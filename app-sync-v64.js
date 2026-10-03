// v64：配合 Apps Script v53。一般記帳不再被全域 ScriptLock 卡住。
(function(){
  const PATCH_VERSION='2026.10.03-v64';
  const EXPECTED_BACKEND='v53';

  // 舊版因 SYNC_BUSY 卡住的項目，升級後立刻允許重試。
  try{
    (state.syncQueue||[]).forEach(q=>{
      const m=String(q.lastError||'').toLowerCase();
      if(m.includes('sync_busy') || m.includes('正在處理其他同步')){
        q.nextRetryAt=0;
        q.lastError='後端已改用新版同步機制，等待重新同步';
      }
    });
    persist();
  }catch(_e){}

  checkBackendVersion=async function(silent=true){
    const webEl=document.getElementById('webVersionText');
    const scriptEl=document.getElementById('scriptVersionText');
    const statusEl=document.getElementById('versionMatchStatus');
    const btn=document.getElementById('versionCheckBtn');
    if(webEl) webEl.textContent=PATCH_VERSION;
    if(!getApiUrl()) return false;
    if(btn){ btn.disabled=true; btn.textContent='檢查中…'; }
    try{
      const data=await postToCloud({action:'getVersion'});
      const version=String(data.scriptVersion||'');
      const matched=version===EXPECTED_BACKEND;
      state.lastScriptVersion=version;
      state.lastVersionCheckAt=new Date().toISOString();
      persist();
      if(scriptEl) scriptEl.textContent=version || '未知版本';
      if(statusEl){
        statusEl.textContent=matched
          ? '版本一致，可以正常同步'
          : '版本不一致：網站需要 '+EXPECTED_BACKEND+'，目前後端是 '+(version||'未知');
        statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-warn');
      }
      if(!matched && !silent){
        alert('目前 Apps Script 是 '+(version||'未知版本')+'，請更新到 '+EXPECTED_BACKEND+'。');
      }
      return matched;
    }catch(err){
      if(scriptEl) scriptEl.textContent='檢查失敗';
      if(statusEl){
        statusEl.textContent='版本檢查失敗：'+String(err?.message||err);
        statusEl.className='version-check-status version-check-error';
      }
      return false;
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
    }
  };

  try{
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    if((state.syncQueue||[]).length) setTimeout(()=>autoSyncPendingRecords(),300);
  }catch(_e){}
})();
