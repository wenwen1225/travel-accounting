// v130：任意幣別換匯 UI 收尾。移除舊的 TWD/旅行幣別匯率方向按鈕，只保留目前來源→目標匯率顯示。
(()=>{
  const VER='2026.10.13-v130-exchange-rate-ui-cleanup';

  function cleanupExchangeRateUi(){
    const rate=document.getElementById('exchangeRate');
    if(!rate) return;
    const group=rate.closest('.form-group');
    if(!group) return;

    // 舊版可能在匯率欄位內插入「1 KRW = ? TWD / 1 TWD = ? KRW」等方向按鈕。
    // 多幣別版已由來源/目標幣別決定方向，這些按鈕會造成混淆，因此僅在換匯匯率區塊內隱藏。
    group.querySelectorAll('button').forEach(btn=>{
      btn.style.display='none';
      btn.setAttribute('aria-hidden','true');
      btn.tabIndex=-1;
    });

    // 若按鈕外層只是純按鈕容器，一併收起，避免留下空白高度。
    Array.from(group.querySelectorAll('div')).forEach(div=>{
      const buttons=Array.from(div.querySelectorAll(':scope > button'));
      if(buttons.length && Array.from(div.children).every(el=>el.tagName==='BUTTON')){
        div.style.display='none';
      }
    });

    const source=String(document.getElementById('exchangeSourceCurrency')?.value || 'TWD').toUpperCase();
    const target=String(document.getElementById('exchangeTargetCurrency')?.value || currentTrip?.currency || 'KRW').toUpperCase();
    const label=group.querySelector('label');
    if(label) label.textContent=`匯率（1 ${source} = ? ${target}）`;
  }

  function scheduleCleanup(){
    setTimeout(cleanupExchangeRateUi,30);
  }

  document.addEventListener('click',event=>{
    const el=event.target?.closest?.('[onclick]');
    const code=String(el?.getAttribute?.('onclick')||'');
    if(code.includes("openAdd('exchange')") || code.includes('openAdd("exchange")') || code.includes('editExchange(')){
      scheduleCleanup();
    }
  });

  document.addEventListener('change',event=>{
    if(event.target?.id==='exchangeSourceCurrency' || event.target?.id==='exchangeTargetCurrency'){
      scheduleCleanup();
    }
  });

  // ⇄ 交換幣別後也重新整理標籤。
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#exchangeSwapCurrency')) scheduleCleanup();
  });

  scheduleCleanup();

  const oldRenderSettings=window.renderSettings;
  if(typeof oldRenderSettings==='function'){
    window.renderSettings=function(){
      const result=oldRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return result;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
