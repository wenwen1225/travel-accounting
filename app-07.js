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

  box.classList.remove(
    'hidden',
    'connectivity-offline',
    'connectivity-online',
    'connectivity-synced'
  );

  if(mode==='offline'){
    box.classList.add('connectivity-offline');
    title.textContent='目前離線';
    message.textContent='資料會先安全保存在這台裝置，恢復連線後會自動同步到 Google Sheets。';
    return;
  }

  if(mode==='online'){
    box.classList.add('connectivity-online');
    title.textContent='已恢復連線';
    message.textContent='正在補同步旅途中尚未上傳的資料…';
    return;
  }

  if(mode==='synced'){
    box.classList.add('connectivity-synced');
    title.textContent='已恢復連線';
    message.textContent='目前可以正常同步 Google Sheets。';
    connectivityHideTimer=setTimeout(()=>{
      box.classList.add('hidden');
    },3500);
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

// 啟動時：先補傳本機待同步，再從 Google Sheets 讀回最新資料
setTimeout(()=>syncAndPullCloud({pull:true}), 1200);

window.addEventListener('offline', ()=>{
  renderConnectivityBanner('offline');
  updateHomeSyncStatus();
  updateCloudStatusUI();
});

// 網路恢復時自動補同步＋讀回
window.addEventListener('online', async ()=>{
  renderConnectivityBanner('online');
  updateHomeSyncStatus();
  updateCloudStatusUI();

  try{
    await syncAndPullCloud({pull:true});
  }finally{
    if(typeof navigator==='undefined' || navigator.onLine!==false){
      renderConnectivityBanner('synced');
      updateHomeSyncStatus();
      updateCloudStatusUI();
    }
  }
});

// 從背景切回網站時自動補同步＋讀回
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    setTimeout(async ()=>{
      await checkCloudRevisionAndPull({silent:true,autoPull:false});
      await autoSyncPendingRecords();
    },500);
    setTimeout(()=>{
      if(currentTrip && typeof renderDailyCloseReminder==='function'){
        renderDailyCloseReminder();
      }
    },600);
  }
});

// 每 60 秒只做輕量版本檢查；雲端真的有變才讀完整資料。
setInterval(async ()=>{
  await checkCloudRevisionAndPull({silent:true,autoPull:false});
  await autoSyncPendingRecords();
  if(currentTrip && typeof renderDailyCloseReminder==='function'){
    renderDailyCloseReminder();
  }
},60000);


function scrollToTop(){
  window.scrollTo({top:0,behavior:'smooth'});
}

function updateScrollTopButton(){
  const btn=document.getElementById('scrollTopBtn');
  if(!btn) return;
  btn.classList.toggle('hidden',window.scrollY < 320);
}

window.addEventListener('scroll',updateScrollTopButton,{passive:true});
document.addEventListener('DOMContentLoaded',updateScrollTopButton);


// ===== 旅途中快速輸入補強：旅程日期選單＋現金匯率換算 =====
function expenseTripDateLabel(ymd){
  if(!ymd) return '';
  const parts=ymd.split('-').map(Number);
  if(parts.length!==3) return ymd;
  const d=new Date(parts[0],parts[1]-1,parts[2],12,0,0);
  const week=['日','一','二','三','四','五','六'][d.getDay()];
  return `${String(parts[1]).padStart(2,'0')}/${String(parts[2]).padStart(2,'0')}（${week}）`;
}

function expenseTripDates(){
  if(!currentTrip) return [];
  const start=normalizeTripDateValue(currentTrip.start);
  const end=normalizeTripDateValue(currentTrip.end);
  if(!start || !end) return [];

  const [sy,sm,sd]=start.split('-').map(Number);
  const [ey,em,ed]=end.split('-').map(Number);
  const cursor=new Date(sy,sm-1,sd,12,0,0);
  const last=new Date(ey,em-1,ed,12,0,0);
  const out=[];

  while(cursor<=last && out.length<100){
    const y=cursor.getFullYear();
    const m=String(cursor.getMonth()+1).padStart(2,'0');
    const d=String(cursor.getDate()).padStart(2,'0');
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate()+1);
  }
  return out;
}

function ensureExpenseDateSelect(){
  const old=document.getElementById('expenseDate');
  if(!old || old.tagName==='SELECT') return old;

  const select=document.createElement('select');
  select.id='expenseDate';
  select.name=old.name || 'expenseDate';
  old.replaceWith(select);
  return select;
}

function populateExpenseTripDates(selected=''){
  const el=ensureExpenseDateSelect();
  if(!el || !currentTrip) return;

  const dates=expenseTripDates();
  const today=localTodayYmd();
  const preferred=selected || (dates.includes(today) ? today : (dates[0] || ''));

  el.innerHTML=dates.map(date=>
    `<option value="${date}">${expenseTripDateLabel(date)}</option>`
  ).join('');

  if(preferred && dates.includes(preferred)) el.value=preferred;
}

function ensureCashRateUi(){
  if(document.getElementById('cashRateGroup')) return;

  const twd=document.getElementById('expenseTwd');
  const row=twd?.closest('.row');
  if(!row || !row.parentElement) return;

  const group=document.createElement('div');
  group.id='cashRateGroup';
  group.className='form-group hidden';
  group.innerHTML=`
    <label id="cashRateLabel">換算匯率</label>
    <input id="cashRate" type="number" step="0.0001" inputmode="decimal" placeholder="輸入匯率後自動換算台幣" />
    <div id="cashRateHint" class="tiny" style="margin-top:6px"></div>
  `;
  row.insertAdjacentElement('afterend',group);

  document.getElementById('cashRate')?.addEventListener('input',calculateCashTwd);
  document.getElementById('expenseForeign')?.addEventListener('input',calculateCashTwd);
}

function latestTripExchangeRate(){
  const list=(currentTrip?.exchange || [])
    .filter(x=>Number(x.rate)>0)
    .slice()
    .sort((a,b)=>
      String(b.date||'').localeCompare(String(a.date||'')) ||
      String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))
    );
  return list.length ? Number(list[0].rate) : 0;
}

function configureCashRateUi(show){
  ensureCashRateUi();
  const group=document.getElementById('cashRateGroup');
  const rate=document.getElementById('cashRate');
  const label=document.getElementById('cashRateLabel');
  const hint=document.getElementById('cashRateHint');
  if(!group || !rate || !label || !hint) return;

  group.classList.toggle('hidden',!show);
  if(!show){
    rate.value='';
    hint.textContent='';
    return;
  }

  label.textContent=`換算匯率（1 TWD = ? ${currentTrip.currency}）`;
  rate.placeholder=`例如：1 TWD = ? ${currentTrip.currency}`;

  if(!rate.value){
    const latest=latestTripExchangeRate();
    if(latest>0){
      rate.value=latest;
      hint.textContent='已帶入這趟旅行最近一筆換匯紀錄的匯率，可自行修改。';
    }else{
      hint.textContent='輸入匯率後，會用「外幣 ÷ 匯率」自動算出台幣。';
    }
  }

  calculateCashTwd();
}

function calculateCashTwd(){
  const group=document.getElementById('cashRateGroup');
  if(!group || group.classList.contains('hidden')) return;

  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const rate=Number(document.getElementById('cashRate')?.value || 0);
  const twd=document.getElementById('expenseTwd');
  const hint=document.getElementById('cashRateHint');
  if(!twd || !hint) return;

  if(!(foreign>0) || !(rate>0)){
    if(!(rate>0)) hint.textContent='輸入匯率後，會用「外幣 ÷ 匯率」自動算出台幣。';
    return;
  }

  const result=Math.round(foreign/rate);
  twd.value=Number(result).toLocaleString('en-US');
  hint.textContent=`自動換算：約 NT$${Number(result).toLocaleString('en-US')}（${Number(foreign).toLocaleString('en-US')} ÷ ${rate}）`;
}

// 包裝既有新增流程，不改原本儲存／同步邏輯。
const originalOpenAddForQuickInput=window.openAdd;
window.openAdd=function(type){
  const result=originalOpenAddForQuickInput(type);
  const isExpense=['expense','credit','transit','cash'].includes(type);

  if(isExpense){
    populateExpenseTripDates();
    configureCashRateUi(type==='cash');
  }else{
    configureCashRateUi(false);
  }
  return result;
};

// 編輯既有消費時，也先把該旅行的日期選項建立好。
const originalEditExpenseForQuickInput=window.editExpense;
if(typeof originalEditExpenseForQuickInput==='function'){
  window.editExpense=function(id){
    const item=(currentTrip?.expenses || []).find(x=>x.id===id);
    populateExpenseTripDates(item?.date || '');
    const result=originalEditExpenseForQuickInput(id);
    const isCashLike=item && (item.pay==='現金' || item.pay==='Wowpass' || item.pay==='電子支付');
    configureCashRateUi(!!isCashLike);
    return result;
  };
}

ensureExpenseDateSelect();
ensureCashRateUi();
