// v63：手機 Safari 不再直接跨網域呼叫 Apps Script；改走同網域 /api/sync 代理。
(function(){
  const PATCH_VERSION='2026.10.03-v63';

  function normalizeProxyError(data,status){
    const msg=String(data?.message || ('HTTP_'+status));
    if(msg==='PROXY_TIMEOUT') return '同步逾時：雲端仍可能正在處理，系統稍後會再試。';
    if(msg==='UPSTREAM_NON_JSON') return '雲端回傳格式異常，系統會保留手機資料稍後重試。';
    return msg;
  }

  postToCloud = async function(payload){
    const targetUrl=getApiUrl();
    if(!targetUrl) throw new Error('NO_API_URL');

    const isWrite=isCloudWriteAction(payload?.action);
    beginCloudActivity(isWrite);
    try{
      const controller=typeof AbortController!=='undefined' ? new AbortController() : null;
      const timeoutMs=isWrite ? 65000 : 35000;
      let timer=null;
      try{
        if(controller) timer=setTimeout(()=>controller.abort(),timeoutMs);
        const res=await fetch('/api/sync',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({targetUrl,payload}),
          cache:'no-store',
          signal:controller?.signal
        });
        if(timer) clearTimeout(timer);

        let data={};
        try{ data=await res.json(); }
        catch(_e){ throw new Error('PROXY_BAD_RESPONSE'); }

        if(!res.ok || !data || data.success!==true){
          const err=new Error(normalizeProxyError(data,res.status));
          err.data=data || {};
          throw err;
        }
        return data;
      }catch(err){
        if(timer) clearTimeout(timer);
        if(err?.name==='AbortError'){
          const e=new Error('同步逾時：資料仍安全保存在手機，系統稍後會再試。');
          e.code='PROXY_TIMEOUT';
          throw e;
        }
        throw err;
      }
    }finally{
      endCloudActivity(isWrite);
    }
  };

  // 將既有 Load failed 立刻視為可重試，不再等兩分鐘。
  try{
    (state.syncQueue||[]).forEach(q=>{
      const m=String(q.lastError||'').toLowerCase();
      if(m.includes('load failed') || m.includes('failed to fetch')){
        q.nextRetryAt=0;
        q.lastError='改用穩定連線重新同步中';
      }
    });
    persist();
  }catch(_e){}

  // 修正版本顯示。
  const previousCheck=checkBackendVersion;
  checkBackendVersion=async function(silent=true){
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    const ok=await previousCheck(silent);
    if(webEl) webEl.textContent=PATCH_VERSION;
    return ok;
  };

  try{
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    if((state.syncQueue||[]).length){
      setTimeout(()=>autoSyncPendingRecords(),300);
    }
  }catch(_e){}
})();
