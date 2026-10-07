// v107：指定 Sheet 一次性救援 + v57 後端版本統一 + 雲端讀取只合併不刪本機旅行。
(()=>{
  const VER='2026.10.07-v107';
  const EXPECTED_BACKEND='v57';
  const RECOVERY_SHEET_ID='1iOki0_URAhwnALSbbBzUymoKETxJ6kfqnmkXqYyYtJ8';
  const rawPostToCloud=window.postToCloud;

  function setWebVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
  }

  // 舊資金同步模組仍寫死 v56；只對它們的版本檢查做相容，不影響設定頁與救援顯示 v57。
  if(typeof rawPostToCloud==='function'){
    window.postToCloud=async function(payload){
      const data=await rawPostToCloud.apply(this,arguments);
      if(payload?.action==='getVersion'&&String(data?.scriptVersion||'')===EXPECTED_BACKEND){
        const stack=String(new Error().stack||'');
        if(/backgroundFundSyncV(?:91|104)/.test(stack))return {...data,scriptVersion:'v56',actualScriptVersion:EXPECTED_BACKEND};
      }
      return data;
    };
  }

  function hasRecoveredTrip(){return (state?.trips||[]).some(t=>String(t?.spreadsheetId||'')===RECOVERY_SHEET_ID);}
  async function actualCloudCall(payload){if(typeof rawPostToCloud!=='function')throw new Error('雲端同步函式尚未載入');return rawPostToCloud(payload);}

  async function recoverTargetTripIfMissing(){
    if(hasRecoveredTrip())return {ok:true,skipped:true};
    const version=await actualCloudCall({action:'getVersion'});
    if(String(version?.scriptVersion||'')!==EXPECTED_BACKEND)throw new Error('請先部署後端 v57，再重新按一次「重新讀取雲端最新資料」。目前後端：'+String(version?.scriptVersion||'未知'));
    const data=await actualCloudCall({action:'recoverTripBySpreadsheetId',spreadsheetId:RECOVERY_SHEET_ID});
    const trip=data?.trip;
    if(!data?.recovered||!trip?.id)throw new Error('指定 Google Sheet 尚未成功還原旅行資料。');
    trip.spreadsheetId=RECOVERY_SHEET_ID;
    trip.spreadsheetUrl=`https://docs.google.com/spreadsheets/d/${RECOVERY_SHEET_ID}/edit`;
    trip.cloudStatus='synced';trip.lastSyncError='';
    if(typeof mergeCloudTrip==='function')mergeCloudTrip(trip);
    else{
      const exists=(state.trips||[]).find(t=>String(t.id)===String(trip.id));
      if(exists)Object.assign(exists,trip);
      else state.trips.push({...trip,expenses:(trip.expenses||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),pretrip:(trip.pretrip||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),exchange:(trip.exchange||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''}))});
    }
    state.tripRecoveryV107={spreadsheetId:RECOVERY_SHEET_ID,clientTripId:String(data.clientTripId||trip.id),recoveredAt:new Date().toISOString()};
    persist();if(typeof renderHome==='function')renderHome();
    return {ok:true,recovered:true,trip};
  }

  window.refreshFromCloudNow=async function(){
    if(!getApiUrl?.()){alert('請先設定 Google Apps Script Web App URL。');return false;}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){alert('目前沒有網路連線，尚未讀取雲端資料。');return false;}
    const btn=document.getElementById('cloudReloadBtn');if(btn){btn.disabled=true;btn.textContent='讀取 Google Sheet 中…';}
    try{
      const recovery=await recoverTargetTripIfMissing();
      if(typeof autoSyncPendingRecords==='function')await autoSyncPendingRecords();
      if((state.syncQueue||[]).length){alert('韓國旅行已救回，但目前仍有 '+state.syncQueue.length+' 筆待同步資料。\n\n為保護資料，這次先不繼續讀取雲端。');return false;}
      const beforeIds=new Set((state.trips||[]).map(t=>String(t.id||''))),beforeCount=(state.trips||[]).length;
      const ok=typeof pullCloudTrips==='function'?await pullCloudTrips({silent:false}):false;if(!ok)return false;
      const afterIds=new Set((state.trips||[]).map(t=>String(t.id||''))),lost=[...beforeIds].filter(id=>id&&!afterIds.has(id));
      if(lost.length)throw new Error('安全檢查攔截：雲端讀取後偵測到本機旅行減少。');
      if(typeof renderHome==='function')renderHome();setWebVersion();
      const added=Math.max(0,(state.trips||[]).length-beforeCount);
      if(recovery?.recovered)alert('已從指定 Google Sheet 救回韓國旅行，並重新掛回正常雲端索引。');
      else alert(added?`已安全合併 Google Sheet 最新資料，新增找回 ${added} 趟旅行。`:'已安全合併 Google Sheet 最新資料。');
      return true;
    }catch(err){alert('重新讀取 Google Sheet 失敗：\n'+String(err?.message||err));return false;}
    finally{if(btn){btn.disabled=false;btn.textContent='↻ 重新讀取雲端最新資料';}setWebVersion();}
  };

  window.checkBackendVersion=async function(silent=true){
    const webEl=document.getElementById('webVersionText'),scriptEl=document.getElementById('scriptVersionText'),statusEl=document.getElementById('versionMatchStatus'),btn=document.getElementById('versionCheckBtn');
    if(webEl)webEl.textContent=VER;
    if(!getApiUrl?.()){if(scriptEl)scriptEl.textContent='尚未設定';if(statusEl){statusEl.textContent='尚未設定 Apps Script Web App URL';statusEl.className='version-check-status version-check-error';}return false;}
    if(btn)btn.disabled=true;
    try{
      const data=await actualCloudCall({action:'getVersion'}),v=String(data?.scriptVersion||''),ok=v===EXPECTED_BACKEND;
      state.lastScriptVersion=v;state.lastVersionCheckAt=new Date().toISOString();persist();
      if(scriptEl)scriptEl.textContent=v||'未知版本';
      if(statusEl){statusEl.textContent=ok?'版本一致，可以正常同步':'版本不一致：網站需要 '+EXPECTED_BACKEND+'，目前後端是 '+(v||'未知');statusEl.className='version-check-status '+(ok?'version-check-ok':'version-check-error');}
      if(!ok&&!silent)alert('Apps Script 版本不一致。\n網站需要：'+EXPECTED_BACKEND+'\n目前後端：'+(v||'未知版本'));
      return ok;
    }catch(err){if(scriptEl)scriptEl.textContent='檢查失敗';if(statusEl){statusEl.textContent='無法讀取 Apps Script 版本：'+String(err?.message||err);statusEl.className='version-check-status version-check-error';}return false;}
    finally{if(btn)btn.disabled=false;setWebVersion();}
  };

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function')window.renderSettings=function(){const r=baseRenderSettings.apply(this,arguments);setWebVersion();return r;};
  window.recoverTargetTripV107=recoverTargetTripIfMissing;
  setWebVersion();
})();
