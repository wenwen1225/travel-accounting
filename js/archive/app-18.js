// v70：徹底修正「先前費用」日期仍顯示原生行事曆／跑版。
// 只處理先前費用日期 UI 與版本顯示，不修改同步、刪除、queue、重試或 Apps Script。
const FORMAL_FRONTEND_VERSION_V70='2026.10.03-v70';

function v70ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V70;
}

if(typeof checkBackendVersion==='function'){
  const v70BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v70BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v70ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v70BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v70BaseRenderSettings.apply(this,arguments);
    v70ApplyVersion();
    return result;
  };
}

function v70InstallStyles(){
  if(document.getElementById('v70PretripDateStyle')) return;
  const style=document.createElement('style');
  style.id='v70PretripDateStyle';
  style.textContent=`
    /* 原生 date input 完全隱藏，避免 iPhone Safari 把行事曆 UI 撐開。 */
    #pretripDate.v70-native-date-hidden{
      display:none!important;
      position:absolute!important;
      width:0!important;
      height:0!important;
      min-width:0!important;
      min-height:0!important;
      padding:0!important;
      margin:0!important;
      border:0!important;
      opacity:0!important;
      pointer-events:none!important;
      appearance:none!important;
      -webkit-appearance:none!important;
    }
    #pretripDateV67Host{
      display:grid!important;
      grid-template-columns:1.25fr .9fr .9fr!important;
      gap:8px!important;
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      box-sizing:border-box!important;
    }
    #pretripDateV67Host select{
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      height:48px!important;
      box-sizing:border-box!important;
      border:1px solid #ddd3ef!important;
      border-radius:14px!important;
      background:#fff!important;
      color:#2f2939!important;
      padding:0 8px!important;
      font-size:15px!important;
      font-weight:700!important;
    }
    @media(max-width:420px){
      #pretripDateV67Host{grid-template-columns:1.2fr .88fr .88fr!important;gap:6px!important}
      #pretripDateV67Host select{font-size:14px!important;padding:0 5px!important}
    }
  `;
  document.head.appendChild(style);
}

function v70FixPretripDate(){
  const input=document.getElementById('pretripDate');
  if(!input) return;

  // 先用 v67 已有的年月日下拉邏輯建立控制項。
  if(typeof v67BuildFreeDateSelect==='function'){
    v67BuildFreeDateSelect('pretripDate');
  }

  // 不論舊版曾套過哪些 class/style，最後都強制原生行事曆完全隱藏。
  input.classList.remove('v64-free-date','v63-native-date-hidden');
  input.classList.add('v70-native-date-hidden');
  input.style.display='none';
  input.style.position='absolute';
  input.style.width='0';
  input.style.height='0';
  input.style.minWidth='0';
  input.style.minHeight='0';
  input.style.padding='0';
  input.style.margin='0';
  input.style.border='0';
  input.style.opacity='0';
  input.style.pointerEvents='none';

  const host=document.getElementById('pretripDateV67Host');
  if(host){
    host.style.display='grid';
    host.style.width='100%';
    host.style.maxWidth='100%';
  }
}

// openAdd 會被多個歷史補丁包裝；不判斷 type，頁面打開後只要先前費用表單存在就重新確認一次。
if(typeof window.openAdd==='function'){
  const v70BaseOpenAdd=window.openAdd;
  window.openAdd=function(){
    const result=v70BaseOpenAdd.apply(this,arguments);
    setTimeout(v70FixPretripDate,0);
    setTimeout(v70FixPretripDate,80);
    return result;
  };
}

if(typeof window.editPretrip==='function'){
  const v70BaseEditPretrip=window.editPretrip;
  window.editPretrip=function(){
    const result=v70BaseEditPretrip.apply(this,arguments);
    setTimeout(v70FixPretripDate,0);
    setTimeout(v70FixPretripDate,80);
    return result;
  };
}

// 兼容舊程式在 showPage / DOM 重畫後把原生 date input 再顯示出來。
const v70Observer=new MutationObserver(()=>{
  const form=document.getElementById('pretripForm');
  if(form && !form.classList.contains('hidden')){
    const input=document.getElementById('pretripDate');
    if(input && (!input.classList.contains('v70-native-date-hidden') || input.style.display!=='none')){
      v70FixPretripDate();
    }
  }
});

if(document.body){
  v70Observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','style']});
}

v70InstallStyles();
v70FixPretripDate();
v70ApplyVersion();
setTimeout(v70ApplyVersion,0);
