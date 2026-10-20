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

// Restore one-click sequential batch sync using the original safe queue processor.
// Do not automatically replay historic pending writes on app launch.
const originalBatchSyncPendingRecords=syncPendingRecords;
syncPendingRecords=async function(options={}){
  if(queueSyncRunning||directRecordSyncRunning){
    if(!options.silent)alert('仍有資料正在同步，請稍後再試。');
    return false;
  }
  if(!getApiUrl()){
    if(!options.silent)alert('請先設定 Google Apps Script Web App URL。');
    return false;
  }
  if(!(state.syncQueue||[]).length){
    if(!options.silent){
      const unresolved=(state.trips||[]).reduce((sum,trip)=>sum+['expenses','pretrip','exchange'].reduce((n,type)=>n+(trip[type]||[]).filter(item=>['pending','conflict'].includes(item.syncStatus)).length,0),0);
      alert(unresolved?'目前沒有可重送的佇列，但有 '+unresolved+' 筆需先核對雲端。請使用首頁「核對雲端紀錄」，避免重複寫入。':'目前沒有待同步資料。');
    }
    return true;
  }
  // Read cloud first: if record IDs are already present, never replay them.
  try{
    const cloud=await postToCloud({action:'getAllData'});
    if(!Array.isArray(cloud.trips))throw new Error('雲端資料格式不完整');
    const byTrip=new Map(cloud.trips.map(t=>[String(t.id),t]));
    let changed=false;
    for(const q of [...state.syncQueue]){
      if(q.action==='createTrip'){
        const t=byTrip.get(String(q.tripId));
        if(t?.spreadsheetId){
          const local=getTripById(q.tripId);
          if(local){local.spreadsheetId=t.spreadsheetId;local.spreadsheetUrl=t.spreadsheetUrl||local.spreadsheetUrl;local.cloudStatus='synced';}
          state.syncQueue=state.syncQueue.filter(x=>x.queueId!==q.queueId);
          changed=true;
        }
        continue;
      }
      // Deletions and edits must never be discarded based only on a matching ID.
      if(!/^add/.test(String(q.action||'')))continue;
      const t=byTrip.get(String(q.tripId));
      const found=(t?.[q.recordType]||[]).some(r=>String(r.id)===String(q.recordId));
      if(!found)continue;
      const local=getTripById(q.tripId);
      const record=(local?.[q.recordType]||[]).find(r=>String(r.id)===String(q.recordId));
      if(!record)continue;
      // For additions only, use cloud reconciliation's field comparison by keeping
      // ambiguous items out of the replay batch, never silently marking them synced.
      const remote=(t[q.recordType]||[]).find(r=>String(r.id)===String(q.recordId));
      const keys=['name','date','pay','person'];
      const comparable=keys.filter(k=>record[k]!=null&&remote[k]!=null&&String(record[k]).trim()!==''&&String(remote[k]).trim()!=='');
      if(comparable.length<2||comparable.some(k=>String(record[k])!==String(remote[k]))){cloudConflicts++;continue;}
      record.syncStatus='synced';record.lastSyncError='';
      state.syncQueue=state.syncQueue.filter(x=>x.queueId!==q.queueId);
      changed=true;
    }
    if(changed)persist();
    if(cloudConflicts){
      if(!options.silent)alert('有 '+cloudConflicts+' 筆紀錄 ID 已存在雲端，但內容尚未確認一致。為避免覆寫或重複，已暫停整批上傳，請先人工核對。');
      return false;
    }
  }catch(err){
    if(!options.silent)alert('為避免重複記帳，雲端核對失敗時暫停批次同步：'+String(err?.message||err));
    return false;
  }
  if(!(state.syncQueue||[]).length){
    if(!options.silent)alert('待同步紀錄已在雲端找到，無須重複上傳。');
    return true;
  }
  return originalBatchSyncPendingRecords(options);
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
  s.onload=()=>{
    if(document.getElementById('v60PatchLoader')) return;
    const p=document.createElement('script');
    p.id='v60PatchLoader';
    p.src='app-09.js?v=73';
    p.async=false;
    document.body.appendChild(p);
  };
  document.body.appendChild(s);
})();

/* iOS Safari / 中文注音輸入法：選字期間不要讓全域輸入事件打斷組字。 */
(function protectExpenseNameIme(){
  const field=document.getElementById('expenseName');
  if(!field || field.dataset.imeProtected==='1') return;
  field.dataset.imeProtected='1';
  let composing=false;
  field.addEventListener('compositionstart',()=>{composing=true;});
  field.addEventListener('compositionend',()=>{composing=false;});
  field.addEventListener('input',event=>{
    if(composing || event.isComposing) event.stopPropagation();
  });
  field.addEventListener('keydown',event=>{
    if((composing || event.isComposing || event.keyCode===229) && event.key==='Enter'){
      event.stopPropagation();
    }
  });
})();
