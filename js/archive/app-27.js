// v80：前端後端版本檢查改為 v53。
// 僅調整版本檢查，不修改記帳、同步、換匯、退稅或統計流程。
const BACKEND_VERSION_V53_PATCH='2026.10.04-v80';

if(typeof checkBackendVersion==='function'){
  checkBackendVersion=async function(silent=true){
    const webEl=document.getElementById('webVersionText');
    const scriptEl=document.getElementById('scriptVersionText');
    const statusEl=document.getElementById('versionMatchStatus');
    const btn=document.getElementById('versionCheckBtn');
    const expected='v53';

    if(webEl) webEl.textContent=BACKEND_VERSION_V53_PATCH;

    if(!getApiUrl()){
      if(scriptEl) scriptEl.textContent='尚未設定';
      if(statusEl){
        statusEl.textContent='尚未設定 Apps Script Web App URL';
        statusEl.className='version-check-status version-check-error';
      }
      return false;
    }

    if(btn) btn.disabled=true;
    try{
      const data=await postToCloud({action:'getVersion'});
      const version=String(data.scriptVersion || '');
      const matched=version===expected;

      state.lastScriptVersion=version;
      state.lastVersionCheckAt=new Date().toISOString();
      persist();

      if(scriptEl) scriptEl.textContent=version || '未知版本';
      if(statusEl){
        statusEl.textContent=matched
          ? '版本一致，可以正常同步'
          : '版本不一致：網站需要 '+expected+'，目前後端是 '+(version||'未知');
        statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
      }

      if(!matched && !silent){
        alert('Apps Script 版本不一致。\n網站需要：'+expected+'\n目前後端：'+(version||'未知版本')+'\n\n請重新部署最新 Apps Script。');
      }
      return matched;
    }catch(err){
      if(scriptEl) scriptEl.textContent='檢查失敗';
      if(statusEl){
        statusEl.textContent='無法讀取 Apps Script 版本：'+(err?.message || err);
        statusEl.className='version-check-status version-check-error';
      }
      if(!silent) alert('版本檢查失敗：'+(err?.message || err));
      return false;
    }finally{
      if(btn) btn.disabled=false;
    }
  };
}

function v80ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=BACKEND_VERSION_V53_PATCH;
}
v80ApplyVersion();
setTimeout(v80ApplyVersion,0);
