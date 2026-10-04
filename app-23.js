// v76：換匯欄位雙向自動計算＋雙匯率模式。
// 操作邏輯與現金消費一致；不修改既有儲存、同步、queue 或其他記帳流程。
const EXCHANGE_CALC_PATCH_VERSION='2026.10.04-v76';
const EXCHANGE_RATE_MODE_FOREIGN_TO_TWD='foreignToTwd';
const EXCHANGE_RATE_MODE_TWD_TO_FOREIGN='twdToForeign';

let exchangeCalcUpdating=false;
let exchangeRateMode=EXCHANGE_RATE_MODE_TWD_TO_FOREIGN;

function exchangeCalcNumber(id){
  const el=document.getElementById(id);
  if(!el) return 0;
  const raw=typeof rawNumber==='function'
    ? rawNumber(el.value)
    : String(el.value||'').replace(/,/g,'');
  const n=Number(raw);
  return Number.isFinite(n) && n>0 ? n : 0;
}

function exchangeCalcRateFmt(value){
  const n=Number(value);
  if(!Number.isFinite(n) || n<=0) return '';
  return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
}

function exchangeCalcSet(id,value){
  const el=document.getElementById(id);
  if(!el || !Number.isFinite(value) || value<=0) return;

  if(id==='exchangeRate'){
    el.value=exchangeCalcRateFmt(value);
    return;
  }

  const rounded=Math.round(value);
  el.value=typeof formatNumberString==='function'
    ? formatNumberString(String(rounded))
    : String(rounded);
}

function exchangeRateFromAmounts(twd,foreign){
  if(!(twd>0) || !(foreign>0)) return 0;
  return exchangeRateMode===EXCHANGE_RATE_MODE_TWD_TO_FOREIGN
    ? foreign/twd
    : twd/foreign;
}

function exchangeForeignFromTwdAndRate(twd,rate){
  if(!(twd>0) || !(rate>0)) return 0;
  return exchangeRateMode===EXCHANGE_RATE_MODE_TWD_TO_FOREIGN
    ? twd*rate
    : twd/rate;
}

function exchangeTwdFromForeignAndRate(foreign,rate){
  if(!(foreign>0) || !(rate>0)) return 0;
  return exchangeRateMode===EXCHANGE_RATE_MODE_TWD_TO_FOREIGN
    ? foreign/rate
    : foreign*rate;
}

function setExchangeRateMode(mode){
  if(![EXCHANGE_RATE_MODE_FOREIGN_TO_TWD,EXCHANGE_RATE_MODE_TWD_TO_FOREIGN].includes(mode)) return;

  const twd=exchangeCalcNumber('exchangeTwd');
  const foreign=exchangeCalcNumber('exchangeForeign');

  exchangeRateMode=mode;

  // 若兩邊金額都已經有值，切換模式時直接重算匯率，避免數字含義混淆。
  if(twd>0 && foreign>0){
    exchangeCalcSet('exchangeRate',exchangeRateFromAmounts(twd,foreign));
  }

  exchangeCalcRefreshUi();
}

function exchangeCalcRefreshUi(){
  if(!currentTrip) return;

  const code=currentTrip.currency || '外幣';
  const direct=document.getElementById('exchangeRateDirectBtn');
  const inverse=document.getElementById('exchangeRateInverseBtn');
  const hint=document.getElementById('exchangeCalcHint');

  if(direct){
    direct.textContent=`1 ${code} = ? TWD`;
    direct.classList.toggle('active',exchangeRateMode===EXCHANGE_RATE_MODE_FOREIGN_TO_TWD);
  }

  if(inverse){
    inverse.textContent=`1 TWD = ? ${code}`;
    inverse.classList.toggle('active',exchangeRateMode===EXCHANGE_RATE_MODE_TWD_TO_FOREIGN);
  }

  const rate=document.getElementById('exchangeRate');
  const label=rate?.closest('.form-group')?.querySelector('label');
  if(label) label.textContent='匯率';

  if(rate){
    rate.placeholder=exchangeRateMode===EXCHANGE_RATE_MODE_TWD_TO_FOREIGN
      ? (code==='KRW' ? '例如：44.2' : `每 NT$1 可換多少 ${code}`)
      : `每 1 ${code} 約等於多少 TWD`;
  }

  if(hint){
    hint.textContent=exchangeRateMode===EXCHANGE_RATE_MODE_TWD_TO_FOREIGN
      ? `${code} = TWD × 匯率；任填台幣／${code}／匯率其中兩個即可。`
      : `TWD = ${code} × 匯率；任填台幣／${code}／匯率其中兩個即可。`;
  }
}

function exchangeCalcRun(source){
  if(exchangeCalcUpdating) return;

  const twd=exchangeCalcNumber('exchangeTwd');
  const foreign=exchangeCalcNumber('exchangeForeign');
  const rate=exchangeCalcNumber('exchangeRate');

  exchangeCalcUpdating=true;
  try{
    if(source==='twd'){
      if(rate>0 && twd>0){
        exchangeCalcSet('exchangeForeign',exchangeForeignFromTwdAndRate(twd,rate));
      }else if(foreign>0 && twd>0){
        exchangeCalcSet('exchangeRate',exchangeRateFromAmounts(twd,foreign));
      }
    }else if(source==='foreign'){
      if(rate>0 && foreign>0){
        exchangeCalcSet('exchangeTwd',exchangeTwdFromForeignAndRate(foreign,rate));
      }else if(twd>0 && foreign>0){
        exchangeCalcSet('exchangeRate',exchangeRateFromAmounts(twd,foreign));
      }
    }else if(source==='rate'){
      if(twd>0 && rate>0){
        exchangeCalcSet('exchangeForeign',exchangeForeignFromTwdAndRate(twd,rate));
      }else if(foreign>0 && rate>0){
        exchangeCalcSet('exchangeTwd',exchangeTwdFromForeignAndRate(foreign,rate));
      }
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

  const rateGroup=rate.closest('.form-group');

  if(rateGroup && !document.getElementById('exchangeRateModeButtons')){
    const buttons=document.createElement('div');
    buttons.id='exchangeRateModeButtons';
    buttons.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px';
    buttons.innerHTML=`
      <button id="exchangeRateDirectBtn" type="button" class="secondary" onclick="setExchangeRateMode('${EXCHANGE_RATE_MODE_FOREIGN_TO_TWD}')"></button>
      <button id="exchangeRateInverseBtn" type="button" class="secondary" onclick="setExchangeRateMode('${EXCHANGE_RATE_MODE_TWD_TO_FOREIGN}')"></button>
    `;
    rateGroup.insertBefore(buttons,rate);
  }

  if(!document.getElementById('exchangeRateModeStyle')){
    const style=document.createElement('style');
    style.id='exchangeRateModeStyle';
    style.textContent=`
      #exchangeRateModeButtons .secondary{
        transition:.16s ease;
        border:1px solid #ddd3ef;
        background:#fff;
        color:#746783;
      }
      #exchangeRateModeButtons .secondary.active{
        background:#7c5ce7!important;
        border-color:#7c5ce7!important;
        color:#fff!important;
        box-shadow:0 5px 14px rgba(124,92,231,.22);
      }
      #exchangeRateModeButtons .secondary.active::after{
        content:' ✓';
        font-weight:900;
      }
    `;
    document.head.appendChild(style);
  }

  if(!document.getElementById('exchangeCalcHint')){
    const hint=document.createElement('div');
    hint.id='exchangeCalcHint';
    hint.className='tiny';
    hint.style.cssText='margin-top:6px;color:#6f52c8;font-weight:700;line-height:1.45';
    rateGroup?.appendChild(hint);
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

  exchangeCalcRefreshUi();
}

if(typeof openAdd==='function'){
  const v76BaseOpenAdd=openAdd;
  openAdd=function(type){
    const result=v76BaseOpenAdd.apply(this,arguments);
    if(type==='exchange'){
      setTimeout(()=>{
        ensureExchangeCalcUi();
        exchangeCalcRefreshUi();
      },0);
    }
    return result;
  };
}

if(typeof editExchange==='function'){
  const v76BaseEditExchange=editExchange;
  editExchange=function(id){
    const result=v76BaseEditExchange.apply(this,arguments);
    setTimeout(()=>{
      ensureExchangeCalcUi();

      // 編輯舊資料時，用目前金額推回當下所選模式的匯率顯示。
      const twd=exchangeCalcNumber('exchangeTwd');
      const foreign=exchangeCalcNumber('exchangeForeign');
      if(twd>0 && foreign>0){
        exchangeCalcSet('exchangeRate',exchangeRateFromAmounts(twd,foreign));
      }
      exchangeCalcRefreshUi();
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
