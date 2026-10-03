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
const CASH_RATE_MODE_FOREIGN_TO_TWD='foreignToTwd';
const CASH_RATE_MODE_TWD_TO_FOREIGN='twdToForeign';

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

  while(cursor<=last && out.length<370){
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
  select.setAttribute('aria-label','消費日期');
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

function defaultCashRateMode(){
  return currentTrip?.currency==='KRW'
    ? CASH_RATE_MODE_TWD_TO_FOREIGN
    : CASH_RATE_MODE_FOREIGN_TO_TWD;
}

function activeCashRateMode(){
  return currentTrip?.cashRateMode || defaultCashRateMode();
}

function ensureCashRateUi(){
  const twd=document.getElementById('expenseTwd');
  const foreign=document.getElementById('expenseForeign');
  const twdGroup=twd?.closest('.form-group');
  const foreignGroup=foreign?.closest('.form-group');
  const moneyRow=twdGroup?.parentElement;
  if(!twd || !foreign || !twdGroup || !foreignGroup || !moneyRow) return;

  if(!moneyRow.classList.contains('expense-money-stack')){
    moneyRow.classList.remove('row');
    moneyRow.classList.add('expense-money-stack');
  }

  let group=document.getElementById('cashRateGroup');
  if(!group){
    group=document.createElement('div');
    group.id='cashRateGroup';
    group.className='form-group hidden cash-rate-group';
    group.innerHTML=`
      <label id="cashRateLabel">換算匯率</label>
      <div class="cash-rate-mode">
        <button id="cashRateDirectBtn" type="button" onclick="setCashRateMode('${CASH_RATE_MODE_FOREIGN_TO_TWD}')"></button>
        <button id="cashRateInverseBtn" type="button" onclick="setCashRateMode('${CASH_RATE_MODE_TWD_TO_FOREIGN}')"></button>
      </div>
      <input id="cashRate" type="text" inputmode="decimal" placeholder="輸入匯率" />
      <div id="cashRateHint" class="tiny cash-rate-hint"></div>
    `;
    moneyRow.insertBefore(group,twdGroup);

    document.getElementById('cashRate')?.addEventListener('input',()=>{
      rememberCashRateSetting();
      calculateCashTwd();
    });
    foreign.addEventListener('input',calculateCashTwd);
  }

  if(!document.getElementById('cashRateResultHint')){
    const hint=document.createElement('div');
    hint.id='cashRateResultHint';
    hint.className='tiny cash-rate-result-hint';
    hint.textContent='輸入外幣與匯率後會自動算出台幣';
    twdGroup.appendChild(hint);
  }

  const twdLabel=twdGroup.querySelector('label');
  if(twdLabel){
    twdLabel.innerHTML='台幣金額 TWD <span class="tiny">（自動換算，可修改）</span>';
  }

  if(!document.getElementById('expenseQuickUiStyle')){
    const style=document.createElement('style');
    style.id='expenseQuickUiStyle';
    style.textContent=`
      .expense-money-stack{display:flex;flex-direction:column;gap:0}
      .cash-rate-mode{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}
      .cash-rate-mode button{border:1px solid #ded4ef;background:#fff;color:#746783;border-radius:11px;padding:9px 6px;font-size:11px;font-weight:700;line-height:1.25}
      .cash-rate-mode button.active{background:#efe8ff;border-color:#a98df1;color:#6f52c8}
      .cash-rate-hint,.cash-rate-result-hint{margin-top:6px;line-height:1.45}
      .cash-auto-result{background:#f7f2ff;border:1px solid #e4d8fb;border-radius:14px;padding:12px;margin-top:3px}
      .cash-auto-result label{color:#694fba}
      .cash-auto-result .money-wrap{background:#fff;border-color:#cdbdf5}
      #expenseDate{width:100%}
    `;
    document.head.appendChild(style);
  }
}

function rememberCashRateSetting(){
  if(!currentTrip) return;
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value || ''));
  if(rate>0) currentTrip.cashRate=rate;
  currentTrip.cashRateMode=activeCashRateMode();
  persist();
}

function setCashRateMode(mode){
  if(!currentTrip) return;
  currentTrip.cashRateMode=mode;
  persist();
  refreshCashRateModeUi();
  calculateCashTwd();
}

function refreshCashRateModeUi(){
  if(!currentTrip) return;
  const mode=activeCashRateMode();
  const code=currentTrip.currency;
  const direct=document.getElementById('cashRateDirectBtn');
  const inverse=document.getElementById('cashRateInverseBtn');
  const hint=document.getElementById('cashRateHint');

  if(direct){
    direct.textContent=`1 ${code} = ? TWD`;
    direct.classList.toggle('active',mode===CASH_RATE_MODE_FOREIGN_TO_TWD);
  }
  if(inverse){
    inverse.textContent=`1 TWD = ? ${code}`;
    inverse.classList.toggle('active',mode===CASH_RATE_MODE_TWD_TO_FOREIGN);
  }
  if(hint){
    hint.textContent=mode===CASH_RATE_MODE_FOREIGN_TO_TWD
      ? `計算方式：${code} 金額 × 匯率 = TWD`
      : `計算方式：${code} 金額 ÷ 匯率 = TWD`;
  }
}

function configureCashRateUi(show){
  ensureCashRateUi();
  const group=document.getElementById('cashRateGroup');
  const rate=document.getElementById('cashRate');
  const twdGroup=document.getElementById('expenseTwd')?.closest('.form-group');
  const resultHint=document.getElementById('cashRateResultHint');
  if(!group || !rate) return;

  group.classList.toggle('hidden',!show);
  twdGroup?.classList.toggle('cash-auto-result',show);
  if(resultHint) resultHint.classList.toggle('hidden',!show);

  if(!show) return;

  refreshCashRateModeUi();
  if(!rate.value && currentTrip?.cashRate){
    rate.value=String(currentTrip.cashRate);
  }
  if(resultHint && !document.getElementById('expenseTwd')?.value){
    resultHint.textContent='輸入外幣與匯率後會自動算出台幣';
  }
  calculateCashTwd();
}

function calculateCashTwd(){
  const group=document.getElementById('cashRateGroup');
  if(!group || group.classList.contains('hidden') || selectedPay!=='現金') return;

  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value || ''));
  const twd=document.getElementById('expenseTwd');
  const hint=document.getElementById('cashRateResultHint');
  if(!twd || !hint) return;

  if(!(foreign>0) || !(rate>0)){
    hint.textContent='輸入外幣與匯率後會自動算出台幣';
    return;
  }

  const mode=activeCashRateMode();
  const result=mode===CASH_RATE_MODE_FOREIGN_TO_TWD
    ? foreign*rate
    : foreign/rate;
  const rounded=Math.round(result);
  twd.value=Number(rounded).toLocaleString('en-US');

  const operator=mode===CASH_RATE_MODE_FOREIGN_TO_TWD ? '×' : '÷';
  hint.textContent=`自動換算：約 NT$${Number(rounded).toLocaleString('en-US')}（${Number(foreign).toLocaleString('en-US')} ${operator} ${rate}）`;
  rememberCashRateSetting();
}

// 包裝既有新增流程，不改原本儲存／同步資料格式。
const originalSelectPayForQuickInput=window.selectPay;
if(typeof originalSelectPayForQuickInput==='function'){
  window.selectPay=function(pay){
    const result=originalSelectPayForQuickInput(pay);
    configureCashRateUi(pay==='現金');
    return result;
  };
}

const originalOpenAddForQuickInput=window.openAdd;
window.openAdd=function(type){
  const result=originalOpenAddForQuickInput(type);
  const isExpense=['expense','credit','transit','cash'].includes(type);

  if(isExpense){
    populateExpenseTripDates();
    const rate=document.getElementById('cashRate');
    if(rate) rate.value=currentTrip?.cashRate ? String(currentTrip.cashRate) : '';
    configureCashRateUi(type==='cash');
  }else{
    configureCashRateUi(false);
  }
  return result;
};

// 編輯既有消費時，也先建立旅程日期選項；匯率沿用這趟旅行最近使用的設定。
const originalEditExpenseForQuickInput=window.editExpense;
if(typeof originalEditExpenseForQuickInput==='function'){
  window.editExpense=function(id){
    const item=(currentTrip?.expenses || []).find(x=>x.id===id);
    populateExpenseTripDates(item?.date || '');
    const result=originalEditExpenseForQuickInput(id);
    populateExpenseTripDates(item?.date || '');
    const rate=document.getElementById('cashRate');
    if(rate) rate.value=currentTrip?.cashRate ? String(currentTrip.cashRate) : '';
    configureCashRateUi(item?.pay==='現金');
    return result;
  };
}

ensureExpenseDateSelect();
ensureCashRateUi();
