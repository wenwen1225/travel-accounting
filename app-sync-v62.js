// v62：修正「顯示已同步但實際仍待同步」與手機 queue 被舊紀錄卡住。
(function(){
  const PATCH_VERSION='2026.10.03-v62';
  let retryTimer=null;

  function now(){ return Date.now(); }
  function scheduleRetry(ms=1200){
    if(retryTimer) clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{ retryTimer=null; autoSyncPendingRecords(); },ms);
  }
  function msg(err){ return String(err?.message || err || ''); }
  function isBusy(err){ return msg(err).toLowerCase().includes('sync_busy'); }
  function isTimeout(err){
    const m=msg(err).toLowerCase();
    return m.includes('timeout') || err?.name==='AbortError';
  }

  // 清除 v61 可能殘留的跨分頁 lease，避免手機一直拿不到同步權。
  try{ localStorage.removeItem('travelLedgerSyncLeaseV61'); }catch(_e){}

  // 新增／修改只代表「已安全存手機並排入 queue」，不再回傳 true 冒充雲端成功。
  syncRecord = async function(action,trip,type,item){
    if(!trip || !item) return false;
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError='等待雲端同步';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.recordId===item.id);
    if(q){
      q.retryCount=0;
      q.nextRetryAt=0;
      q.lastError='等待雲端同步';
    }
    persist();
    scheduleRetry(100);
    return false;
  };

  syncTripCreation = async function(trip){
    if(!trip) return false;
    if(trip.spreadsheetId) return true;
    if(!getApiUrl()) return false;
    trip.cloudStatus='pending';
    trip.lastSyncError='等待雲端同步';
    enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
    const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.action==='createTrip');
    if(q){ q.retryCount=0; q.nextRetryAt=0; q.lastError='等待雲端同步'; }
    persist();
    scheduleRetry(100);
    return false;
  };

  function freshPayload(q,trip){
    if(q.action==='createTrip') return cloudPayloadForTrip(trip);
    const arr=trip[q.recordType] || [];
    const item=arr.find(x=>x.id===q.recordId);
    if(item){
      return {
        ...cloudPayloadForRecord(q.action,trip,item),
        spreadsheetId:trip.spreadsheetId || ''
      };
    }
    return {
      ...(q.payload||{}),
      spreadsheetId:trip.spreadsheetId || q.payload?.spreadsheetId || ''
    };
  }

  function eligibleQueue(){
    const t=now();
    return [...(state.syncQueue||[])]
      .filter(q=>Number(q.nextRetryAt||0)<=t)
      .sort((a,b)=>{
        if(a.tripId===b.tripId){
          const ap=a.action==='createTrip'?0:1;
          const bp=b.action==='createTrip'?0:1;
          if(ap!==bp) return ap-bp;
        }
        return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
      });
  }

  function setRetry(q,err){
    const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
    if(!live) return;
    live.retryCount=Number(live.retryCount||0)+1;
    live.lastErrorAt=new Date().toISOString();
    if(isBusy(err)){
      live.lastError='雲端正在處理其他同步，稍後自動再試';
      live.nextRetryAt=now()+12000;
    }else if(isTimeout(err)){
      live.lastError='雲端回應較久，稍後自動再試';
      live.nextRetryAt=now()+30000;
    }else{
      live.lastError=msg(err) || '同步失敗';
      // 真正資料錯誤先跳過 2 分鐘，不要卡住後面的新資料。
      live.nextRetryAt=now()+120000;
    }
  }

  syncPendingRecords = async function(options={}){
    const silent=!!options.silent;
    if(queueSyncRunning){
      if(!silent) alert('背景正在同步；資料都已安全保存在手機。');
      return false;
    }
    if(!getApiUrl() || (typeof navigator!=='undefined' && navigator.onLine===false)) return false;
    if(!(state.syncQueue||[]).length) return true;

    queueSyncRunning=true;
    let processed=0;
    try{
      while(processed<5){
        const list=eligibleQueue();
        if(!list.length) break;
        const q=list[0];
        const trip=getTripById(q.tripId);
        if(!trip){
          state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==q.queueId);
          processed++;
          continue;
        }

        if(q.action==='createTrip' && trip.spreadsheetId){
          state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==q.queueId);
          trip.cloudStatus='synced';
          trip.lastSyncError='';
          persist();
          processed++;
          continue;
        }

        if(q.action!=='createTrip' && !trip.spreadsheetId){
          const hasCreate=(state.syncQueue||[]).some(x=>x.tripId===trip.id && x.action==='createTrip');
          if(!hasCreate) enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
          const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
          if(live){
            live.lastError='等待旅行 Google Sheet 建立完成';
            live.nextRetryAt=now()+3000;
          }
          persist();
          processed++;
          continue;
        }

        try{
          const data=await postToCloud(freshPayload(q,trip));
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
              item.syncStatus='synced';
              item.lastSyncError='';
              item.conflictCloudRecord=null;
              if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint;
            }
          }
          state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==q.queueId);
          markSyncSuccess();
          persist();
          processed++;
          await sleepMs(500);
        }catch(err){
          setRetry(q,err);
          persist();
          processed++;
          // SYNC_BUSY 代表後端真的忙，先停；其他單筆錯誤則繼續試下一筆。
          if(isBusy(err) || isTimeout(err)) break;
        }
      }

      if(typeof renderSettings==='function') renderSettings();
      if(currentTrip && typeof renderTripSummary==='function') renderTripSummary();

      if((state.syncQueue||[]).length){
        const future=(state.syncQueue||[])
          .map(x=>Number(x.nextRetryAt||0))
          .filter(x=>x>now());
        const wait=future.length ? Math.min(15000,Math.max(1000,Math.min(...future)-now())) : 1200;
        scheduleRetry(wait);
      }

      if(!silent){
        alert((state.syncQueue||[]).length
          ? `目前還有 ${state.syncQueue.length} 筆等待雲端同步；資料都已安全保存在手機，系統會繼續自動補傳。`
          : '全部資料已同步完成。');
      }
      return !(state.syncQueue||[]).length;
    }finally{
      queueSyncRunning=false;
    }
  };

  autoSyncPendingRecords = async function(){
    if(autoSyncRunning || queueSyncRunning) return false;
    if(!getApiUrl() || !(state.syncQueue||[]).length) return false;
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false;
    autoSyncRunning=true;
    try{ return await syncPendingRecords({silent:true}); }
    catch(_e){ return false; }
    finally{ autoSyncRunning=false; }
  };

  retrySingleSync = async function(queueId){
    const q=(state.syncQueue||[]).find(x=>x.queueId===queueId);
    if(q){ q.nextRetryAt=0; q.retryCount=0; q.lastError='手動重試中'; persist(); }
    return syncPendingRecords({silent:false});
  };

  const oldCheckBackendVersion=checkBackendVersion;
  checkBackendVersion = async function(silent=true){
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    const ok=await oldCheckBackendVersion(silent);
    if(webEl) webEl.textContent=PATCH_VERSION;
    return ok;
  };

  window.addEventListener('online',()=>scheduleRetry(200));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible' && (state.syncQueue||[]).length) scheduleRetry(300);
  });

  try{
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    updateHomeSyncStatus();
    updateCloudStatusUI();
    if((state.syncQueue||[]).length) scheduleRetry(300);
  }catch(_e){}
})();
