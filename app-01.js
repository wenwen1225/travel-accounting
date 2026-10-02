const STORE_KEY = 'travelLedgerV1';
const WEB_APP_VERSION = '2026.10.02-v32';
const EXPECTED_SCRIPT_VERSION = 'v32';

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

function beginCloudActivity(){
  cloudRequestCount++;
  updateHomeSyncStatus();
  updateCloudStatusUI();
}

function endCloudActivity(){
  cloudRequestCount = Math.max(0, cloudRequestCount - 1);
  updateHomeSyncStatus();
  updateCloudStatusUI();
}

async function postToCloud(payload){
  const url = getApiUrl();
  if(!url) throw new Error('NO_API_URL');

  beginCloudActivity();
  try{
    const res = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('HTTP_'+res.status);
    const data = await res.json();
    if(!data || data.success !== true) throw new Error(data?.message || 'SYNC_FAILED');
    return data;
  }finally{
    endCloudActivity();
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
    if(queued) queued.lastError = trip.lastSyncError;
    persist();
    setTimeout(autoSyncPendingRecords, 5000);
    return false;
  }
}

async function syncRecord(action, trip, type, item){
  try{
    const data = await postToCloud(cloudPayloadForRecord(action, trip, item));
    setRecordSyncState(trip, type, item.id, 'synced');
    state.syncQueue = state.syncQueue.filter(q => !(q.tripId===trip.id && q.recordId===item.id));
    item.lastSyncError = '';
    markSyncSuccess();
    return true;
  }catch(err){
    setRecordSyncState(trip, type, item.id, 'pending');
    item.lastSyncError = err && err.message ? err.message : String(err);
    enqueueSync(action, trip.id, type, item.id, cloudPayloadForRecord(action, trip, item));
    const queued = state.syncQueue.find(q => q.tripId===trip.id && q.recordId===item.id && q.action===action);
    if(queued) queued.lastError = item.lastSyncError;
    persist();
    setTimeout(autoSyncPendingRecords, 5000);
    return false;
  }
}

let autoSyncRunning = false;

async function syncPendingRecords(options={}){
  const silent = !!options.silent;
  if(!getApiUrl()){
    if(!silent) alert('請先填入 Google Apps Script Web App URL。');
    return;
  }

  const queue = [...state.syncQueue];
  const errors = [];

  for(const q of queue){
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
        if(item) item.lastSyncError = '';
        state.syncQueue = state.syncQueue.filter(x => !(x.tripId===q.tripId && x.recordId===q.recordId));
      }

      removeQueued(q.queueId);
      markSyncSuccess();

    }catch(err){
      const msg = err && err.message ? err.message : String(err);
      q.lastError = msg;
      const realQueueItem = state.syncQueue.find(x=>x.queueId===q.queueId);
      if(realQueueItem) realQueueItem.lastError = msg;
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
      if(item) item.lastSyncError='';
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

  for(const cloudItem of (cloudList || [])){
    const localItem = localMap.get(cloudItem.id);
    if(localItem && (pendingIds.has(cloudItem.id) || localItem.syncStatus === 'pending' || localItem.syncStatus === 'local')){
      merged.push(localItem);
    }else{
      merged.push({...cloudItem, syncStatus:'synced', lastSyncError:''});
    }
    localMap.delete(cloudItem.id);
  }

  for(const localItem of localMap.values()){
    if(
      pendingIds.has(localItem.id) ||
      localItem.syncStatus === 'pending' ||
      localItem.syncStatus === 'local'
    ){
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

async function syncAndPullCloud(){
  if(!getApiUrl()) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;

  // 先把本機待同步推上去，再讀回最新雲端資料，避免舊雲端覆蓋本機新修改
  await autoSyncPendingRecords();
  await pullCloudTrips({silent:true});
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

function updateHomeSyncStatus(){
  updateLastSyncUI();
  const box = document.getElementById('homeSyncStatus');
  const text = document.getElementById('homeSyncText');
  const icon = document.getElementById('homeSyncIcon');
  if(!box || !text || !icon) return;

  if(!getApiUrl()){
    box.className='home-sync-status home-sync-local';
    icon.textContent='●';
    text.textContent='僅本機';
    return;
  }

  if(cloudRequestCount > 0){
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
  if(pending) pending.textContent = cloudRequestCount > 0 ? '同步中…' : `${state.syncQueue.length} 筆待同步`;
  if(!dot || !text) return;
  if(getApiUrl()){
    if(cloudRequestCount > 0){
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
    alert('Google Apps Script 網址已儲存。');
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

