// v59 手機優先同步修正：所有寫入只走單一待同步佇列，避免手機背景同步互撞。
(function(){
  const PATCH_VERSION='2026.10.03-v59';
  const PATCH_SCRIPT_VERSION='v52';
  let retryTimer=null;

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

  // 建立旅行也只排隊，不再直接和背景寫入同時撞後端。
  syncTripCreation = async function(trip){
    if(!trip) return false;
    if(trip.spreadsheetId) return true;
    if(!getApiUrl()) return false;

    trip.cloudStatus='pending';
    trip.lastSyncError='等待背景同步';
    enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
    persist();
    scheduleRetry(120);
    return false;
  };

  // 所有消費／先前費用／換匯：先安全存手機，再排隊背景同步。
  syncRecord = async function(action,trip,type,item){
    if(!trip || !item) return false;
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError='';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    persist();
    scheduleRetry(120);
    return true;
  };

  // 單一 worker：一次只送一筆；createTrip 永遠排在該旅行其他資料之前。
  syncPendingRecords = async function(options={}){
    const silent=!!options.silent;
    if(queueSyncRunning){
      if(!silent) alert('同步正在背景處理中，資料已安全保存在這台裝置。');
      return false;
    }
    if(!getApiUrl()){
      if(!silent) alert('請先填入 Google Apps Script Web App URL。');
      return false;
    }
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false;

    queueSyncRunning=true;
    let busy=false;
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
        const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
        if(!live) continue;
        const trip=getTripById(q.tripId);
        if(!trip){ removeQueued(q.queueId); continue; }

        try{
          let payload=q.payload || {};

          if(q.action!=='createTrip'){
            if(!trip.spreadsheetId){
              const hasCreate=(state.syncQueue||[]).some(x=>x.tripId===trip.id && x.action==='createTrip');
              if(!hasCreate){
                enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
              }
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
            real.lastError=isBusyError(err) ? '雲端忙碌，系統會自動重試' : msg;
            real.lastErrorAt=new Date().toISOString();
          }
          if(isBusyError(err)){
            busy=true;
            break;
          }
          errors.push(msg);
          // 一筆真正失敗時保留資料，但不要阻止其他旅行的資料之後重試。
          break;
        }
      }

      persist();
      if(typeof renderSettings==='function') renderSettings();
      if(currentTrip && typeof renderTripSummary==='function') renderTripSummary();

      if(!silent){
        if((state.syncQueue||[]).length){
          alert(busy
            ? `資料已安全保存在手機，目前仍有 ${state.syncQueue.length} 筆等待雲端同步；系統會自動重試。`
            : `目前仍有 ${state.syncQueue.length} 筆等待同步，資料都已安全保存在這台裝置。${errors.length?'\n\n'+errors[0]:''}`
          );
        }else{
          alert('全部資料已同步完成。');
        }
      }
      return !(state.syncQueue||[]).length;
    }finally{
      queueSyncRunning=false;
      if((state.syncQueue||[]).length && (typeof navigator==='undefined' || navigator.onLine!==false)){
        scheduleRetry(busy?8000:12000);
      }
    }
  };

  autoSyncPendingRecords = async function(){
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
      if((state.syncQueue||[]).length) scheduleRetry(10000);
    }
  };

  retrySingleSync = async function(_queueId){
    return syncPendingRecords({silent:false});
  };

  // 版本卡改顯示 v59 / v52。
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
        statusEl.textContent=matched?'版本一致，可以正常同步':'版本不一致：網站建議使用 '+PATCH_SCRIPT_VERSION+'，目前後端是 '+(version||'未知');
        statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-warn');
      }
      if(!matched && !silent) alert('目前後端仍是 '+(version||'未知版本')+'。手機資料會先安全保存在本機，但請更新 Apps Script 至 '+PATCH_SCRIPT_VERSION+' 以修正同步鎖與重複 Sheet。');
      return matched;
    }catch(err){
      if(scriptEl) scriptEl.textContent='檢查失敗';
      if(statusEl){ statusEl.textContent='版本檢查失敗：'+(err?.message||err); statusEl.className='version-check-status version-check-error'; }
      return false;
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
    }
  };

  // 載入修正後立刻接手既有待同步資料。
  try{
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    updateHomeSyncStatus();
    updateCloudStatusUI();
    if((state.syncQueue||[]).length) scheduleRetry(600);
  }catch(_e){}
})();
