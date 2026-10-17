// v145：退稅機台同步 +「全部紀錄」篩選修正。
// 1) refundMachine 新增/修改/待同步都確實送到 GAS。
// 2) 卡別篩選納入「共用卡別」state.cards（含台新、富邦等），不是只看本趟已用過的卡。
// 3) 新增退稅狀態篩選，可查「找機台退稅（含已完成）」再確認。
(()=>{
  const VER='2026.10.15-v145-record-filter-refund';
  if(window.__travelV145Installed) return;
  window.__travelV145Installed=true;

  const INSTANT='當下已退稅✅';
  const NONE='無法退稅✖️';
  const MACHINE='找機台退稅❗️';
  const COMPLETED='機台退稅完成✅';

  function statusKey(value){
    return String(value||'').replace(/\uFE0F/g,'').replace(/\s+/g,'').trim();
  }

  function normalizeStatus(value){
    const key=statusKey(value);
    if(key==='當下已退稅✅') return INSTANT;
    if(key==='無法退稅✖') return NONE;
    if(key==='找機台退稅❗') return MACHINE;
    if(key==='機台退稅完成✅') return COMPLETED;
    return String(value||'').trim();
  }

  function keepMachine(status){
    const s=normalizeStatus(status);
    return s===MACHINE || s===COMPLETED;
  }

  function firstText(...values){
    for(const value of values){
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

  const baseTaxRefundReadForm=
    typeof window.taxRefundReadForm==='function'
      ? window.taxRefundReadForm
      : (typeof taxRefundReadForm==='function' ? taxRefundReadForm : null);

  function readRefundForm(){
    let status='';
    let machine='';

    if(baseTaxRefundReadForm){
      try{
        const data=baseTaxRefundReadForm()||{};
        status=data.status||data.refundStatus||'';
        machine=data.machine||data.refundMachine||'';
      }catch(e){}
    }

    if(!status){
      status=document.getElementById('taxRefundGroup')?.dataset?.status||'';
    }
    status=normalizeStatus(status);

    if(keepMachine(status) && !machine){
      machine=(document.getElementById('taxRefundMachine')?.value||'').trim();
    }

    return {
      status,
      machine:keepMachine(status) ? String(machine||'').trim() : ''
    };
  }

  function applyRefundToItem(item,snapshot){
    if(!item) return item;
    const data=snapshot||{};
    const status=normalizeStatus(
      data.status||data.refundStatus||item.refundStatus||''
    );
    const machine=firstText(
      data.machine,
      data.refundMachine,
      machineFromItem(item)
    );

    item.refundStatus=status;
    item.refundMachine=keepMachine(status) ? machine : '';

    ['refundMethod','refundAmount','refundTwdAmount','refundCard','refundCompletedAt']
      .forEach(key=>{
        if(data[key]!=null) item[key]=data[key];
      });

    return item;
  }

  function refundFields(item){
    const status=normalizeStatus(item?.refundStatus||'');
    return {
      refundStatus:status,
      refundMachine:keepMachine(status) ? machineFromItem(item) : '',
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
    Object.assign(payload,fields);
    return payload;
  }

  function patchQueueForItem(trip,item){
    if(!trip || !item || !window.state) return;
    (state.syncQueue||[]).forEach(q=>{
      if(String(q.tripId)!==String(trip.id)) return;
      if(String(q.recordId)!==String(item.id)) return;
      q.payload=q.payload||{};
      enrichPayload(q.payload,item);
    });
  }

  function patchAllPending(){
    if(!window.state) return;
    (state.syncQueue||[]).forEach(q=>{
      if(!q || q.action==='createTrip') return;
      const trip=(state.trips||[]).find(
        t=>String(t.id)===String(q.tripId)
      );
      if(!trip) return;
      const list=trip[q.recordType]||[];
      const item=list.find(
        x=>String(x.id)===String(q.recordId)
      );
      if(item) patchQueueForItem(trip,item);
    });
    try{persist();}catch(e){}
  }

  try{
    window.taxRefundReadForm=readRefundForm;
    taxRefundReadForm=readRefundForm;
  }catch(e){}
  try{
    window.taxRefundApplyToItem=applyRefundToItem;
    taxRefundApplyToItem=applyRefundToItem;
  }catch(e){}

  if(typeof cloudPayloadForRecord==='function'){
    const basePayload=cloudPayloadForRecord;
    const wrappedPayload=function(action,trip,item){
      return enrichPayload(
        basePayload.apply(this,arguments),
        item
      );
    };
    cloudPayloadForRecord=wrappedPayload;
    window.cloudPayloadForRecord=wrappedPayload;
  }

  if(typeof syncRecord==='function'){
    const baseSyncRecord=syncRecord;
    const wrappedSyncRecord=async function(action,trip,type,item){
      if(type==='expenses' && item){
        const pageAdd=document.getElementById('page-add');
        if(pageAdd?.classList?.contains('active')){
          const snapshot=readRefundForm();
          if(snapshot.status) applyRefundToItem(item,snapshot);
        }else{
          applyRefundToItem(item,{
            status:item.refundStatus,
            machine:machineFromItem(item)
          });
        }
        patchQueueForItem(trip,item);
        try{persist();}catch(e){}
      }
      return baseSyncRecord.apply(this,arguments);
    };
    syncRecord=wrappedSyncRecord;
    window.syncRecord=wrappedSyncRecord;
  }

  if(typeof saveExpense==='function'){
    const baseSaveExpense=saveExpense;
    const wrappedSaveExpense=async function(){
      const trip=currentTrip;
      const snapshot=readRefundForm();
      const beforeIds=new Set(
        (trip?.expenses||[]).map(x=>String(x.id))
      );

      let editId='';
      try{
        editId=String(
          typeof editingExpenseId!=='undefined'
            ? (editingExpenseId||'')
            : ''
        );
      }catch(e){}

      const result=await baseSaveExpense.apply(this,arguments);
      if(!trip) return result;

      let item=null;
      if(editId){
        item=(trip.expenses||[]).find(
          x=>String(x.id)===editId
        )||null;
      }

      if(!item){
        const added=(trip.expenses||[]).filter(
          x=>!beforeIds.has(String(x.id))
        );
        item=added[added.length-1]||null;
      }

      if(item){
        applyRefundToItem(item,snapshot);
        patchQueueForItem(trip,item);
        try{persist();}catch(e){}
      }

      return result;
    };
    saveExpense=wrappedSaveExpense;
    window.saveExpense=wrappedSaveExpense;
  }

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
    const wrappedRetry=async function(){
      patchAllPending();
      return baseRetry.apply(this,arguments);
    };
    retrySingleSync=wrappedRetry;
    window.retrySingleSync=wrappedRetry;
  }

  if(typeof editExpense==='function'){
    const baseEditExpense=editExpense;
    const wrappedEditExpense=function(id){
      const result=baseEditExpense.apply(this,arguments);
      setTimeout(()=>{
        const item=(currentTrip?.expenses||[]).find(
          x=>String(x.id)===String(id)
        );
        if(!item) return;

        const status=normalizeStatus(item.refundStatus||'');
        const machine=machineFromItem(item);

        const group=document.getElementById('taxRefundGroup');
        if(group) group.dataset.status=status;

        const input=document.getElementById('taxRefundMachine');
        if(input && keepMachine(status)) input.value=machine;
      },0);
      return result;
    };
    editExpense=wrappedEditExpense;
    window.editExpense=wrappedEditExpense;
  }

  function cardKey(value){
    return String(value||'')
      .toLowerCase()
      .replace(/\s+/g,'')
      .replace(/[／/._-]/g,'');
  }

  function uniqueCards(){
    const result=[];
    const seen=new Set();

    [
      ...(state?.cards||[]),
      ...((typeof allRecordSource!=='undefined' ? allRecordSource : [])
        .map(x=>x?.card)
        .filter(v=>v && v!=='無'))
    ].forEach(card=>{
      const label=String(card||'').trim();
      const key=cardKey(label);
      if(!label || !key || seen.has(key)) return;
      seen.add(key);
      result.push(label);
    });

    return result;
  }

  function ensureRefundFilterUi(){
    if(document.getElementById('recordFilterRefund')) return;

    const grid=document.querySelector(
      '#recordsFilterCard .records-filter-grid'
    );
    if(!grid) return;

    const group=document.createElement('div');
    group.className='form-group';
    group.innerHTML=`
      <label>退稅狀態</label>
      <select id="recordFilterRefund" onchange="applyRecordFilters()">
        <option value="">全部退稅狀態</option>
        <option value="machine_all">找機台退稅（含已完成）</option>
        <option value="machine_pending">待找機台退稅</option>
        <option value="machine_done">機台退稅完成</option>
        <option value="instant">當下已退稅</option>
        <option value="none">無法退稅</option>
      </select>
    `;
    grid.appendChild(group);
  }

  function refundMatches(item,filter){
    if(!filter) return true;
    const status=normalizeStatus(item?.refundStatus||'');

    if(filter==='machine_all'){
      return status===MACHINE || status===COMPLETED;
    }
    if(filter==='machine_pending') return status===MACHINE;
    if(filter==='machine_done') return status===COMPLETED;
    if(filter==='instant') return status===INSTANT;
    if(filter==='none') return status===NONE;
    return true;
  }

  function recordText(item){
    return [
      item?.name,
      item?.type,
      item?.place,
      item?.category,
      item?.website,
      item?.note,
      item?.person,
      item?.pay,
      item?.card,
      item?.date,
      item?.refundStatus,
      item?.refundMachine
    ].filter(Boolean).join(' ').toLowerCase();
  }

  const setupFiltersV145=function(){
    ensureRefundFilterUi();

    const source=
      typeof allRecordSource!=='undefined'
        ? allRecordSource
        : [];

    const people=[...new Set([
      ...(currentTrip?.people||[]),
      ...source.map(x=>x?.person).filter(Boolean)
    ])];

    const pays=[...new Set(
      source.map(x=>x?.pay).filter(Boolean)
    )];

    const cards=uniqueCards();

    const personEl=document.getElementById('recordFilterPerson');
    const payEl=document.getElementById('recordFilterPay');
    const cardEl=document.getElementById('recordFilterCard');

    if(personEl){
      personEl.innerHTML=
        '<option value="">全部人員</option>'+ 
        people.map(v=>`<option value="${v}">${v}</option>`).join('');
    }
    if(payEl){
      payEl.innerHTML=
        '<option value="">全部付款方式</option>'+ 
        pays.map(v=>`<option value="${v}">${v}</option>`).join('');
    }
    if(cardEl){
      cardEl.innerHTML=
        '<option value="">全部卡別</option>'+ 
        cards.map(v=>`<option value="${v}">${v}</option>`).join('');
    }

    clearFiltersV145(false);
  };

  const applyFiltersV145=function(){
    ensureRefundFilterUi();

    const source=
      typeof allRecordSource!=='undefined'
        ? allRecordSource
        : [];

    const keyword=(
      document.getElementById('recordSearch')?.value||''
    ).trim().toLowerCase();

    const date=
      document.getElementById('recordFilterDate')?.value||'';
    const person=
      document.getElementById('recordFilterPerson')?.value||'';
    const pay=
      document.getElementById('recordFilterPay')?.value||'';
    const card=
      document.getElementById('recordFilterCard')?.value||'';
    const refund=
      document.getElementById('recordFilterRefund')?.value||'';

    const filtered=source.filter(item=>{
      if(keyword && !recordText(item).includes(keyword)) return false;
      if(date && normalizeTripDateValue(item.date)!==date) return false;
      if(person && item.person!==person) return false;
      if(pay && item.pay!==pay) return false;
      if(card && cardKey(item.card)!==cardKey(card)) return false;
      if(!refundMatches(item,refund)) return false;
      return true;
    });

    const box=document.getElementById('allRecords');
    const count=document.getElementById('recordFilterCount');

    if(count) count.textContent=
      `${filtered.length} / ${source.length} 筆`;

    if(box){
      box.innerHTML=filtered.length
        ? filtered.map(recordHtml).join('')
        : '<div class="empty">沒有符合條件的紀錄</div>';
    }
  };

  const clearFiltersV145=function(refresh=true){
    [
      'recordSearch',
      'recordFilterDate',
      'recordFilterPerson',
      'recordFilterPay',
      'recordFilterCard',
      'recordFilterRefund'
    ].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.value='';
    });

    if(refresh) applyFiltersV145();
  };

  try{
    setupRecordFilters=setupFiltersV145;
    window.setupRecordFilters=setupFiltersV145;

    applyRecordFilters=applyFiltersV145;
    window.applyRecordFilters=applyFiltersV145;

    clearRecordFilters=clearFiltersV145;
    window.clearRecordFilters=clearFiltersV145;
  }catch(e){}

  patchAllPending();

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
})();
