// v62：表單穩定性修正。只處理表單／匯率／幣別／編輯保護，不碰任何同步流程。
const FORMAL_FRONTEND_VERSION_V62='2026.10.03-v62';

function v62LocalTodayYmd(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function v62TripSafeDate(){
  if(!currentTrip) return v62LocalTodayYmd();
  const today=v62LocalTodayYmd();
  const start=normalizeTripDateValue(currentTrip.start)||today;
  const end=normalizeTripDateValue(currentTrip.end)||today;
  if(today<start) return start;
  if(today>end) return end;
  return today;
}

function v62SetValue(id,value){
  const el=document.getElementById(id);
  if(el) el.value=value;
}

function v62RefreshCurrencyUi(){
  if(!currentTrip) return;
  const code=currentTrip.currency||'KRW';
  const symbol=currencySymbol(code);
  const foreignLabel=document.getElementById('foreignLabel');
  const foreignSymbol=document.getElementById('foreignSymbol');
  const preLabel=document.getElementById('pretripForeignLabel');
  const preSymbol=document.getElementById('pretripForeignSymbol');
  const exchangeLabel=document.getElementById('exchangeForeignLabel');
  const exchangeSymbol=document.getElementById('exchangeForeignSymbol');
  if(foreignLabel) foreignLabel.innerHTML=`外幣金額 ${code} <span class="danger">*</span>`;
  if(foreignSymbol) foreignSymbol.textContent=symbol;
  if(preLabel) preLabel.textContent=`外幣金額 ${code}`;
  if(preSymbol) preSymbol.textContent=symbol;
  if(exchangeLabel) exchangeLabel.textContent=`${code} 外幣`;
  if(exchangeSymbol) exchangeSymbol.textContent=symbol;

  const direct=document.getElementById('cashRateDirectBtn');
  const inverse=document.getElementById('cashRateInverseBtn');
  if(direct) direct.textContent=`1 ${code} = ? TWD`;
  if(inverse) inverse.textContent=`1 TWD = ? ${code}`;
}

function v62NormalizePaymentUi(pay){
  if(!currentTrip) return;
  selectedPay=pay;
  const personGroup=document.getElementById('expensePersonGroup');
  const card=document.getElementById('cardType');
  const cardGroup=card?.closest('.form-group');
  const sharedPay=typeof sharedPaymentMethodForCurrency==='function'
    ? sharedPaymentMethodForCurrency(currentTrip.currency)
    : '現金';
  const shared=(pay==='現金' || pay===sharedPay || pay==='Wowpass' || pay==='電子支付');

  if(personGroup) personGroup.classList.toggle('hidden',shared);
  if(cardGroup) cardGroup.classList.toggle('hidden',pay!=='信用卡');
  if(card) card.disabled=pay!=='信用卡';

  if(shared){
    selectedPerson='共同';
  }else{
    const people=currentTrip.people||[];
    if(!people.includes(selectedPerson)) selectedPerson=people[0]||'Wen';
  }

  document.querySelectorAll('#personSeg button').forEach(btn=>{
    const active=!shared && btn.dataset.person===selectedPerson;
    btn.classList.toggle('active',active);
  });

  if(typeof v61RefreshRateDisplay==='function') v61RefreshRateDisplay();
}

function v62ResetNewExpenseForm(type){
  if(editingExpenseId) return;
  v62SetValue('expenseDate',v62TripSafeDate());
  v62SetValue('expenseQty','1');
  v62SetValue('expenseName','');
  v62SetValue('expenseForeign','');
  v62SetValue('expenseTwd','');
  v62SetValue('expensePlace','');
  v62SetValue('expenseNote','');
  if(typeof setExpenseCategoryValue==='function') setExpenseCategoryValue('');
  const custom=document.getElementById('expenseCategoryCustom');
  if(custom) custom.value='';
  const rate=document.getElementById('cashRate');
  if(rate) rate.value='';

  const pay=type==='transit'?'交通卡':type==='cash'?'現金':'信用卡';
  if(pay!=='現金') selectedPerson=(currentTrip.people||[])[0]||'Wen';
  v62NormalizePaymentUi(pay);
  v62RefreshCurrencyUi();
  if(typeof v61RefreshRateDisplay==='function') v61RefreshRateDisplay();
}

function v62ResetNewPretripForm(){
  if(editingPretripId) return;
  v62SetValue('pretripDate',v62TripSafeDate());
  v62SetValue('pretripName','');
  v62SetValue('pretripWebsite','');
  v62SetValue('pretripTwd','');
  v62SetValue('pretripForeign','');
  v62SetValue('pretripNote','');
  v62SetValue('pretripPay','信用卡');
  selectedPretripPerson=(currentTrip.people||[])[0]||'Wen';
  v62SetValue('pretripPerson',selectedPretripPerson);
  v62SetValue('pretripCard','');
  if(typeof updatePretripCardVisibility==='function') updatePretripCardVisibility();
  v62RefreshCurrencyUi();
}

function v62ResetNewExchangeForm(){
  if(editingExchangeId) return;
  v62SetValue('exchangeDate',v62TripSafeDate());
  v62SetValue('exchangeTwd','');
  v62SetValue('exchangeForeign','');
  v62SetValue('exchangeRate','');
  v62SetValue('exchangePlace','');
  v62SetValue('exchangeNote','');
  v62RefreshCurrencyUi();
}

// 固定匯率公式：
// 1 外幣 = ? TWD  -> 外幣 × 匯率 = TWD
// 1 TWD = ? 外幣  -> 外幣 ÷ 匯率 = TWD
v61CalculateTwdFromRate=function(){
  if(!['信用卡','交通卡','現金'].includes(selectedPay)) return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const rate=Number(rawNumber(document.getElementById('cashRate')?.value||''));
  const twd=document.getElementById('expenseTwd');
  if(!twd || !(foreign>0) || !(rate>0)) return;
  const value=rateModeCurrent()===RATE_MODE_FOREIGN_TO_TWD ? foreign*rate : foreign/rate;
  twd.value=formatNumberString(String(Math.round(value)));
  if(typeof v61RefreshRateDisplay==='function') v61RefreshRateDisplay();
};

v61DeriveRateFromAmounts=function(){
  if(!['信用卡','交通卡','現金'].includes(selectedPay)) return;
  const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
  const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
  const input=document.getElementById('cashRate');
  if(!input || !(foreign>0) || !(twd>0)) return;
  input.value=rateFmt(impliedRate(foreign,twd,rateModeCurrent()));
  if(typeof v61RefreshRateDisplay==='function') v61RefreshRateDisplay();
};

const v62BaseOpenAdd=window.openAdd;
window.openAdd=function(type){
  const result=v62BaseOpenAdd(type);
  setTimeout(()=>{
    v62RefreshCurrencyUi();
    if(['expense','credit','transit','cash'].includes(type)) v62ResetNewExpenseForm(type);
    if(type==='pretrip') v62ResetNewPretripForm();
    if(type==='exchange') v62ResetNewExchangeForm();
  },0);
  return result;
};

if(typeof window.selectPay==='function'){
  const v62BaseSelectPay=window.selectPay;
  window.selectPay=function(pay){
    const result=v62BaseSelectPay(pay);
    setTimeout(()=>v62NormalizePaymentUi(pay),0);
    return result;
  };
}

if(typeof window.editExpense==='function'){
  const v62BaseEditExpense=window.editExpense;
  window.editExpense=function(id){
    editingExpenseId=id;
    const result=v62BaseEditExpense(id);
    setTimeout(()=>{
      editingExpenseId=id;
      v62RefreshCurrencyUi();
      v62NormalizePaymentUi(selectedPay);
    },0);
    return result;
  };
}

// 後補台幣時一定要更新原 ID；如果編輯 ID 已不存在，直接停止，避免誤新增第二筆。
if(typeof window.saveExpense==='function'){
  const v62BaseSaveExpense=window.saveExpense;
  window.saveExpense=async function(){
    if(editingExpenseId){
      const exists=(currentTrip?.expenses||[]).some(x=>x.id===editingExpenseId);
      if(!exists){
        alert('找不到原本這筆紀錄，為避免重複新增，這次先不儲存。請返回紀錄列表後重新開啟。');
        return false;
      }
    }
    return v62BaseSaveExpense.apply(this,arguments);
  };
}

if(typeof window.openTrip==='function'){
  const v62BaseOpenTrip=window.openTrip;
  window.openTrip=function(id){
    const result=v62BaseOpenTrip(id);
    setTimeout(v62RefreshCurrencyUi,0);
    return result;
  };
}

function applyV62VersionLabel(){
  const webEl=document.getElementById('webVersionText');
  if(webEl) webEl.textContent=FORMAL_FRONTEND_VERSION_V62;
}

if(typeof renderSettings==='function'){
  const v62BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v62BaseRenderSettings.apply(this,arguments);
    applyV62VersionLabel();
    return result;
  };
}

applyV62VersionLabel();
setTimeout(()=>{
  applyV62VersionLabel();
  v62RefreshCurrencyUi();
},0);
