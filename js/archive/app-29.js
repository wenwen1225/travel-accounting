// v82：外幣現金千分位 + 日期下拉 + 初始現金日期修正。
// 搭配 Apps Script v55：初始現金日期不再固定使用旅程開始日。
(()=>{
  const CASH_WALLET_WEB_VERSION_V82='2026.10.06-v82';
  const CASH_WALLET_EXPECTED_BACKEND_V82='v55';

  function cw82Number(value){
    const n=Number(String(value??'').replace(/,/g,''));
    return Number.isFinite(n)?n:0;
  }

  function cw82FormatInput(value){
    let raw=String(value??'').replace(/,/g,'').replace(/[^0-9.\-]/g,'');
    let negative=raw.startsWith('-');
    raw=raw.replace(/-/g,'');
    const parts=raw.split('.');
    const integer=(parts[0]||'').replace(/^0+(?=\d)/,'');
    const grouped=integer ? Number(integer).toLocaleString('en-US') : '';
    const decimal=parts.length>1 ? '.'+parts.slice(1).join('').slice(0,6) : '';
    return (negative?'-':'')+grouped+decimal;
  }

  function cw82BindMoneyInput(el){
    if(!el || el.dataset.cw82Bound==='1') return;
    el.dataset.cw82Bound='1';
    el.addEventListener('input',()=>{
      const formatted=cw82FormatInput(el.value);
      if(el.value!==formatted) el.value=formatted;
    });
    el.addEventListener('blur',()=>{
      el.value=cw82FormatInput(el.value);
    });
  }

  function cw82Ymd(date){
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,'0');
    const d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }

  function cw82ParseYmd(text){
    const m=String(text||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0);
  }

  function cw82Weekday(date){
    return ['日','一','二','三','四','五','六'][date.getDay()];
  }

  function cw82DateLabel(ymd){
    const d=cw82ParseYmd(ymd);
    if(!d) return ymd;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}（${cw82Weekday(d)}）`;
  }

  function cw82Today(){
    const d=new Date();
    return cw82Ymd(d);
  }

  function cw82DateOptions(extra=[]){
    if(!currentTrip) return [];
    const start=cw82ParseYmd(currentTrip.start) || new Date();
    const end=cw82ParseYmd(currentTrip.end) || start;
    const from=new Date(start.getTime());
    from.setDate(from.getDate()-30);
    const to=new Date(end.getTime());
    to.setDate(to.getDate()+7);
    const set=new Set();
    for(let d=new Date(from.getTime());d<=to;d.setDate(d.getDate()+1)) set.add(cw82Ymd(d));
    [cw82Today(),...extra].filter(Boolean).forEach(v=>set.add(String(v)));
    return [...set].sort();
  }

  function cw82FillSelect(select,selected,extra=[]){
    if(!select) return;
    const wanted=String(selected||'');
    select.innerHTML=cw82DateOptions([wanted,...extra]).map(v=>`<option value="${v}">${cw82DateLabel(v)}</option>`).join('');
    select.value=wanted && [...select.options].some(o=>o.value===wanted) ? wanted : cw82Today();
  }

  function cw82EnsureStyles(){
    if(document.getElementById('cashWalletV82Styles')) return;
    const style=document.createElement('style');
    style.id='cashWalletV82Styles';
    style.textContent=`
      #cashWalletOverlay .cash-wallet-dialog .row{align-items:flex-start}
      #cashWalletOverlay .cash-wallet-date-select{width:100%;min-width:0;height:52px;border:1px solid var(--line);border-radius:16px;background:#fff;padding:0 14px;font:inherit;color:var(--text);appearance:auto;-webkit-appearance:menulist}
      #cashWalletOverlay .cash-wallet-dialog .form-group{min-width:0}
      #cashWalletOverlay .cash-wallet-dialog .money-wrap input{font-variant-numeric:tabular-nums}
      @media(max-width:560px){#cashWalletOverlay .cash-wallet-dialog .row{display:block}#cashWalletOverlay .cash-wallet-dialog .row>.form-group{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function cw82EnsureFields(){
    cw82EnsureStyles();
    const initialInput=document.getElementById('cashWalletInitialInput');
    if(!initialInput) return;

    initialInput.placeholder='例如：300,000';
    cw82BindMoneyInput(initialInput);
    const adjustInput=document.getElementById('cashWalletAdjustInput');
    if(adjustInput){
      adjustInput.placeholder='增加填正數，例如 10,000；減少填 -5,000';
      cw82BindMoneyInput(adjustInput);
    }

    if(!document.getElementById('cashWalletInitialDate')){
      const help=initialInput.closest('.form-group')?.querySelector('.cash-wallet-help');
      const group=document.createElement('div');
      group.className='form-group';
      group.innerHTML='<label>初始現金日期</label><select id="cashWalletInitialDate" class="cash-wallet-date-select"></select><div class="cash-wallet-help">這一天會寫入「現金紀錄」，不再固定使用旅程開始日。</div>';
      (help?.closest('.form-group')||initialInput.closest('.form-group'))?.insertAdjacentElement('afterend',group);
    }

    const oldDate=document.getElementById('cashWalletAdjustDate');
    if(oldDate && oldDate.tagName!=='SELECT'){
      const select=document.createElement('select');
      select.id='cashWalletAdjustDate';
      select.className='cash-wallet-date-select';
      oldDate.replaceWith(select);
    }
  }

  const baseOpen=window.openCashWalletV81;
  window.openCashWalletV81=function(){
    if(typeof baseOpen==='function') baseOpen();
    cw82EnsureFields();
    if(!currentTrip) return;
    const raw=currentTrip.cashWallet||{};
    const today=cw82Today();
    const initialDate=String(raw.initialDate||today);
    const initialInput=document.getElementById('cashWalletInitialInput');
    if(initialInput) initialInput.value=raw.initial?cw82FormatInput(raw.initial):'';
    const adjustInput=document.getElementById('cashWalletAdjustInput');
    if(adjustInput) adjustInput.value='';
    cw82FillSelect(document.getElementById('cashWalletInitialDate'),initialDate,[today]);
    cw82FillSelect(document.getElementById('cashWalletAdjustDate'),today,[initialDate]);
  };

  const baseRemove=window.removeCashWalletAdjustmentV81;
  window.removeCashWalletAdjustmentV81=function(id){
    const initialDate=String(currentTrip?.cashWallet?.initialDate||'');
    if(typeof baseRemove==='function') baseRemove(id);
    if(currentTrip?.cashWallet) currentTrip.cashWallet.initialDate=initialDate;
    if(typeof persist==='function') persist();
  };

  window.saveCashWalletV81=async function(){
    if(!currentTrip) return;
    if(currentTrip.archived){
      if(typeof archiveReadOnlyAlert==='function') archiveReadOnlyAlert();
      return;
    }

    const initialRaw=document.getElementById('cashWalletInitialInput')?.value||'';
    const initial=cw82Number(initialRaw);
    if(initialRaw.trim() && initial<0){alert('初始現金不能是負數');return;}

    const initialDate=document.getElementById('cashWalletInitialDate')?.value||cw82Today();
    const raw=currentTrip.cashWallet||{};
    const adjustments=Array.isArray(raw.adjustments)?raw.adjustments.map(item=>({
      id:String(item?.id||''),date:String(item?.date||''),amount:cw82Number(item?.amount),note:String(item?.note||'')
    })).filter(item=>item.id&&item.amount!==0):[];

    const adjustRaw=document.getElementById('cashWalletAdjustInput')?.value||'';
    const adjust=cw82Number(adjustRaw);
    if(adjustRaw.trim() && adjust===0){alert('現金調整請輸入非 0 的金額');return;}
    if(adjust!==0){
      adjustments.push({
        id:'cash_adj_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        date:document.getElementById('cashWalletAdjustDate')?.value||cw82Today(),
        amount:adjust,
        note:(document.getElementById('cashWalletAdjustNote')?.value||'').trim()
      });
    }

    currentTrip.cashWallet={initial,initialDate,adjustments};
    persist();
    if(typeof renderCashWalletV81==='function') renderCashWalletV81();

    const btn=document.getElementById('cashWalletSaveBtn');
    if(btn){btn.disabled=true;btn.textContent='儲存中…';}
    try{
      if(!getApiUrl()) throw new Error('尚未設定 Google Apps Script Web App URL');
      const ready=await ensureTripSpreadsheetReady(currentTrip);
      if(!ready||!currentTrip.spreadsheetId) throw new Error('Google Sheet 尚未建立完成，請稍後再試');
      const result=await postToCloud({
        action:'saveCashWallet',
        clientTripId:currentTrip.id,
        spreadsheetId:currentTrip.spreadsheetId,
        tripName:currentTrip.name,
        initial,
        initialDate,
        adjustments
      });
      if(result?.cashWallet) currentTrip.cashWallet=result.cashWallet;
      currentTrip.cloudStatus='synced';
      currentTrip.lastSyncError='';
      if(typeof markSyncSuccess==='function') markSyncSuccess();
      persist();
      if(typeof renderCashWalletV81==='function') renderCashWalletV81();
      if(typeof closeCashWalletV81==='function') closeCashWalletV81();
      alert('外幣現金已儲存，日期與金額格式也已同步到 Google Sheet。');
    }catch(err){
      currentTrip.cloudStatus='pending';
      currentTrip.lastSyncError=String(err?.message||err);
      persist();
      alert('現金設定已保留在這台裝置，但雲端尚未更新：\n'+currentTrip.lastSyncError);
    }finally{
      if(btn){btn.disabled=false;btn.textContent='儲存現金設定';}
    }
  };

  if(typeof checkBackendVersion==='function'){
    checkBackendVersion=async function(silent=true){
      const webEl=document.getElementById('webVersionText');
      const scriptEl=document.getElementById('scriptVersionText');
      const statusEl=document.getElementById('versionMatchStatus');
      const btn=document.getElementById('versionCheckBtn');
      if(webEl) webEl.textContent=CASH_WALLET_WEB_VERSION_V82;
      if(!getApiUrl()){
        if(scriptEl) scriptEl.textContent='尚未設定';
        if(statusEl){statusEl.textContent='尚未設定 Apps Script Web App URL';statusEl.className='version-check-status version-check-error';}
        return false;
      }
      if(btn) btn.disabled=true;
      try{
        const data=await postToCloud({action:'getVersion'});
        const version=String(data.scriptVersion||'');
        const matched=version===CASH_WALLET_EXPECTED_BACKEND_V82;
        state.lastScriptVersion=version;
        state.lastVersionCheckAt=new Date().toISOString();
        persist();
        if(scriptEl) scriptEl.textContent=version||'未知版本';
        if(statusEl){
          statusEl.textContent=matched?'版本一致，可以正常同步':'版本不一致：網站需要 '+CASH_WALLET_EXPECTED_BACKEND_V82+'，目前後端是 '+(version||'未知');
          statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
        }
        if(!matched&&!silent) alert('Apps Script 版本不一致。\n網站需要：'+CASH_WALLET_EXPECTED_BACKEND_V82+'\n目前後端：'+(version||'未知版本')+'\n\n請部署 v55 Apps Script。');
        return matched;
      }catch(err){
        if(scriptEl) scriptEl.textContent='檢查失敗';
        if(statusEl){statusEl.textContent='無法讀取 Apps Script 版本：'+(err?.message||err);statusEl.className='version-check-status version-check-error';}
        if(!silent) alert('版本檢查失敗：'+(err?.message||err));
        return false;
      }finally{if(btn) btn.disabled=false;}
    };
  }

  const webEl=document.getElementById('webVersionText');
  if(webEl) webEl.textContent=CASH_WALLET_WEB_VERSION_V82;
  cw82EnsureStyles();
})();