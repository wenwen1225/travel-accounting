// v64：換匯日期恢復自由選擇、修正行事曆跑位、全部紀錄支援右滑刪除。
// 不修改 syncRecord、queue、背景同步、重試或 Apps Script。
const FORMAL_FRONTEND_VERSION_V64='2026.10.03-v64';

function v64RestoreFreeDate(inputId){
  const input=document.getElementById(inputId);
  if(!input) return;
  const host=document.getElementById(inputId+'QuickHost');
  if(host) host.remove();
  input.classList.remove('v63-native-date-hidden');
  input.classList.add('v64-free-date');
  const group=input.closest('.form-group');
  if(group) group.classList.add('v64-date-group');
}

function v64FixFreeDateInputs(){
  // 先前費用與換匯都可能發生在出發前，因此保留完整行事曆自由選日期。
  v64RestoreFreeDate('pretripDate');
  v64RestoreFreeDate('exchangeDate');
}

function v64InstallStyles(){
  if(document.getElementById('v64UiStyle')) return;
  const style=document.createElement('style');
  style.id='v64UiStyle';
  style.textContent=`
    .v64-date-group{min-width:0!important;overflow:hidden}
    input[type="date"].v64-free-date{
      width:100%!important;max-width:100%!important;min-width:0!important;
      box-sizing:border-box!important;display:block!important;min-height:46px!important;
      height:46px!important;padding:0 12px!important;font-size:16px!important;
      line-height:46px!important;text-align:left!important;
    }
    input[type="date"].v64-free-date::-webkit-date-and-time-value{text-align:left!important;min-height:1.2em}

    .v64-swipe-shell{position:relative;overflow:hidden;border-radius:14px;margin-bottom:10px;touch-action:pan-y}
    .v64-swipe-action{position:absolute;inset:0 auto 0 0;width:104px;display:flex;align-items:stretch;justify-content:flex-start;background:#e4545e}
    .v64-swipe-delete{width:104px;border:0;background:#e4545e;color:#fff;font-weight:800;font-size:13px;padding:0 12px}
    .v64-swipe-content{position:relative;z-index:2;background:var(--bg,#f8f6fb);transform:translateX(0);transition:transform .18s ease;will-change:transform}
    .v64-swipe-shell.is-open .v64-swipe-content{transform:translateX(104px)}
    .v64-swipe-hint{font-size:12px;color:#8c8296;margin:8px 0 12px;padding:0 2px}
  `;
  document.head.appendChild(style);
}

function v64RecordBucket(item){
  if((currentTrip?.expenses||[]).some(x=>x.id===item.id)) return 'expenses';
  if((currentTrip?.pretrip||[]).some(x=>x.id===item.id)) return 'pretrip';
  if((currentTrip?.exchange||[]).some(x=>x.id===item.id)) return 'exchange';
  return '';
}

function v64SwipeRecordHtml(item){
  const type=v64RecordBucket(item);
  if(!type || isCurrentTripArchived()) return recordHtml(item);
  return `
    <div class="v64-swipe-shell" data-record-type="${type}" data-record-id="${item.id}">
      <div class="v64-swipe-action"><button type="button" class="v64-swipe-delete" onclick="event.stopPropagation();v64SwipeDelete('${type}','${item.id}')">確認刪除</button></div>
      <div class="v64-swipe-content">${recordHtml(item)}</div>
    </div>`;
}

function v64GetFilteredRecords(){
  const keyword=(document.getElementById('recordSearch')?.value||'').trim().toLowerCase();
  const date=document.getElementById('recordFilterDate')?.value||'';
  const person=document.getElementById('recordFilterPerson')?.value||'';
  const pay=document.getElementById('recordFilterPay')?.value||'';
  const card=document.getElementById('recordFilterCard')?.value||'';
  return allRecordSource.filter(item=>{
    if(keyword && !recordSearchText(item).includes(keyword)) return false;
    if(date && normalizeTripDateValue(item.date)!==date) return false;
    if(person && item.person!==person) return false;
    if(pay && item.pay!==pay) return false;
    if(card && item.card!==card) return false;
    return true;
  });
}

const v64BaseApplyRecordFilters=applyRecordFilters;
applyRecordFilters=function(){
  const box=document.getElementById('allRecords');
  if(!box) return v64BaseApplyRecordFilters();
  const filtered=v64GetFilteredRecords();
  const count=document.getElementById('recordFilterCount');
  if(count) count.textContent=`${filtered.length} / ${allRecordSource.length} 筆`;
  box.innerHTML=filtered.length
    ? filtered.map(v64SwipeRecordHtml).join('')
    : `<div class="empty">沒有符合條件的紀錄</div>`;
  v64BindSwipeRows();
};

function v64BindSwipeRows(){
  document.querySelectorAll('#allRecords .v64-swipe-shell').forEach(shell=>{
    if(shell.dataset.swipeBound==='1') return;
    shell.dataset.swipeBound='1';
    const content=shell.querySelector('.v64-swipe-content');
    let startX=0,startY=0,dx=0,tracking=false,moved=false;

    shell.addEventListener('touchstart',e=>{
      const t=e.touches[0];
      if(!t) return;
      startX=t.clientX; startY=t.clientY; dx=0; tracking=true; moved=false;
    },{passive:true});

    shell.addEventListener('touchmove',e=>{
      if(!tracking) return;
      const t=e.touches[0];
      if(!t) return;
      const dy=t.clientY-startY;
      dx=t.clientX-startX;
      if(Math.abs(dy)>Math.abs(dx) && Math.abs(dy)>8){ tracking=false; return; }
      if(dx>8){
        moved=true;
        const x=Math.min(104,Math.max(0,dx));
        content.style.transition='none';
        content.style.transform=`translateX(${x}px)`;
        if(e.cancelable) e.preventDefault();
      }
    },{passive:false});

    shell.addEventListener('touchend',()=>{
      if(!tracking && !moved) return;
      content.style.transition='';
      content.style.transform='';
      if(dx>=58){
        document.querySelectorAll('#allRecords .v64-swipe-shell.is-open').forEach(x=>{ if(x!==shell) x.classList.remove('is-open'); });
        shell.classList.add('is-open');
      }else{
        shell.classList.remove('is-open');
      }
      tracking=false;
    },{passive:true});

    shell.addEventListener('click',e=>{
      if(!shell.classList.contains('is-open')) return;
      if(e.target.closest('.v64-swipe-delete')) return;
      e.preventDefault();
      e.stopPropagation();
      shell.classList.remove('is-open');
    },true);
  });
}

function v64FindRecord(type,id){
  return (currentTrip?.[type]||[]).find(x=>x.id===id) || null;
}

async function v64SwipeDelete(type,id){
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
  const item=v64FindRecord(type,id);
  if(!item) return;

  const queued=(state.syncQueue||[]).some(q=>q.tripId===currentTrip.id && q.recordId===id);
  if(item.syncStatus==='pending' || item.syncStatus==='conflict' || queued){
    alert('這筆目前還在同步／等待重試。為避免手機與 Google Sheet 不一致，請等它顯示「已同步」後再刪除。');
    return;
  }

  const confirmType=type==='expenses'?'expenses':type==='pretrip'?'pretrip':'exchange';
  if(!confirm(deleteRecordConfirmText(confirmType,item))) return;

  if(getApiUrl() && item.syncStatus==='synced'){
    const action=type==='expenses'?'deleteExpense':type==='pretrip'?'deletePretrip':'deleteExchange';
    try{
      await postToCloud({
        action,
        spreadsheetId:currentTrip.spreadsheetId||'',
        clientTripId:currentTrip.id,
        recordId:item.id,
        baseFingerprint:item.cloudFingerprint||''
      });
    }catch(err){
      alert('Google Sheets 刪除失敗，所以手機中的這筆先保留。\n'+(err?.message||err));
      return;
    }
  }

  currentTrip[type]=(currentTrip[type]||[]).filter(x=>x.id!==id);
  state.syncQueue=(state.syncQueue||[]).filter(q=>!(q.tripId===currentTrip.id && q.recordId===id));
  persist();
  allRecordSource=[...(currentTrip.expenses||[]),...(currentTrip.pretrip||[]),...(currentTrip.exchange||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  applyRecordFilters();
}

const v64BaseOpenRecords=window.openRecords;
window.openRecords=function(){
  const result=v64BaseOpenRecords();
  const sub=document.getElementById('recordsSubtitle');
  if(sub) sub.textContent=currentTrip.name+' · 點一下修改｜往右滑可刪除';
  setTimeout(v64BindSwipeRows,0);
  return result;
};

const v64BaseOpenAdd=window.openAdd;
window.openAdd=function(type){
  const result=v64BaseOpenAdd(type);
  setTimeout(()=>{
    if(type==='exchange') v64RestoreFreeDate('exchangeDate');
    if(type==='pretrip') v64RestoreFreeDate('pretripDate');
    v64FixFreeDateInputs();
  },0);
  return result;
};

if(typeof window.editExchange==='function'){
  const v64BaseEditExchange=window.editExchange;
  window.editExchange=function(id){
    const result=v64BaseEditExchange(id);
    setTimeout(()=>v64RestoreFreeDate('exchangeDate'),0);
    return result;
  };
}

if(typeof window.editPretrip==='function'){
  const v64BaseEditPretrip=window.editPretrip;
  window.editPretrip=function(id){
    const result=v64BaseEditPretrip(id);
    setTimeout(()=>v64RestoreFreeDate('pretripDate'),0);
    return result;
  };
}

function v64ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V64;
}

if(typeof renderSettings==='function'){
  const v64BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v64BaseRenderSettings.apply(this,arguments);
    v64ApplyVersion();
    return result;
  };
}

v64InstallStyles();
v64FixFreeDateInputs();
v64ApplyVersion();
setTimeout(v64ApplyVersion,0);
