// v95：統一資金紀錄同步條樣式，並以韓幣金色系區分資金紀錄。
// 僅調整全部紀錄顯示，不改資金計算、排序、刪除或同步邏輯。
(()=>{
  const FUND_SYNC_VERSION='2026.10.07-v95';

  function fundSyncState(){
    if(!currentTrip) return 'pending';
    return currentTrip.cloudStatus==='synced' ? 'synced' : 'pending';
  }

  function ensureStyles(){
    if(document.getElementById('fundSyncV95Styles'))return;
    const s=document.createElement('style');
    s.id='fundSyncV95Styles';
    s.textContent=`
      /* 資金同步狀態：跟一般記帳一樣使用長條版 */
      .fund-sync-pill{
        margin-top:9px;
        display:flex;
        align-items:center;
        justify-content:flex-start;
        width:100%;
        height:27px;
        border-radius:999px;
        padding:0 14px;
        box-sizing:border-box;
        font-size:11px;
        font-weight:900;
      }
      .fund-sync-pill.synced{background:#e8f7ef;color:#557768}
      .fund-sync-pill.pending{background:#fff4d8;color:#9a6b12}

      /* 韓國旅程的資金紀錄統一用韓幣金色系，與信用卡淺藍區分 */
      .fund-kind-badge,
      .fund-type-badge,
      .fund-swipe-shell .fund-record-card:before{
        background:#fff1c9!important;
        color:#9a6700!important;
        border:1px solid #f3dda0!important;
      }

      /* 讓同步條真正佔滿內容欄，與一般記帳長條一致 */
      .fund-record-main{min-width:0;flex:1}
      .fund-record-main>.fund-sync-pill{width:100%}
      .fund-record-card>.fund-sync-pill{margin-left:48px;width:calc(100% - 48px)}
    `;
    document.head.appendChild(s);
  }

  function injectSyncPills(){
    ensureStyles();
    const state=fundSyncState();
    document.querySelectorAll('.fund-record-card, .fund-record-v87').forEach(card=>{
      let pill=card.querySelector('.fund-sync-pill');
      if(!pill){
        pill=document.createElement('div');
        pill.className='fund-sync-pill';
        const main=card.querySelector('.fund-record-main');
        if(main) main.appendChild(pill);
        else card.appendChild(pill);
      }
      pill.className='fund-sync-pill '+state;
      pill.textContent=state==='synced'?'已同步':'待同步';
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
