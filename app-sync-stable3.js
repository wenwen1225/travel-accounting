// Stable 3：手機寫入不再經 Vercel proxy。改用隱藏表單直接 POST Apps Script，再用 JSONP 確認 Sheet 真的已寫入。
(function(){
  const PATCH_VERSION='2026.10.03-stable3';
  const EXPECTED_BACKEND='v54-mobile';

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  function submitFormPost(targetUrl,payload){
    return new Promise((resolve,reject)=>{
      try{
        const iframeName='syncFrame_'+Date.now()+'_'+Math.random().toString(36).slice(2);
        const iframe=document.createElement('iframe');
        iframe.name=iframeName;
        iframe.style.display='none';
        document.body.appendChild(iframe);

        const form=document.createElement('form');
        form.method='POST';
        form.action=targetUrl;
        form.target=iframeName;
        form.style.display='none';

        const input=document.createElement('input');
        input.type='hidden';
        input.name='payload';
        input.value=JSON.stringify(payload);
        form.appendChild(input);
        document.body.appendChild(form);

        form.submit();
        setTimeout(()=>{
          try{ form.remove(); iframe.remove(); }catch(_e){}
        },30000);
        resolve(true);
      }catch(err){ reject(err); }
    });
  }

  function jsonpCheckRecord(targetUrl,spreadsheetId,recordId,timeoutMs=7000){
    return new Promise((resolve,reject)=>{
      const cb='__travelSyncCb_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      let done=false;
      const cleanup=()=>{
        if(done) return;
        done=true;
        try{ delete window[cb]; }catch(_e){ window[cb]=undefined; }
        try{ script.remove(); }catch(_e){}
      };
      const timer=setTimeout(()=>{
        cleanup();
        reject(new Error('CONFIRM_TIMEOUT'));
      },timeoutMs);

      window[cb]=(data)=>{
        clearTimeout(timer);
        cleanup();
        if(data && data.success===true) resolve(data);
        else reject(new Error(data?.message || 'CONFIRM_FAILED'));
      };

      const u=new URL(targetUrl);
      u.searchParams.set('action','checkRecord');
      u.searchParams.set('spreadsheetId',spreadsheetId);
      u.searchParams.set('recordId',recordId);
      u.searchParams.set('callback',cb);
      u.searchParams.set('_',Date.now());
      script.src=u.toString();
      script.onerror=()=>{
        clearTimeout(timer);
        cleanup();
        reject(new Error('CONFIRM_LOAD_FAILED'));
      };
      document.head.appendChild(script);
    });
  }

  async function writeAndConfirm(payload){
    const targetUrl=getApiUrl();
    const recordId=payload?.record?.id || payload?.recordId || '';
    const spreadsheetId=payload?.spreadsheetId || '';
    if(!targetUrl) throw new Error('NO_API_URL');
    if(!recordId || !spreadsheetId) throw new Error('缺少 recordId 或 spreadsheetId');

    await submitFormPost(targetUrl,payload);

    // Apps Script 寫 Sheet 可能需要數秒；確認最多約 30 秒。
    let lastErr=null;
    for(let i=0;i<8;i++){
      await sleep(i===0 ? 2200 : 3200);
      try{
        const result=await jsonpCheckRecord(targetUrl,spreadsheetId,recordId,6500);
        if(result.exists){
          return {
            success:true,
            cloudFingerprint:result.cloudFingerprint || ''
          };
        }
      }catch(err){
        lastErr=err;
      }
    }
    throw lastErr || new Error('已送出，但尚未確認寫入 Google Sheet');
  }

  const oldPostToCloud=postToCloud;
  postToCloud=async function(payload){
    const action=String(payload?.action||'');
    const confirmable=['addExpense','updateExpense','addPretrip','updatePretrip','addExchange','updateExchange'];
    if(confirmable.includes(action)){
      const isWrite=isCloudWriteAction(action);
      beginCloudActivity(isWrite);
      try{
        return await writeAndConfirm(payload);
      }finally{
        endCloudActivity(isWrite);
      }
    }
    // 建立旅行 / 刪除 / 版本檢查暫沿用既有路徑。
    return oldPostToCloud(payload);
  };

  checkBackendVersion=async function(silent=true){
    const webEl=document.getElementById('webVersionText');
    const scriptEl=document.getElementById('scriptVersionText');
    const statusEl=document.getElementById('versionMatchStatus');
    const btn=document.getElementById('versionCheckBtn');
    if(webEl) webEl.textContent=PATCH_VERSION;
    if(!getApiUrl()) return false;
    if(btn){ btn.disabled=true; btn.textContent='檢查中…'; }
    try{
      // 版本檢查仍可走舊 postToCloud；後端支援 v54-mobile。
      const data=await oldPostToCloud({action:'getVersion'});
      const version=String(data.scriptVersion||'');
      const matched=version===EXPECTED_BACKEND;
      state.lastScriptVersion=version;
      state.lastVersionCheckAt=new Date().toISOString();
      persist();
      if(scriptEl) scriptEl.textContent=version || '未知版本';
      if(statusEl){
        statusEl.textContent=matched ? '手機直送 Google Sheets 已啟用' : '後端需要 '+EXPECTED_BACKEND+'，目前是 '+(version||'未知');
        statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-warn');
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
  }catch(_e){}
})();
