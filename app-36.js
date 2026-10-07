// v94：資金紀錄加入「已同步 / 待同步」狀態顯示；不改核心記帳流程。
(()=>{
  const FUND_SYNC_VERSION='2026.10.07-v94';

  function fundSyncState(){
    if(!currentTrip) return 'pending';
    return currentTrip.cloudStatus==='synced' ? 'synced' : 'pending';
  }

  function ensureStyles(){
    if(document.getElementById('fundSyncV94Styles'))return;
    const s=document.createElement('style');
    s.id='fundSyncV94Styles';
    s.textContent=`
      .fund-sync-pill{margin-top:8px;display:inline-flex;align-items:center;justify-content:center;min-width:120px;height:28px;border-radius:999px;padding:0 14px;font-size:11px;font-weight:900}
      .fund-sync-pill.synced{background:#e8f7ef;color:#557768}
      .fund-sync-pill.pending{background:#fff4d8;color:#9a6b12}
    `;
    document.head.appendChild(s);
  }

  function injectSyncPills(){
    ensureStyles();
    const state=fundSyncState();
    document.querySelectorAll('.fund-record-card, .fund-record-v87').forEach(card=>{
      if(card.querySelector('.fund-sync-pill'))return;
      const host=card.querySelector('.fund-record-copy, .fund-record-main, .fund-record-title') || card;
      const pill=document.createElement('div');
      pill.className='fund-sync-pill '+state;
      pill.textContent=state==='synced'?'已同步':'待同步';
      host.appendChild(pill);
    });
  }

  const baseApply=window.applyRecordFilters;
  window.applyRecordFilters=function(){
    const r=typeof baseApply==='function'?baseApply.apply(this,arguments):undefined;
    injectSyncPills();
    return r;
  };

  const baseOpen=window.openRecords;
  window.openRecords=function(){
    const r=typeof baseOpen==='function'?baseOpen.apply(this,arguments):undefined;
    setTimeout(injectSyncPills,0);
    return r;
  };

  const prevBg=window.backgroundFundSyncV90 || window.backgroundFundSyncV86;
  if(typeof prevBg==='function'){
    const wrapped=async function(){
      const ok=await prevBg.apply(this,arguments);
      if(document.getElementById('page-records')?.classList.contains('active') && typeof window.applyRecordFilters==='function'){
        window.applyRecordFilters();
      }
      return ok;
    };
    window.backgroundFundSyncV90=wrapped;
    window.backgroundFundSyncV86=wrapped;
  }

  try{window.WEB_VERSION=FUND_SYNC_VERSION;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=FUND_SYNC_VERSION;
  ensureStyles();
})();
