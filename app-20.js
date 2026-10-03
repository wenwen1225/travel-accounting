// v72：修正快速補台幣欄位 NT$ 與 placeholder 重疊，並固定前端版本顯示。
// 純前端 UI 修正；不修改同步、queue、背景重試或 Apps Script。
const FORMAL_FRONTEND_VERSION_V72='2026.10.03-v72';

function v72ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V72;
}

if(typeof checkBackendVersion==='function'){
  const v72BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v72BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v72ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v72BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v72BaseRenderSettings.apply(this,arguments);
    v72ApplyVersion();
    return result;
  };
}

function v72InstallStyles(){
  if(document.getElementById('v72PendingTwdLayoutStyle')) return;
  const style=document.createElement('style');
  style.id='v72PendingTwdLayoutStyle';
  style.textContent=`
    .pending-twd-input-wrap .money-wrap{
      position:relative!important;
      width:100%!important;
      min-width:0!important;
    }
    .pending-twd-input-wrap .money-prefix{
      position:absolute!important;
      left:18px!important;
      top:50%!important;
      transform:translateY(-50%)!important;
      z-index:3!important;
      pointer-events:none!important;
      font-weight:800!important;
      line-height:1!important;
      white-space:nowrap!important;
    }
    #pendingTwdQuickInput{
      width:100%!important;
      min-width:0!important;
      box-sizing:border-box!important;
      padding-left:76px!important;
      padding-right:16px!important;
    }
    #pendingTwdQuickInput::placeholder{
      opacity:.62!important;
    }
  `;
  document.head.appendChild(style);
}

v72InstallStyles();
v72ApplyVersion();
setTimeout(v72ApplyVersion,0);
