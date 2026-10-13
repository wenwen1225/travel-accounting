// v132：全部紀錄中的換匯顯示改成「來源幣別金額 → 目標幣別金額」。只改前端顯示，不碰同步與後端。
(()=>{
  const VER='2026.10.13-v132-records-exchange-pair-display';
  const oldRecordHtml=window.recordHtml;
  if(typeof oldRecordHtml!=='function') return;

  const SYMBOLS={
    TWD:'NT$', KRW:'₩', JPY:'¥', USD:'$', EUR:'€', CNY:'¥', HKD:'HK$',
    SGD:'S$', THB:'฿', MYR:'RM', GBP:'£', AUD:'A$', CAD:'C$'
  };

  function tripCurrency(){
    return String(currentTrip?.currency || 'KRW').toUpperCase();
  }

  function money(code,value){
    const c=String(code||'').toUpperCase();
    const n=Number(value||0);
    const symbol=SYMBOLS[c] || (c ? c+' ' : '');
    const digits=['KRW','JPY','TWD'].includes(c) ? 0 : 2;
    return symbol + n.toLocaleString('en-US',{
      minimumFractionDigits:0,
      maximumFractionDigits:digits
    });
  }

  function inferLegacy(item){
    const trip=tripCurrency();
    const twd=Math.abs(Number(item?.twd||0));
    const foreign=Math.abs(Number(item?.foreign||0));
    const rate=Number(item?.rate||0);
    const forward=twd>0 ? foreign/twd : 0;
    const reverse=foreign>0 ? twd/foreign : 0;
    const reverseIsCloser=rate>0 && Math.abs(rate-reverse)<Math.abs(rate-forward);
    return reverseIsCloser
      ? {sourceCurrency:trip,sourceAmount:foreign,targetCurrency:'TWD',targetAmount:twd}
      : {sourceCurrency:'TWD',sourceAmount:twd,targetCurrency:trip,targetAmount:foreign};
  }

  function pairFor(item){
    if(item?.sourceCurrency && item?.targetCurrency){
      return {
        sourceCurrency:String(item.sourceCurrency).toUpperCase(),
        sourceAmount:Number(item.sourceAmount||0),
        targetCurrency:String(item.targetCurrency).toUpperCase(),
        targetAmount:Number(item.targetAmount||0)
      };
    }
    return inferLegacy(item);
  }

  window.recordHtml=function(x){
    if(x?.type!=='換匯') return oldRecordHtml.apply(this,arguments);

    const p=pairFor(x);
    const editable=!isCurrentTripArchived();
    const rate=Number(x.rate||0);
    const rateText=rate>0
      ? `1 ${p.sourceCurrency} = ${rate.toLocaleString('en-US',{maximumFractionDigits:6})} ${p.targetCurrency}`
      : `${p.sourceCurrency} → ${p.targetCurrency}`;

    return `
      <div class="record ${editable?'editable':''}" ${editable?`onclick="editExchange('${x.id}')"`:''}>
        <div class="avatar person-avatar">換</div>
        <div class="record-main">
          <strong>換匯紀錄</strong>
          <span>${dateWithWeekday(x.date)} · ${p.sourceCurrency} → ${p.targetCurrency}</span>
          ${x.place?`<div class="record-note">${x.place}</div>`:''}
          ${x.note?`<div class="record-note">${x.note}</div>`:''}
          <div class="record-category">${rateText}</div>
          <div style="margin-top:5px">${syncBadgeHtml(x)}</div>
        </div>
        <div class="record-amt">
          <strong>${money(p.sourceCurrency,p.sourceAmount)}</strong>
          <span>→ ${money(p.targetCurrency,p.targetAmount)}</span>
        </div>
      </div>`;
  };

  // 若使用者正在「全部紀錄」頁，載入新版後立即重畫一次。
  try{
    if(document.getElementById('page-records') && !document.getElementById('page-records').classList.contains('hidden') && typeof applyRecordFilters==='function'){
      applyRecordFilters();
    }
  }catch(e){}

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
