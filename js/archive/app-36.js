// v103：資金同步條改為帳戶別狀態；外幣色與長條同步樣式維持不變。
(()=>{
  const FUND_SYNC_VERSION='2026.10.07-v103';

  function accountForCard(card){
    const shell=card.closest('.fund-swipe-shell');
    if(shell?.dataset?.account)return String(shell.dataset.account);
    const onclick=card.getAttribute('onclick')||'';
    const m=onclick.match(/openFundRecordV84\('[^']*','[^']*','([^']+)'\)/);
    return m?m[1]:'';
  }
  function fundSyncState(accountId){
    if(!currentTrip)return 'pending';
    const map=currentTrip.fundAccountCloudStatus;
    if(accountId&&map&&map[accountId])return map[accountId];
    return currentTrip.fundCloudStatus==='synced'?'synced':currentTrip.fundCloudStatus==='local'?'local':'pending';
  }
  function isForeignCurrency(){
    return Boolean(currentTrip?.currency)&&String(currentTrip.currency).toUpperCase()!=='TWD';
  }
  function friendlySyncError(raw){
    const s=String(raw||'').trim();
    if(!s)return '這個資金帳戶尚未完成同步，系統會在背景自動重試。\n\n如果一直維持「待同步」，請確認網路連線與 Apps Script 後端版本。';
    if(s.includes('Apps Script 尚未更新'))return 'Apps Script 後端版本尚未更新到 v56，請先部署最新後端。';
    if(s.includes('Google Sheet 尚未建立'))return '這趟旅行的 Google Sheet 尚未建立完成，稍後會再自動嘗試。';
    if(/Failed to fetch|NetworkError|網路|HTTP_?0|Load failed/i.test(s))return '目前無法連上雲端，可能是網路不穩或 Apps Script 暫時沒有回應。\n\n原始訊息：'+s;
    return s;
  }
  function ensureStyles(){
    if(document.getElementById('fundSyncV96Styles'))return;
    const s=document.createElement('style');
    s.id='fundSyncV96Styles';
    s.textContent=`
      .fund-sync-pill{margin-top:9px;display:flex;align-items:center;justify-content:flex-start;width:100%;height:27px;border-radius:999px;padding:0 14px;box-sizing:border-box;font-size:11px;font-weight:900}
      .fund-sync-pill.synced{background:#e8f7ef;color:#557768}
      .fund-sync-pill.pending{background:#fff4d8;color:#9a6b12;cursor:pointer}
      .fund-kind-badge.initial,.fund-type-badge.fund-badge-initial{background:#f2ecff!important;color:#7c3aed!important;border:0!important}
      .fund-kind-badge.income,.fund-type-badge.fund-badge-income{background:#e7f8ec!important;color:#15803d!important;border:0!important}
      .fund-kind-badge.expense,.fund-type-badge.fund-badge-expense{background:#ffe8ee!important;color:#c2415a!important;border:0!important}
      .fund-kind-badge.adjust,.fund-type-badge.fund-badge-adjust{background:#f0e8ff!important;color:#7c3aed!important;border:0!important}
      .fund-kind-badge.transfer,.fund-type-badge.fund-badge-transfer{background:#e6f0ff!important;color:#2563eb!important;border:0!important}
      .fund-swipe-shell.fund-v86-income .fund-record-card:before{background:#e7f8ec!important;color:#15803d!important;border:0!important}
      .fund-swipe-shell.fund-v86-expense .fund-record-card:before{background:#ffe8ee!important;color:#c2415a!important;border:0!important}
      .fund-swipe-shell.fund-v86-adjust .fund-record-card:before{background:#f0e8ff!important;color:#7c3aed!important;border:0!important}
      .fund-swipe-shell.fund-v86-transfer .fund-record-card:before{background:#e6f0ff!important;color:#2563eb!important;border:0!important}
      .fund-foreign-currency .fund-record-amount strong,.fund-foreign-currency .fund-record-money strong{color:#6f5bd3!important}
      .fund-foreign-currency .fund-record-amount span,.fund-foreign-currency .fund-record-money span{color:#8a7fba!important}
      .fund-record-main{min-width:0;flex:1}.fund-record-main>.fund-sync-pill{width:100%}.fund-record-card>.fund-sync-pill{margin-left:48px;width:calc(100% - 48px)}
    `;
    document.head.appendChild(s);
  }
  function injectSyncPills(){
    ensureStyles();
    const foreign=isForeignCurrency();
    document.querySelectorAll('.fund-record-card, .fund-record-v87').forEach(card=>{
      const accountId=accountForCard(card);
      const state=fundSyncState(accountId);
      card.classList.toggle('fund-foreign-currency',foreign);
      let pill=card.querySelector('.fund-sync-pill');
      if(!pill){
        pill=document.createElement('div');pill.className='fund-sync-pill';
        const main=card.querySelector('.fund-record-main');if(main)main.appendChild(pill);else card.appendChild(pill);
      }
      pill.className='fund-sync-pill '+(state==='synced'?'synced':'pending');
      pill.textContent=state==='synced'?'已同步':state==='local'?'僅本機':'待同步';
      pill.dataset.fundAccount=accountId||'';
      pill.title=state==='synced'?'這個資金帳戶已同步至 Google Sheet':state==='local'?'尚未設定雲端同步':'點一下查看待同步原因';
      pill.onclick=function(e){
        if(state==='synced')return;
        e.preventDefault();e.stopPropagation();
        if(state==='local')return alert('這個資金帳戶目前只保存在本機，尚未設定 Google Apps Script 雲端同步。');
        alert('資金同步狀態：待同步\n\n'+friendlySyncError(currentTrip?.fundLastSyncError));
      };
    });
  }
  const baseApply=window.applyRecordFilters;
  window.applyRecordFilters=function(){const r=typeof baseApply==='function'?baseApply.apply(this,arguments):undefined;injectSyncPills();return r;};
  const baseOpen=window.openRecords;
  window.openRecords=function(){const r=typeof baseOpen==='function'?baseOpen.apply(this,arguments):undefined;setTimeout(injectSyncPills,0);return r;};
  try{window.WEB_VERSION=FUND_SYNC_VERSION;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=FUND_SYNC_VERSION;
  ensureStyles();
})();
