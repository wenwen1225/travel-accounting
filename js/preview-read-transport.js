/* Preview-only safe transport: read operations use protected Vercel proxy.
   Writes continue unchanged. Do not embed or transmit the GAS URL. */
(function(){
  'use strict';
  window.TRAVEL_PREVIEW_READ_ONLY = true;
  const oldPost = postToCloud;
  postToCloud = async function(payload){
    const action = payload && payload.action;
    if (!['getAllData','getVersion','getCloudRevision'].includes(action)) {
      return oldPost(payload);
    }
    const response = await fetch('/api/travel-read', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action}),
      cache:'no-store'
    });
    let data = null;
    try { data = await response.json(); }
    catch (_) { throw new Error('雲端代理回傳無效內容。'); }
    if (!response.ok || !data || data.success !== true) {
      const reason = String(data?.code || data?.message || 'UNKNOWN_ERROR');
      const explanations = {
        GAS_NOT_CONFIGURED:'Vercel 測試環境尚未設定 TRAVEL_GAS_URL。',
        GAS_UNREACHABLE:'Vercel 目前無法連上 GAS。',
        GAS_TIMEOUT:'GAS 回應逾時。',
        TRIPS_NOT_ARRAY:'GAS 未提供有效旅行清單。',
        PREVIEW_ONLY:'這個測試用代理不允許在正式網站使用。'
      };
      throw new Error(explanations[reason] || '雲端讀取失敗：' + reason);
    }
    return data;
  };
  // Preview diagnostic only: legacy v51 strict equality must not instruct users
  // to downgrade a newer live GAS deployment. Confirm API reachability separately.
  checkBackendVersion = async function(silent=true) {
    const scriptEl=document.getElementById('scriptVersionText');
    const statusEl=document.getElementById('versionMatchStatus');
    const btn=document.getElementById('versionCheckBtn');
    if(btn){btn.disabled=true;btn.textContent='檢查中…';}
    try {
      const data=await postToCloud({action:'getVersion'});
      const version=String(data.scriptVersion||'未知');
      if(scriptEl)scriptEl.textContent=version;
      if(statusEl){
        statusEl.textContent='GAS 已回應（'+version+'）。舊版預期 v51 僅供參考；資料相容性以雲端讀取測試為準。';
        statusEl.className='version-check-status version-check-warn';
      }
      if(!silent)alert('GAS 連線檢查成功：'+version+'。請另外確認旅行清單是否成功讀取。');
      return true;
    }catch(error){
      if(scriptEl)scriptEl.textContent='檢查失敗';
      if(statusEl){
        statusEl.textContent='GAS 版本讀取失敗：'+String(error?.message||error);
        statusEl.className='version-check-status version-check-error';
      }
      if(!silent)alert('版本讀取失敗：'+String(error?.message||error));
      return false;
    }finally{
      if(btn){btn.disabled=false;btn.textContent='檢查版本';}
    }
  };

})();
