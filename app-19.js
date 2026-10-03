// v71：快速補台幣時，即時顯示由「外幣金額 ÷ 台幣金額」反推的實際匯率。
// 純前端顯示；不修改 syncRecord、queue、背景同步、重試或 Apps Script。
const FORMAL_FRONTEND_VERSION_V71='2026.10.03-v71';

function v71ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V71;
}

if(typeof checkBackendVersion==='function'){
  const v71BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v71BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v71ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v71BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v71BaseRenderSettings.apply(this,arguments);
    v71ApplyVersion();
    return result;
  };
}

function v71InstallStyles(){
  if(document.getElementById('v71PendingRateStyle')) return;
  const style=document.createElement('style');
  style.id='v71PendingRateStyle';
  style.textContent=`
    .v71-rate-box{
      margin-top:10px;
      padding:11px 13px;
      border:1px solid #e1d7ef;
      border-radius:13px;
      background:#faf7ff;
      color:#645a70;
      font-size:12px;
      line-height:1.5;
    }
    .v71-rate-box.is-ready{background:#f5efff;border-color:#d9c7ff}
    .v71-rate-title{font-weight:900;color:#4f455b;margin-bottom:3px}
    .v71-rate-main{font-size:15px;font-weight:900;color:#7a5bd6}
    .v71-rate-sub{margin-top:2px;color:#8b8195}
  `;
  document.head.appendChild(style);
}

function v71CurrentPendingItem(){
  if(!Array.isArray(pendingTwdQuickItems)) return null;
  return pendingTwdQuickItems[pendingTwdQuickIndex] || null;
}

function v71RawNumber(value){
  if(typeof rawNumber==='function'){
    const raw=rawNumber(value);
    const n=Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const n=Number(String(value||'').replace(/,/g,''));
  return Number.isFinite(n) ? n : 0;
}

function v71EnsureRateBox(){
  const input=document.getElementById('pendingTwdQuickInput');
  if(!input) return null;
  let box=document.getElementById('pendingTwdRateBox');
  if(box) return box;

  box=document.createElement('div');
  box.id='pendingTwdRateBox';
  box.className='v71-rate-box';

  const tools=document.getElementById('pendingTwdQuickInputV69Tools');
  if(tools) tools.insertAdjacentElement('afterend',box);
  else {
    const wrap=input.closest('.money-wrap') || input;
    wrap.insertAdjacentElement('afterend',box);
  }
  return box;
}

function v71UpdatePendingRate(){
  const input=document.getElementById('pendingTwdQuickInput');
  const box=v71EnsureRateBox();
  const item=v71CurrentPendingItem();
  if(!input || !box || !item) return;

  const foreign=Number(item.foreign||0);
  const twd=v71RawNumber(input.value);
  const currency=currentTrip?.currency || '';

  if(!(foreign>0) || !(twd>0)){
    box.classList.remove('is-ready');
    box.innerHTML=`<div class="v71-rate-title">實際匯率</div><div>輸入台幣金額後會自動計算</div>`;
    return;
  }

  const foreignPerTwd=foreign/twd;
  const twdPerForeign=twd/foreign;
  box.classList.add('is-ready');
  box.innerHTML=`
    <div class="v71-rate-title">實際匯率</div>
    <div class="v71-rate-main">1 TWD = ${foreignPerTwd.toLocaleString('en-US',{maximumFractionDigits:6})} ${currency}</div>
    <div class="v71-rate-sub">1 ${currency} = ${twdPerForeign.toLocaleString('en-US',{maximumFractionDigits:6})} TWD</div>`;
}

function v71BindPendingRate(){
  const input=document.getElementById('pendingTwdQuickInput');
  if(!input) return;
  if(input.dataset.v71RateBound!=='1'){
    input.dataset.v71RateBound='1';
    input.addEventListener('input',v71UpdatePendingRate);
    input.addEventListener('change',v71UpdatePendingRate);
  }
  v71EnsureRateBox();
  v71UpdatePendingRate();
}

if(typeof renderPendingTwdQuick==='function'){
  const v71BaseRenderPendingTwdQuick=renderPendingTwdQuick;
  renderPendingTwdQuick=function(){
    const result=v71BaseRenderPendingTwdQuick.apply(this,arguments);
    setTimeout(v71BindPendingRate,0);
    return result;
  };
}

if(typeof openPendingTwd==='function'){
  const v71BaseOpenPendingTwd=openPendingTwd;
  openPendingTwd=function(){
    const result=v71BaseOpenPendingTwd.apply(this,arguments);
    setTimeout(v71BindPendingRate,0);
    return result;
  };
}

v71InstallStyles();
v71ApplyVersion();
setTimeout(v71ApplyVersion,0);
