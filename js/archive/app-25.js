// v78：修正換匯同步資料正規化＋手機「全部紀錄」日期欄跑版。
// 僅處理這兩個問題，不修改其他記帳、退稅、統計或同步流程。
const EXCHANGE_SYNC_DATE_LAYOUT_PATCH_VERSION='2026.10.04-v78';

function v78CanonicalExchangeRate(twd,foreign){
  const t=Number(twd||0);
  const f=Number(foreign||0);
  if(!(t>0) || !(f>0)) return 0;
  // 後端與 Sheet 統一保存：1 TWD = ? 外幣
  return f/t;
}

if(typeof saveExchange==='function'){
  const v78BaseSaveExchange=saveExchange;
  saveExchange=async function(){
    const twdEl=document.getElementById('exchangeTwd');
    const foreignEl=document.getElementById('exchangeForeign');
    const rateEl=document.getElementById('exchangeRate');

    let twd=typeof exchangeCalcNumber==='function' ? exchangeCalcNumber('exchangeTwd') : Number(rawNumber(twdEl?.value||'')||0);
    let foreign=typeof exchangeCalcNumber==='function' ? exchangeCalcNumber('exchangeForeign') : Number(rawNumber(foreignEl?.value||'')||0);
    const enteredRate=typeof exchangeCalcNumber==='function' ? exchangeCalcNumber('exchangeRate') : Number(rawNumber(rateEl?.value||'')||0);

    // 若只填兩個欄位，儲存前再補一次第三個，避免 input 事件在手機上沒有及時觸發。
    if(!(twd>0) && foreign>0 && enteredRate>0 && typeof exchangeTwdFromForeignAndRate==='function'){
      twd=exchangeTwdFromForeignAndRate(foreign,enteredRate);
      if(twdEl && twd>0) twdEl.value=typeof formatNumberString==='function' ? formatNumberString(String(Math.round(twd))) : String(Math.round(twd));
    }
    if(!(foreign>0) && twd>0 && enteredRate>0 && typeof exchangeForeignFromTwdAndRate==='function'){
      foreign=exchangeForeignFromTwdAndRate(twd,enteredRate);
      if(foreignEl && foreign>0) foreignEl.value=typeof formatNumberString==='function' ? formatNumberString(String(Math.round(foreign))) : String(Math.round(foreign));
    }

    twd=typeof exchangeCalcNumber==='function' ? exchangeCalcNumber('exchangeTwd') : Number(rawNumber(twdEl?.value||'')||0);
    foreign=typeof exchangeCalcNumber==='function' ? exchangeCalcNumber('exchangeForeign') : Number(rawNumber(foreignEl?.value||'')||0);

    if(!(twd>0) || !(foreign>0)){
      alert('換匯紀錄請至少填入台幣、外幣、匯率其中兩項，讓系統可以算出完整金額。');
      return;
    }

    // 不論畫面目前選哪種匯率模式，送到既有後端前統一成「外幣 ÷ 台幣」。
    const canonicalRate=v78CanonicalExchangeRate(twd,foreign);
    if(rateEl && canonicalRate>0){
      rateEl.value=typeof exchangeCalcRateFmt==='function'
        ? exchangeCalcRateFmt(canonicalRate)
        : String(canonicalRate);
    }

    return v78BaseSaveExchange.apply(this,arguments);
  };
}

(()=>{
  if(document.getElementById('v78RecordsDateLayoutStyle')) return;
  const style=document.createElement('style');
  style.id='v78RecordsDateLayoutStyle';
  style.textContent=`
    #recordsFilterCard .records-filter-grid{
      min-width:0!important;
    }
    #recordsFilterCard .records-filter-grid .form-group{
      min-width:0!important;
      width:100%!important;
    }
    #recordFilterDate{
      display:block!important;
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      box-sizing:border-box!important;
      overflow:hidden!important;
    }
    #recordFilterDate::-webkit-date-and-time-value{
      min-width:0!important;
      text-align:left!important;
    }
    #recordFilterDate::-webkit-calendar-picker-indicator{
      flex:0 0 auto!important;
    }
    @media (max-width:520px){
      #recordsFilterCard .records-filter-grid{
        grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
      }
    }
  `;
  document.head.appendChild(style);
})();

function v78ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=EXCHANGE_SYNC_DATE_LAYOUT_PATCH_VERSION;
}

v78ApplyVersion();
setTimeout(v78ApplyVersion,0);
