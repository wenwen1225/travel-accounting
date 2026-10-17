// v61：信用卡 / 交通卡 / 現金皆可直接輸入匯率；同步顯示總進度＋逐筆狀態。
const FORMAL_FRONTEND_VERSION_V61='2026.10.03-v61';
const EXPECTED_BACKEND_VERSION_V61='v52';

function v61SupportedRatePay(){
  return ['信用卡','交通卡','現金'].includes(selectedPay);
}

function v61CalculateTwdFromRate(){
  if(!v61SupportedRatePay()) return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value||''));
  const twd=document.getElementById('expenseTwd');
  if(!twd || !(foreign>0) || !(rate>0)) return;
  const value=rateModeCurrent()===RATE_MODE_FOREIGN_TO_TWD ? foreign*rate : foreign/rate;
  twd.value=formatNumberString(String(Math.round(value)));
  v61RefreshRateDisplay();
}

function v61DeriveRateFromAmounts(){
  if(!v61SupportedRatePay()) return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
  const input=document.getElementById('cashRate');
  if(!input || !(foreign>0) || !(twd>0)) return;
  input.value=rateFmt(impliedRate(foreign,twd,rateModeCurrent()));
  if(currentTrip){
    currentTrip.cashRateMode=rateModeCurrent();
    persist();
  }
  v61RefreshRateDisplay();
}

function v61RefreshRateDisplay(){
  if(typeof ensureExpenseRateUi==='function') ensureExpenseRateUi();
  const group=document.getElementById('cashRateGroup');
  const input=document.getElementById('cashRate');
  const direct=document.getElementById('cashRateDirectBtn');
  const inverse=document.getElementById('cashRateInverseBtn');
  const hint=document.getElementById('cashRateHint');
  const implied=document.getElementById('expenseImpliedRateHint');
  const supported=v61SupportedRatePay();
  const mode=rateModeCurrent();
  const code=currentTrip?.currency||'';
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));

  if(group){
    group.classList.toggle('hidden',!supported);
    const label=group.querySelector('label');
    if(label) label.innerHTML='換算匯率 <span class="tiny">（可直接輸入）</span>';
  }
  if(input){
    input.classList.toggle('hidden',!supported);
    input.disabled=!supported;
    input.placeholder='可直接輸入匯率；也可填台幣後自動反推';
  }
  if(direct){
    direct.textContent=`1 ${code} = ? TWD`;
    direct.classList.toggle('active',mode===RATE_MODE_FOREIGN_TO_TWD);
  }
  if(inverse){
    inverse.textContent=`1 TWD = ? ${code}`;
    inverse.classList.toggle('active',mode===RATE_MODE_TWD_TO_FOREIGN);
  }
  if(hint){
    hint.textContent=mode===RATE_MODE_FOREIGN_TO_TWD
      ? `輸入匯率後：${code} × 匯率 = TWD`
      : `輸入匯率後：${code} ÷ 匯率 = TWD`;
  }
  if(implied){
    if(supported && foreign>0 && twd>0){
      implied.textContent=impliedRateLabel(foreign,twd,mode);
      implied.classList.remove('hidden');
    }else{
      implied.textContent='';
      implied.classList.add('hidden');
    }
  }
}

function v61BindRateInput(){
  const input=document.getElementById('cashRate');
  const twd=document.getElementById('expenseTwd');
  const foreign=document.getElementById('expenseForeign');
  if(input && !input.dataset.v61Bound){
    input.dataset.v61Bound='1';
    input.addEventListener('input',()=>{
      if(currentTrip){
        const n=Number(rawNumber(input.value||''));
        if(n>0) currentTrip.cashRate=n;
        currentTrip.cashRateMode=rateModeCurrent();
        persist();
      }
      v61CalculateTwdFromRate();
    });
  }
  if(twd && !twd.dataset.v61RateBound){
    twd.dataset.v61RateBound='1';
    twd.addEventListener('input',()=>{
      if(v61SupportedRatePay()) v61DeriveRateFromAmounts();
    });
  }
  if(foreign && !foreign.dataset.v61RateBound){
    foreign.dataset.v61RateBound='1';
    foreign.addEventListener('input',()=>{
      const rate=Number(rawNumber(input?.value||''));
      if(rate>0) v61CalculateTwdFromRate();
      else v61RefreshRateDisplay();
    });
  }
}

setExpenseCashRateMode=function(mode){
  if(!currentTrip) return;
  currentTrip.cashRateMode=mode;
  persist();
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
  const input=document.getElementById('cashRate');
  if(input && foreign>0 && twd>0) input.value=rateFmt(impliedRate(foreign,twd,mode));
  v61RefreshRateDisplay();
};

const v60OpenAdd=window.openAdd;
window.openAdd=function(type){
  const result=v60OpenAdd(type);
  if(['expense','credit','transit','cash'].includes(type)){
    setTimeout(()=>{
      v61BindRateInput();
      v61RefreshRateDisplay();
    },0);
  }
  return result;
};

if(typeof window.selectPay==='function'){
  const v60SelectPay=window.selectPay;
  window.selectPay=function(pay){
    const result=v60SelectPay(pay);
    setTimeout(()=>{
      v61BindRateInput();
      v61RefreshRateDisplay();
    },0);
    return result;
  };
}

if(typeof window.editExpense==='function'){
  const v60EditExpense=window.editExpense;
  window.editExpense=function(id){
    const result=v60EditExpense(id);
    setTimeout(()=>{
      v61BindRateInput();
      v61RefreshRateDisplay();
    },0);
    return result;
  };
}

function v61SyncItemLabel(entry){
  const trip=getTripById(entry.tripId);
  if(!trip) return '同步資料';
  if(entry.action==='createTrip') return `建立旅行：${trip.name||'新旅行'}`;
  const item=(trip[entry.recordType]||[]).find(x=>x.id===entry.recordId);
  if(!item) return '同步資料';
  if(entry.recordType==='exchange') return `${item.date||''} · 換匯紀錄`;
  return `${item.date||''} · ${item.name || (entry.recordType==='pretrip'?'先前費用':'消費紀錄')}`;
}

function v61PendingEntries(){
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
        if(!map.has(key)) map.set(key,{key,tripId:t.id,recordId:item.id,recordType:type,action:'',fromQueue:false,conflict:item.syncStatus==='conflict'});
      });
    });
  });
  return [...map.values()];
}

function ensureV61SyncStyles(){
  if(document.getElementById('v61SyncStyle')) return;
  const style=document.createElement('style');
  style.id='v61SyncStyle';
  style.textContent=`
    .sync-record-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
    .sync-record-item{padding:9px 10px;border-radius:12px;background:#fff;border:1px solid #e9e2f5}
    .sync-record-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;font-size:11px}
    .sync-record-name{font-weight:700;color:#4f465c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72%}
    .sync-record-state{font-weight:800;color:#7c5ce7;white-space:nowrap}
    .sync-record-track{height:6px;background:#ebe7f0;border-radius:999px;overflow:hidden}
    .sync-record-fill{height:100%;border-radius:999px;background:#9a82e9;transition:width .25s ease}
    .sync-record-item.is-syncing .sync-record-fill{width:68%;animation:v61Pulse 1.1s ease-in-out infinite alternate}
    .sync-record-item.is-waiting .sync-record-fill{width:16%;opacity:.5}
    .sync-record-item.is-retry .sync-record-fill{width:28%;background:#d49b55}
    @keyframes v61Pulse{from{opacity:.5;transform:translateX(-12%)}to{opacity:1;transform:translateX(12%)}}
    #cashRateGroup .secondary.active{background:#7c5ce7!important;border-color:#7c5ce7!important;color:#fff!important;box-shadow:0 5px 14px rgba(124,92,231,.24)!important}
    #cashRateGroup .secondary.active::after{content:' ✓';font-weight:900}
  `;
  document.head.appendChild(style);
}

function renderV61SyncProgress(){
  ensureV61SyncStyles();
  const box=typeof ensureSyncProgressUi==='function' ? ensureSyncProgressUi() : null;
  if(!box) return;
  let list=document.getElementById('syncRecordProgressList');
  if(!list){
    list=document.createElement('div');
    list.id='syncRecordProgressList';
    list.className='sync-record-list';
    box.appendChild(list);
  }
  const entries=v61PendingEntries();
  const pending=entries.length;
  if(pending>0){
    if(typeof syncProgressHideTimer!=='undefined' && syncProgressHideTimer){ clearTimeout(syncProgressHideTimer); syncProgressHideTimer=null; }
    if(typeof syncProgressBatchTotal!=='undefined'){
      if(syncProgressBatchTotal<=0) syncProgressBatchTotal=pending;
      if(pending>syncProgressBatchTotal) syncProgressBatchTotal=pending;
    }
    const total=(typeof syncProgressBatchTotal!=='undefined' && syncProgressBatchTotal>0)?syncProgressBatchTotal:pending;
    const done=Math.max(0,total-pending);
    const pct=Math.max(5,Math.min(95,Math.round(done/Math.max(1,total)*100)));
    box.classList.remove('hidden','sync-done');
    const text=document.getElementById('syncProgressText');
    const percent=document.getElementById('syncProgressPercent');
    const fill=document.getElementById('syncProgressFill');
    if(text) text.textContent=`總同步 ${done}/${total}｜剩 ${pending} 筆`;
    if(percent) percent.textContent=`${pct}%`;
    if(fill) fill.style.width=`${pct}%`;
    const activeIndex=Math.max(0,entries.findIndex(e=>e.fromQueue));
    list.innerHTML=entries.map((entry,index)=>{
      const isRetry=!!entry.conflict || !!entry.lastError;
      const isSyncing=!isRetry && index===activeIndex && (cloudWriteCount>0 || directRecordSyncRunning || queueSyncRunning);
      const cls=isRetry?'is-retry':isSyncing?'is-syncing':'is-waiting';
      const stateText=isRetry?'等待重試':isSyncing?'同步中':'等待中';
      return `<div class="sync-record-item ${cls}"><div class="sync-record-top"><span class="sync-record-name">${v61SyncItemLabel(entry)}</span><span class="sync-record-state">${stateText}</span></div><div class="sync-record-track"><div class="sync-record-fill"></div></div></div>`;
    }).join('');
    return;
  }
  list.innerHTML='';
  const total=(typeof syncProgressBatchTotal!=='undefined')?syncProgressBatchTotal:0;
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

if(typeof refreshSyncProgress==='function') refreshSyncProgress=renderV61SyncProgress;

function applyV61VersionLabel(){
  const webEl=document.getElementById('webVersionText');
  if(webEl) webEl.textContent=FORMAL_FRONTEND_VERSION_V61;
}

if(typeof renderSettings==='function'){
  const v61BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v61BaseRenderSettings.apply(this,arguments);
    applyV61VersionLabel();
    return result;
  };
}

checkBackendVersion=async function(silent=true){
  const webEl=document.getElementById('webVersionText');
  const scriptEl=document.getElementById('scriptVersionText');
  const statusEl=document.getElementById('versionMatchStatus');
  const btn=document.getElementById('versionCheckBtn');
  if(webEl) webEl.textContent=FORMAL_FRONTEND_VERSION_V61;
  if(!getApiUrl()){
    if(scriptEl) scriptEl.textContent='尚未設定';
    if(statusEl){ statusEl.textContent='請先設定 Apps Script Web App URL'; statusEl.className='version-check-status version-check-error'; }
    return false;
  }
  if(btn){ btn.disabled=true; btn.textContent='檢查中…'; }
  try{
    const data=await postToCloud({action:'getVersion'});
    const version=String(data.scriptVersion||'');
    const matched=version===EXPECTED_BACKEND_VERSION_V61;
    state.lastScriptVersion=version;
    state.lastVersionCheckAt=new Date().toISOString();
    persist();
    if(scriptEl) scriptEl.textContent=version||'未知版本';
    if(statusEl){
      statusEl.textContent=matched?'版本一致，可以正常同步':`版本不一致：網站需要 ${EXPECTED_BACKEND_VERSION_V61}，目前後端是 ${version||'未知'}`;
      statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
    }
    if(!matched && !silent) alert(`Apps Script 版本不一致。\n網站需要：${EXPECTED_BACKEND_VERSION_V61}\n目前後端：${version||'未知版本'}\n\n請重新部署最新 Apps Script。`);
    return matched;
  }catch(err){
    if(scriptEl) scriptEl.textContent='檢查失敗';
    if(statusEl){ statusEl.textContent='無法取得 Apps Script 版本'; statusEl.className='version-check-status version-check-error'; }
    if(!silent) alert('版本檢查失敗：'+(err?.message||err));
    return false;
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='檢查版本'; }
  }
};

ensureV61SyncStyles();
applyV61VersionLabel();
setTimeout(()=>{
  applyV61VersionLabel();
  v61BindRateInput();
  v61RefreshRateDisplay();
  renderV61SyncProgress();
},0);
