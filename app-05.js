let recordSaveLocked = false;

async function guardedSave(kind, button){
  if(recordSaveLocked || !button || button.disabled) return;

  const actions = {
    expense: saveExpense,
    pretrip: savePretrip,
    exchange: saveExchange
  };
  const action = actions[kind];
  if(!action) return;

  const originalText = button.textContent;
  recordSaveLocked = true;
  button.disabled = true;
  button.classList.add('is-saving');
  button.textContent = '儲存中…';

  try{
    await action();
  }catch(err){
    console.error('save error:', err);
    alert('儲存時發生錯誤，資料沒有重複送出，請再試一次。');
  }finally{
    recordSaveLocked = false;
    button.disabled = false;
    button.classList.remove('is-saving');
    button.textContent = originalText;
  }
}

async function saveExpense(){
  clearRequiredErrors();
  const okDate = requireTextField('expenseDate','請選擇日期');
  const okQty = requireNumberField('expenseQty','請填寫大於 0 的數量');
  const okName = requireTextField('expenseName','請填寫品名');
  const okForeign = requireNumberField('expenseForeign','請填寫外幣金額');
  const okPlace = requireTextField('expensePlace','請填寫購買地點');
  if(!(okDate && okQty && okName && okForeign && okPlace)) return;

  const expenseDateValue=document.getElementById('expenseDate').value;
  const tripStart = normalizeTripDateValue(currentTrip.start);
  const tripEnd = normalizeTripDateValue(currentTrip.end);
  if(expenseDateValue < tripStart || expenseDateValue > tripEnd){
    alert(`購買商品日期只能填在旅行期間：${tripStart} ～ ${tripEnd}`);
    return;
  }

  const twdRaw = rawNumber(document.getElementById('expenseTwd').value);
  const item = {
    id: editingExpenseId || ('e_' + Date.now()),
    type:'購買商品',
    person:selectedPay==='信用卡' ? selectedPerson : '共同',
    pay:selectedPay,
    card:selectedPay==='信用卡'?document.getElementById('cardType').value:'',
    date:document.getElementById('expenseDate').value,
    qty:Number(rawNumber(document.getElementById('expenseQty').value)),
    name:document.getElementById('expenseName').value.trim(),
    foreign:Number(rawNumber(document.getElementById('expenseForeign').value)),
    twd:twdRaw === '' ? null : Number(twdRaw),
    place:document.getElementById('expensePlace').value.trim(),
    note:document.getElementById('expenseNote').value.trim()
  };

  if(editingExpenseId){
    const idx = currentTrip.expenses.findIndex(x=>x.id===editingExpenseId);
    if(idx === -1){ showSaveModal(false); return; }
    currentTrip.expenses[idx] = item;
    try{
      persist();
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      const trip = stored && stored.trips.find(t=>t.id===currentTrip.id);
      const found = trip && (trip.expenses||[]).find(x=>x.id===editingExpenseId);
      if(!found) throw new Error('更新失敗');
      const updatedId = editingExpenseId;
      editingExpenseId = null;
      let cloudOk = false;
      if(getApiUrl()){
        cloudOk = await syncRecord('updateExpense', currentTrip, 'expenses', item);
        showCloudResultModal(cloudOk, cloudOk
          ? '這筆紀錄已更新至 Google Sheets，並保留本機備份。'
          : '本機紀錄已更新，但 Google Sheets 尚未同步成功，已加入待同步佇列。');
      }else{
        item.syncStatus='local';
        persist();
        showCloudResultModal(false,'本機紀錄已更新。尚未設定 Google Apps Script，因此目前不會同步到 Google Sheets。');
      }
    }catch(err){
      showSaveModal(false);
    }
  }else{
    const saved = await confirmSaved('expenses', item, 'addExpense');
    if(saved){
      document.getElementById('expenseName').value = '';
      document.getElementById('expenseForeign').value = '';
      document.getElementById('expenseTwd').value = '';
      document.getElementById('expensePlace').value = '';
      document.getElementById('expenseNote').value = '';
      document.getElementById('expenseQty').value = 1;
    }
  }
}

async function savePretrip(){
  const name=document.getElementById('pretripName').value.trim();
  const date=document.getElementById('pretripDate').value;
  if(!name || !date){ alert('請填項目與日期'); return; }
  selectedPretripPerson=document.getElementById('pretripPerson').value;
  const pretripPay=document.getElementById('pretripPay').value;
  const item = {
    id:editingPretripId || ('p_'+Date.now()),
    type:'先前費用',
    person:selectedPretripPerson,
    name,date,
    website:document.getElementById('pretripWebsite').value.trim(),
    pay:pretripPay,
    twd:Number(rawNumber(document.getElementById('pretripTwd').value)||0),
    foreign:Number(rawNumber(document.getElementById('pretripForeign').value)||0),
    card:pretripPay==='信用卡' ? (document.getElementById('pretripCard').value || '無') : '無',
    note:document.getElementById('pretripNote').value.trim()
  };

  if(editingPretripId){
    const idx=currentTrip.pretrip.findIndex(x=>x.id===editingPretripId);
    if(idx===-1) return;
    currentTrip.pretrip[idx]=item;
    persist();
    let cloudOk=true;
    if(getApiUrl()) cloudOk=await syncRecord('updatePretrip',currentTrip,'pretrip',item);
    else { item.syncStatus='local'; persist(); }
    editingPretripId=null;
    showCloudResultModal(cloudOk, cloudOk?'先前費用已更新至 Google Sheets。':'本機已更新，但 Google Sheets 尚未同步成功。');
  }else{
    await confirmSaved('pretrip', item, 'addPretrip');
  }
}

async function saveExchange(){
  const date=document.getElementById('exchangeDate').value;
  if(!date){ alert('請填日期'); return; }
  const item = {
    id:editingExchangeId || ('x_'+Date.now()),
    type:'換匯',
    date,
    twd:Number(rawNumber(document.getElementById('exchangeTwd').value)||0),
    foreign:Number(rawNumber(document.getElementById('exchangeForeign').value)||0),
    rate:Number(document.getElementById('exchangeRate').value||0),
    place:document.getElementById('exchangePlace').value.trim(),
    note:document.getElementById('exchangeNote').value.trim()
  };

  if(editingExchangeId){
    const idx=currentTrip.exchange.findIndex(x=>x.id===editingExchangeId);
    if(idx===-1) return;
    currentTrip.exchange[idx]=item;
    persist();
    let cloudOk=true;
    if(getApiUrl()) cloudOk=await syncRecord('updateExchange',currentTrip,'exchange',item);
    else { item.syncStatus='local'; persist(); }
    editingExchangeId=null;
    showCloudResultModal(cloudOk, cloudOk?'換匯紀錄已更新至 Google Sheets。':'本機已更新，但 Google Sheets 尚未同步成功。');
  }else{
    await confirmSaved('exchange', item, 'addExchange');
  }
}

function backToTrip(){
  if(currentTrip) openTrip(currentTrip.id); else goHome();
}

let allRecordSource = [];

function openRecords(){
  document.getElementById('recordsSubtitle').textContent = currentTrip.name + ' · 點任一紀錄可修改或刪除';
  allRecordSource = [
    ...(currentTrip.expenses||[]),
    ...(currentTrip.pretrip||[]),
    ...(currentTrip.exchange||[])
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  setupRecordFilters();
  applyRecordFilters();
  showPage('page-records');
}

function setupRecordFilters(){
  const people = [...new Set([
    ...(currentTrip.people||[]),
    ...allRecordSource.map(x=>x.person).filter(Boolean)
  ])];

  const pays = [...new Set(
    allRecordSource.map(x=>x.pay).filter(Boolean)
  )];

  const cards = [...new Set(
    allRecordSource
      .map(x=>x.card)
      .filter(v=>v && v!=='無')
  )];

  const personEl=document.getElementById('recordFilterPerson');
  const payEl=document.getElementById('recordFilterPay');
  const cardEl=document.getElementById('recordFilterCard');

  personEl.innerHTML='<option value="">全部人員</option>'+
    people.map(v=>`<option value="${v}">${v}</option>`).join('');
  payEl.innerHTML='<option value="">全部付款方式</option>'+
    pays.map(v=>`<option value="${v}">${v}</option>`).join('');
  cardEl.innerHTML='<option value="">全部卡別</option>'+
    cards.map(v=>`<option value="${v}">${v}</option>`).join('');

  clearRecordFilters(false);
}

function recordSearchText(item){
  return [
    item.name,
    item.type,
    item.place,
    item.website,
    item.note,
    item.person,
    item.pay,
    item.card,
    item.date
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function applyRecordFilters(){
  const keyword=(document.getElementById('recordSearch')?.value||'').trim().toLowerCase();
  const date=document.getElementById('recordFilterDate')?.value||'';
  const person=document.getElementById('recordFilterPerson')?.value||'';
  const pay=document.getElementById('recordFilterPay')?.value||'';
  const card=document.getElementById('recordFilterCard')?.value||'';

  const filtered=allRecordSource.filter(item=>{
    if(keyword && !recordSearchText(item).includes(keyword)) return false;
    if(date && normalizeTripDateValue(item.date)!==date) return false;
    if(person && item.person!==person) return false;
    if(pay && item.pay!==pay) return false;
    if(card && item.card!==card) return false;
    return true;
  });

  const box=document.getElementById('allRecords');
  const count=document.getElementById('recordFilterCount');

  if(count) count.textContent=`${filtered.length} / ${allRecordSource.length} 筆`;

  box.innerHTML = filtered.length
    ? filtered.map(recordHtml).join('')
    : `<div class="empty">沒有符合條件的紀錄</div>`;
}

function clearRecordFilters(refresh=true){
  const ids=['recordSearch','recordFilterDate','recordFilterPerson','recordFilterPay','recordFilterCard'];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value='';
  });
  if(refresh) applyRecordFilters();
}


function openPendingTwd(){
  document.getElementById('recordsSubtitle').textContent = currentTrip.name + ' · 待補台幣金額';
  const items = (currentTrip.expenses||[])
    .filter(x => x.twd === null || x.twd === '' || Number(x.twd) === 0)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const box = document.getElementById('allRecords');
  box.innerHTML = items.length ? items.map(recordHtml).join('') : `<div class="empty">目前沒有待補台幣的紀錄</div>`;
  showPage('page-records');
}

function goSettings(){
  renderSettings();
  showPage('page-settings');
}

function renderSettings(){
  setTimeout(updateCloudStatusUI,0);
  setTimeout(renderSyncErrorDetails,0);
  document.getElementById('peopleSettings').innerHTML = state.people.map((p,i)=>`
    <div class="setting-row">
      <div><strong><span class="${personClass(p)}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--person);margin-right:7px"></span>${p}</strong><br><span>${i===0?'預設自己':'記帳對象'}</span></div>
      ${i===0?'':'<button class="pill danger" onclick="removePerson(\''+p+'\')">刪除</button>'}
    </div>`).join('');
  document.getElementById('cardSettings').innerHTML = state.cards.map(c=>`
    <div class="setting-row">
      <div><strong>${c}</strong><br><span>所有記帳對象共用</span></div>
      <button class="pill danger" onclick="removeCard('${c}')">刪除</button>
    </div>`).join('');
}

function addPerson(){
  const v=document.getElementById('newPerson').value.trim();
  if(!v || state.people.includes(v)) return;
  state.people.push(v);persist();document.getElementById('newPerson').value='';renderSettings();
}
function removePerson(v){
  if(!confirm(`刪除 ${v}？既有紀錄不會被刪除。`))return;
  state.people=state.people.filter(x=>x!==v);persist();renderSettings();
}


function normalizeTripDateValue(value){
  if(!value) return '';
  if(typeof value === 'string'){
    const direct = value.match(/^\d{4}-\d{2}-\d{2}$/);
    if(direct) return value;
    const parsed = new Date(value);
    if(!Number.isNaN(parsed.getTime())){
      const y=parsed.getFullYear();
      const m=String(parsed.getMonth()+1).padStart(2,'0');
      const d=String(parsed.getDate()).padStart(2,'0');
      return `${y}-${m}-${d}`;
    }
  }
  if(value instanceof Date && !Number.isNaN(value.getTime())){
    const y=value.getFullYear();
    const m=String(value.getMonth()+1).padStart(2,'0');
    const d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0,10);
}


function syncQueueLabel(q){
  if(q.action==='createTrip') return '建立旅行';
  if(q.recordType==='expenses') return '購買商品';
  if(q.recordType==='pretrip') return '先前費用';
  if(q.recordType==='exchange') return '換匯紀錄';
  return '同步資料';
}

function renderSyncErrorDetails(){
  const box=document.getElementById('syncErrorDetails');
  if(!box) return;

  const items=(state.syncQueue||[]).filter(q=>q.lastError);
  if(!items.length){
    box.innerHTML=state.syncQueue.length
      ? '<div class="sync-error-empty">目前有待同步資料，系統會自動重試。</div>'
      : '';
    return;
  }

  box.innerHTML=
    '<div class="tiny" style="font-weight:800;margin-top:4px">同步失敗明細</div>'+
    items.map(q=>{
      const trip=getTripById(q.tripId);
      const record=q.payload && q.payload.record ? q.payload.record : null;
      const title=record?.name || trip?.name || syncQueueLabel(q);
      const date=record?.date ? ` · ${record.date}` : '';
      return `
        <div class="sync-error-card">
          <strong>${syncQueueLabel(q)}｜${title}</strong>
          <div class="sync-error-meta">${trip?.name || '旅行資料'}${date}</div>
          <div class="sync-error-message">${q.lastError || '未知錯誤'}</div>
        </div>`;
    }).join('');
}
