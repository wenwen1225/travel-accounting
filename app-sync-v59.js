// v60 手機優先同步修正：單一佇列 + 請求逾時 + 卡住 worker 自動恢復。
(function(){
  const PATCH_VERSION='2026.10.03-v60';
  const PATCH_SCRIPT_VERSION='v52';
  const FETCH_TIMEOUT_MS=20000;
  const STALE_WORKER_MS=45000;
  let retryTimer=null;
  let workerStartedAt=0;

  function scheduleRetry(ms=8000){
    if(retryTimer) clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{
      retryTimer=null;
      autoSyncPendingRecords();
    },ms);
  }

  function isBusyError(err){
    return String(err?.message || err || '').toLowerCase().includes('sync_busy');
  }

  function isTimeoutError(err){
    const msg=String(err?.message || err || '').toLowerCase();
    return msg.includes('sync_timeout') || err?.name==='AbortError';
  }

  function recoverStaleWorker(){
    if(!queueSyncRunning) return;
    if(!workerStartedAt) return;
    if(Date.now()-workerStartedAt < STALE_WORKER_MS) return;
    queueSyncRunning=false;
    autoSyncRunning=false;
    workerStartedAt=0;
    if(typeof endCloudActivity==='function'){
      cloudRequestCount=0;
      cloudWriteCount=0;
      updateHomeSyncStatus();
      updateCloudStatusUI();
    }
  }

  // 覆寫雲端請求：Safari / 4G 若 request 掛住，20 秒後自動中止並保留 queue。
  postToCloud = async function(payload){
    const url=getApiUrl();
    if(!url) throw new Error('NO_API_URL');

    const isWrite=isCloudWriteAction(payload?.action);
    const maxAttempts=isWrite ? 2 : 2;
    beginCloudActivity(isWrite);

    try{
      let lastErr=null;
      for(let attempt=1; attempt<=maxAttempts; attempt++){
        const controller=typeof AbortController!=='undefined' ? new AbortController() : null;
        let timeoutId=null;
        try{
          if(controller){
            timeoutId=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
          }
          const res=await fetch(url,{
            method:'POST',
            headers:{'Content-Type':'text/plain;charset=utf-8'},
            body:JSON.stringify(payload),
            cache:'no-store',
            signal:controller?.signal
          });
          if(timeoutId) clearTimeout(timeoutId);
          if(!res.ok) throw new Error('HTTP_'+res.status);
          const data=await res.json();
          if(!data || data.success!==true){
            const err=new Error(data?.message || 'SYNC_FAILED');
            err.data=data || {};
            throw err;
          }
          return data;
        }catch(err){
          if(timeoutId) clearTimeout(timeoutId);
          lastErr=err?.name==='AbortError' ? new Error('SYNC_TIMEOUT：手機連線等待過久，系統會稍後自動重試。') : err;
          if(attempt>=maxAttempts) throw lastErr;
          if(!(isBusyError(lastErr) || isTimeoutError(lastErr) || isTransientFetchError(lastErr))) throw lastErr;
          await sleepMs(isBusyError(lastErr) ? 3500 : 1800);
        }
      }
      throw lastErr || new Error('NETWORK_FAILED');
    }finally{
      endCloudActivity(isWrite);
    }
  };

  // 建立旅行也只排隊，不再直接與其他寫入互撞。
  syncTripCreation = async function(trip){
    if(!trip) return false;
    if(trip.spreadsheetId) return true;
    if(!getApiUrl()) return false;
    trip.cloudStatus='pending';
    trip.lastSyncError='等待背景同步';
    enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
    persist();
    scheduleRetry(150);
    return false;
  };

  // 所有資料先安全存手機，再交給唯一背景 queue。
  syncRecord = async function(action,trip,type,item){
    if(!trip || !item) return false;
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError='';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    persist();
    scheduleRetry(150);
    return true;
  };

  syncPendingRecords = async function(options={}){
    const silent=!!options.silent;
    recoverStaleWorker();

    if(queueSyncRunning){
      if(!silent) alert('同步正在背景處理中；資料已安全保存在手機。');
      return false;
    }
    if(!getApiUrl()){
      if(!silent) alert('請先填入 Google Apps Script Web App URL。');
      return false;
    }
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false;

    queueSyncRunning=true;
    workerStartedAt=Date.now();
    let busy=false;
    let timeout=false;
    const errors=[];

    try{
      const queue=[...(state.syncQueue||[])].sort((a,b)=>{
        if(a.tripId===b.tripId){
          const ap=a.action==='createTrip'?0:1;
          const bp=b.action==='createTrip'?0:1;
          if(ap!==bp) return ap-bp;
        }
        return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
      });

      for(const q of queue){
        workerStartedAt=Date.now();
        const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
        if(!live) continue;
        const trip=getTripById(q.tripId);
        if(!trip){ removeQueued(q.queueId); continue; }

        try{
          let payload=q.payload || {};

          if(q.action!=='createTrip'){
            if(!trip.spreadsheetId){
              const hasCreate=(state.syncQueue||[]).some(x=>x.tripId===trip.id && x.action==='createTrip');
              if(!hasCreate) enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
              live.lastError='等待旅行 Google Sheet 建立完成';
              live.lastErrorAt=new Date().toISOString();
              continue;
            }
            payload={
              ...payload,
              spreadsheetId:trip.spreadsheetId,
              forceOverwrite:/^update|^delete/.test(String(q.action||'')) ? true : payload.forceOverwrite
            };
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
              item.conflictCloudRecord=null;
              if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint;
            }
          }

          state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==q.queueId);
          markSyncSuccess();
          persist();
        }catch(err){
          const msg=err?.message || String(err);
          const real=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
          if(real){
            if(isBusyError(err)) real.lastError='雲端忙碌，系統會自動重試';
            else if(isTimeoutError(err)) real.lastError='手機連線等待過久，系統會自動重試';
            else real.lastError=msg;
            real.lastErrorAt=new Date().toISOString();
          }
          busy=isBusyError(err);
          timeout=isTimeoutError(err);
          if(!busy && !timeout) errors.push(msg);
          break;
        }
      }

      persist();
      if(typeof renderSettings==='function') renderSettings();
      if(currentTrip && typeof renderTripSummary==='function') renderTripSummary();

      if(!silent){
        if((state.syncQueue||[]).length){
          alert(`資料已安全保存在手機，目前仍有 ${state.syncQueue.length} 筆等待雲端同步；系統會自動重試。${errors.length?'\n\n'+errors[0]:''}`);
        }else{
          alert('全部資料已同步完成。');
        }
      }
      return !(state.syncQueue||[]).length;
    }finally{
      queueSyncRunning=false;
      workerStartedAt=0;
      if((state.syncQueue||[]).length && (typeof navigator==='undefined' || navigator.onLine!==false)){
        scheduleRetry((busy||timeout)?7000:12000);
      }
    }
  };

  autoSyncPendingRecords = async function(){
    recoverStaleWorker();
    if(autoSyncRunning) return false;
    if(!getApiUrl() || !(state.syncQueue||[]).length) return false;
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false;
    autoSyncRunning=true;
    try{
      return await syncPendingRecords({silent:true});
    }catch(_err){
      return false;
    }finally{
      autoSyncRunning=false;
      if((state.syncQueue||[]).length) scheduleRetry(9000);
    }
  };

  retrySingleSync = async function(_queueId){
    recoverStaleWorker();
    return syncPendingRecords({silent:false});
  };

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
      const matched=version===PATCH_SCRIPT_VERSION;
      state.lastScriptVersion=version;
      state.lastVersionCheckAt=new Date().toISOString();
      persist();
      if(scriptEl) scriptEl.textContent=version || '未知版本';
      if(statusEl){
        statusEl.textContent=matched?'版本一致，可以正常同步':'版本不一致：網站需要 '+PATCH_SCRIPT_VERSION+'，目前後端是 '+(version||'未知');
        statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-warn');
      }
      return matched;
    }catch(err){
      if(scriptEl) scriptEl.textContent='檢查失敗';
      if(statusEl){ statusEl.textContent='版本檢查失敗：'+(err?.message||err); statusEl.className='version-check-status version-check-error'; }
      return false;
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
    }
  };

  // 每 15 秒做一次很輕量的 watchdog；只在真的有待同步時工作。
  setInterval(()=>{
    if(!(state.syncQueue||[]).length) return;
    recoverStaleWorker();
    if(!queueSyncRunning && !autoSyncRunning) scheduleRetry(200);
  },15000);

  try{
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    updateHomeSyncStatus();
    updateCloudStatusUI();
    if((state.syncQueue||[]).length) scheduleRetry(500);
  }catch(_e){}
})();
