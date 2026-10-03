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

// v58.3：手機快速記帳。
// 儲存只等本機完成，立刻回旅行首頁；Google Sheets 在背景逐筆同步。
const MOBILE_WRITE_ONLY_VERSION='2026.10.03-v58.3';
let mobileWriteRetryTimers=new Map();
let fastWriteChain=Promise.resolve();
let quickToastTimer=null;

function showQuickSaveToast(text='已儲存在手機，正在同步雲端'){
  let toast=document.getElementById('quickSaveToast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='quickSaveToast';
    toast.style.cssText='position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:9999;background:rgba(35,31,43,.92);color:#fff;padding:10px 16px;border-radius:999px;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:86vw;text-align:center;transition:opacity .2s ease;';
    document.body.appendChild(toast);
  }
  toast.textContent=text;
  toast.style.opacity='1';
  toast.style.pointerEvents='none';
  if(quickToastTimer) clearTimeout(quickToastTimer);
  quickToastTimer=setTimeout(()=>{ toast.style.opacity='0'; },1400);
}

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
      if(typeof renderSettings==='function') renderSettings();
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

// 不在啟動、切回頁面或每分鐘時批次重送歷史 queue。
autoSyncPendingRecords=async function(){ return false; };
syncAndPullCloud=async function(){ return false; };
checkCloudRevisionAndPull=async function(){ return false; };

const originalSyncRecord=syncRecord;

// 呼叫端會立即拿到成功；真正雲端寫入依序在背景執行。
syncRecord=async function(action,trip,type,item){
  if(!trip || !item) return false;

  setRecordSyncState(trip,type,item.id,'pending');
  item.lastSyncError='雲端同步中';
  persist();

  const tripId=trip.id;
  const recordId=item.id;
  const snapshot=JSON.parse(JSON.stringify(item));

  fastWriteChain=fastWriteChain.then(async ()=>{
    const liveTrip=getTripById(tripId) || trip;
    const liveArr=liveTrip[type] || [];
    const liveItem=liveArr.find(x=>x.id===recordId) || snapshot;

    const ok=await originalSyncRecord(action,liveTrip,type,liveItem);
    if(ok){
      state.syncQueue=(state.syncQueue||[]).filter(q=>!(q.tripId===tripId && q.recordId===recordId));
      const current=(liveTrip[type]||[]).find(x=>x.id===recordId);
      if(current){ current.lastSyncError=''; current.syncStatus='synced'; }
      persist();
      if(currentTrip && currentTrip.id===tripId) renderTripSummary();
      if(typeof renderSettings==='function') renderSettings();
      return;
    }

    const q=(state.syncQueue||[]).find(x=>x.tripId===tripId && x.recordId===recordId);
    if(q) scheduleSameRecordRetry(q.queueId,8000);
  }).catch(err=>{
    console.error('background sync error',err);
    const q=(state.syncQueue||[]).find(x=>x.tripId===tripId && x.recordId===recordId);
    if(q) scheduleSameRecordRetry(q.queueId,8000);
  });

  showQuickSaveToast();
  return true;
};

// 不用等雲端，也不顯示阻塞 modal；儲存後直接回旅行首頁。
showCloudResultModal=function(_success,message){
  const text=!getApiUrl()
    ? '已儲存在手機（尚未設定雲端）'
    : (String(message||'').includes('尚未同步') ? '已儲存在手機，稍後補同步' : '已儲存在手機，正在同步雲端');
  if(currentTrip) backToTrip();
  showQuickSaveToast(text);
};

// 「同步待處理」仍一次只處理一筆。
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

// 後續補丁獨立載入，避免再碰已穩定的 v58.3 主流程。
(()=>{
  if(document.getElementById('v584PatchLoader')) return;
  const s=document.createElement('script');
  s.id='v584PatchLoader';
  s.src='app-08.js?v=584';
  s.async=false;
  document.body.appendChild(s);
})();