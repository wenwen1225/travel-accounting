// Stable 2：手機優先。資料先存本機、直接寫 Google Sheet；不讓「同步中」UI 卡住。
(function(){
  const PATCH_VERSION='2026.10.03-stable2';
  const EXPECTED_BACKEND='v51';
  const IS_MOBILE=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'');
  let stableWriteRunning=false;
  let retryTimer=null;
  let uiWatchdog=null;

  function scheduleRetry(ms=15000){
    if(retryTimer) clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{
      retryTimer=null;
      autoSyncPendingRecords();
    },ms);
  }
  function errMsg(err){ return String(err?.message || err || ''); }

  // 只處理畫面 busy 狀態，不刪 queue、不假裝資料已同步。
  function releaseBusyUi(){
    try{
      cloudRequestCount=0;
      cloudWriteCount=0;
      updateHomeSyncStatus();
      updateCloudStatusUI();
    }catch(_e){}
  }

  function armUiWatchdog(){
    if(uiWatchdog) clearTimeout(uiWatchdog);
    uiWatchdog=setTimeout(()=>{
      uiWatchdog=null;
      // Apps Script 偶爾已完成寫入，但 Safari / proxy 回應仍未收尾。
      // 此時只解除「同步中」動畫，真正同步狀態仍由 record/queue 決定。
      releaseBusyUi();
    },12000);
  }

  postToCloud = async function(payload){
    const targetUrl=getApiUrl();
    if(!targetUrl) throw new Error('NO_API_URL');
    const isWrite=isCloudWriteAction(payload?.action);
    beginCloudActivity(isWrite);
    if(isWrite) armUiWatchdog();
    const controller=typeof AbortController!=='undefined' ? new AbortController() : null;
    const timeoutMs=isWrite ? 90000 : 45000;
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
      try{ data=await res.json(); }catch(_e){ throw new Error('PROXY_BAD_RESPONSE'); }
      if(!res.ok || !data || data.success!==true){
        throw new Error(data?.message || ('HTTP_'+res.status));
      }
      return data;
    }catch(err){
      if(timer) clearTimeout(timer);
      if(err?.name==='AbortError') throw new Error('同步逾時，資料已保留在手機');
      throw err;
    }finally{
      if(uiWatchdog){ clearTimeout(uiWatchdog); uiWatchdog=null; }
      endCloudActivity(isWrite);
      releaseBusyUi();
    }
  };

  function queueRecord(action,trip,type,item,message){
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError=message || '等待同步';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.recordId===item.id);
    if(q){
      q.lastError=item.lastSyncError;
      q.lastErrorAt=new Date().toISOString();
    }
    persist();
  }

  syncRecord = async function(action,trip,type,item){
    if(!trip || !item) return false;
    if(stableWriteRunning){
      queueRecord(action,trip,type,item,'上一筆正在同步，稍後自動補傳');
      scheduleRetry(12000);
      return false;
    }

    stableWriteRunning=true;
    directRecordSyncRunning=true;
    try{
      if(!trip.spreadsheetId){
        const ok=await syncTripCreation(trip);
        if(!ok || !trip.spreadsheetId){
          queueRecord(action,trip,type,item,'等待旅行 Google Sheet 建立完成');
          scheduleRetry(15000);
          return false;
        }
      }

      const data=await postToCloud(cloudPayloadForRecord(action,trip,item));
      setRecordSyncState(trip,type,item.id,'synced');
      item.lastSyncError='';
      item.conflictCloudRecord=null;
      if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint;
      state.syncQueue=(state.syncQueue||[]).filter(q=>!(q.tripId===trip.id && q.recordId===item.id));
      markSyncSuccess();
      persist();
      return true;
    }catch(err){
      queueRecord(action,trip,type,item,errMsg(err));
      scheduleRetry(15000);
      return false;
    }finally{
      stableWriteRunning=false;
      directRecordSyncRunning=false;
      releaseBusyUi();
      if(typeof renderSettings==='function') renderSettings();
      if(currentTrip && typeof renderTripSummary==='function') renderTripSummary();
    }
  };

  syncPendingRecords = async function(options={}){
    const silent=!!options.silent;
    if(stableWriteRunning || queueSyncRunning || directRecordSyncRunning) return false;
    if(!getApiUrl() || !(state.syncQueue||[]).length) return true;
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false;

    const q=[...(state.syncQueue||[])].sort((a,b)=>{
      const ap=a.action==='createTrip'?0:1;
      const bp=b.action==='createTrip'?0:1;
      if(ap!==bp) return ap-bp;
      return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
    })[0];
    if(!q) return true;

    const trip=getTripById(q.tripId);
    if(!trip){ removeQueued(q.queueId); scheduleRetry(500); return false; }

    stableWriteRunning=true;
    queueSyncRunning=true;
    try{
      let payload=q.payload || {};
      if(q.action!=='createTrip'){
        if(!trip.spreadsheetId){
          const ok=await syncTripCreation(trip);
          if(!ok || !trip.spreadsheetId) throw new Error('等待旅行 Google Sheet 建立完成');
        }
        const arr=trip[q.recordType] || [];
        const item=arr.find(x=>x.id===q.recordId);
        payload=item ? cloudPayloadForRecord(q.action,trip,item) : {...payload,spreadsheetId:trip.spreadsheetId||''};
      }

      const data=await postToCloud(payload);
      if(q.action==='createTrip'){
        trip.spreadsheetId=data.spreadsheetId || trip.spreadsheetId || '';
        trip.spreadsheetUrl=data.spreadsheetUrl || trip.spreadsheetUrl || '';
        trip.cloudStatus='synced';
        trip.lastSyncError='';
      }else{
        setRecordSyncState(trip,q.recordType,q.recordId,'synced');
        const arr=trip[q.recordType] || [];
        const item=arr.find(x=>x.id===q.recordId);
        if(item){
          item.lastSyncError='';
          item.syncStatus='synced';
          if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint;
        }
      }
      state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==q.queueId && !(q.action!=='createTrip' && x.tripId===q.tripId && x.recordId===q.recordId));
      markSyncSuccess();
      persist();
      if((state.syncQueue||[]).length) scheduleRetry(2000);
      if(!silent) alert((state.syncQueue||[]).length ? `這筆已同步，還有 ${state.syncQueue.length} 筆等待補傳。` : '全部資料已同步完成。');
      return !(state.syncQueue||[]).length;
    }catch(err){
      const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
      if(live){ live.lastError=errMsg(err); live.lastErrorAt=new Date().toISOString(); }
      persist();
      scheduleRetry(15000);
      if(!silent) alert('這筆目前尚未上雲，資料仍安全保存在手機。\n\n'+errMsg(err));
      return false;
    }finally{
      stableWriteRunning=false;
      queueSyncRunning=false;
      releaseBusyUi();
      if(typeof renderSettings==='function') renderSettings();
      if(currentTrip && typeof renderTripSummary==='function') renderTripSummary();
    }
  };

  autoSyncPendingRecords = async function(){
    if(stableWriteRunning || autoSyncRunning || queueSyncRunning || directRecordSyncRunning) return false;
    if(!getApiUrl() || !(state.syncQueue||[]).length) return true;
    autoSyncRunning=true;
    try{ return await syncPendingRecords({silent:true}); }
    finally{ autoSyncRunning=false; releaseBusyUi(); }
  };

  retrySingleSync = async function(_queueId){ return syncPendingRecords({silent:false}); };

  if(IS_MOBILE){
    syncAndPullCloud = async function(){ await autoSyncPendingRecords(); return true; };
    checkCloudRevisionAndPull = async function(){ return false; };
  }

  checkBackendVersion = async function(silent=true){
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
        statusEl.textContent=matched ? '穩定版：手機直接寫入已啟用' : '後端版本不一致：需要 '+EXPECTED_BACKEND+'，目前是 '+(version||'未知');
        statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-warn');
      }
      return matched;
    }catch(err){
      if(scriptEl) scriptEl.textContent='檢查失敗';
      if(statusEl){ statusEl.textContent='版本檢查失敗：'+errMsg(err); statusEl.className='version-check-status version-check-error'; }
      return false;
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
      releaseBusyUi();
    }
  };

  try{
    releaseBusyUi();
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    if((state.syncQueue||[]).length) scheduleRetry(8000);
  }catch(_e){}
})();
