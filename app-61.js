// v131：多幣別匯率提示統一。匯率一律定義為「1 來源幣別 = N 目標幣別」。
(()=>{
  const VER='2026.10.13-v131-exchange-rate-formula';

  function currencies(){
    const source=String(document.getElementById('exchangeSourceCurrency')?.value || 'TWD').toUpperCase();
    const target=String(document.getElementById('exchangeTargetCurrency')?.value || currentTrip?.currency || 'KRW').toUpperCase();
    return {source,target};
  }

  function refreshFormulaUi(){
    const rate=document.getElementById('exchangeRate');
    if(!rate) return;
    const group=rate.closest('.form-group');
    if(!group) return;
    const {source,target}=currencies();

    const label=group.querySelector('label');
    if(label) label.textContent=`匯率（1 ${source} = ? ${target}）`;

    // 隱藏舊版 TWD/KRW 專用提示，避免出現「有時乘、有時除」的混淆。
    Array.from(group.querySelectorAll('.tiny, small, .hint, .form-hint')).forEach(el=>{
      if(el.id!=='exchangeRateFormulaHint') el.style.display='none';
    });

    let hint=document.getElementById('exchangeRateFormulaHint');
    if(!hint){
      hint=document.createElement('div');
      hint.id='exchangeRateFormulaHint';
      hint.className='tiny';
      hint.style.marginTop='8px';
      hint.style.color='#6f52c8';
      hint.style.fontWeight='700';
      hint.style.lineHeight='1.45';
      rate.insertAdjacentElement('afterend',hint);
    }
    hint.style.display='block';
    hint.textContent=`統一算法：目標金額 = 來源金額 × 匯率。若手上的匯率方向相反，按上方 ⇄ 交換來源／目標幣別即可。`;
  }

  function schedule(){ setTimeout(refreshFormulaUi,30); }

  document.addEventListener('change',event=>{
    if(event.target?.id==='exchangeSourceCurrency' || event.target?.id==='exchangeTargetCurrency') schedule();
  });
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#exchangeSwapCurrency')) schedule();
    const el=event.target?.closest?.('[onclick]');
    const code=String(el?.getAttribute?.('onclick')||'');
    if(code.includes("openAdd('exchange')") || code.includes('openAdd("exchange")') || code.includes('editExchange(')) schedule();
  });

  schedule();

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
