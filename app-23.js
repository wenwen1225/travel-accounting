// v75：換匯欄位雙向自動計算。
// 僅補強換匯表單 UI，不修改既有儲存、同步、queue 或其他記帳流程。
const EXCHANGE_CALC_PATCH_VERSION='2026.10.04-v75';

let exchangeCalcUpdating=false;
let exchangeCalcLastEdited='';

function exchangeCalcNumber(id){
  const el=document.getElementById(id);
  if(!el) return 0;
  const raw=typeof rawNumber==='function' ? rawNumber(el.value) : String(el.value||'').replace(/,/g,'');
  const n=Number(raw);
  return Number.isFinite(n) && n>0 ? n : 0;
}

function exchangeCalcSet(id,value,decimals=0){
  const el=document.getElementById(id);
  if(!el || !Number.isFinite(value) || value<=0) return;
  if(id==='exchangeRate'){
    el.value=Number(value.toFixed(6)).toString();
  }else{
    const rounded=decimals>0 ? Number(value.toFixed(decimals)) : Math.round(value);
    el.value=typeof formatNumberString==='function' ? formatNumberString(String(rounded)) : String(rounded);
  }
}

function exchangeCalcRefreshHint(){
  if(!currentTrip) return;
  const label=document.querySelector('label[for="exchangeRate"]') || document.getElementById('exchangeRate')?.closest('.form-group')?.querySelector('label');
  if(label) label.textContent=`匯率（NT$1 ≈ ? ${currentTrip.currency}）`;
  const input=document.getElementById('exchangeRate');
  if(input) input.placeholder=currentTrip.currency==='KRW' ? '例如：44.2' : '輸入每 NT$1 可換多少外幣';
  const hint=document.getElementById('exchangeCalcHint');
  if(hint) hint.textContent=`任填兩個即可：台幣＋${currentTrip.currency}、台幣＋匯率、${currentTrip.currency}＋匯率。`;
}

function exchangeCalcRun(source){
  if(exchangeCalcUpdating) return;
  exchangeCalcLastEdited=source;
  const twd=exchangeCalcNumber('exchangeTwd');
  const foreign=exchangeCalcNumber('exchangeForeign');
  const rate=exchangeCalcNumber('exchangeRate');
  exchangeCalcUpdating=true;
  try{
    if(source==='twd'){
      if(rate>0) exchangeCalcSet('exchangeForeign',twd*rate,0);
      else if(foreign>0 && twd>0) exchangeCalcSet('exchangeRate',foreign/twd,6);
    }else if(source==='foreign'){
      if(twd>0) exchangeCalcSet('exchangeRate',foreign/twd,6);
      else if(rate>0) exchangeCalcSet('exchangeTwd',foreign/rate,0);
    }else if(source==='rate'){
      if(twd>0) exchangeCalcSet('exchangeForeign',twd*rate,0);
      else if(foreign>0) exchangeCalcSet('exchangeTwd',foreign/rate,0);
    }
  }finally{
    exchangeCalcUpdating=false;
  }
}

function ensureExchangeCalcUi(){
  const twd=document.getElementById('exchangeTwd');
  const foreign=document.getElementById('exchangeForeign');
  const rate=document.getElementById('exchangeRate');
  if(!twd || !foreign || !rate) return;

  rate.type='text';
  rate.inputMode='decimal';

  if(!document.getElementById('exchangeCalcHint')){
    const hint=document.createElement('div');
    hint.id='exchangeCalcHint';
    hint.className='tiny';
    hint.style.cssText='margin-top:6px;color:#6f52c8;font-weight:700;line-height:1.45';
    rate.closest('.form-group')?.appendChild(hint);
  }

  if(!twd.dataset.exchangeCalcBound){
    twd.dataset.exchangeCalcBound='1';
    twd.addEventListener('input',()=>exchangeCalcRun('twd'));
  }
  if(!foreign.dataset.exchangeCalcBound){
    foreign.dataset.exchangeCalcBound='1';
    foreign.addEventListener('input',()=>exchangeCalcRun('foreign'));
  }
  if(!rate.dataset.exchangeCalcBound){
    rate.dataset.exchangeCalcBound='1';
    rate.addEventListener('input',()=>exchangeCalcRun('rate'));
  }
  exchangeCalcRefreshHint();
}

if(typeof openAdd==='function'){
  const v75BaseOpenAdd=openAdd;
  openAdd=function(type){
    const result=v75BaseOpenAdd.apply(this,arguments);
    if(type==='exchange'){
      setTimeout(()=>{
        ensureExchangeCalcUi();
        exchangeCalcRefreshHint();
      },0);
    }
    return result;
  };
}

if(typeof editExchange==='function'){
  const v75BaseEditExchange=editExchange;
  editExchange=function(id){
    const result=v75BaseEditExchange.apply(this,arguments);
    setTimeout(()=>{
      ensureExchangeCalcUi();
      exchangeCalcRefreshHint();
    },0);
    return result;
  };
}

function exchangeCalcApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=EXCHANGE_CALC_PATCH_VERSION;
}

ensureExchangeCalcUi();
exchangeCalcApplyVersion();
setTimeout(exchangeCalcApplyVersion,0);
