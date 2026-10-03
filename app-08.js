// v58.4：恢復匯率提示＋修正背景逐筆同步狀態。
const MOBILE_WRITE_PATCH_VERSION='2026.10.03-v58.4';

// ===== 匯率功能：信用卡 / 交通卡顯示推算匯率，現金可輸入匯率自動換算 =====
const RATE_MODE_FOREIGN_TO_TWD='foreignToTwd';
const RATE_MODE_TWD_TO_FOREIGN='twdToForeign';

function rateModeDefault(){
  return currentTrip?.currency==='KRW' ? RATE_MODE_TWD_TO_FOREIGN : RATE_MODE_FOREIGN_TO_TWD;
}
function rateModeCurrent(){ return currentTrip?.cashRateMode || rateModeDefault(); }
function rateFmt(v){
  const n=Number(v);
  if(!Number.isFinite(n) || n<=0) return '';
  return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
}
function impliedRate(foreign,twd,mode=rateModeDefault()){
  const f=Number(foreign), t=Number(twd);
  if(!(f>0) || !(t>0)) return 0;
  return mode===RATE_MODE_FOREIGN_TO_TWD ? t/f : f/t;
}
function impliedRateLabel(foreign,twd,mode=rateModeDefault()){
  const r=impliedRate(foreign,twd,mode);
  if(!(r>0) || !currentTrip) return '';
  const code=currentTrip.currency;
  return mode===RATE_MODE_FOREIGN_TO_TWD
    ? `推算匯率：1 ${code} ≈ NT$${rateFmt(r)}`
    : `推算匯率：NT$1 ≈ ${rateFmt(r)} ${code}`;
}

function ensureExpenseRateUi(){
  const foreign=document.getElementById('expenseForeign');
  const twd=document.getElementById('expenseTwd');
  const twdGroup=twd?.closest('.form-group');
  const moneyRow=twdGroup?.parentElement;
  if(!foreign || !twd || !twdGroup || !moneyRow) return;

  if(!document.getElementById('cashRateGroup')){
    const group=document.createElement('div');
    group.id='cashRateGroup';
    group.className='form-group hidden';
    group.innerHTML=`
      <label>換算匯率 <span class="tiny">（現金可直接輸入）</span></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px">
        <button id="cashRateDirectBtn" type="button" class="secondary" onclick="setExpenseCashRateMode('${RATE_MODE_FOREIGN_TO_TWD}')"></button>
        <button id="cashRateInverseBtn" type="button" class="secondary" onclick="setExpenseCashRateMode('${RATE_MODE_TWD_TO_FOREIGN}')"></button>
      </div>
      <input id="cashRate" type="text" inputmode="decimal" placeholder="可留空；輸入台幣後也會反推" />
      <div id="cashRateHint" class="tiny" style="margin-top:6px"></div>`;
    moneyRow.insertBefore(group,twdGroup);

    document.getElementById('cashRate')?.addEventListener('input',()=>{
      rememberExpenseCashRate();
      calculateExpenseCashTwd();
    });
  }

  if(!document.getElementById('expenseImpliedRateHint')){
    const hint=document.createElement('div');
    hint.id='expenseImpliedRateHint';
    hint.className='tiny hidden';
    hint.style.cssText='margin-top:6px;color:#6f52c8;font-weight:700';
    twdGroup.appendChild(hint);
  }

  if(!foreign.dataset.rateUiBound){
    foreign.dataset.rateUiBound='1';
    foreign.addEventListener('input',refreshExpenseRateUi);
  }
  if(!twd.dataset.rateUiBound){
    twd.dataset.rateUiBound='1';
    twd.addEventListener('input',()=>{
      if(selectedPay==='現金') deriveExpenseCashRate();
      refreshExpenseRateUi();
    });
  }
}

function rememberExpenseCashRate(){
  if(!currentTrip || selectedPay!=='現金') return;
  const n=Number(rawNumber(document.getElementById('cashRate')?.value||''));
  if(n>0) currentTrip.cashRate=n;
  currentTrip.cashRateMode=rateModeCurrent();
  persist();
}
function setExpenseCashRateMode(mode){
  if(!currentTrip) return;
  currentTrip.cashRateMode=mode;
  persist();
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
  const input=document.getElementById('cashRate');
  if(input && foreign>0 && twd>0) input.value=rateFmt(impliedRate(foreign,twd,mode));
  refreshExpenseRateUi();
}
function calculateExpenseCashTwd(){
  if(selectedPay!=='現金') return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value||''));
  const twd=document.getElementById('expenseTwd');
  if(!twd || !(foreign>0) || !(rate>0)) return;
  const value=rateModeCurrent()===RATE_MODE_FOREIGN_TO_TWD ? foreign*rate : foreign/rate;
  twd.value=formatNumberString(String(Math.round(value)));
  refreshExpenseRateUi();
}
function deriveExpenseCashRate(){
  if(selectedPay!=='現金') return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
  const input=document.getElementById('cashRate');
  if(!input || !(foreign>0) || !(twd>0)) return;
  input.value=rateFmt(impliedRate(foreign,twd,rateModeCurrent()));
  rememberExpenseCashRate();
}
function refreshExpenseRateUi(){
  ensureExpenseRateUi();
  const cashGroup=document.getElementById('cashRateGroup');
  const implied=document.getElementById('expenseImpliedRateHint');
  const rateInput=document.getElementById('cashRate');
  const direct=document.getElementById('cashRateDirectBtn');
  const inverse=document.getElementById('cashRateInverseBtn');
  const cashHint=document.getElementById('cashRateHint');
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
  const isCash=selectedPay==='現金';
  const isImplied=selectedPay==='信用卡' || selectedPay==='交通卡';

  if(cashGroup) cashGroup.classList.toggle('hidden',!isCash);
  if(isCash){
    const mode=rateModeCurrent();
    const code=currentTrip?.currency||'';
    if(direct){ direct.textContent=`1 ${code} = ? TWD`; direct.classList.toggle('active',mode===RATE_MODE_FOREIGN_TO_TWD); }
    if(inverse){ inverse.textContent=`1 TWD = ? ${code}`; inverse.classList.toggle('active',mode===RATE_MODE_TWD_TO_FOREIGN); }
    if(cashHint) cashHint.textContent=mode===RATE_MODE_FOREIGN_TO_TWD ? `${code} × 匯率 = TWD` : `${code} ÷ 匯率 = TWD`;
    if(rateInput && !rateInput.value && Number(currentTrip?.cashRate)>0) rateInput.value=rateFmt(currentTrip.cashRate);
  }

  if(implied){
    if(isImplied && foreign>0 && twd>0){
      implied.textContent=impliedRateLabel(foreign,twd,rateModeDefault());
      implied.classList.remove('hidden');
    }else{
      implied.textContent='';
      implied.classList.add('hidden');
    }
  }
}

const v583OpenAdd=window.openAdd;
window.openAdd=function(type){
  const result=v583OpenAdd(type);
  if(['expense','credit','transit','cash'].includes(type)){
    ensureExpenseRateUi();
    const input=document.getElementById('cashRate');
    if(input) input.value=Number(currentTrip?.cashRate)>0 ? rateFmt(currentTrip.cashRate) : '';
    refreshExpenseRateUi();
  }
  return result;
};

if(typeof window.selectPay==='function'){
  const v583SelectPay=window.selectPay;
  window.selectPay=function(pay){
    const result=v583SelectPay(pay);
    setTimeout(refreshExpenseRateUi,0);
    return result;
  };
}

if(typeof window.editExpense==='function'){
  const v583EditExpense=window.editExpense;
  window.editExpense=function(id){
    const result=v583EditExpense(id);
    setTimeout(()=>{ ensureExpenseRateUi(); refreshExpenseRateUi(); },0);
    return result;
  };
}

// ===== 背景同步：每一筆先進 queue，成功才移除；忙碌時不再漏掉重試 =====
function actualPendingSyncCount(){
  const ids=new Set();
  (state.syncQueue||[]).forEach(q=>ids.add(`${q.tripId||''}:${q.recordId||q.queueId||''}`));
  (state.trips||[]).forEach(t=>{
    ['expenses','pretrip','exchange'].forEach(type=>{
      (t[type]||[]).forEach(item=>{
        if(item?.syncStatus==='pending' || item?.syncStatus==='conflict') ids.add(`${t.id}:${item.id}`);
      });
    });
  });
  return ids.size;
}

const v583SyncRecord=syncRecord;
syncRecord=async function(action,trip,type,item){
  if(trip && item && getApiUrl()){
    setRecordSyncState(trip,type,item.id,'pending');
    item.lastSyncError='雲端同步中';
    enqueueSync(action,trip.id,type,item.id,cloudPayloadForRecord(action,trip,item));
    persist();
    updateHomeSyncStatus();
    updateCloudStatusUI();
  }
  return v583SyncRecord(action,trip,type,item);
};

scheduleSameRecordRetry=function(queueId,delay=5000){
  if(!queueId) return;
  if(mobileWriteRetryTimers.has(queueId)) return;
  const timer=setTimeout(async ()=>{
    mobileWriteRetryTimers.delete(queueId);
    const q=(state.syncQueue||[]).find(x=>x.queueId===queueId);
    if(!q) return;
    if(queueSyncRunning || directRecordSyncRunning){
      scheduleSameRecordRetry(queueId,3000);
      return;
    }
    const trip=getTripById(q.tripId);
    if(!trip) return;
    try{
      let payload=q.payload||{};
      if(q.action!=='createTrip'){
        if(!trip.spreadsheetId){
          const ready=await ensureTripSpreadsheetReady(trip);
          if(!ready){ scheduleSameRecordRetry(queueId,5000); return; }
        }
        const arr=trip[q.recordType]||[];
        const item=arr.find(x=>x.id===q.recordId);
        payload=item ? cloudPayloadForRecord(q.action,trip,item) : {...payload,spreadsheetId:trip.spreadsheetId||payload.spreadsheetId||''};
      }
      const data=await postToCloud(payload);
      if(q.action==='createTrip'){
        trip.spreadsheetId=data.spreadsheetId||trip.spreadsheetId||'';
        trip.spreadsheetUrl=data.spreadsheetUrl||trip.spreadsheetUrl||'';
        trip.cloudStatus='synced';
      }else{
        setRecordSyncState(trip,q.recordType,q.recordId,'synced');
        const item=(trip[q.recordType]||[]).find(x=>x.id===q.recordId);
        if(item){ item.lastSyncError=''; item.syncStatus='synced'; if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint; }
      }
      state.syncQueue=(state.syncQueue||[]).filter(x=>x.queueId!==queueId && !(x.tripId===q.tripId && x.recordId===q.recordId));
      markSyncSuccess();
      persist();
      if(currentTrip && currentTrip.id===trip.id) renderTripSummary();
      if(typeof renderSettings==='function') renderSettings();
      updateHomeSyncStatus();
      updateCloudStatusUI();
    }catch(err){
      const live=(state.syncQueue||[]).find(x=>x.queueId===queueId);
      if(live){ live.lastError=String(err?.message||err||'同步失敗'); live.lastErrorAt=new Date().toISOString(); persist(); }
      scheduleSameRecordRetry(queueId,8000);
    }
  },delay);
  mobileWriteRetryTimers.set(queueId,timer);
};

const baseUpdateHomeSyncStatus=updateHomeSyncStatus;
updateHomeSyncStatus=function(){
  baseUpdateHomeSyncStatus();
  const count=actualPendingSyncCount();
  if(!getApiUrl() || count<=0) return;
  const text=document.getElementById('homeSyncText');
  const icon=document.getElementById('homeSyncIcon');
  const sub=document.getElementById('homeLastSync');
  if(text) text.textContent=`尚有 ${count} 筆待同步`;
  if(icon) icon.textContent='↻';
  if(sub) sub.textContent='資料已先保存在手機，背景同步中';
};

const baseUpdateCloudStatusUI=updateCloudStatusUI;
updateCloudStatusUI=function(){
  baseUpdateCloudStatusUI();
  const count=actualPendingSyncCount();
  if(count<=0) return;
  const pending=document.getElementById('pendingSyncCount');
  const text=document.getElementById('cloudStatusText');
  if(pending) pending.textContent=`${count} 筆待同步`;
  if(text) text.textContent='尚有資料等待同步';
};

document.addEventListener('DOMContentLoaded',()=>{
  const webEl=document.getElementById('webVersionText');
  if(webEl) webEl.textContent=MOBILE_WRITE_PATCH_VERSION;
});