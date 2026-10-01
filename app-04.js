function openAdd(type){
  if(!currentTrip) return;
  const today = new Date().toISOString().slice(0,10);
  const isExpense = type==='expense' || type==='credit' || type==='cash';
  document.getElementById('expenseForm').classList.toggle('hidden',!isExpense);
  document.getElementById('pretripForm').classList.toggle('hidden',type!=='pretrip');
  document.getElementById('exchangeForm').classList.toggle('hidden',type!=='exchange');
  fillCards();

  if(isExpense){
    resetExpenseForm();
    const cashMode = type==='cash';
    document.getElementById('expensePersonGroup').classList.toggle('hidden',cashMode);
    document.getElementById('addTitle').textContent = cashMode ? '新增現金 / Wowpass' : '新增信用卡消費';
    document.getElementById('addSubtitle').textContent = cashMode
      ? `${currentTrip.name} · 共同支出`
      : `${currentTrip.name} · ${currentTrip.currency}`;

    document.querySelectorAll('#paySeg button').forEach(btn=>{
      const pay=btn.dataset.pay;
      const show = cashMode ? (pay==='現金' || pay==='Wowpass') : pay==='信用卡';
      btn.classList.toggle('hidden',!show);
    });

    selectPay(cashMode ? '現金' : '信用卡');
    if(cashMode) selectedPerson='共同';

    document.getElementById('foreignLabel').innerHTML = `外幣金額 ${currentTrip.currency} <span class="danger">*</span>`;
    document.getElementById('foreignSymbol').textContent = currencySymbol(currentTrip.currency);
    attachMoneyFormat('expenseForeign');
    attachMoneyFormat('expenseTwd');
  }
  if(type==='pretrip'){
    editingPretripId = null;
    const d=document.getElementById('deletePretripBtn'); if(d) d.classList.add('hidden');
    document.getElementById('pretripName').value='';
    document.getElementById('pretripTwd').value='';
    document.getElementById('pretripForeign').value='';
    document.getElementById('pretripNote').value='';
    document.getElementById('pretripPay').value='信用卡';
    document.getElementById('pretripCard').value='';
    document.getElementById('addTitle').textContent='新增先前費用';
    document.getElementById('addSubtitle').textContent='機票、飯店、門票、網卡等';
    selectedPretripPerson = currentTrip.people[0] || 'Wen';
    renderPersonChips('pretripPersonChips',selectedPretripPerson,'selectPretripPerson');
    document.getElementById('pretripForeignLabel').textContent = `外幣金額 ${currentTrip.currency}`;
    document.getElementById('pretripForeignSymbol').textContent = currencySymbol(currentTrip.currency);
    attachMoneyFormat('pretripTwd'); attachMoneyFormat('pretripForeign');
    document.getElementById('pretripDate').value = today;
  }
  if(type==='exchange'){
    editingExchangeId = null;
    const d=document.getElementById('deleteExchangeBtn'); if(d) d.classList.add('hidden');
    document.getElementById('exchangeTwd').value='';
    document.getElementById('exchangeForeign').value='';
    document.getElementById('exchangeRate').value='';
    document.getElementById('exchangePlace').value='';
    document.getElementById('exchangeNote').value='';
    document.getElementById('addTitle').textContent='新增換匯紀錄';
    document.getElementById('addSubtitle').textContent=`TWD ↔ ${currentTrip.currency}`;
    document.getElementById('exchangeForeignLabel').textContent = `${currentTrip.currency} 外幣`;
    document.getElementById('exchangeForeignSymbol').textContent = currencySymbol(currentTrip.currency);
    attachMoneyFormat('exchangeTwd'); attachMoneyFormat('exchangeForeign');
    document.getElementById('exchangeDate').value = today;
  }
  showPage('page-add');
}


const CURRENCY_SYMBOLS = {
  KRW:'₩', JPY:'¥', USD:'$', EUR:'€', HKD:'HK$', CNY:'¥',
  SGD:'S$', THB:'฿', MYR:'RM', GBP:'£', AUD:'A$', TWD:'$'
};

function currencySymbol(code){ return CURRENCY_SYMBOLS[code] || code; }
function rawNumber(v){ return String(v ?? '').replace(/,/g,'').replace(/[^\d.-]/g,''); }

function formatNumberString(v){
  const raw = rawNumber(v);
  if(raw === '' || raw === '-' || raw === '.') return raw;
  const parts = raw.split('.');
  const intPart = Number(parts[0] || 0).toLocaleString('en-US');
  return parts.length > 1 ? intPart + '.' + parts[1].slice(0,2) : intPart;
}

function attachMoneyFormat(inputId){
  const el = document.getElementById(inputId);
  if(!el || el.dataset.moneyBound) return;
  el.dataset.moneyBound = '1';
  el.addEventListener('input', ()=>{
    el.value = formatNumberString(el.value);
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

function clearRequiredErrors(){
  document.querySelectorAll('.field-error').forEach(el=>el.classList.remove('field-error'));
  document.querySelectorAll('.error-text.show').forEach(el=>el.classList.remove('show'));
}

function markRequiredError(el, message){
  el.classList.add('field-error');
  let host = el.closest('.money-wrap') ? el.closest('.money-wrap').parentElement : el.parentElement;
  let err = host.querySelector('.error-text');
  if(!err){
    err = document.createElement('div');
    err.className = 'error-text';
    host.appendChild(err);
  }
  err.textContent = message;
  err.classList.add('show');
}

function requireTextField(id, message){
  const el = document.getElementById(id);
  if(!el.value.trim()){ markRequiredError(el, message); return false; }
  return true;
}
function requireNumberField(id, message){
  const el = document.getElementById(id);
  const v = rawNumber(el.value);
  if(v === '' || Number(v) <= 0){ markRequiredError(el, message); return false; }
  return true;
}

let editingExpenseId = null;
let editingPretripId = null;
let editingExchangeId = null;

let savedModalSuccess = false;
let cloudModalReturnToTrip = false;


function showCloudResultModal(success, message){
  savedModalSuccess = false;
  cloudModalReturnToTrip = currentTrip !== null;
  document.getElementById('saveSymbol').textContent = success ? '☁' : '↻';
  document.getElementById('saveTitle').textContent = success ? '已同步 Google Sheets' : '已保留本機備份';
  document.getElementById('saveMessage').textContent = message;
  document.getElementById('saveModalButton').textContent = '確定';
  document.getElementById('saveOverlay').classList.remove('hidden');
}

function showSaveModal(success){
  savedModalSuccess = success;
  document.getElementById('saveSymbol').textContent = success ? '✓' : '!';
  document.getElementById('saveTitle').textContent = success ? '儲存成功' : '儲存失敗';
  document.getElementById('saveMessage').textContent = success
    ? '這筆資料已確認儲存在目前的瀏覽器中。尚未同步到 Google Sheets。'
    : '資料尚未確認寫入，請檢查瀏覽器儲存空間後再試一次。';
  document.getElementById('saveModalButton').textContent = success
    ? '確定，返回旅行首頁'
    : '確定，返回繼續填寫';
  document.getElementById('saveOverlay').classList.remove('hidden');
}

function closeSaveModal(){
  document.getElementById('saveOverlay').classList.add('hidden');
  if(savedModalSuccess || cloudModalReturnToTrip){
    cloudModalReturnToTrip = false;
    backToTrip();
  }
}


async function confirmSaved(type, item, cloudAction){
  const records = currentTrip[type];
  records.push(item);
  try {
    persist();
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const trip = stored && stored.trips.find(t => t.id === currentTrip.id);
    if(!trip || !(trip[type] || []).some(r => r.id === item.id)){
      throw new Error('無法確認資料已寫入瀏覽器');
    }
  }catch(err){
    const index = records.findIndex(r => r.id === item.id);
    if(index !== -1) records.splice(index, 1);
    showSaveModal(false);
    return false;
  }

  let cloudOk = false;
  if(getApiUrl()){
    cloudOk = await syncRecord(cloudAction, currentTrip, type, item);
  }else{
    item.syncStatus = 'local';
    persist();
  }

  if(getApiUrl()){
    showCloudResultModal(cloudOk,
      cloudOk
        ? '資料已同步至 Google Sheets，並保留本機備份。'
        : '資料已保留在本機，但尚未同步 Google Sheets；之後可在設定中按「立即同步」。');
  }else{
    showCloudResultModal(false,'資料已安全保留在本機。尚未設定 Google Apps Script，因此目前不會同步到 Google Sheets。');
  }
  return true;
}

