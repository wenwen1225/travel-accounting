// v134：全部紀錄中的換匯改回既有「右滑刪除」互動。沿用 app-41 的 regular-swipe 機制與 deleteCurrentExchange，不碰後端/同步架構。
(()=>{
  const VER='2026.10.13-v134-records-exchange-swipe-delete';
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

  function escAttr(v){
    return String(v??'')
      .replace(/&/g,'&amp;')
      .replace(/"/g,'&quot;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
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

    const inner=`
      <div class="record ${editable?'editable':''}" ${editable?`onclick="editExchange('${escAttr(x.id)}')"`:''}>
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

    if(!editable) return inner;

    // 完全沿用 app-41 既有 swipe DOM 結構，讓 applyRecordFilters 後的 bindRegularSwipe 自動綁定。
    return `<div class="regular-swipe-shell" data-kind="exchange" data-id="${escAttr(x.id)}"><button class="regular-swipe-delete" type="button">刪除</button><div class="regular-swipe-content">${inner}</div></div>`;
  };

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
