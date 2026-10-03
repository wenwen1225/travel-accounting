let connectivityHideTimer=null;

function renderConnectivityBanner(mode){
  const box=document.getElementById('connectivityBanner');
  const title=document.getElementById('connectivityTitle');
  const message=document.getElementById('connectivityMessage');
  if(!box || !title || !message) return;

  if(connectivityHideTimer){
    clearTimeout(connectivityHideTimer);
    connectivityHideTimer=null;
  }

  box.classList.remove('hidden','connectivity-offline','connectivity-online','connectivity-synced');

  if(mode==='offline'){
    box.classList.add('connectivity-offline');
    title.textContent='目前離線';
    message.textContent='資料會先安全保存在這台裝置，恢復連線後可再同步。';
    return;
  }

  if(mode==='online'){
    box.classList.add('connectivity-online');
    title.textContent='已恢復連線';
    message.textContent='目前可以繼續新增與修改資料。';
    connectivityHideTimer=setTimeout(()=>box.classList.add('hidden'),2500);
    return;
  }

  box.classList.add('hidden');
}

function refreshConnectivityState(){
  if(typeof navigator!=='undefined' && navigator.onLine===false){
    renderConnectivityBanner('offline');
  }else{
    renderConnectivityBanner('hidden');
  }
  updateHomeSyncStatus();
  updateCloudStatusUI();
}

renderHome();
refreshConnectivityState();

window.addEventListener('offline', ()=>{
  renderConnectivityBanner('offline');
  updateHomeSyncStatus();
  updateCloudStatusUI();
});

window.addEventListener('online', ()=>{
  renderConnectivityBanner('online');
  updateHomeSyncStatus();
  updateCloudStatusUI();
});

// 手機優先：不要在啟動、切回頁面或每分鐘時批次重送舊 queue。
// 新增／修改時只同步「當下那一筆」。若失敗，只重試同一筆。
const MOBILE_WRITE_ONLY_VERSION='2026.10.03-v58.1';
let mobileWriteRetryTimers=new Map();

function scheduleSameRecordRetry(queueId,delay=8000){
  if(!queueId || mobileWriteRetryTimers.has(queueId)) return;
  const timer=setTimeout(async ()=>{
    mobileWriteRetryTimers.delete(queueId);
    const q=(state.syncQueue||[]).find(x=>x.queueId===queueId);
    if(!q || queueSyncRunning || directRecordSyncRunning) return;
    const trip=getTripById(q.tripId);
    if(!trip) return;

    try{
      let payload=q.payload || {};
      if(q.action!=='createTrip'){
        if(!trip.spreadsheetId){
          const ready=await ensureTripSpreadsheetReady(trip);
          if(!ready) return;
        }
        const arr=trip[q.recordType] || [];
        const item=arr.find(x=>x.id===q.recordId);
        if(item) payload=cloudPayloadForRecord(q.action,trip,item);
        else payload={...payload,spreadsheetId:trip.spreadsheetId||payload.spreadsheetId||''};
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
      state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==queueId && !(q.action!=='createTrip' && x.tripId===q.tripId && x.recordId===q.recordId));
      markSyncSuccess();
      persist();
      if(currentTrip) renderTripSummary();
      renderSettings();
    }catch(err){
      const live=(state.syncQueue||[]).find(x=>x.queueId===queueId);
      if(live){
        live.lastError=String(err?.message||err||'同步失敗');
        live.lastErrorAt=new Date().toISOString();
        persist();
      }
      scheduleSameRecordRetry(queueId,15000);
    }
  },delay);
  mobileWriteRetryTimers.set(queueId,timer);
}

// 關掉舊版「把整個待同步佇列全部跑一遍」的背景工作。
autoSyncPendingRecords=async function(){ return false; };
syncAndPullCloud=async function(){ return false; };
checkCloudRevisionAndPull=async function(){ return false; };

const originalSyncRecord=syncRecord;
syncRecord=async function(action,trip,type,item){
  if(!trip || !item) return false;

  // 如果目前真的有另一筆正在傳，這一筆只排隊自己，不啟動整批 queue。
  if(directRecordSyncRunning || queueSyncRunning){
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError='上一筆正在同步，稍後只補傳這一筆';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.recordId===item.id);
    persist();
    if(q) scheduleSameRecordRetry(q.queueId,3000);
    return false;
  }

  // 直接使用原本 v58 已驗證可寫入的單筆同步。
  const ok=await originalSyncRecord(action,trip,type,item);
  if(ok){
    state.syncQueue=(state.syncQueue||[]).filter(q=>!(q.tripId===trip.id && q.recordId===item.id));
    persist();
    return true;
  }

  // 原本失敗時只針對這個 record 重試，不碰其他歷史 queue。
  const q=(state.syncQueue||[]).find(x=>x.tripId===trip.id && x.recordId===item.id);
  if(q) scheduleSameRecordRetry(q.queueId,8000);
  return false;
};

// 「同步待處理」按鈕也改成一次只處理一筆，避免整批重送造成 Sheet 看起來一直更新舊資料。
syncPendingRecords=async function(options={}){
  const silent=!!options.silent;
  if(queueSyncRunning || directRecordSyncRunning) return false;
  const q=(state.syncQueue||[])[0];
  if(!q){
    if(!silent) alert('目前沒有待同步資料。');
    return true;
  }
  if(!silent) return retrySingleSync(q.queueId);
  scheduleSameRecordRetry(q.queueId,50);
  return false;
};

function scrollToTop(){
  window.scrollTo({top:0,behavior:'smooth'});
}

function updateScrollTopButton(){
  const btn=document.getElementById('scrollTopBtn');
  if(!btn) return;
  btn.classList.toggle('hidden',window.scrollY < 320);
}

window.addEventListener('scroll',updateScrollTopButton,{passive:true});
document.addEventListener('DOMContentLoaded',()=>{
  updateScrollTopButton();
  const webEl=document.getElementById('webVersionText');
  if(webEl) webEl.textContent=MOBILE_WRITE_ONLY_VERSION;
});