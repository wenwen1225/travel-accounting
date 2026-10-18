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
})();
