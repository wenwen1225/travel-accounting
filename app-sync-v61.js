// v61：手機優先同步。避免短 timeout 造成 Apps Script 寫入重疊，並讓單一失敗紀錄不再卡住後續資料。
(function(){
  const PATCH_VERSION='2026.10.03-v61';
  const PATCH_SCRIPT_VERSION='v52';
  const WRITE_TIMEOUT_MS=120000;
  const READ_TIMEOUT_MS=30000;
  const LEASE_KEY='travelLedgerSyncLeaseV61';
  const LEASE_TTL_MS=150000;
  const TAB_ID=(sessionStorage.getItem('travelLedgerTabId') || ('tab_'+Date.now()+'_'+Math.random().toString(36).slice(2)));
  sessionStorage.setItem('travelLedgerTabId',TAB_ID);
  let retryTimer=null;

  function now(){ return Date.now(); }
  function scheduleRetry(ms=3000){
    if(retryTimer) clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{ retryTimer=null; autoSyncPendingRecords(); },ms);
  }
  function messageOf(err){ return String(err?.message || err || ''); }
  function isBusy(err){ return messageOf(err).toLowerCase().includes('sync_busy'); }
  function isTimeout(err){
    const m=messageOf(err).toLowerCase();
    return m.includes('sync_write_timeout') || m.includes('sync_read_timeout') || err?.name==='AbortError';
  }
  function isNetworkish(err){
    const m=messageOf(err).toLowerCase();
    return err instanceof TypeError || m.includes('failed to fetch') || m.includes('load failed') || m.includes('network');
  }

  function readLease(){
    try{ return JSON.parse(localStorage.getItem(LEASE_KEY)||'null'); }catch(_e){ return null; }
  }
  function acquireLease(){
    const t=now();
    const old=readLease();
    if(old && old.owner!==TAB_ID && Number(old.expiresAt||0)>t) return false;
    const lease={owner:TAB_ID,expiresAt:t+LEASE_TTL_MS};
    localStorage.setItem(LEASE_KEY,JSON.stringify(lease));
    const confirm=readLease();
    return !!confirm && confirm.owner===TAB_ID;
  }
  function renewLease(){
    const old=readLease();
    if(old?.owner!==TAB_ID) return false;
    localStorage.setItem(LEASE_KEY,JSON.stringify({owner:TAB_ID,expiresAt:now()+LEASE_TTL_MS}));
    return true;
  }
  function releaseLease(){
    const old=readLease();
    if(old?.owner===TAB_ID) localStorage.removeItem(LEASE_KEY);
  }

  // 讀取可短 timeout；寫入給 Apps Script 足夠時間完成，而且不在同一次呼叫裡重送。
  postToCloud = async function(payload){
    const url=getApiUrl();
    if(!url) throw new Error('NO_API_URL');
    const isWrite=isCloudWriteAction(payload?.action);
    const timeoutMs=isWrite ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS;
    const attempts=isWrite ? 1 : 2;
    beginCloudActivity(isWrite);
    try{
      let lastErr=null;
      for(let attempt=1;attempt<=attempts;attempt++){
        const controller=typeof AbortController!=='undefined' ? new AbortController() : null;
        let timer=null;
        try{
          if(controller) timer=setTimeout(()=>controller.abort(),timeoutMs);
          const res=await fetch(url,{
            method:'POST',
            headers:{'Content-Type':'text/plain;charset=utf-8'},
            body:JSON.stringify(payload),
            cache:'no-store',
            signal:controller?.signal
          });
          if(timer) clearTimeout(timer);
          if(!res.ok) throw new Error('HTTP_'+res.status);
          const data=await res.json();
          if(!data || data.success!==true){
            const e=new Error(data?.message || 'SYNC_FAILED');
            e.data=data || {};
            throw e;
          }
          return data;
        }catch(err){
          if(timer) clearTimeout(timer);
          if(err?.name==='AbortError'){
            lastErr=new Error(isWrite
              ? 'SYNC_WRITE_TIMEOUT：雲端寫入仍在處理，稍後會再確認，不會立刻重送。'
              : 'SYNC_READ_TIMEOUT：讀取雲端逾時。');
          }else lastErr=err;
          if(attempt>=attempts || isWrite) throw lastErr;
          if(!(isNetworkish(lastErr) || isTimeout(lastErr))) throw lastErr;
          await sleepMs(1200);
        }
      }
      throw lastErr || new Error('NETWORK_FAILED');
    }finally{
      endCloudActivity(isWrite);
    }
  };

  // 新增／修改一律先留在手機 queue，不阻塞使用者。
  syncRecord = async function(action,trip,type,item){
    if(!trip || !item) return false;
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError='';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.recordId===item.id);
    if(q){ q.retryCount=0; q.nextRetryAt=0; }
    persist();
    scheduleRetry(100);
    return true;
  };

  syncTripCreation = async function(trip){
    if(!trip) return false;
    if(trip.spreadsheetId) return true;
    if(!getApiUrl()) return false;
    trip.cloudStatus='pending';
    trip.lastSyncError='等待背景同步';
    enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
    const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.action==='createTrip');
    if(q){ q.retryCount=0; q.nextRetryAt=0; }
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

  function markRetry(q,err){
    const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
    if(!live) return;
    live.retryCount=Number(live.retryCount||0)+1;
    live.lastErrorAt=new Date().toISOString();
    if(isBusy(err)){
      live.lastError='雲端正在處理其他同步，稍後自動再試';
      live.nextRetryAt=now()+15000;
    }else if(messageOf(err).toLowerCase().includes('sync_write_timeout')){
      // fetch abort 不代表 Apps Script 已停止。留 90 秒避免立刻重送造成永久 SYNC_BUSY。
      live.lastError='雲端寫入時間較久，資料仍安全保存在手機，稍後自動確認';
      live.nextRetryAt=now()+90000;
    }else if(isTimeout(err) || isNetworkish(err)){
      live.lastError='網路暫時不穩，稍後自動再試';
      live.nextRetryAt=now()+30000;
    }else{
      // 真正資料錯誤不應擋住後面的紀錄。
      live.lastError=messageOf(err);
      live.nextRetryAt=now()+300000;
    }
  }

  function nextEligibleQueueItem(){
    const t=now();
    const queue=[...(state.syncQueue||[])];
    queue.sort((a,b)=>{
      const ar=Number(a.nextRetryAt||0), br=Number(b.nextRetryAt||0);
      const ae=ar<=t?0:1, be=br<=t?0:1;
      if(ae!==be) return ae-be;
      if(a.tripId===b.tripId){
        const ap=a.action==='createTrip'?0:1, bp=b.action==='createTrip'?0:1;
        if(ap!==bp) return ap-bp;
      }
      return String(a.createdAt||'').localeCompare(String(b.createdAt||''));
    });
    return queue.find(q=>Number(q.nextRetryAt||0)<=t) || null;
  }

  syncPendingRecords = async function(options={}){
    const silent=!!options.silent;
    if(queueSyncRunning || autoSyncRunning && !options.fromAuto){
      if(!silent) alert('背景正在同步；你可以繼續記帳，資料都已先存在手機。');
      return false;
    }
    if(!getApiUrl() || (typeof navigator!=='undefined' && navigator.onLine===false)) return false;
    if(!(state.syncQueue||[]).length) return true;
    if(!acquireLease()){
      scheduleRetry(4000);
      return false;
    }

    queueSyncRunning=true;
    try{
      const q=nextEligibleQueueItem();
      if(!q){
        const waits=(state.syncQueue||[]).map(x=>Number(x.nextRetryAt||0)).filter(x=>x>now());
        scheduleRetry(waits.length ? Math.min(30000,Math.max(1000,Math.min(...waits)-now())) : 5000);
        return false;
      }
      renewLease();
      const trip=getTripById(q.tripId);
      if(!trip){ removeQueued(q.queueId); return false; }

      // 舊 queue 若還留著 createTrip，但這台已知道 Sheet ID，直接清掉，不再多建一次。
      if(q.action==='createTrip' && trip.spreadsheetId){
        state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==q.queueId);
        trip.cloudStatus='synced';
        trip.lastSyncError='';
        persist();
        scheduleRetry(150);
        return false;
      }

      if(q.action!=='createTrip' && !trip.spreadsheetId){
        const hasCreate=(state.syncQueue||[]).some(x=>x.tripId===trip.id && x.action==='createTrip');
        if(!hasCreate) enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
        const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
        if(live){ live.lastError='等待旅行 Google Sheet 建立完成'; live.nextRetryAt=now()+3000; }
        persist();
        scheduleRetry(200);
        return false;
      }

      try{
        const payload=freshPayload(q,trip);
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
        if((state.syncQueue||[]).length) scheduleRetry(400);
      }catch(err){
        markRetry(q,err);
        persist();
        // 下一輪可以挑其他已到期的項目，避免一筆壞資料永遠擋住全部。
        scheduleRetry(isBusy(err)?15000:1200);
      }

      if(typeof renderSettings==='function') renderSettings();
      if(currentTrip && typeof renderTripSummary==='function') renderTripSummary();
      if(!silent && (state.syncQueue||[]).length){
        alert(`目前還有 ${state.syncQueue.length} 筆等待雲端同步。資料都已安全保存在手機，你可以繼續記帳，系統會自動補傳。`);
      }
      return !(state.syncQueue||[]).length;
    }finally{
      queueSyncRunning=false;
      releaseLease();
    }
  };

  autoSyncPendingRecords = async function(){
    if(autoSyncRunning) return false;
    if(!getApiUrl() || !(state.syncQueue||[]).length) return false;
    if(typeof navigator!=='undefined' && navigator.onLine===false) return false;
    autoSyncRunning=true;
    try{ return await syncPendingRecords({silent:true,fromAuto:true}); }
    catch(_e){ return false; }
    finally{ autoSyncRunning=false; }
  };

  retrySingleSync = async function(queueId){
    const q=(state.syncQueue||[]).find(x=>x.queueId===queueId);
    if(q){ q.nextRetryAt=0; q.retryCount=0; persist(); }
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
      if(statusEl){ statusEl.textContent='版本檢查失敗：'+messageOf(err); statusEl.className='version-check-status version-check-error'; }
      return false;
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
    }
  };

  window.addEventListener('online',()=>scheduleRetry(300));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible' && (state.syncQueue||[]).length) scheduleRetry(500);
  });
  setInterval(()=>{
    if((state.syncQueue||[]).length && (typeof navigator==='undefined' || navigator.onLine!==false)) scheduleRetry(300);
  },20000);

  try{
    const webEl=document.getElementById('webVersionText');
    if(webEl) webEl.textContent=PATCH_VERSION;
    updateHomeSyncStatus();
    updateCloudStatusUI();
    if((state.syncQueue||[]).length) scheduleRetry(500);
  }catch(_e){}
})();
