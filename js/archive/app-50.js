// v120：機台退稅完成時補記「退稅方式＋實際退稅金額」；現金退稅自動加入 CASH 收入。
// 不修改 Apps Script 後端與 Sheet 結構：退稅明細寫入既有 note 欄位；現金收入沿用既有 saveFundAccounts 同步。
(()=>{
  const VER='2026.10.11-v120-refund-settlement';
  const COMPLETED='機台退稅完成✅';
  const MACHINE='找機台退稅❗️';
  let pendingRefundId='';
  let pendingRefundButton=null;

  const num=v=>{
    const n=Number(String(v??'').replace(/,/g,'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const money=v=>`${typeof currencySymbol==='function'?currencySymbol(currentTrip?.currency):''}${Number(v||0).toLocaleString('en-US')}`;

  function ensureStyles(){
    if(document.getElementById('refundSettlementV120Style'))return;
    const s=document.createElement('style');
    s.id='refundSettlementV120Style';
    s.textContent=`
      .refund-settlement-dialog{max-width:430px;text-align:left}
      .refund-settlement-dialog h2,.refund-settlement-dialog>.sub{text-align:center}
      .refund-settlement-summary{margin:12px 0;padding:11px 12px;border-radius:13px;background:#fff8e8;border:1px solid #f0dfb2;font-size:12px;line-height:1.55;color:#6d5a23}
      .refund-method-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .refund-method-btn{border:1px solid #ddd3ef;background:#fff;border-radius:12px;padding:10px 8px;font-weight:900;color:#665b73}
      .refund-method-btn.active{background:#7c5ce7;color:#fff;border-color:#7c5ce7}
      .refund-settlement-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:14px}
    `;
    document.head.appendChild(s);
  }

  function ensureOverlay(){
    ensureStyles();
    if(document.getElementById('refundSettlementOverlay'))return;
    const o=document.createElement('div');
    o.id='refundSettlementOverlay';
    o.className='save-overlay hidden';
    o.innerHTML=`
      <div class="save-dialog refund-settlement-dialog">
        <div class="save-symbol">💸</div>
        <h2>完成退稅</h2>
        <div class="sub">確認後才會更新原消費紀錄</div>
        <div id="refundSettlementSummary" class="refund-settlement-summary"></div>
        <div class="form-group">
          <label>退稅方式</label>
          <input id="refundSettlementMethod" type="hidden" value="現金">
          <div class="refund-method-row">
            <button type="button" class="refund-method-btn active" data-method="現金">現金</button>
            <button type="button" class="refund-method-btn" data-method="信用卡">信用卡</button>
            <button type="button" class="refund-method-btn" data-method="其他">其他</button>
          </div>
        </div>
        <div class="form-group">
          <label>實際退稅金額 <span class="danger">*</span></label>
          <div class="money-wrap"><span id="refundSettlementSymbol" class="money-prefix"></span><input id="refundSettlementAmount" type="text" inputmode="decimal" placeholder="例如：12,000"></div>
          <div class="tiny">會以旅程幣別記錄；現金退稅會同步加入「現金」帳戶收入。</div>
        </div>
        <div class="refund-settlement-actions">
          <button id="refundSettlementCancel" class="secondary" type="button">取消</button>
          <button id="refundSettlementConfirm" class="primary" type="button">確認完成退稅</button>
        </div>
      </div>`;
    document.body.appendChild(o);

    o.querySelectorAll('.refund-method-btn').forEach(btn=>btn.addEventListener('click',()=>{
      o.querySelectorAll('.refund-method-btn').forEach(x=>x.classList.toggle('active',x===btn));
      document.getElementById('refundSettlementMethod').value=btn.dataset.method||'其他';
    }));
    const amount=document.getElementById('refundSettlementAmount');
    amount.addEventListener('input',()=>{
      const raw=String(amount.value||'').replace(/,/g,'').replace(/[^0-9.]/g,'');
      const parts=raw.split('.');
      const i=parts[0]?Number(parts[0]).toLocaleString('en-US'):'';
      amount.value=i+(parts.length>1?'.'+parts.slice(1).join('').slice(0,2):'');
    });
    document.getElementById('refundSettlementCancel').onclick=closeOverlay;
    document.getElementById('refundSettlementConfirm').onclick=confirmRefund;
  }

  function openOverlay(id,button){
    if(!currentTrip)return false;
    const item=(currentTrip.expenses||[]).find(x=>String(x.id)===String(id));
    if(!item||item.refundStatus!==MACHINE)return false;
    ensureOverlay();
    pendingRefundId=String(id);
    pendingRefundButton=button||null;
    const summary=document.getElementById('refundSettlementSummary');
    summary.innerHTML=`<strong>${esc(item.name||'這筆消費')}</strong><br>${esc(item.refundMachine||'未填寫退稅機台／地點')}`;
    document.getElementById('refundSettlementSymbol').textContent=typeof currencySymbol==='function'?currencySymbol(currentTrip.currency):'';
    document.getElementById('refundSettlementAmount').value='';
    document.getElementById('refundSettlementMethod').value='現金';
    document.querySelectorAll('#refundSettlementOverlay .refund-method-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.method==='現金'));
    document.getElementById('refundSettlementOverlay').classList.remove('hidden');
    setTimeout(()=>document.getElementById('refundSettlementAmount')?.focus(),80);
    return true;
  }

  function closeOverlay(){
    document.getElementById('refundSettlementOverlay')?.classList.add('hidden');
    pendingRefundId='';
    pendingRefundButton=null;
  }

  function refundNote(oldNote,method,amount){
    const clean=String(oldNote||'').replace(/(?:^|\n)【退稅】[^\n]*/g,'').trim();
    const line=`【退稅】${method}｜${currentTrip?.currency||''} ${Number(amount).toLocaleString('en-US')}`;
    return clean?`${clean}\n${line}`:line;
  }

  function ensureCashEntry(item,amount){
    if(!currentTrip||!(amount>0))return false;
    if(!currentTrip.fundAccounts||typeof currentTrip.fundAccounts!=='object')currentTrip.fundAccounts={accounts:{},transfers:[]};
    if(!currentTrip.fundAccounts.accounts||typeof currentTrip.fundAccounts.accounts!=='object')currentTrip.fundAccounts.accounts={};
    const cash=currentTrip.fundAccounts.accounts.CASH || (currentTrip.fundAccounts.accounts.CASH={initial:0,initialDate:'',initialSet:false,entries:[]});
    if(!Array.isArray(cash.entries))cash.entries=[];
    const marker=`【退稅現金】${item.id}`;
    if(cash.entries.some(e=>String(e.note||'').includes(marker)))return false;
    cash.entries.push({
      id:'fund_refund_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      date:String(item.date||new Date().toISOString().slice(0,10)),
      amount:Number(amount),
      type:'退稅收入',
      note:`${marker}｜${item.name||'未命名商品'}`,
      createdAt:Date.now()
    });

    if(!currentTrip.fundAccountCloudStatus||typeof currentTrip.fundAccountCloudStatus!=='object')currentTrip.fundAccountCloudStatus={};
    if(!currentTrip.fundAccountRevision||typeof currentTrip.fundAccountRevision!=='object')currentTrip.fundAccountRevision={};
    currentTrip.fundAccountRevision.CASH=Number(currentTrip.fundAccountRevision.CASH||0)+1;
    currentTrip.fundAccountCloudStatus.CASH=typeof getApiUrl==='function'&&getApiUrl()?'pending':'local';
    currentTrip.fundCloudStatus='pending';
    return true;
  }

  async function confirmRefund(){
    const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===String(pendingRefundId));
    if(!item)return closeOverlay();
    const method=document.getElementById('refundSettlementMethod')?.value||'其他';
    const amount=num(document.getElementById('refundSettlementAmount')?.value||'');
    if(!(amount>0)){
      alert('請輸入實際退稅金額。');
      document.getElementById('refundSettlementAmount')?.focus();
      return;
    }

    const btn=document.getElementById('refundSettlementConfirm');
    if(btn){btn.disabled=true;btn.textContent='處理中…';}
    if(pendingRefundButton){pendingRefundButton.disabled=true;pendingRefundButton.textContent='處理中…';}

    const cashAdded=method==='現金' ? ensureCashEntry(item,amount) : false;
    item.refundStatus=COMPLETED;
    item.refundMachine=item.refundMachine||'';
    item.note=refundNote(item.note,method,amount);
    item.updatedAt=new Date().toISOString();
    item.syncStatus=typeof getApiUrl==='function'&&getApiUrl()?'pending':'local';
    persist();

    closeOverlay();
    try{
      if(typeof renderTaxRefundPendingSection==='function')renderTaxRefundPendingSection();
      if(typeof renderRecentRecords==='function')renderRecentRecords();
      if(typeof renderTripSummary==='function')renderTripSummary();
    }catch(e){}

    if(typeof getApiUrl==='function'&&getApiUrl()){
      try{ await syncRecord('updateExpense',currentTrip,'expenses',item); }catch(e){}
      if(cashAdded){
        const syncFn=window.backgroundFundSyncV104||window.backgroundFundSyncV103||window.backgroundFundSyncV90;
        if(typeof syncFn==='function')setTimeout(()=>syncFn(currentTrip.id,true),0);
      }
    }
    persist();
    try{ if(typeof renderSettings==='function')renderSettings(); }catch(e){}
    if(typeof showQuickSaveToast==='function')showQuickSaveToast(method==='現金'?`退稅 ${money(amount)} 已加入現金帳戶`:`已記錄退稅 ${money(amount)}`);
    if(btn){btn.disabled=false;btn.textContent='確認完成退稅';}
    return true;
  }

  // 覆蓋 v114 快捷完成流程：第一次按按鈕只開輸入視窗，第二次確認才改資料。
  window.completeTaxRefundV114=function(id,button){return openOverlay(id,button);};

  // v114 的按鈕 listener 在建立時閉包綁定舊 completeRefund；每次重畫後改成呼叫新版全域函式。
  function rebindPendingButtons(){
    document.querySelectorAll('#taxRefundPendingPreview .tax-refund-preview-item').forEach((card,index)=>{
      const btn=card.querySelector('.tax-refund-complete-btn');
      const items=typeof taxRefundPendingItems==='function'?taxRefundPendingItems().slice(0,3):[];
      const item=items[index];
      if(!btn||!item||btn.dataset.v120Bound==='1')return;
      btn.dataset.v120Bound='1';
      const fresh=btn.cloneNode(true);
      fresh.dataset.v120Bound='1';
      fresh.onclick=e=>{e.preventDefault();e.stopPropagation();openOverlay(item.id,fresh);};
      btn.replaceWith(fresh);
    });
  }

  const baseRenderPending=window.renderTaxRefundPendingSection;
  if(typeof baseRenderPending==='function'){
    window.renderTaxRefundPendingSection=function(){
      const r=baseRenderPending.apply(this,arguments);
      setTimeout(rebindPendingButtons,0);
      return r;
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
  }
  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function')window.renderSettings=function(){const r=baseRenderSettings.apply(this,arguments);applyVersion();return r;};

  ensureOverlay();
  applyVersion();
  try{if(currentTrip&&typeof renderTaxRefundPendingSection==='function')renderTaxRefundPendingSection();}catch(e){}
})();
