// v122：退稅正式欄位 + 信用卡退稅沖減支出。
// - 完成機台退稅時正式保存：refundMethod / refundAmount / refundTwdAmount / refundCard / refundCompletedAt
// - 現金退稅：加入 CASH 收入（沿用共同資金）
// - 信用卡退稅：不進 CASH，改以「退稅沖減」從旅行總支出／統計扣除
// - 退回卡別可與原購買卡不同；台幣退回金額可手動填，留空則按原交易比例估算
(()=>{
  const VER='2026.10.12-v122-refund-structured-credit-net';
  const COMPLETED='機台退稅完成✅';
  const MACHINE='找機台退稅❗️';
  let activeRefundId='';

  const num=v=>{
    const n=Number(String(v??'').replace(/,/g,'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const fmtInput=n=>n>0?Number(n).toLocaleString('en-US',{maximumFractionDigits:2}):'';
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function refundTwdValue(item){
    const direct=num(item?.refundTwdAmount);
    if(direct>0)return direct;
    const amount=num(item?.refundAmount);
    const foreign=num(item?.foreign);
    const twd=num(item?.twd);
    if(amount>0&&foreign>0&&twd>0)return Number((amount*twd/foreign).toFixed(2));
    return 0;
  }

  function isCompletedCardRefund(item){
    return item?.refundStatus===COMPLETED &&
      String(item?.refundMethod||'')==='信用卡' &&
      num(item?.refundAmount)>0;
  }

  function refundSyntheticRows(){
    if(!currentTrip)return [];
    return (currentTrip.expenses||[])
      .filter(isCompletedCardRefund)
      .map(item=>({
        id:'refund_offset_'+item.id,
        type:'購買商品',
        name:'退稅沖減｜'+(item.name||'未命名商品'),
        qty:1,
        date:item.date||'',
        foreign:-Math.abs(num(item.refundAmount)),
        twd:-Math.abs(refundTwdValue(item)),
        person:item.person||'',
        pay:'信用卡',
        card:item.refundCard||item.card||'',
        place:item.refundMachine||item.place||'',
        category:'退稅沖減',
        note:'機台退稅刷退信用卡',
        _refundOffset:true,
        _sourceExpenseId:item.id
      }));
  }

  function cardRefundTotals(){
    return refundSyntheticRows().reduce((acc,x)=>{
      acc.twd+=Math.abs(num(x.twd));
      acc.foreign+=Math.abs(num(x.foreign));
      return acc;
    },{twd:0,foreign:0});
  }

  function ensureStyles(){
    if(document.getElementById('refundStructuredV122Style'))return;
    const s=document.createElement('style');
    s.id='refundStructuredV122Style';
    s.textContent=`
      #refundSettlementCardGroup.hidden,#refundSettlementTwdGroup.hidden{display:none!important}
      .refund-structured-note{font-size:11px;line-height:1.5;color:var(--muted);margin-top:6px}
      .refund-offset-badge{display:inline-flex;align-items:center;gap:5px;margin-top:5px;padding:4px 7px;border-radius:999px;background:#eef8f1;color:#34704a;font-size:11px;font-weight:900}
      .refund-offset-detail{margin-top:4px;font-size:11px;color:#5e5668;line-height:1.5}
    `;
    document.head.appendChild(s);
  }

  function ensureStructuredFields(){
    ensureStyles();
    const overlay=document.getElementById('refundSettlementOverlay');
    if(!overlay)return;
    const amountGroup=document.getElementById('refundSettlementAmount')?.closest('.form-group');
    if(!amountGroup)return;

    if(!document.getElementById('refundSettlementCardGroup')){
      const cardGroup=document.createElement('div');
      cardGroup.id='refundSettlementCardGroup';
      cardGroup.className='form-group hidden';
      cardGroup.innerHTML=`
        <label>退回卡別 <span class="danger">*</span></label>
        <select id="refundSettlementCard"></select>
        <div class="refund-structured-note">可以和原本購買的信用卡不同；這裡記錄實際收到退稅的卡。</div>`;
      amountGroup.insertAdjacentElement('afterend',cardGroup);

      const twdGroup=document.createElement('div');
      twdGroup.id='refundSettlementTwdGroup';
      twdGroup.className='form-group hidden';
      twdGroup.innerHTML=`
        <label>實際退回台幣 <span class="tiny">（可留空）</span></label>
        <div class="money-wrap"><span class="money-prefix">NT$</span><input id="refundSettlementTwdAmount" type="text" inputmode="decimal" placeholder="留空會依原交易比例估算"></div>
        <div id="refundSettlementTwdHint" class="refund-structured-note"></div>`;
      cardGroup.insertAdjacentElement('afterend',twdGroup);

      const twdInput=document.getElementById('refundSettlementTwdAmount');
      twdInput?.addEventListener('input',()=>{
        const raw=String(twdInput.value||'').replace(/,/g,'').replace(/[^0-9.]/g,'');
        const parts=raw.split('.');
        const i=parts[0]?Number(parts[0]).toLocaleString('en-US'):'';
        twdInput.value=i+(parts.length>1?'.'+parts.slice(1).join('').slice(0,2):'');
      });
    }
  }

  function fillRefundCards(item){
    const select=document.getElementById('refundSettlementCard');
    if(!select)return;
    const cards=[...(state?.cards||[])].filter(Boolean);
    const wanted=item?.refundCard||item?.card||cards[0]||'';
    select.innerHTML=cards.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if(wanted&&cards.includes(wanted))select.value=wanted;
  }

  function updateMethodUi(item){
    ensureStructuredFields();
    const method=document.getElementById('refundSettlementMethod')?.value||'現金';
    const credit=method==='信用卡';
    document.getElementById('refundSettlementCardGroup')?.classList.toggle('hidden',!credit);
    document.getElementById('refundSettlementTwdGroup')?.classList.toggle('hidden',!credit);

    if(credit){
      fillRefundCards(item);
      const amount=num(document.getElementById('refundSettlementAmount')?.value||'');
      const foreign=num(item?.foreign);
      const twd=num(item?.twd);
      const estimated=(amount>0&&foreign>0&&twd>0)?amount*twd/foreign:0;
      const hint=document.getElementById('refundSettlementTwdHint');
      if(hint){
        hint.textContent=estimated>0
          ? `留空將先以原交易比例估算約 NT$${Math.round(estimated).toLocaleString('en-US')}；信用卡帳單入帳後可再依實際金額調整。`
          : '若沒有原台幣金額，建議直接填信用卡帳單實際退回的台幣金額。';
      }
    }
  }

  function bindMethodButtons(){
    const overlay=document.getElementById('refundSettlementOverlay');
    if(!overlay)return;
    overlay.querySelectorAll('.refund-method-btn').forEach(btn=>{
      if(btn.dataset.v122Bound==='1')return;
      btn.dataset.v122Bound='1';
      btn.addEventListener('click',()=>{
        const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===String(activeRefundId));
        setTimeout(()=>updateMethodUi(item),0);
      });
    });
    const amount=document.getElementById('refundSettlementAmount');
    if(amount&&amount.dataset.v122Bound!=='1'){
      amount.dataset.v122Bound='1';
      amount.addEventListener('input',()=>{
        const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===String(activeRefundId));
        updateMethodUi(item);
      });
    }
  }

  function ensureCashRefundEntry(item,amount){
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

  function structuredRefundNote(oldNote,method,amount,card){
    const clean=String(oldNote||'')
      .replace(/(?:^|\n)【退稅】[^\n]*/g,'')
      .replace(/(?:^|\n)【退稅卡別】[^\n]*/g,'')
      .trim();
    const lines=[
      `【退稅】${method}｜${currentTrip?.currency||''} ${Number(amount).toLocaleString('en-US')}`
    ];
    if(method==='信用卡'&&card)lines.push(`【退稅卡別】${card}`);
    return [clean,...lines].filter(Boolean).join('\n');
  }

  async function confirmStructuredRefund(){
    const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===String(activeRefundId));
    if(!item)return;

    const method=document.getElementById('refundSettlementMethod')?.value||'其他';
    const amount=num(document.getElementById('refundSettlementAmount')?.value||'');
    if(!(amount>0)){
      alert('請輸入實際退稅金額。');
      document.getElementById('refundSettlementAmount')?.focus();
      return;
    }

    const refundCard=method==='信用卡'
      ? String(document.getElementById('refundSettlementCard')?.value||'').trim()
      : '';
    if(method==='信用卡'&&!refundCard){
      alert('請選擇實際退回的信用卡。');
      return;
    }

    let refundTwd=method==='信用卡'
      ? num(document.getElementById('refundSettlementTwdAmount')?.value||'')
      : 0;
    if(method==='信用卡'&&!(refundTwd>0)){
      const foreign=num(item.foreign), twd=num(item.twd);
      if(foreign>0&&twd>0)refundTwd=Number((amount*twd/foreign).toFixed(2));
    }

    const confirmBtn=document.getElementById('refundSettlementConfirm');
    if(confirmBtn){confirmBtn.disabled=true;confirmBtn.textContent='處理中…';}

    const cashAdded=method==='現金'?ensureCashRefundEntry(item,amount):false;
    item.refundStatus=COMPLETED;
    item.refundMachine=item.refundMachine||'';
    item.refundMethod=method;
    item.refundAmount=Number(amount);
    item.refundTwdAmount=method==='信用卡'&&refundTwd>0?Number(refundTwd):'';
    item.refundCard=refundCard;
    item.refundCompletedAt=new Date().toISOString();
    item.note=structuredRefundNote(item.note,method,amount,refundCard);
    item.updatedAt=new Date().toISOString();
    item.syncStatus=typeof getApiUrl==='function'&&getApiUrl()?'pending':'local';
    persist();

    document.getElementById('refundSettlementOverlay')?.classList.add('hidden');

    try{
      if(typeof renderTaxRefundPendingSection==='function')renderTaxRefundPendingSection();
      if(typeof renderRecentRecords==='function')renderRecentRecords();
      if(typeof renderTripSummary==='function')renderTripSummary();
    }catch(e){}

    if(typeof getApiUrl==='function'&&getApiUrl()){
      try{await syncRecord('updateExpense',currentTrip,'expenses',item);}catch(e){}
      if(cashAdded){
        const syncFn=window.backgroundFundSyncV104||window.backgroundFundSyncV103||window.backgroundFundSyncV90;
        if(typeof syncFn==='function')setTimeout(()=>syncFn(currentTrip.id,true),0);
      }
    }

    persist();
    try{if(typeof renderSettings==='function')renderSettings();}catch(e){}
    if(typeof showQuickSaveToast==='function'){
      if(method==='現金')showQuickSaveToast(`退稅已加入現金帳戶`);
      else if(method==='信用卡')showQuickSaveToast(`信用卡退稅已記錄並沖減支出`);
      else showQuickSaveToast(`退稅資料已記錄`);
    }
    if(confirmBtn){confirmBtn.disabled=false;confirmBtn.textContent='確認完成退稅';}
    activeRefundId='';
  }

  function replaceConfirmButton(){
    const old=document.getElementById('refundSettlementConfirm');
    if(!old||old.dataset.v122Bound==='1')return;
    const fresh=old.cloneNode(true);
    fresh.dataset.v122Bound='1';
    fresh.addEventListener('click',confirmStructuredRefund);
    old.replaceWith(fresh);
  }

  const baseCompleteV122=window.completeTaxRefundV114;
  if(typeof baseCompleteV122==='function'){
    window.completeTaxRefundV114=function(id,button){
      activeRefundId=String(id||'');
      const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===activeRefundId);
      const result=baseCompleteV122.apply(this,arguments);
      setTimeout(()=>{
        ensureStructuredFields();
        bindMethodButtons();
        replaceConfirmButton();
        fillRefundCards(item);
        const twdInput=document.getElementById('refundSettlementTwdAmount');
        if(twdInput)twdInput.value=fmtInput(item?.refundTwdAmount);
        updateMethodUi(item);
      },0);
      return result;
    };
  }

  // 首頁總額：信用卡退稅視為「支出沖減」，不改原消費金額。
  window.renderTripSummary=function(){
    if(!currentTrip)return;
    const expenses=currentTrip.expenses||[];
    const pretrip=currentTrip.pretrip||[];
    const refunds=cardRefundTotals();
    const totalTwd=Math.max(0,[...expenses,...pretrip].reduce((s,x)=>s+num(x.twd),0)-refunds.twd);
    const totalForeign=Math.max(0,[...expenses,...pretrip].reduce((s,x)=>s+num(x.foreign),0)-refunds.foreign);
    const today=typeof localTodayYmd==='function'?localTodayYmd():'';
    const todayRefund=refundSyntheticRows()
      .filter(x=>x.date===today)
      .reduce((s,x)=>s+Math.abs(num(x.twd)),0);
    const todayTwd=Math.max(0,expenses.filter(x=>x.date===today).reduce((s,x)=>s+num(x.twd),0)-todayRefund);

    const totalTwdEl=document.getElementById('totalTwd');
    const totalForeignEl=document.getElementById('totalForeign');
    const todayTwdEl=document.getElementById('todayTwd');
    if(totalTwdEl)totalTwdEl.textContent=fmtMoney(totalTwd,'TWD');
    if(totalForeignEl)totalForeignEl.textContent=`${currentTrip.currency} ${new Intl.NumberFormat().format(totalForeign)}`;
    if(todayTwdEl)todayTwdEl.textContent=fmtMoney(todayTwd,'TWD');

    const pendingTwd=expenses.filter(x=>x.twd===null||x.twd===''||num(x.twd)===0).length;
    const pending=document.getElementById('pendingTwdCount');
    if(pending)pending.textContent=pendingTwd;

    if(typeof renderTodayOverview==='function')renderTodayOverview();
    if(typeof renderDailyCloseReminder==='function')renderDailyCloseReminder();
    if(typeof renderRecent==='function')renderRecent();
  };

  function withRefundOffsets(fn){
    if(!currentTrip||typeof fn!=='function')return fn?.();
    const original=currentTrip.expenses;
    const offsets=refundSyntheticRows();
    const oldStatsKnown=window.statsKnownTwd;
    currentTrip.expenses=[...(original||[]),...offsets];
    if(typeof oldStatsKnown==='function'){
      window.statsKnownTwd=function(item){
        return item && item.twd!==null && item.twd!=='' && Number(item.twd)!==0;
      };
    }
    try{return fn();}
    finally{
      currentTrip.expenses=original;
      if(typeof oldStatsKnown==='function')window.statsKnownTwd=oldStatsKnown;
    }
  }

  const baseTodayOverview=window.renderTodayOverview;
  if(typeof baseTodayOverview==='function'){
    window.renderTodayOverview=function(){
      return withRefundOffsets(()=>baseTodayOverview.apply(this,arguments));
    };
  }

  const baseSettlement=window.renderTripSettlement;
  if(typeof baseSettlement==='function'){
    window.renderTripSettlement=function(){
      return withRefundOffsets(()=>baseSettlement.apply(this,arguments));
    };
  }

  const baseOpenStats=window.openTripStats;
  if(typeof baseOpenStats==='function'){
    window.openTripStats=function(){
      return withRefundOffsets(()=>baseOpenStats.apply(this,arguments));
    };
  }

  // 原消費紀錄保留原價，另外標示退稅結果與退回卡別。
  const baseRecordHtmlV122=window.recordHtml;
  if(typeof baseRecordHtmlV122==='function'){
    window.recordHtml=function(item){
      let html=baseRecordHtmlV122.apply(this,arguments);
      if(item?.refundStatus!==COMPLETED)return html;

      const method=String(item.refundMethod||'');
      const amount=num(item.refundAmount);
      if(!method||!(amount>0))return html;
      const symbol=typeof currencySymbol==='function'?currencySymbol(currentTrip?.currency):'';
      const card=method==='信用卡'?(item.refundCard||item.card||''):'';
      const twd=method==='信用卡'?refundTwdValue(item):0;
      const detail=method==='信用卡'
        ? `退回 ${card||'信用卡'}${twd>0?` · 約 NT$${Math.round(twd).toLocaleString('en-US')}`:''}`
        : method==='現金'
          ? '已加入現金帳戶'
          : '已完成退稅';
      const insert=`<div class="refund-offset-badge">↩ ${esc(method)}退稅 ${symbol}${Number(amount).toLocaleString('en-US')}</div><div class="refund-offset-detail">${esc(detail)}</div>`;
      return html.replace('<div style="margin-top:5px">',insert+'<div style="margin-top:5px">');
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web)web.textContent=VER;
  }

  const baseRenderSettingsV122=window.renderSettings;
  if(typeof baseRenderSettingsV122==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV122.apply(this,arguments);
      applyVersion();
      return r;
    };
  }

  ensureStyles();
  ensureStructuredFields();
  bindMethodButtons();
  replaceConfirmButton();
  applyVersion();
})();
