// v146：前端安全整理。
// 1) 移除「重新讀取雲端最新資料」按鈕，避免誤觸後以雲端資料覆蓋本機。
// 2) Apps Script 版本檢查改為接受目前 v63.x 後端，不再因 v63.6 > v61 誤判版本不一致。
// 3) 網站版本顯示更新為 v146。
(()=>{
  const VER='2026.10.15-v146-safe-cloud-ui';
  if(window.__travelV146Installed) return;
  window.__travelV146Installed=true;

  function removeCloudReloadButton(){
    const btn=document.getElementById('cloudReloadBtn');
    if(btn) btn.remove();
  }

  // 設定頁每次重畫時都再確認一次，避免舊 renderSettings 把按鈕留著。
  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      removeCloudReloadButton();
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return r;
    };
  }

  // v63.x 視為目前相容後端；避免舊前端硬性要求 v61。
  if(typeof checkBackendVersion==='function'){
    checkBackendVersion=async function(silent=true){
      const webEl=document.getElementById('webVersionText');
      const scriptEl=document.getElementById('scriptVersionText');
      const statusEl=document.getElementById('versionMatchStatus');
      const btn=document.getElementById('versionCheckBtn');

      if(webEl) webEl.textContent=VER;

      if(!getApiUrl()){
        if(scriptEl) scriptEl.textContent='尚未設定';
        if(statusEl){
          statusEl.textContent='請先設定 Apps Script Web App URL';
          statusEl.className='version-check-status version-check-warn';
        }
        return false;
      }

      if(btn){ btn.disabled=true; btn.textContent='檢查中…'; }
      if(statusEl){
        statusEl.textContent='正在確認後端版本…';
        statusEl.className='version-check-status';
      }

      try{
        const data=await postToCloud({action:'getVersion'});
        const version=String(data.scriptVersion||'');
        const matched=/^v63(?:\.|$)/i.test(version);

        state.lastScriptVersion=version;
        state.lastVersionCheckAt=new Date().toISOString();
        try{persist();}catch(e){}

        if(scriptEl) scriptEl.textContent=version||'未知版本';
        if(statusEl){
          statusEl.textContent=matched
            ? '版本相容，可以正常同步'
            : '目前網站支援 v63.x，後端是 '+(version||'未知');
          statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
        }

        if(!matched && !silent){
          alert('Apps Script 版本不相容。\n目前網站支援：v63.x\n目前後端：'+(version||'未知版本'));
        }
        return matched;
      }catch(err){
        const msg=err&&err.message?err.message:String(err);
        if(scriptEl) scriptEl.textContent='檢查失敗';
        if(statusEl){
          statusEl.textContent='版本檢查失敗：'+msg;
          statusEl.className='version-check-status version-check-error';
        }
        if(!silent) alert('Apps Script 版本檢查失敗：\n'+msg);
        return false;
      }finally{
        if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
      }
    };
    window.checkBackendVersion=checkBackendVersion;
  }

  removeCloudReloadButton();
  document.addEventListener('DOMContentLoaded',()=>{
    removeCloudReloadButton();
    const web=document.getElementById('webVersionText');
    if(web) web.textContent=VER;
  });

  // 若之後有舊版程式重新渲染設定頁，也把危險按鈕拿掉。
  const observer=new MutationObserver(()=>removeCloudReloadButton());
  observer.observe(document.documentElement,{childList:true,subtree:true});

  try{window.WEB_VERSION=VER;}catch(e){}
})();
