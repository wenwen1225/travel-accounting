// v133：全部紀錄中的換匯顯示＋直接刪除。沿用既有雲端刪除規則，不碰新增/修改/後端資料格式。
(()=>{
  const VER='2026.10.13-v133-records-exchange-delete';
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

  window.deleteExchangeFromRecords=async function(id,event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if(isCurrentTripArchived()) return archiveReadOnlyAlert();
    if(!currentTrip || !id) return;

    const item=(currentTrip.exchange||[]).find(x=>x.id===id);
    if(!item) return;
    const confirmText=typeof deleteRecordConfirmText==='function'
      ? deleteRecordConfirmText('exchange',item)
      : '確定要刪除這筆換匯紀錄嗎？';
    if(!confirm(confirmText)) return;

    if(getApiUrl() && currentTrip.spreadsheetId){
      try{
        await postToCloud({
          action:'deleteExchange',
          spreadsheetId:currentTrip.spreadsheetId,
          clientTripId:currentTrip.id,
          recordId:item.id,
          baseFingerprint:item.cloudFingerprint || ''
        });
      }catch(err){
        const message=String(err?.message || err || '');
        if(!message.includes('找不到要刪除的換匯紀錄')){
          alert('Google Sheets 刪除失敗，本機資料先保留：'+message);
          return;
        }
      }
    }

    currentTrip.exchange=(currentTrip.exchange||[]).filter(x=>x.id!==id);
    state.syncQueue=(state.syncQueue||[]).filter(q=>q.recordId!==id);
    if(typeof allRecordSource!=='undefined'){
      allRecordSource=(allRecordSource||[]).filter(x=>x.id!==id);
    }
    persist();
    if(typeof applyRecordFilters==='function') applyRecordFilters();
    if(typeof renderTripSummary==='function') renderTripSummary();
    alert('這筆換匯紀錄已刪除，Google Sheets 也會同步移除。');
  };

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
          ${editable?`<button type="button" class="pill danger" style="margin-top:8px" onclick="deleteExchangeFromRecords('${x.id}',event)">刪除</button>`:''}
        </div>
      </div>`;
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
