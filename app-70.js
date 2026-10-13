// v142：首頁旅行頁重新排序，共同資金／每日現金流移到「快速新增」下方。
// 純前端位置調整，不改資金資料、計算、同步或後端。
(()=>{
  const VER='2026.10.13-v142-fund-section-order';

  function findQuickAddSection(){
    const page=document.getElementById('page-trip');
    if(!page) return null;
    return [...page.querySelectorAll(':scope > .section')].find(sec=>{
      const title=sec.querySelector(':scope > .section-title');
      return String(title?.textContent||'').trim()==='快速新增';
    }) || null;
  }

  function moveFundSections(){
    const quick=findQuickAddSection();
    const fund=document.getElementById('fundAccountsSection');
    if(!quick||!fund) return;

    // 共同資金緊接在快速新增下方。
    if(quick.nextElementSibling!==fund){
      quick.insertAdjacentElement('afterend',fund);
    }

    // 每日現金流維持跟在共同資金後面，避免被留在頁面上方。
    const daily=document.getElementById('fundDailySummaryV136');
    if(daily && fund.nextElementSibling!==daily){
      fund.insertAdjacentElement('afterend',daily);
    }
  }

  function schedule(){
    setTimeout(moveFundSections,0);
    setTimeout(moveFundSections,80);
    setTimeout(moveFundSections,220);
  }

  const baseOpenTrip=window.openTrip;
  if(typeof baseOpenTrip==='function'){
    window.openTrip=function(){
      const r=baseOpenTrip.apply(this,arguments);
      schedule();
      return r;
    };
  }

  const baseRenderTripSummary=window.renderTripSummary;
  if(typeof baseRenderTripSummary==='function'){
    window.renderTripSummary=function(){
      const r=baseRenderTripSummary.apply(this,arguments);
      schedule();
      return r;
    };
  }

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const w=document.getElementById('webVersionText');if(w)w.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  schedule();
})();
