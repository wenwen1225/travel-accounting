// v138：旅行統計頁先隱藏「Google Sheet 旅行統計／更新 Sheet 統計」區塊。
// 只改前端顯示，不刪除原功能、不改同步與後端。
(()=>{
  const VER='2026.10.13-v138-hide-stats-sheet-update';

  function hideStatsSheetSync(){
    const card=document.querySelector('#page-stats .stats-sheet-sync');
    if(card) card.style.display='none';
  }

  const baseOpenTripStats=window.openTripStats;
  if(typeof baseOpenTripStats==='function'){
    window.openTripStats=function(){
      const r=baseOpenTripStats.apply(this,arguments);
      hideStatsSheetSync();
      return r;
    };
  }

  hideStatsSheetSync();

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return r;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
