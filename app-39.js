// v106：安全雲端重新讀取 + 指定 Sheet 一次性旅行救援。
// 救援只補回原 clientTripId 的索引與本機旅行；不建立新 Sheet、不修改 Sheet 內容。
(()=>{
  const VER='2026.10.07-v106';
  const RECOVERY_SHEET_ID='1iOki0_URAhwnALSbbBzUymoKETxJ6kfqnmkXqYyYtJ8';

  function hasRecoveredTrip(){
    return (state?.trips||[]).some(t=>String(t?.spreadsheetId||'')===RECOVERY_SHEET_ID);
  }

  async function recoverTargetTripIfMissing(){
    if(hasRecoveredTrip())return {ok:true,skipped:true};

    const version=await postToCloud({action:'getVersion'});
    const build=String(version?.backendBuildVersion||'');
    if(!build || !/^v56\.(?:[6-9]|\d{2,})$/.test(build)){
      throw new Error('請先部署後端 v56.6，再重新按一次「重新讀取雲端最新資料」。');
    }

    const data=await postToCloud({
      action:'recoverTripBySpreadsheetId',
      spreadsheetId:RECOVERY_SHEET_ID
    });
    const trip=data?.trip;
    if(!data?.recovered||!trip?.id)throw new Error('指定 Google Sheet 尚未成功還原旅行資料。');

    trip.spreadsheetId=RECOVERY_SHEET_ID;
    trip.spreadsheetUrl=`https://docs.google.com/spreadsheets/d/${RECOVERY_SHEET_ID}/edit`;

    if(typeof mergeCloudTrip==='function'){
      mergeCloudTrip(trip);
    }else{
      const exists=(state.trips||[]).find(t=>String(t.id)===String(trip.id));
      if(exists)Object.assign(exists,trip);
      else state.trips.push({
        ...trip,
        expenses:(trip.expenses||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),
        pretrip:(trip.pretrip||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),
        exchange:(trip.exchange||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),
        cloudStatus:'synced',
        lastSyncError:''
      });
    }

    state.tripRecoveryV106={
      spreadsheetId:RECOVERY_SHEET_ID,
      clientTripId:String(data.clientTripId||trip.id),
      recoveredAt:new Date().toISOString()
    };
    persist();
    if(typeof renderHome==='function')renderHome();
    return {ok:true,recovered:true,trip};
  }

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
      // 先救回指定韓國旅行。成功後才進入一般同步流程，避免旅行缺失時清掉佇列。
      const recovery=await recoverTargetTripIfMissing();

      // 再送出真正待同步資料；若仍有失敗，停止讀取，避免任何覆蓋風險。
      if(typeof autoSyncPendingRecords==='function')await autoSyncPendingRecords();
      if((state.syncQueue||[]).length){
        alert('韓國旅行已嘗試救回，但目前仍有 '+state.syncQueue.length+' 筆待同步資料。\n\n為保護本機資料，這次先不繼續讀取雲端。請先處理同步失敗明細。');
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
      if(recovery?.recovered){
        alert('已從指定 Google Sheet 救回韓國旅行，並重新掛回正常雲端索引。\n\n之後會回到一般同步，不會永久綁定這張 Sheet。');
      }else{
        alert(added
          ? `已安全合併 Google Sheet 最新資料，新增找回 ${added} 趟旅行。`
          : '已安全合併 Google Sheet 最新資料。\n\n本機既有旅行不會因雲端清單缺少而被刪除。');
      }
      return true;
    }catch(err){
      alert('重新讀取 Google Sheet 失敗：\n'+String(err?.message||err));
      return false;
    }finally{
      if(btn){btn.disabled=false;btn.textContent='↻ 重新讀取雲端最新資料';}
    }
  };

  window.recoverTargetTripV106=recoverTargetTripIfMissing;
  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
})();
