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

setTimeout(()=>syncAndPullCloud({pull:true}), 1200);

window.addEventListener('offline', ()=>{
  renderConnectivityBanner('offline');
  updateHomeSyncStatus();
  updateCloudStatusUI();
});

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

function formatRateValue(value){
  const n=Number(value);
  if(!Number.isFinite(n) || n<=0) return '';
  return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
}

function impliedRateFromAmounts(foreign,twd,mode=defaultCashRateMode()){
  const f=Number(foreign);
  const t=Number(twd);
  if(!(f>0) || !(t>0)) return 0;
  return mode===CASH_RATE_MODE_FOREIGN_TO_TWD ? t/f : f/t;
}

function impliedRateText(foreign,twd,mode=defaultCashRateMode()){
  const rate=impliedRateFromAmounts(foreign,twd,mode);
  if(!(rate>0) || !currentTrip) return '';
  const code=currentTrip.currency;
  return mode===CASH_RATE_MODE_FOREIGN_TO_TWD
    ? `推算匯率：1 ${code} ≈ NT$${formatRateValue(rate)}`
    : `推算匯率：NT$1 ≈ ${formatRateValue(rate)} ${code}`;
}

function ensureRequiredCategoryLabel(){
  const select=document.getElementById('expenseCategory');
  const label=select?.closest('.form-group')?.querySelector('label');
  if(!label) return;
  if(!label.querySelector('.danger')){
    label.innerHTML='分類標籤 <span class="danger">*</span>';
  }
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
      <label id="cashRateLabel">換算匯率 <span class="tiny">（可之後補）</span></label>
      <div class="cash-rate-mode">
        <button id="cashRateDirectBtn" type="button" onclick="setCashRateMode('${CASH_RATE_MODE_FOREIGN_TO_TWD}')"></button>
        <button id="cashRateInverseBtn" type="button" onclick="setCashRateMode('${CASH_RATE_MODE_TWD_TO_FOREIGN}')"></button>
      </div>
      <input id="cashRate" type="text" inputmode="decimal" placeholder="可留空；之後填台幣也能反推" />
      <div id="cashRateHint" class="tiny cash-rate-hint"></div>
    `;
    moneyRow.insertBefore(group,twdGroup);

    document.getElementById('cashRate')?.addEventListener('input',()=>{
      rememberCashRateSetting();
      calculateCashTwd();
    });

    foreign.addEventListener('input',()=>{
      if(selectedPay==='現金'){
        const rate=Number(rawNumber(document.getElementById('cashRate')?.value || ''));
        if(rate>0) calculateCashTwd();
        else deriveCashRateFromTwd();
      }else{
        updateCreditImpliedRate();
      }
    });
  }

  if(!twd.dataset.rateReverseBound){
    twd.dataset.rateReverseBound='1';
    twd.addEventListener('input',()=>{
      if(selectedPay==='現金') deriveCashRateFromTwd();
      else updateCreditImpliedRate();
    });
  }

  if(!document.getElementById('cashRateResultHint')){
    const hint=document.createElement('div');
    hint.id='cashRateResultHint';
    hint.className='tiny cash-rate-result-hint hidden';
    hint.textContent='匯率可留空；之後補台幣時也會自動反推匯率';
    twdGroup.appendChild(hint);
  }

  if(!document.getElementById('expenseImpliedRateHint')){
    const hint=document.createElement('div');
    hint.id='expenseImpliedRateHint';
    hint.className='tiny expense-implied-rate-hint hidden';
    twdGroup.appendChild(hint);
  }

  if(!document.getElementById('expenseQuickUiStyle')){
    const style=document.createElement('style');
    style.id='expenseQuickUiStyle';
    style.textContent=`
      .expense-money-stack{display:flex;flex-direction:column;gap:0}
      .cash-rate-mode{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}
      .cash-rate-mode button{border:1px solid #ded4ef;background:#fff;color:#746783;border-radius:11px;padding:9px 6px;font-size:11px;font-weight:700;line-height:1.25}
      .cash-rate-mode button.active{background:#efe8ff;border-color:#a98df1;color:#6f52c8}
      .cash-rate-hint,.cash-rate-result-hint,.expense-implied-rate-hint{margin-top:6px;line-height:1.45}
      .expense-implied-rate-hint{color:#6f52c8;font-weight:700}
      .cash-auto-result{background:#f7f2ff;border:1px solid #e4d8fb;border-radius:14px;padding:12px;margin-top:3px}
      .cash-auto-result label{color:#694fba}
      .cash-auto-result .money-wrap{background:#fff;border-color:#cdbdf5}
      #expenseDate{width:100%}
    `;
    document.head.appendChild(style);
  }
}

function rememberCashRateSetting(){
  if(!currentTrip || selectedPay!=='現金') return;
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value || ''));
  if(rate>0) currentTrip.cashRate=rate;
  currentTrip.cashRateMode=activeCashRateMode();
  persist();
}

function setCashRateMode(mode){
  if(!currentTrip || selectedPay!=='現金') return;
  currentTrip.cashRateMode=mode;
  persist();
  refreshCashRateModeUi();

  const rate=document.getElementById('cashRate');
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value || ''));
  if(foreign>0 && twd>0 && rate){
    rate.value=formatRateValue(impliedRateFromAmounts(foreign,twd,mode));
    rememberCashRateSetting();
    updateCashResultHint(foreign,twd);
  }else{
    calculateCashTwd();
  }
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
      ? `可留空；${code} × 匯率 = TWD`
      : `可留空；${code} ÷ 匯率 = TWD`;
  }
}

function updateCashResultHint(foreign,twd){
  const hint=document.getElementById('cashRateResultHint');
  if(!hint) return;
  const text=impliedRateText(foreign,twd,activeCashRateMode());
  hint.textContent=text || '匯率可留空；之後補台幣時也會自動反推匯率';
}

function deriveCashRateFromTwd(){
  if(selectedPay!=='現金') return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value || ''));
  const rate=document.getElementById('cashRate');
  if(!rate) return;

  if(!(foreign>0) || !(twd>0)){
    updateCashResultHint(0,0);
    return;
  }

  const implied=impliedRateFromAmounts(foreign,twd,activeCashRateMode());
  rate.value=formatRateValue(implied);
  rememberCashRateSetting();
  updateCashResultHint(foreign,twd);
}

function updateCreditImpliedRate(){
  const hint=document.getElementById('expenseImpliedRateHint');
  if(!hint) return;

  const rateVisiblePay = selectedPay==='信用卡' || selectedPay==='交通卡';
  if(!rateVisiblePay){
    hint.classList.add('hidden');
    hint.textContent='';
    return;
  }

  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value || ''));
  if(!(foreign>0) || !(twd>0)){
    hint.classList.add('hidden');
    hint.textContent='';
    return;
  }

  hint.textContent=impliedRateText(foreign,twd,defaultCashRateMode());
  hint.classList.remove('hidden');
}

function configureCashRateUi(show){
  ensureCashRateUi();
  const group=document.getElementById('cashRateGroup');
  const rate=document.getElementById('cashRate');
  const twdGroup=document.getElementById('expenseTwd')?.closest('.form-group');
  const twdLabel=twdGroup?.querySelector('label');
  const resultHint=document.getElementById('cashRateResultHint');
  if(!group || !rate) return;

  const cashOnly=!!show && selectedPay==='現金';
  group.classList.toggle('hidden',!cashOnly);
  twdGroup?.classList.toggle('cash-auto-result',cashOnly);
  if(resultHint) resultHint.classList.toggle('hidden',!cashOnly);

  if(twdLabel){
    twdLabel.innerHTML='台幣金額 TWD <span class="tiny">（可之後補）</span>';
  }

  if(!cashOnly){
    if(resultHint) resultHint.textContent='';
    updateCreditImpliedRate();
    return;
  }

  const creditHint=document.getElementById('expenseImpliedRateHint');
  if(creditHint){
    creditHint.classList.add('hidden');
    creditHint.textContent='';
  }

  refreshCashRateModeUi();
  if(!rate.value && currentTrip?.cashRate){
    rate.value=String(currentTrip.cashRate);
  }

  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value || ''));
  if(foreign>0 && twd>0){
    deriveCashRateFromTwd();
  }else if(resultHint){
    resultHint.textContent='匯率可留空；之後補台幣時也會自動反推匯率';
  }
}

function calculateCashTwd(){
  const group=document.getElementById('cashRateGroup');
  if(!group || group.classList.contains('hidden') || selectedPay!=='現金') return;

  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value || ''));
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value || ''));
  const twd=document.getElementById('expenseTwd');
  if(!twd) return;

  if(!(foreign>0) || !(rate>0)){
    updateCashResultHint(0,0);
    return;
  }

  const mode=activeCashRateMode();
  const result=mode===CASH_RATE_MODE_FOREIGN_TO_TWD
    ? foreign*rate
    : foreign/rate;
  const rounded=Math.round(result);
  twd.value=Number(rounded).toLocaleString('en-US');
  updateCashResultHint(foreign,rounded);
  rememberCashRateSetting();
}

const originalSelectPayForQuickInput=window.selectPay;
if(typeof originalSelectPayForQuickInput==='function'){
  window.selectPay=function(pay){
    const result=originalSelectPayForQuickInput(pay);
    configureCashRateUi(pay==='現金');
    updateCreditImpliedRate();
    return result;
  };
}

const originalOpenAddForQuickInput=window.openAdd;
window.openAdd=function(type){
  const result=originalOpenAddForQuickInput(type);
  const isExpense=['expense','credit','transit','cash'].includes(type);

  if(isExpense){
    ensureRequiredCategoryLabel();
    populateExpenseTripDates();
    const rate=document.getElementById('cashRate');
    if(rate) rate.value=currentTrip?.cashRate ? String(currentTrip.cashRate) : '';
    configureCashRateUi(selectedPay==='現金');
    updateCreditImpliedRate();
  }else{
    configureCashRateUi(false);
  }
  return result;
};

const originalEditExpenseForQuickInput=window.editExpense;
if(typeof originalEditExpenseForQuickInput==='function'){
  window.editExpense=function(id){
    const item=(currentTrip?.expenses || []).find(x=>x.id===id);
    populateExpenseTripDates(item?.date || '');
    const result=originalEditExpenseForQuickInput(id);
    ensureRequiredCategoryLabel();
    populateExpenseTripDates(item?.date || '');

    const rate=document.getElementById('cashRate');
    if(rate) rate.value='';
    configureCashRateUi(item?.pay==='現金');

    if(item?.pay==='現金'){
      deriveCashRateFromTwd();
    }else{
      updateCreditImpliedRate();
    }
    return result;
  };
}

ensureExpenseDateSelect();
ensureCashRateUi();
ensureRequiredCategoryLabel();
configureCashRateUi(false);
