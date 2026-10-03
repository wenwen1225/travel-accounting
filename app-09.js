// v60：正式版版本號＋逐筆同步進度＋後端 v52 相容。
const FORMAL_FRONTEND_VERSION_V60='2026.10.03-v60';
const EXPECTED_BACKEND_VERSION_V60='v52';

function v60SyncItemLabel(entry){
  const trip=getTripById(entry.tripId);
  if(!trip) return '同步資料';
  if(entry.action==='createTrip') return `建立旅行：${trip.name || '新旅行'}`;
  const type=entry.recordType;
  const item=(trip[type]||[]).find(x=>x.id===entry.recordId);
  if(!item) return '同步資料';
  if(type==='exchange') return `${item.date || ''} · 換匯紀錄`;
  return `${item.date || ''} · ${item.name || (type==='pretrip'?'先前費用':'消費紀錄')}`;
}

function v60PendingEntries(){
  const map=new Map();
  (state.syncQueue||[]).forEach(q=>{
    const key=`${q.tripId||''}:${q.recordId||q.queueId||''}`;
    map.set(key,{...q,key,fromQueue:true});
  });
  (state.trips||[]).forEach(t=>{
    ['expenses','pretrip','exchange'].forEach(type=>{
      (t[type]||[]).forEach(item=>{
        if(item?.syncStatus!=='pending' && item?.syncStatus!=='conflict') return;
        const key=`${t.id}:${item.id}`;
        if(!map.has(key)){
          map.set(key,{
            key,
            tripId:t.id,
            recordId:item.id,
            recordType:type,
            action:'',
            fromQueue:false,
            conflict:item.syncStatus==='conflict'
          });
        }
      });
    });
  });
  return [...map.values()];
}

function ensureV60SyncStyles(){
  if(document.getElementById('v60SyncStyle')) return;
  const style=document.createElement('style');
  style.id='v60SyncStyle';
  style.textContent=`
    .sync-record-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .sync-record-item{padding:9px 10px;border-radius:12px;background:#fff;border:1px solid #e9e2f5}
    .sync-record-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:11px}
    .sync-record-name{font-weight:700;color:#4f465c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72%}
    .sync-record-state{font-weight:800;color:#7c5ce7;white-space:nowrap}
    .sync-record-track{height:6px;background:#ebe7f0;border-radius:999px;overflow:hidden}
    .sync-record-fill{height:100%;border-radius:999px;background:#9a82e9;transition:width .25s ease}
    .sync-record-item.is-syncing .sync-record-fill{width:64%;animation:v60Pulse 1.1s ease-in-out infinite alternate}
    .sync-record-item.is-waiting .sync-record-fill{width:18%}
    .sync-record-item.is-retry .sync-record-fill{width:28%;background:#d49b55}
    @keyframes v60Pulse{from{opacity:.55}to{opacity:1}}
    #cashRateGroup .secondary.active{background:#7c5ce7!important;border-color:#7c5ce7!important;color:#fff!important;box-shadow:0 5px 14px rgba(124,92,231,.24)!important}
    #cashRateGroup .secondary.active::after{content:' ✓';font-weight:900}
  `;
  document.head.appendChild(style);
}

function ensureV60RecordProgressHost(){
  const card=typeof ensureSyncProgressUi==='function' ? ensureSyncProgressUi() : null;
  if(!card) return null;
  let list=document.getElementById('syncRecordProgressList');
  if(!list){
    list=document.createElement('div');
    list.id='syncRecordProgressList';
    list.className='sync-record-list';
    card.appendChild(list);
  }
  return list;
}

function renderV60SyncProgress(){
  ensureV60SyncStyles();
  const box=typeof ensureSyncProgressUi==='function' ? ensureSyncProgressUi() : null;
  if(!box) return;
  const list=ensureV60RecordProgressHost();
  const entries=v60PendingEntries();
  const pending=entries.length;

  if(pending>0){
    if(typeof syncProgressHideTimer!=='undefined' && syncProgressHideTimer){
      clearTimeout(syncProgressHideTimer);
      syncProgressHideTimer=null;
    }
    if(typeof syncProgressBatchTotal!=='undefined'){
      if(syncProgressBatchTotal<=0) syncProgressBatchTotal=pending;
      if(pending>syncProgressBatchTotal) syncProgressBatchTotal=pending;
    }
    const total=(typeof syncProgressBatchTotal!=='undefined' && syncProgressBatchTotal>0) ? syncProgressBatchTotal : pending;
    const done=Math.max(0,total-pending);
    const pct=Math.max(5,Math.min(95,Math.round(done/Math.max(1,total)*100)));
    box.classList.remove('hidden','sync-done');
    const text=document.getElementById('syncProgressText');
    const percent=document.getElementById('syncProgressPercent');
    const fill=document.getElementById('syncProgressFill');
    if(text) text.textContent=`總同步 ${done}/${total}｜剩 ${pending} 筆`;
    if(percent) percent.textContent=`${pct}%`;
    if(fill) fill.style.width=`${pct}%`;

    const firstQueuedIndex=entries.findIndex(e=>e.fromQueue);
    list.innerHTML=entries.map((entry,index)=>{
      const isRetry=!!entry.conflict || !!entry.lastError;
      const isSyncing=!isRetry && index===(firstQueuedIndex>=0?firstQueuedIndex:0);
      const cls=isRetry?'is-retry':isSyncing?'is-syncing':'is-waiting';
      const stateText=isRetry?'等待重試':isSyncing?'同步中':'等待中';
      return `<div class="sync-record-item ${cls}">
        <div class="sync-record-top">
          <span class="sync-record-name">${v60SyncItemLabel(entry)}</span>
          <span class="sync-record-state">${stateText}</span>
        </div>
        <div class="sync-record-track"><div class="sync-record-fill"></div></div>
      </div>`;
    }).join('');
    return;
  }

  if(list) list.innerHTML='';
  const total=(typeof syncProgressBatchTotal!=='undefined') ? syncProgressBatchTotal : 0;
  if(total>0){
    box.classList.remove('hidden');
    box.classList.add('sync-done');
    const text=document.getElementById('syncProgressText');
    const percent=document.getElementById('syncProgressPercent');
    const fill=document.getElementById('syncProgressFill');
    if(text) text.textContent=`同步完成 ${total}/${total}`;
    if(percent) percent.textContent='100%';
    if(fill) fill.style.width='100%';
    if(typeof syncProgressHideTimer!=='undefined'){
      syncProgressHideTimer=setTimeout(()=>{
        box.classList.add('hidden');
        box.classList.remove('sync-done');
        if(typeof syncProgressBatchTotal!=='undefined') syncProgressBatchTotal=0;
      },1800);
    }
  }else{
    box.classList.add('hidden');
  }
}

// 取代 v59 的總進度刷新：保留總進度，同時列出每一筆各自狀態。
if(typeof refreshSyncProgress==='function'){
  refreshSyncProgress=renderV60SyncProgress;
}

function applyV60VersionLabel(){
  const webEl=document.getElementById('webVersionText');
  if(webEl) webEl.textContent=FORMAL_FRONTEND_VERSION_V60;
}

if(typeof renderSettings==='function'){
  const v60BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v60BaseRenderSettings.apply(this,arguments);
    applyV60VersionLabel();
    return result;
  };
}

// 後端正式升級為 v52；這裡同步更新版本檢查，不再沿用 app-01 的 v51 判斷。
checkBackendVersion=async function(silent=true){
  const webEl=document.getElementById('webVersionText');
  const scriptEl=document.getElementById('scriptVersionText');
  const statusEl=document.getElementById('versionMatchStatus');
  const btn=document.getElementById('versionCheckBtn');
  if(webEl) webEl.textContent=FORMAL_FRONTEND_VERSION_V60;

  if(!getApiUrl()){
    if(scriptEl) scriptEl.textContent='尚未設定';
    if(statusEl){
      statusEl.textContent='請先設定 Apps Script Web App URL';
      statusEl.className='version-check-status version-check-error';
    }
    return false;
  }

  if(btn){ btn.disabled=true; btn.textContent='檢查中…'; }
  try{
    const data=await postToCloud({action:'getVersion'});
    const version=String(data.scriptVersion||'');
    const matched=version===EXPECTED_BACKEND_VERSION_V60;
    state.lastScriptVersion=version;
    state.lastVersionCheckAt=new Date().toISOString();
    persist();
    if(scriptEl) scriptEl.textContent=version||'未知版本';
    if(statusEl){
      statusEl.textContent=matched
        ? '版本一致，可以正常同步'
        : `版本不一致：網站需要 ${EXPECTED_BACKEND_VERSION_V60}，目前後端是 ${version||'未知'}`;
      statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
    }
    if(!matched && !silent){
      alert(`Apps Script 版本不一致。\n網站需要：${EXPECTED_BACKEND_VERSION_V60}\n目前後端：${version||'未知版本'}\n\n請重新部署最新 Apps Script。`);
    }
    return matched;
  }catch(err){
    if(scriptEl) scriptEl.textContent='檢查失敗';
    if(statusEl){
      statusEl.textContent='無法取得 Apps Script 版本';
      statusEl.className='version-check-status version-check-error';
    }
    if(!silent) alert('版本檢查失敗：'+(err?.message||err));
    return false;
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
  }
};

// app-09 是由 app-07 動態載入，可能晚於 DOMContentLoaded；因此立即套用一次。
ensureV60SyncStyles();
applyV60VersionLabel();
setTimeout(()=>{
  applyV60VersionLabel();
  renderV60SyncProgress();
},0);
