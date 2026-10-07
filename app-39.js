// v105：緊急保護「重新讀取雲端最新資料」；雲端只能合併進本機，不得因回傳清單缺少旅行而刪除本機旅行。
(()=>{
  const VER='2026.10.07-v105';

  window.refreshFromCloudNow=async function(){
    if(!getApiUrl?.()){
      alert('請先設定 Google Apps Script Web App URL。');
      return false;
    }
    if(typeof navigator!=='undefined'&&navigator.onLine===false){
      alert('目前沒有網路連線，尚未讀取雲端資料。');
      return false;
    }

    const btn=document.getElementById('cloudReloadBtn');
    if(btn){btn.disabled=true;btn.textContent='讀取 Google Sheet 中…';}

    try{
      // 先送出真正待同步資料；若仍有失敗，停止讀取，避免任何覆蓋風險。
      if(typeof autoSyncPendingRecords==='function')await autoSyncPendingRecords();
      if((state.syncQueue||[]).length){
        alert('目前仍有 '+state.syncQueue.length+' 筆待同步資料。\n\n為保護本機資料，這次不讀取雲端。請先處理同步失敗明細。');
        return false;
      }

      const beforeIds=new Set((state.trips||[]).map(t=>String(t.id||'')));
      const beforeCount=(state.trips||[]).length;

      // 只使用既有安全 merge 流程；絕不 state.trips = cloudTrips。
      const ok=typeof pullCloudTrips==='function'
        ? await pullCloudTrips({silent:false})
        : false;
      if(!ok)return false;

      const afterIds=new Set((state.trips||[]).map(t=>String(t.id||'')));
      const lost=[...beforeIds].filter(id=>id&&!afterIds.has(id));
      if(lost.length){
        throw new Error('安全檢查攔截：雲端讀取後偵測到本機旅行減少，已停止操作。');
      }

      if(typeof renderHome==='function')renderHome();
      const added=Math.max(0,(state.trips||[]).length-beforeCount);
      alert(added
        ? `已安全合併 Google Sheet 最新資料，新增找回 ${added} 趟旅行。`
        : '已安全合併 Google Sheet 最新資料。\n\n本機既有旅行不會因雲端清單缺少而被刪除。');
      return true;
    }catch(err){
      alert('重新讀取 Google Sheet 失敗：\n'+String(err?.message||err));
      return false;
    }finally{
      if(btn){btn.disabled=false;btn.textContent='↻ 重新讀取雲端最新資料';}
    }
  };

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
})();
