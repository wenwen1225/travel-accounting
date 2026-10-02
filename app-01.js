const STORE_KEY = 'travelLedgerV1';
const WEB_APP_VERSION = '2026.10.02-v49';
const EXPECTED_SCRIPT_VERSION = 'v47';

let state = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {
  people:['Wen','Clark','Anna'],
  cards:['國泰cube','中信line pay','中信無限卡','台新richart','富邦costco'],
  trips:[],
  apiUrl:'',
  syncQueue:[]
};
const REQUIRED_CARDS = ['國泰cube','中信line pay','中信無限卡','台新richart','富邦costco'];
const OLD_DEFAULT_CARDS = ['國泰 CUBE','中信 LINE Pay','台新 Richart'];
if(!state.cardListV15){
  const extras = (state.cards || []).filter(c => !OLD_DEFAULT_CARDS.includes(c) && !REQUIRED_CARDS.includes(c));
  state.cards = [...REQUIRED_CARDS, ...extras];
  state.cardListV15 = true;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

if(typeof state.apiUrl !== 'string') state.apiUrl = '';
if(!Array.isArray(state.syncQueue)) state.syncQueue = [];
if(typeof state.lastSyncAt !== 'string') state.lastSyncAt = '';
let currentTrip = null;
let selectedPerson = 'Wen';
let selectedPretripPerson = 'Wen';
let selectedPay = '信用卡';


function getApiUrl(){
  return (state.apiUrl || '').trim();
}

function enqueueSync(action, tripId, recordType, recordId, payload){
  const existing = state.syncQueue.find(q => q.tripId===tripId && q.recordId===recordId);
  const item = {
    queueId:'q_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    action, tripId, recordType, recordId, payload,
    createdAt:new Date().toISOString()
  };
  if(existing){
    Object.assign(existing, item, {queueId:existing.queueId});
  }else{
    state.syncQueue.push(item);
  }
  persist();
}

function removeQueued(queueId){
  state.syncQueue = state.syncQueue.filter(q=>q.queueId!==queueId);
  persist();
}

let cloudRequestCount = 0;
let cloudWriteCount = 0;
let lastCloudPullAt = 0;
let lastCloudRevision = String(state.lastCloudRevision || '');

function isCloudWriteAction(action){
  return !['getVersion','getAllData','getCloudRevision'].includes(action || '');
}

function beginCloudActivity(isWrite=false){
  cloudRequestCount++;
  if(isWrite) cloudWriteCount++;
  updateHomeSyncStatus();
  updateCloudStatusUI();
}

function endCloudActivity(isWrite=false){
  cloudRequestCount = Math.max(0, cloudRequestCount - 1);
  if(isWrite) cloudWriteCount = Math.max(0, cloudWriteCount - 1);
  updateHomeSyncStatus();
  updateCloudStatusUI();
}

async function postToCloud(payload){
  const url = getApiUrl();
  if(!url) throw new Error('NO_API_URL');

  const isWrite=isCloudWriteAction(payload?.action);
  beginCloudActivity(isWrite);
  try{
    const res = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('HTTP_'+res.status);
    const data = await res.json();
    if(!data || data.success !== true){
      const err = new Error(data?.message || 'SYNC_FAILED');
      err.data = data || {};
      throw err;
    }
    return data;
  }finally{
    endCloudActivity(isWrite);
  }
}

function getTripById(id){
  return state.trips.find(t=>t.id===id);
}

function cloudPayloadForTrip(trip){
  return {
    action:'createTrip',
    clientTripId:trip.id,
    tripName:trip.name,
    place:trip.place,
    start:trip.start,
    end:trip.end,
    currency:trip.currency,
    people:trip.people,
    cards:state.cards || [],
    archived:!!trip.archived,
    archivedAt:trip.archivedAt || ''
  };
}

function cloudPayloadForRecord(action, trip, item){
  return {
    action,
    clientTripId:trip.id,
    spreadsheetId:trip.spreadsheetId || '',
    tripName:trip.name,
    currency:trip.currency,
    cards:state.cards || [],
    baseFingerprint:item?.cloudFingerprint || '',
    record:item
  };
}

function setRecordSyncState(trip, type, id, status){
  const arr = trip[type] || [];
  const item = arr.find(x=>x.id===id);
  if(item) item.syncStatus = status;
}

async function syncTripCreation(trip){
  try{
    const data = await postToCloud(cloudPayloadForTrip(trip));
    trip.spreadsheetId = data.spreadsheetId || trip.spreadsheetId || '';
    trip.spreadsheetUrl = data.spreadsheetUrl || trip.spreadsheetUrl || '';
    trip.cloudStatus = 'synced';
    markSyncSuccess();
    return true;
  }catch(err){
    trip.cloudStatus = 'pending';
    trip.lastSyncError = err && err.message ? err.message : String(err);
    enqueueSync('createTrip', trip.id, 'trip', trip.id, cloudPayloadForTrip(trip));
    const queued = state.syncQueue.find(q => q.tripId===trip.id && q.action==='createTrip');
    if(queued){
      queued.lastError = trip.lastSyncError;
      queued.lastErrorAt = new Date().toISOString();
    }
    persist();
    setTimeout(autoSyncPendingRecords, 5000);
    return false;
  }
}

let directRecordSyncRunning = false;
let queueSyncRunning = false;

async function syncRecord(action, trip, type, item){
  if(queueSyncRunning){
    setRecordSyncState(trip, type, item.id, 'pending');
    item.lastSyncError = '正在處理其他同步，已加入待同步佇列';
    enqueueSync(action, trip.id, type, item.id, cloudPayloadForRecord(action, trip, item));
    persist();
    return false;
  }

  directRecordSyncRunning = true;
  try{
    const data = await postToCloud(cloudPayloadForRecord(action, trip, item));
    setRecordSyncState(trip, type, item.id, 'synced');
    state.syncQueue = state.syncQueue.filter(q => !(q.tripId===trip.id && q.recordId===item.id));
    item.lastSyncError = '';
    item.conflictCloudRecord = null;
    if(data?.cloudFingerprint) item.cloudFingerprint = data.cloudFingerprint;
    markSyncSuccess();
    return true;
  }catch(err){
    const isConflict = err?.data?.code === 'SYNC_CONFLICT';

    setRecordSyncState(trip, type, item.id, isConflict ? 'conflict' : 'pending');
    item.lastSyncError = isConflict
      ? '資料衝突：雲端版本已被修改'
      : (err && err.message ? err.message : String(err));
    item.conflictCloudRecord = isConflict ? (err.data.cloudRecord || null) : null;

    enqueueSync(action, trip.id, type, item.id, cloudPayloadForRecord(action, trip, item));
    const queued = state.syncQueue.find(q => q.tripId===trip.id && q.recordId===item.id && q.action===action);
    if(queued){
      queued.lastError = item.lastSyncError;
      queued.lastErrorAt = new Date().toISOString();
      if(isConflict) queued.conflictCloudRecord = item.conflictCloudRecord;
    }
    persist();

    if(!isConflict) setTimeout(autoSyncPendingRecords, 5000);
    return false;
  }finally{
    directRecordSyncRunning = false;
  }
}

let autoSyncRunning = false;

async function syncPendingRecords(options={}){
  const silent = !!options.silent;

  if(queueSyncRunning || directRecordSyncRunning){
    if(!silent) alert('目前還有一筆資料正在同步，請稍後再按一次。');
    return;
  }

  if(!getApiUrl()){
    if(!silent) alert('請先填入 Google Apps Script Web App URL。');
    return;
  }

  queueSyncRunning = true;
  try{
  const queue = [...state.syncQueue];
  const errors = [];

  for(const q of queue){
    if(q.conflictCloudRecord){
      errors.push('有資料衝突尚未處理');
      continue;
    }

    const trip = getTripById(q.tripId);
    if(!trip){ removeQueued(q.queueId); continue; }

    try{
      let payload = q.payload;

      if(q.action !== 'createTrip'){
        const spreadsheetId = trip.spreadsheetId || payload.spreadsheetId || '';
        if(!spreadsheetId){
          throw new Error('這趟旅行尚未成功建立 Google Sheet，請先讓「建立旅行」同步成功。');
        }
        payload = {...payload, spreadsheetId};
      }

      const data = await postToCloud(payload);

      if(q.action === 'createTrip'){
        trip.spreadsheetId = data.spreadsheetId || trip.spreadsheetId || '';
        trip.spreadsheetUrl = data.spreadsheetUrl || trip.spreadsheetUrl || '';
        trip.cloudStatus = 'synced';
        trip.lastSyncError = '';
      }else{
        setRecordSyncState(trip, q.recordType, q.recordId, 'synced');
        const arr = trip[q.recordType] || [];
        const item = arr.find(x=>x.id===q.recordId);
        if(item){
          item.lastSyncError = '';
          item.syncStatus = 'synced';
          item.conflictCloudRecord = null;
          if(data?.cloudFingerprint) item.cloudFingerprint = data.cloudFingerprint;
        }
        state.syncQueue = state.syncQueue.filter(x => !(x.tripId===q.tripId && x.recordId===q.recordId));
      }

      removeQueued(q.queueId);
      markSyncSuccess();

    }catch(err){
      const msg = err && err.message ? err.message : String(err);
      q.lastError = msg;
      const realQueueItem = state.syncQueue.find(x=>x.queueId===q.queueId);
      if(realQueueItem){
        realQueueItem.lastError = msg;
        realQueueItem.lastErrorAt = new Date().toISOString();
      }
      errors.push(msg);
    }
  }

  persist();
  renderSettings();
  if(currentTrip) renderTripSummary();

  if(!silent){
    if(state.syncQueue.length){
      const detail = errors.length ? '\n\n錯誤原因：\n' + [...new Set(errors)].slice(0,3).join('\n') : '';
      alert(`同步完成，但仍有 ${state.syncQueue.length} 筆待同步。${detail}`);
    }else{
      alert('全部資料已同步完成。');
    }
  }
  }finally{
    queueSyncRunning = false;
  }
}

async function retrySingleSync(queueId){
  if(!getApiUrl()){
    alert('請先填入 Google Apps Script Web App URL。');
    return false;
  }

  const q=(state.syncQueue||[]).find(x=>x.queueId===queueId);
  if(!q){
    alert('這筆待同步資料已不存在，可能已經同步完成。');
    renderSettings();
    return false;
  }

  if(q.conflictCloudRecord){
    alert('這筆資料有同步衝突，請先選擇「保留本機」或「使用雲端」。');
    return false;
  }

  const trip=getTripById(q.tripId);
  if(!trip){
    removeQueued(queueId);
    persist();
    renderSettings();
    return false;
  }

  q.retrying=true;
  persist();
  renderSettings();

  try{
    let payload=q.payload;

    if(q.action!=='createTrip'){
      const spreadsheetId=trip.spreadsheetId || payload.spreadsheetId || '';
      if(!spreadsheetId){
        throw new Error('這趟旅行尚未成功建立 Google Sheet，請先讓「建立旅行」同步成功。');
      }
      payload={...payload,spreadsheetId};
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
      state.syncQueue=state.syncQueue.filter(x=>!(x.tripId===q.tripId && x.recordId===q.recordId));
    }

    removeQueued(queueId);
    markSyncSuccess();
    persist();
    renderSettings();
    if(currentTrip) renderTripSummary();
    alert('這筆資料已同步完成。');
    return true;

  }catch(err){
    const msg=err && err.message ? err.message : String(err);
    const real=state.syncQueue.find(x=>x.queueId===queueId);
    if(real){
      real.lastError=msg;
      real.lastErrorAt=new Date().toISOString();
      real.retrying=false;
    }
    persist();
    renderSettings();
    alert('這筆資料仍同步失敗：\n'+msg);
    return false;
  }finally{
    const real=state.syncQueue.find(x=>x.queueId===queueId);
    if(real) real.retrying=false;
    persist();
    renderSettings();
  }
}

async function resolveSyncConflict(queueId, choice){
  const q=(state.syncQueue||[]).find(x=>x.queueId===queueId);
  if(!q) return false;

  const trip=getTripById(q.tripId);
  if(!trip) return false;

  const arr=trip[q.recordType] || [];
  const item=arr.find(x=>x.id===q.recordId);

  if(choice==='cloud'){
    const cloud=q.conflictCloudRecord || item?.conflictCloudRecord;
    if(!cloud){
      alert('找不到雲端版本，請先重新同步資料。');
      return false;
    }

    const idx=arr.findIndex(x=>x.id===q.recordId);
    if(idx>=0){
      arr[idx]={...cloud,syncStatus:'synced',lastSyncError:''};
    }

    state.syncQueue=state.syncQueue.filter(x=>x.queueId!==queueId);
    persist();
    renderSettings();
    if(currentTrip) renderTripSummary();
    alert('已保留雲端版本。');
    return true;
  }

  if(choice==='local'){
    if(!item){
      alert('找不到本機版本。');
      return false;
    }

    try{
      const payload={
        ...cloudPayloadForRecord(q.action,trip,item),
        spreadsheetId:trip.spreadsheetId || q.payload?.spreadsheetId || '',
        forceOverwrite:true
      };

      const data=await postToCloud(payload);
      item.syncStatus='synced';
      item.lastSyncError='';
      item.conflictCloudRecord=null;
      if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint;

      state.syncQueue=state.syncQueue.filter(x=>x.queueId!==queueId);
      markSyncSuccess();
      persist();
      renderSettings();
      if(currentTrip) renderTripSummary();
      alert('已用本機版本覆蓋雲端資料。');
      return true;
    }catch(err){
      alert('保留本機版本失敗：\n'+(err?.message||err));
      return false;
    }
  }

  return false;
}

async function autoSyncPendingRecords(){
  if(autoSyncRunning) return;
  if(!getApiUrl()) return;
  if(!state.syncQueue.length) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;

  autoSyncRunning = true;
  try{
    await syncPendingRecords({silent:true});
  }catch(err){
    // 背景自動同步失敗時保留待同步資料，不打擾使用者
  }finally{
    autoSyncRunning = false;
  }
}


let cloudPullRunning = false;

function mergeCloudRecordList(tripId, localList, cloudList){
  const pendingIds = new Set(
    (state.syncQueue || [])
      .filter(q => q.tripId === tripId && q.recordId && q.recordId !== tripId)
      .map(q => q.recordId)
  );

  const localMap = new Map((localList || []).map(x => [x.id, x]));
  const merged = [];

  function mustKeepLocal(item){
    return !!item && (
      pendingIds.has(item.id) ||
      item.syncStatus === 'pending' ||
      item.syncStatus === 'conflict'
    );
  }

  for(const cloudItem of (cloudList || [])){
    const localItem = localMap.get(cloudItem.id);
    if(mustKeepLocal(localItem)){
      merged.push(localItem);
    }else{
      merged.push({...cloudItem, syncStatus:'synced', lastSyncError:''});
    }
    localMap.delete(cloudItem.id);
  }

  // 雲端沒有的本機資料，只保留真正正在等待同步／衝突的紀錄。
  // 舊的 syncStatus=local 不再永久混入，避免不同裝置各自累積不同資料。
  for(const localItem of localMap.values()){
    if(mustKeepLocal(localItem)){
      merged.push(localItem);
    }
  }

  return merged;
}

function mergeCloudTrip(cloudTrip){
  const local = getTripById(cloudTrip.id);

  if(!local){
    state.trips.push({
      ...cloudTrip,
      expenses:(cloudTrip.expenses||[]).map(x=>({...x,syncStatus:'synced'})),
      pretrip:(cloudTrip.pretrip||[]).map(x=>({...x,syncStatus:'synced'})),
      exchange:(cloudTrip.exchange||[]).map(x=>({...x,syncStatus:'synced'})),
      cloudStatus:'synced'
    });
    return;
  }

  const createPending = (state.syncQueue||[]).some(
    q => q.tripId===cloudTrip.id && q.action==='createTrip'
  );

  const merged = {
    ...local,
    ...cloudTrip,
    expenses:mergeCloudRecordList(cloudTrip.id, local.expenses, cloudTrip.expenses),
    pretrip:mergeCloudRecordList(cloudTrip.id, local.pretrip, cloudTrip.pretrip),
    exchange:mergeCloudRecordList(cloudTrip.id, local.exchange, cloudTrip.exchange),
    cloudStatus:createPending ? (local.cloudStatus || 'pending') : 'synced',
    lastSyncError:createPending ? (local.lastSyncError || '') : ''
  };

  Object.assign(local, merged);
}

async function pullCloudTrips(options={}){
  const silent = options.silent !== false;
  if(cloudPullRunning) return false;
  if(!getApiUrl()) return false;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  cloudPullRunning = true;
  try{
    const data = await postToCloud({action:'getAllData'});
    const trips = Array.isArray(data.trips) ? data.trips : [];

    trips.forEach(mergeCloudTrip);

    // 雲端讀回時，也把新同行人補進共用名單
    trips.forEach(t => {
      (t.people || []).forEach(p => {
        if(p && !state.people.includes(p)) state.people.push(p);
      });
    });

    persist();
    renderHome();
    if(currentTrip){
      const refreshed = getTripById(currentTrip.id);
      if(refreshed){
        currentTrip = refreshed;
        renderTripSummary();
      }
    }
    lastCloudPullAt = Date.now();
    if(data?.cloudRevision !== undefined && data?.cloudRevision !== null){
      lastCloudRevision = String(data.cloudRevision);
      state.lastCloudRevision = lastCloudRevision;
    }
    markSyncSuccess();
    return true;
  }catch(err){
    if(!silent){
      alert('從 Google Sheets 讀取資料失敗：' + (err && err.message ? err.message : err));
    }
    return false;
  }finally{
    cloudPullRunning = false;
  }
}

async function syncAndPullCloud(options={}){
  if(!getApiUrl()) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const shouldPull = options.pull !== false;

  // 跨裝置安全順序：
  // 1. 先讀最新雲端，確認別的裝置是否已經更新。
  // 2. 再補送這台裝置真正的待同步資料。
  // 這樣只是打開另一台裝置，不會先把舊待同步狀態推上雲端。
  if(shouldPull){
    await pullCloudTrips({silent:true});
  }

  await autoSyncPendingRecords();

  // 如果剛剛真的有待同步成功送出，再輕量確認一次雲端版本。
  if(shouldPull && !(state.syncQueue || []).length){
    await checkCloudRevisionAndPull({silent:true});
  }
}

async function checkCloudRevisionAndPull(options={}){
  if(!getApiUrl()) return false;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if(cloudPullRunning || cloudWriteCount > 0) return false;

  const force = !!options.force;

  try{
    const data = await postToCloud({action:'getCloudRevision'});
    const revision = String(data?.cloudRevision ?? '');

    if(force || !lastCloudRevision || revision !== lastCloudRevision){
      return await pullCloudTrips({silent:options.silent !== false});
    }

    return false;
  }catch(err){
    if(options.silent === false){
      alert('檢查雲端更新失敗：' + (err?.message || err));
    }
    return false;
  }
}

async function refreshFromCloudNow(){
  if(!getApiUrl()){
    alert('請先設定 Google Apps Script Web App URL。');
    return false;
  }

  const btn=document.getElementById('cloudReloadBtn');
  if(btn){
    btn.disabled=true;
    btn.textContent='讀取 Google Sheet 中…';
  }

  try{
    // 先補送真正待同步資料，避免直接讀回時把尚未上傳的修改蓋掉。
    await autoSyncPendingRecords();

    if((state.syncQueue || []).length){
      alert('目前仍有 '+state.syncQueue.length+' 筆待同步資料。\n\n為避免本機資料被雲端覆蓋，請先把待同步資料處理完成，再重新讀取雲端。');
      return false;
    }

    // 手動按鈕採「雲端直接取代旅行資料」，不再做 merge。
    const data=await postToCloud({action:'getAllData'});
    const trips=Array.isArray(data.trips) ? data.trips : [];

    state.trips=trips.map(t=>({
      ...t,
      expenses:(t.expenses||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),
      pretrip:(t.pretrip||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),
      exchange:(t.exchange||[]).map(x=>({...x,syncStatus:'synced',lastSyncError:''})),
      cloudStatus:'synced',
      lastSyncError:''
    }));

    // 共用人員名單補入雲端旅行中的人員，不刪除使用者目前的共用設定。
    for(const trip of state.trips){
      for(const p of (trip.people || [])){
        if(p && !state.people.includes(p)) state.people.push(p);
      }
    }

    if(data?.cloudRevision !== undefined && data?.cloudRevision !== null){
      lastCloudRevision=String(data.cloudRevision);
      state.lastCloudRevision=lastCloudRevision;
    }
    lastCloudPullAt=Date.now();
    state.lastSyncAt=new Date().toISOString();

    persist();
    renderHome();

    if(currentTrip){
      const refreshed=getTripById(currentTrip.id);
      currentTrip=refreshed || null;
      if(currentTrip) renderTripSummary();
      else goHome();
    }

    alert('已用 Google Sheet 最新資料重新載入。\n目前共有 '+state.trips.length+' 趟旅行。');
    return true;
  }catch(err){
    alert('重新讀取 Google Sheet 失敗：\n'+(err?.message || err));
    return false;
  }finally{
    if(btn){
      btn.disabled=false;
      btn.textContent='↻ 重新讀取雲端最新資料';
    }
  }
}

function enqueueLocalOnlyRecordsForCloud(){
  if(!getApiUrl()) return 0;

  let count=0;
  for(const trip of (state.trips || [])){
    if(!trip.spreadsheetId) continue;

    const groups=[
      ['expenses','addExpense'],
      ['pretrip','addPretrip'],
      ['exchange','addExchange']
    ];

    for(const [type,action] of groups){
      for(const item of (trip[type] || [])){
        if(item?.syncStatus !== 'local') continue;
        const exists=(state.syncQueue || []).some(q=>q.tripId===trip.id && q.recordId===item.id);
        if(exists) continue;

        item.syncStatus='pending';
        enqueueSync(action, trip.id, type, item.id, cloudPayloadForRecord(action, trip, item));
        count++;
      }
    }
  }

  if(count) persist();
  return count;
}

async function pullCloudIfStale(maxAgeMs=300000){
  if(!getApiUrl()) return false;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if(Date.now()-lastCloudPullAt < maxAgeMs) return false;
  return pullCloudTrips({silent:true});
}

function markSyncSuccess(){
  state.lastSyncAt = new Date().toISOString();
  persist();
}

function formatLastSyncTime(){
  if(!state.lastSyncAt) return '尚未同步';
  const d = new Date(state.lastSyncAt);
  if(Number.isNaN(d.getTime())) return '尚未同步';
  return '最後同步：' + d.toLocaleTimeString('zh-TW',{
    hour:'2-digit',
    minute:'2-digit',
    hour12:false
  });
}

function updateLastSyncUI(){
  const home = document.getElementById('homeLastSync');
  const settings = document.getElementById('settingsLastSync');
  const text = formatLastSyncTime();
  if(home) home.textContent = text;
  if(settings) settings.textContent = text;
}

function isAppOffline(){
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function updateHomeSyncStatus(){
  updateLastSyncUI();
  const box = document.getElementById('homeSyncStatus');
  const text = document.getElementById('homeSyncText');
  const icon = document.getElementById('homeSyncIcon');
  if(!box || !text || !icon) return;

  if(isAppOffline()){
    box.className='home-sync-status home-sync-pending';
    icon.textContent='⌁';
    text.textContent='目前離線・已保存在手機';
    return;
  }

  if(!getApiUrl()){
    box.className='home-sync-status home-sync-local';
    icon.textContent='●';
    text.textContent='僅本機';
    return;
  }

  if(cloudWriteCount > 0){
    box.className='home-sync-status home-sync-syncing';
    icon.textContent='↻';
    text.textContent='同步中…';
    return;
  }

  const pendingCount = (state.syncQueue || []).length;
  if(pendingCount > 0){
    box.className='home-sync-status home-sync-pending';
    icon.textContent='↻';
    text.textContent=`${pendingCount} 筆待同步`;
  }else{
    box.className='home-sync-status home-sync-ok';
    icon.textContent='☁';
    text.textContent='已全部同步';
  }
}

function updateCloudStatusUI(){
  updateHomeSyncStatus();
  const dot = document.getElementById('cloudDot');
  const text = document.getElementById('cloudStatusText');
  const pending = document.getElementById('pendingSyncCount');
  const input = document.getElementById('apiUrlInput');
  if(input) input.value = getApiUrl();
  if(pending) pending.textContent = cloudWriteCount > 0 ? '同步中…' : `${state.syncQueue.length} 筆待同步`;
  if(!dot || !text) return;

  if(isAppOffline()){
    dot.className='cloud-dot cloud-warn';
    text.textContent='目前離線・資料會先保存在本機';
    return;
  }

  if(getApiUrl()){
    if(cloudWriteCount > 0){
      dot.className='cloud-dot cloud-warn';
      text.textContent='同步中…';
    }else{
      dot.className='cloud-dot ' + (state.syncQueue.length ? 'cloud-warn' : 'cloud-ok');
      text.textContent = state.syncQueue.length ? '已設定・有待同步資料' : '已設定';
    }
  }else{
    dot.className='cloud-dot cloud-off';
    text.textContent='尚未設定';
  }
}

async function checkBackendVersion(silent=true){
  const webEl=document.getElementById('webVersionText');
  const scriptEl=document.getElementById('scriptVersionText');
  const statusEl=document.getElementById('versionMatchStatus');
  const btn=document.getElementById('versionCheckBtn');

  if(webEl) webEl.textContent=WEB_APP_VERSION;

  if(!getApiUrl()){
    if(scriptEl) scriptEl.textContent='尚未設定';
    if(statusEl){
      statusEl.textContent='請先設定 Apps Script Web App URL';
      statusEl.className='version-check-status version-check-warn';
    }
    return false;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent='檢查中…';
  }
  if(statusEl){
    statusEl.textContent='正在確認後端版本…';
    statusEl.className='version-check-status';
  }

  try{
    const data=await postToCloud({action:'getVersion'});
    const version=String(data.scriptVersion || '');
    const matched=version===EXPECTED_SCRIPT_VERSION;

    state.lastScriptVersion=version;
    state.lastVersionCheckAt=new Date().toISOString();
    persist();

    if(scriptEl) scriptEl.textContent=version || '未知版本';

    if(statusEl){
      statusEl.textContent = matched
        ? '版本一致，可以正常同步'
        : '版本不一致：網站需要 '+EXPECTED_SCRIPT_VERSION+'，目前後端是 '+(version||'未知');
      statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
    }

    if(!matched && !silent){
      alert('Apps Script 版本不一致。\n網站需要：'+EXPECTED_SCRIPT_VERSION+'\n目前後端：'+(version||'未知版本')+'\n\n請重新部署最新 Apps Script。');
    }

    return matched;
  }catch(err){
    const msg=err && err.message ? err.message : String(err);
    if(scriptEl) scriptEl.textContent='檢查失敗';
    if(statusEl){
      statusEl.textContent = msg==='HTTP_404'
        ? 'Web App 網址無法使用，請確認最新 /exec 網址'
        : '版本檢查失敗：'+msg;
      statusEl.className='version-check-status version-check-error';
    }
    if(!silent) alert('Apps Script 版本檢查失敗：\n'+msg);
    return false;
  }finally{
    if(btn){
      btn.disabled=false;
      btn.textContent='檢查版本';
    }
  }
}

function saveApiUrl(){
  const v = document.getElementById('apiUrlInput').value.trim();
  state.apiUrl = v;
  persist();
  updateCloudStatusUI();

  if(v){
    const queuedLocal=enqueueLocalOnlyRecordsForCloud();
    alert(queuedLocal
      ? 'Google Apps Script 網址已儲存，並已將 '+queuedLocal+' 筆本機資料加入待同步。'
      : 'Google Apps Script 網址已儲存。');
    setTimeout(()=>checkBackendVersion(false),150);
  }else{
    alert('已清除 Google Apps Script 網址。');
    checkBackendVersion(true);
  }
}

function syncBadgeHtml(item){
  if(!getApiUrl()) return '<span class="sync-badge sync-local">僅本機</span>';
  if(item?.syncStatus==='synced') return '<span class="sync-badge sync-ok">已同步</span>';
  return '<span class="sync-badge sync-pending">待同步</span>';
}


function persist(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  updateHomeSyncStatus();
}

function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('bottomNav').classList.toggle('hidden', id==='page-create' || id==='page-add' || id==='page-records');
  window.scrollTo({top:0,behavior:'smooth'});
}

function fmtMoney(v, currency='TWD'){
  const n = Number(v || 0);
  return new Intl.NumberFormat('zh-TW',{
    style:'currency',currency:currency,maximumFractionDigits:0
  }).format(n);
}

