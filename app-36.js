// v96：統一資金紀錄同步條；左側類型色恢復，右側外幣金額改用外幣專用色。
// 僅調整全部紀錄顯示，不改資金計算、排序、刪除或同步邏輯。
(()=>{
  const FUND_SYNC_VERSION='2026.10.07-v96';

  function fundSyncState(){
    if(!currentTrip) return 'pending';
    return currentTrip.cloudStatus==='synced' ? 'synced' : 'pending';
  }

  function isForeignCurrency(){
    return Boolean(currentTrip?.currency) && String(currentTrip.currency).toUpperCase()!=='TWD';
  }

  function ensureStyles(){
    if(document.getElementById('fundSyncV96Styles'))return;
    const s=document.createElement('style');
    s.id='fundSyncV96Styles';
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

      /* 左側 icon 回到原本「初 / 收 / 支 / 調 / 轉」分類色 */
      .fund-kind-badge.initial,.fund-type-badge.fund-badge-initial{background:#f2ecff!important;color:#7c3aed!important;border:0!important}
      .fund-kind-badge.income,.fund-type-badge.fund-badge-income{background:#e7f8ec!important;color:#15803d!important;border:0!important}
      .fund-kind-badge.expense,.fund-type-badge.fund-badge-expense{background:#ffe8ee!important;color:#c2415a!important;border:0!important}
      .fund-kind-badge.adjust,.fund-type-badge.fund-badge-adjust{background:#f0e8ff!important;color:#7c3aed!important;border:0!important}
      .fund-kind-badge.transfer,.fund-type-badge.fund-badge-transfer{background:#e6f0ff!important;color:#2563eb!important;border:0!important}
      .fund-swipe-shell.fund-v86-income .fund-record-card:before{background:#e7f8ec!important;color:#15803d!important;border:0!important}
      .fund-swipe-shell.fund-v86-expense .fund-record-card:before{background:#ffe8ee!important;color:#c2415a!important;border:0!important}
      .fund-swipe-shell.fund-v86-adjust .fund-record-card:before{background:#f0e8ff!important;color:#7c3aed!important;border:0!important}
      .fund-swipe-shell.fund-v86-transfer .fund-record-card:before{background:#e6f0ff!important;color:#2563eb!important;border:0!important}

      /* 外幣資金：右側金額與餘額用固定外幣色，台幣仍維持原本深色 */
      .fund-foreign-currency .fund-record-amount strong,
      .fund-foreign-currency .fund-record-money strong{
        color:#6f5bd3!important;
      }
      .fund-foreign-currency .fund-record-amount span,
      .fund-foreign-currency .fund-record-money span{
        color:#8a7fba!important;
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
    const foreign=isForeignCurrency();
    document.querySelectorAll('.fund-record-card, .fund-record-v87').forEach(card=>{
      card.classList.toggle('fund-foreign-currency',foreign);
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
