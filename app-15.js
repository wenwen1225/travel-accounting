// v67：自由日期改為年月日下拉，並確保右滑刪除會先刪 Google Sheet 再刪本機。
// 不修改 syncRecord、queue、背景同步或重試流程。
const FORMAL_FRONTEND_VERSION_V67='2026.10.03-v67';

function v67ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V67;
}

if(typeof checkBackendVersion==='function'){
  const v67BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v67BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v67ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v67BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v67BaseRenderSettings.apply(this,arguments);
    v67ApplyVersion();
    return result;
  };
}

function v67Pad2(n){ return String(n).padStart(2,'0'); }

function v67DateParts(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return {y:Number(m[1]),m:Number(m[2]),d:Number(m[3])};
  const now=new Date();
  return {y:now.getFullYear(),m:now.getMonth()+1,d:now.getDate()};
}

function v67DaysInMonth(y,m){ return new Date(y,m,0).getDate(); }

function v67SetDateInput(inputId,y,m,d){
  const input=document.getElementById(inputId);
  if(!input) return;
  const max=v67DaysInMonth(y,m);
  d=Math.min(Math.max(1,d),max);
  input.value=`${y}-${v67Pad2(m)}-${v67Pad2(d)}`;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function v67BuildFreeDateSelect(inputId){
  const input=document.getElementById(inputId);
  if(!input) return;

  // 移除舊的快速日期／原生行事曆 UI，只保留真正的 hidden date value 給既有儲存程式讀取。
  const oldQuick=document.getElementById(inputId+'QuickHost');
  if(oldQuick) oldQuick.remove();
  const oldHost=document.getElementById(inputId+'V67Host');
  if(oldHost) oldHost.remove();

  input.classList.remove('v64-free-date');
  input.style.position='absolute';
  input.style.opacity='0';
  input.style.pointerEvents='none';
  input.style.width='1px';
  input.style.height='1px';
  input.style.padding='0';
  input.style.border='0';

  const p=v67DateParts(input.value);
  const nowY=new Date().getFullYear();
  const minY=Math.min(nowY-10,p.y);
  const maxY=Math.max(nowY+3,p.y);

  const host=document.createElement('div');
  host.id=inputId+'V67Host';
  host.className='v67-date-selects';

  const yearOptions=[];
  for(let y=maxY;y>=minY;y--) yearOptions.push(`<option value="${y}"${y===p.y?' selected':''}>${y}年</option>`);
  const monthOptions=[];
  for(let m=1;m<=12;m++) monthOptions.push(`<option value="${m}"${m===p.m?' selected':''}>${m}月</option>`);
  const dayMax=v67DaysInMonth(p.y,p.m);
  const dayOptions=[];
  for(let d=1;d<=dayMax;d++) dayOptions.push(`<option value="${d}"${d===Math.min(p.d,dayMax)?' selected':''}>${d}日</option>`);

  host.innerHTML=`
    <select data-v67-year aria-label="年份">${yearOptions.join('')}</select>
    <select data-v67-month aria-label="月份">${monthOptions.join('')}</select>
    <select data-v67-day aria-label="日期">${dayOptions.join('')}</select>`;

  input.insertAdjacentElement('afterend',host);

  const ySel=host.querySelector('[data-v67-year]');
  const mSel=host.querySelector('[data-v67-month]');
  const dSel=host.querySelector('[data-v67-day]');

  const refreshDays=()=>{
    const y=Number(ySel.value), m=Number(mSel.value), currentD=Number(dSel.value||1);
    const max=v67DaysInMonth(y,m);
    dSel.innerHTML=Array.from({length:max},(_,i)=>{
      const d=i+1;
      return `<option value="${d}"${d===Math.min(currentD,max)?' selected':''}>${d}日</option>`;
    }).join('');
    v67SetDateInput(inputId,y,m,Number(dSel.value));
  };

  ySel.addEventListener('change',refreshDays);
  mSel.addEventListener('change',refreshDays);
  dSel.addEventListener('change',()=>v67SetDateInput(inputId,Number(ySel.value),Number(mSel.value),Number(dSel.value)));

  v67SetDateInput(inputId,p.y,p.m,Math.min(p.d,dayMax));
}

function v67InstallStyles(){
  if(document.getElementById('v67Style')) return;
  const style=document.createElement('style');
  style.id='v67Style';
  style.textContent=`
    .v67-date-selects{display:grid;grid-template-columns:1.25fr .9fr .9fr;gap:8px;width:100%;min-width:0}
    .v67-date-selects select{width:100%;min-width:0;height:48px;border:1px solid #ddd3ef;border-radius:14px;background:#fff;color:#2f2939;padding:0 10px;font-size:16px;font-weight:700;box-sizing:border-box}
    @media(max-width:420px){.v67-date-selects{gap:6px}.v67-date-selects select{padding:0 7px;font-size:15px}}
    .v67-delete-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:10050;background:rgba(35,31,43,.94);color:#fff;padding:11px 16px;border-radius:999px;font-size:13px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.2);max-width:88vw;text-align:center}
  `;
  document.head.appendChild(style);
}

function v67ShowDeleteToast(text){
  let el=document.getElementById('v67DeleteToast');
  if(!el){
    el=document.createElement('div');
    el.id='v67DeleteToast';
    el.className='v67-delete-toast';
    document.body.appendChild(el);
  }
  el.textContent=text;
  el.style.display='block';
  clearTimeout(v67ShowDeleteToast.timer);
  v67ShowDeleteToast.timer=setTimeout(()=>{el.style.display='none';},2200);
}

function v67FindRecord(type,id){
  return (currentTrip?.[type]||[]).find(x=>x.id===id)||null;
}

// v66 的刪除按鈕仍呼叫 v64SwipeDelete；這裡直接覆寫它。
// 規則：只要有雲端設定且旅行已建立 Sheet，就一定先要求後端刪除成功，才刪本機。
v64SwipeDelete=async function(type,id){
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
  const item=v67FindRecord(type,id);
  if(!item) return;

  const queued=(state.syncQueue||[]).some(q=>q.tripId===currentTrip.id && q.recordId===id);
  if(item.syncStatus==='pending' || item.syncStatus==='conflict' || queued){
    alert('這筆目前還在同步／等待重試。請等同步完成後再刪除，避免手機與 Google Sheet 不一致。');
    return;
  }

  const confirmType=type==='expenses'?'expenses':type==='pretrip'?'pretrip':'exchange';
  if(!confirm(deleteRecordConfirmText(confirmType,item))) return;

  const hasCloud=!!getApiUrl() && !!currentTrip.spreadsheetId;
  if(hasCloud){
    const action=type==='expenses'?'deleteExpense':type==='pretrip'?'deletePretrip':'deleteExchange';
    try{
      await postToCloud({
        action,
        spreadsheetId:currentTrip.spreadsheetId,
        clientTripId:currentTrip.id,
        recordId:item.id,
        baseFingerprint:item.cloudFingerprint||''
      });
    }catch(err){
      alert('Google Sheet 刪除失敗，所以這筆手機資料沒有刪除。\n\n'+(err?.message||err));
      return;
    }
  }

  currentTrip[type]=(currentTrip[type]||[]).filter(x=>x.id!==id);
  state.syncQueue=(state.syncQueue||[]).filter(q=>!(q.tripId===currentTrip.id && q.recordId===id));
  persist();

  allRecordSource=[
    ...(currentTrip.expenses||[]),
    ...(currentTrip.pretrip||[]),
    ...(currentTrip.exchange||[])
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  applyRecordFilters();

  v67ShowDeleteToast(hasCloud ? '已刪除：手機與 Google Sheet 都已移除' : '已刪除手機中的這筆紀錄');
};

const v67BaseOpenAdd=window.openAdd;
window.openAdd=function(type){
  const result=v67BaseOpenAdd.apply(this,arguments);
  if(type==='pretrip' || type==='exchange'){
    setTimeout(()=>v67BuildFreeDateSelect(type==='pretrip'?'pretripDate':'exchangeDate'),0);
  }
  return result;
};

if(typeof window.editPretrip==='function'){
  const v67BaseEditPretrip=window.editPretrip;
  window.editPretrip=function(){
    const result=v67BaseEditPretrip.apply(this,arguments);
    setTimeout(()=>v67BuildFreeDateSelect('pretripDate'),0);
    return result;
  };
}

if(typeof window.editExchange==='function'){
  const v67BaseEditExchange=window.editExchange;
  window.editExchange=function(){
    const result=v67BaseEditExchange.apply(this,arguments);
    setTimeout(()=>v67BuildFreeDateSelect('exchangeDate'),0);
    return result;
  };
}

v67InstallStyles();
v67ApplyVersion();
setTimeout(v67ApplyVersion,0);
