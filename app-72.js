// v144：退稅機台欄位前端同步修正。
// 確保新增、修改、離線待同步、手動重送都會把 refundMachine 與完整退稅欄位送到 GAS。
(()=>{
  const VER='2026.10.15-v144-tax-refund-machine-sync';
  if(window.__taxRefundMachineSyncV144Installed) return;
  window.__taxRefundMachineSyncV144Installed=true;

  const MACHINE='找機台退稅❗️';
  const COMPLETED='機台退稅完成✅';

  function statusKey(value){
    return String(value||'').replace(/\uFE0F/g,'').replace(/\s+/g,'').trim();
  }

  function normalizeStatus(value){
    const key=statusKey(value);
    if(key==='找機台退稅❗') return MACHINE;
    if(key==='機台退稅完成✅') return COMPLETED;
    if(key==='當下已退稅✅') return '當下已退稅✅';
    if(key==='無法退稅✖') return '無法退稅✖️';
    return String(value||'').trim();
  }

  function shouldKeepMachine(status){
    const s=normalizeStatus(status);
    return s===MACHINE || s===COMPLETED;
  }

  function firstText(){
    for(const value of arguments){
      const s=String(value==null?'':value).trim();
      if(s) return s;
    }
    return '';
  }

  function machineFromItem(item){
    if(!item) return '';
    return firstText(
      item.refundMachine,
      item.refundMachineName,
      item.refundMachineLocation,
      item.taxRefundMachine,
      item.taxRefundMachineName,
      item.taxRefundLocation,
      item.machineName,
      item.machineLocation,
      item.refundLocation
    );
  }

  function readForm(){
    let status='';
    let machine='';
    try{
      if(typeof taxRefundReadForm==='function'){
        const data=taxRefundReadForm()||{};
        status=data.status||data.refundStatus||'';
        machine=data.machine||data.refundMachine||'';
      }
    }catch(e){}

    if(!status){
      status=document.getElementById('taxRefundGroup')?.dataset?.status||'';
    }
    status=normalizeStatus(status);

    if(shouldKeepMachine(status) && !machine){
      machine=(document.getElementById('taxRefundMachine')?.value||'').trim();
    }

    return {
      status,
      machine: shouldKeepMachine(status) ? String(machine||'').trim() : ''
    };
  }

  function applyToItem(item,snapshot){
    if(!item) return item;
    const data=snapshot||{};
    const status=normalizeStatus(data.status||data.refundStatus||item.refundStatus||'');
    const machine=firstText(data.machine,data.refundMachine,machineFromItem(item));

    item.refundStatus=status;
    item.refundMachine=shouldKeepMachine(status) ? machine : '';

    // 後端 v63 目前也支援這些正式退稅欄位，一併保留。
    if(data.refundMethod!=null) item.refundMethod=data.refundMethod;
    if(data.refundAmount!=null) item.refundAmount=data.refundAmount;
    if(data.refundTwdAmount!=null) item.refundTwdAmount=data.refundTwdAmount;
    if(data.refundCard!=null) item.refundCard=data.refundCard;
    if(data.refundCompletedAt!=null) item.refundCompletedAt=data.refundCompletedAt;
    return item;
  }

  function refundFields(item){
    const status=normalizeStatus(item?.refundStatus||'');
    return {
      refundStatus:status,
      refundMachine:shouldKeepMachine(status) ? machineFromItem(item) : '',
      refundMethod:item?.refundMethod||'',
      refundAmount:item?.refundAmount??'',
      refundTwdAmount:item?.refundTwdAmount??'',
      refundCard:item?.refundCard||'',
      refundCompletedAt:item?.refundCompletedAt||''
    };
  }

  function enrichPayload(payload,item){
    if(!payload || !item) return payload;
    const fields=refundFields(item);

    if(payload.record && typeof payload.record==='object'){
      Object.assign(payload.record,fields);
    }
    if(payload.data?.record && typeof payload.data.record==='object'){
      Object.assign(payload.data.record,fields);
    }
    // 額外放頂層相容欄位，不影響既有後端。
    Object.assign(payload,fields);
    return payload;
  }

  function patchQueueForItem(trip,item){
    if(!trip || !item || !window.state) return;
    const fields=refundFields(item);
    (state.syncQueue||[]).forEach(q=>{
      if(String(q.tripId)!==String(trip.id) || String(q.recordId)!==String(item.id)) return;
      q.payload=q.payload||{};
      enrichPayload(q.payload,item);
      if(q.payload.record && typeof q.payload.record==='object') Object.assign(q.payload.record,fields);
    });
  }

  function patchAllPending(){
    if(!window.state) return;
    (state.syncQueue||[]).forEach(q=>{
      if(!q || q.action==='createTrip') return;
      const trip=(state.trips||[]).find(t=>String(t.id)===String(q.tripId));
      if(!trip) return;
      const list=trip[q.recordType]||[];
      const item=list.find(x=>String(x.id)===String(q.recordId));
      if(item) patchQueueForItem(trip,item);
    });
    try{persist();}catch(e){}
  }

  // 1) 表單讀取與 item 套用，直接固定成正式欄位。
  try{
    window.taxRefundReadForm=function(){ return readForm(); };
    taxRefundReadForm=window.taxRefundReadForm;
  }catch(e){}

  try{
    window.taxRefundApplyToItem=function(item,snapshot){ return applyToItem(item,snapshot); };
    taxRefundApplyToItem=window.taxRefundApplyToItem;
  }catch(e){}

  // 2) 儲存前抓快照；儲存後再補一次本機資料，避免離線時只留在畫面上。
  if(typeof saveExpense==='function'){
    const baseSaveExpense=saveExpense;
    const wrappedSaveExpense=async function(){
      const trip=currentTrip;
      const snapshot=readForm();
      const beforeIds=new Set((trip?.expenses||[]).map(x=>String(x.id)));
      let editId='';
      try{
        editId=String(window.editingExpenseId || (typeof editingExpenseId!=='undefined' ? editingExpenseId : '') || '');
      }catch(e){}

      const result=await baseSaveExpense.apply(this,arguments);
      if(!trip) return result;

      let item=null;
      if(editId) item=(trip.expenses||[]).find(x=>String(x.id)===editId) || null;
      if(!item){
        const added=(trip.expenses||[]).filter(x=>!beforeIds.has(String(x.id)));
        item=added[added.length-1] || null;
      }
      if(!item && (trip.expenses||[]).length){
        item=[...(trip.expenses||[])].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
      }

      if(item){
        applyToItem(item,snapshot);
        patchQueueForItem(trip,item);
        try{persist();}catch(e){}
      }
      return result;
    };
    saveExpense=wrappedSaveExpense;
    window.saveExpense=wrappedSaveExpense;
  }

  // 3) 每次同步前再次把表單/本機正式欄位塞回 item，避免同步層吃掉機台。
  if(typeof syncRecord==='function'){
    const baseSyncRecord=syncRecord;
    const wrappedSyncRecord=async function(action,trip,type,item){
      if(type==='expenses' && item){
        const pageAdd=document.getElementById('page-add');
        if(pageAdd?.classList?.contains('active')){
          const snapshot=readForm();
          if(snapshot.status) applyToItem(item,snapshot);
        }else{
          applyToItem(item,{status:item.refundStatus,machine:machineFromItem(item)});
        }
        patchQueueForItem(trip,item);
        try{persist();}catch(e){}
      }
      return baseSyncRecord.apply(this,arguments);
    };
    syncRecord=wrappedSyncRecord;
    window.syncRecord=wrappedSyncRecord;
  }

  // 4) 雲端 payload 最後一關：無論新增/修改都保證 record 內含 refundMachine。
  if(typeof cloudPayloadForRecord==='function'){
    const basePayload=cloudPayloadForRecord;
    const wrappedPayload=function(action,trip,item){
      const payload=basePayload.apply(this,arguments);
      return enrichPayload(payload,item);
    };
    cloudPayloadForRecord=wrappedPayload;
    window.cloudPayloadForRecord=wrappedPayload;
  }

  // 5) 手動「同步待處理」與單筆重送前，刷新 queue payload。
  if(typeof syncPendingRecords==='function'){
    const baseSyncPending=syncPendingRecords;
    const wrappedSyncPending=async function(){
      patchAllPending();
      return baseSyncPending.apply(this,arguments);
    };
    syncPendingRecords=wrappedSyncPending;
    window.syncPendingRecords=wrappedSyncPending;
  }

  if(typeof retrySingleSync==='function'){
    const baseRetry=retrySingleSync;
    const wrappedRetry=async function(queueId){
      patchAllPending();
      return baseRetry.apply(this,arguments);
    };
    retrySingleSync=wrappedRetry;
    window.retrySingleSync=wrappedRetry;
  }

  // 6) 開啟舊資料編輯時，把既有機台名稱確實塞回輸入框。
  if(typeof editExpense==='function'){
    const baseEditExpense=editExpense;
    const wrappedEditExpense=function(id){
      const r=baseEditExpense.apply(this,arguments);
      setTimeout(()=>{
        const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===String(id));
        if(!item) return;
        const status=normalizeStatus(item.refundStatus||'');
        const machine=machineFromItem(item);
        const group=document.getElementById('taxRefundGroup');
        if(group) group.dataset.status=status;
        const input=document.getElementById('taxRefundMachine');
        if(input && shouldKeepMachine(status)) input.value=machine;
      },0);
      return r;
    };
    editExpense=wrappedEditExpense;
    window.editExpense=wrappedEditExpense;
  }

  // 啟動時先補強既有待同步 payload。
  patchAllPending();

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
})();
