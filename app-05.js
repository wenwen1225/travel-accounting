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

function normalizedRecordName(value){
  return String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
}

function isSameMoneyValue(a,b){
  const aa=a===null || a==='' || a===undefined ? null : Number(a);
  const bb=b===null || b==='' || b===undefined ? null : Number(b);
  return aa===bb;
}

function findPotentialDuplicate(type,item,excludeId=''){
  const list = type==='expenses'
    ? (currentTrip?.expenses || [])
    : type==='pretrip'
      ? (currentTrip?.pretrip || [])
      : (currentTrip?.exchange || []);

  return list.find(existing=>{
    if(!existing || existing.id===excludeId) return false;
    if(normalizeTripDateValue(existing.date)!==normalizeTripDateValue(item.date)) return false;

    if(type==='expenses'){
      return (
        normalizedRecordName(existing.name)===normalizedRecordName(item.name) &&
        isSameMoneyValue(existing.foreign,item.foreign)
      );
    }

    if(type==='pretrip'){
      return (
        normalizedRecordName(existing.name)===normalizedRecordName(item.name) &&
        isSameMoneyValue(existing.twd,item.twd) &&
        isSameMoneyValue(existing.foreign,item.foreign)
      );
    }

    return (
      isSameMoneyValue(existing.twd,item.twd) &&
      isSameMoneyValue(existing.foreign,item.foreign)
    );
  }) || null;
}

function duplicateRecordSummary(type,item){
  const date=dateWithWeekday(item.date) || item.date || '未填日期';

  if(type==='expenses'){
    return `${date} · ${item.name || '未命名'} · ${currencySymbol(currentTrip.currency)}${Number(item.foreign||0).toLocaleString('en-US')}`;
  }

  if(type==='pretrip'){
    const twd=fmtMoney(item.twd||0,'TWD');
    return `${date} · ${item.name || '先前費用'} · ${twd}`;
  }

  return `${date} · ${fmtMoney(item.twd||0,'TWD')} → ${currencySymbol(currentTrip.currency)}${Number(item.foreign||0).toLocaleString('en-US')}`;
}

function confirmPotentialDuplicate(type,item,excludeId=''){
  const duplicate=findPotentialDuplicate(type,item,excludeId);
  if(!duplicate) return true;

  return confirm(
    '可能有重複紀錄：\n\n'+
    duplicateRecordSummary(type,item)+
    '\n\n同一天、相同項目／金額已有紀錄。\n仍要繼續儲存嗎？'
  );
}

async function saveExpense(){
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
  clearRequiredErrors();
  const okDate = requireTextField('expenseDate','請選擇日期');
  const okQty = requireNumberField('expenseQty','請填寫大於 0 的數量');
  const okName = requireTextField('expenseName','請填寫品名');
  const okForeign = requireNumberField('expenseForeign','請填寫外幣金額');
  const okPlace = requireTextField('expensePlace','請填寫購買地點');
  const selectedCategory=document.getElementById('expenseCategory')?.value || '';
  if(!selectedCategory){
    alert('請選擇分類標籤。');
    return;
  }
  if(selectedCategory==='其他（自行輸入）' && !document.getElementById('expenseCategoryCustom')?.value.trim()){
    alert('請輸入自訂分類名稱。');
    document.getElementById('expenseCategoryCustom')?.focus();
    return;
  }
  if(!(okDate && okQty && okName && okForeign && okPlace)) return;

  const expenseDateValue=document.getElementById('expenseDate').value;
  const tripStart = normalizeTripDateValue(currentTrip.start);
  const tripEnd = normalizeTripDateValue(currentTrip.end);
  if(expenseDateValue < tripStart || expenseDateValue > tripEnd){
    alert(`購買商品日期只能填在旅行期間：${dateWithWeekday(tripStart)} ～ ${dateWithWeekday(tripEnd)}`);
    return;
  }

  const twdRaw = rawNumber(document.getElementById('expenseTwd').value);
  const item = {
    id: editingExpenseId || ('e_' + Date.now()),
    type:'購買商品',
    person:(selectedPay==='信用卡' || selectedPay==='交通卡') ? selectedPerson : '共同',
    pay:selectedPay,
    card:selectedPay==='信用卡'?document.getElementById('cardType').value:'',
    date:document.getElementById('expenseDate').value,
    qty:Number(rawNumber(document.getElementById('expenseQty').value)),
    name:document.getElementById('expenseName').value.trim(),
    foreign:Number(rawNumber(document.getElementById('expenseForeign').value)),
    twd:twdRaw === '' ? null : Number(twdRaw),
    place:document.getElementById('expensePlace').value.trim(),
    category:getExpenseCategoryValue(),
    note:document.getElementById('expenseNote').value.trim()
  };
  if(!item.updatedAt) item.updatedAt=new Date().toISOString();

  if(!confirmPotentialDuplicate('expenses',item,editingExpenseId || '')) return;

  if(editingExpenseId){
    const idx = currentTrip.expenses.findIndex(x=>x.id===editingExpenseId);
    if(idx === -1){ showSaveModal(false); return; }
    const previous = currentTrip.expenses[idx];
    item.cloudFingerprint = previous?.cloudFingerprint || '';
    item.updatedAt = new Date().toISOString();
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
      setExpenseCategoryValue('');
      document.getElementById('expenseNote').value = '';
      document.getElementById('expenseQty').value = 1;
    }
  }
}

async function savePretrip(){
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
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
  if(!item.updatedAt) item.updatedAt=new Date().toISOString();

  if(!confirmPotentialDuplicate('pretrip',item,editingPretripId || '')) return;

  if(editingPretripId){
    const idx=currentTrip.pretrip.findIndex(x=>x.id===editingPretripId);
    if(idx===-1) return;
    const previous=currentTrip.pretrip[idx];
    item.cloudFingerprint=previous?.cloudFingerprint || '';
    item.updatedAt=new Date().toISOString();
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
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
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
  if(!item.updatedAt) item.updatedAt=new Date().toISOString();

  if(!confirmPotentialDuplicate('exchange',item,editingExchangeId || '')) return;

  if(editingExchangeId){
    const idx=currentTrip.exchange.findIndex(x=>x.id===editingExchangeId);
    if(idx===-1) return;
    const previous=currentTrip.exchange[idx];
    item.cloudFingerprint=previous?.cloudFingerprint || '';
    item.updatedAt=new Date().toISOString();
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
  pendingTwdQuickMode=false;
  pendingTwdQuickItems=[];
  pendingTwdQuickIndex=0;
  setPendingTwdQuickUi(false);
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
    item.category,
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


let pendingTwdQuickMode=false;
let pendingTwdQuickItems=[];
let pendingTwdQuickIndex=0;

function setPendingTwdQuickUi(active){
  const panel=document.getElementById('pendingTwdQuickPanel');
  const filters=document.getElementById('recordsFilterCard');
  const all=document.getElementById('allRecords');

  if(panel) panel.classList.toggle('hidden',!active);
  if(filters) filters.classList.toggle('hidden',active);
  if(all) all.classList.toggle('hidden',active);
}

function pendingTwdItems(){
  return (currentTrip?.expenses || [])
    .filter(x => x.twd === null || x.twd === '' || Number(x.twd) === 0)
    .sort((a,b)=>(a.date||'').localeCompare(b.date||''));
}

function pendingTwdQuickCard(item){
  const foreignText =
    currencySymbol(currentTrip.currency) +
    Number(item.foreign || 0).toLocaleString('en-US');

  const shared=isSharedExpensePay(item.pay);
  const who=shared ? '共同支出' : (item.person || '');
  const payInfo=[
    who,
    item.pay || '',
    item.card || ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="pending-twd-item">
      <div class="pending-twd-item-date">${dateWithWeekday(item.date)}</div>
      <div class="pending-twd-item-head">
        <div>
          <strong>${item.name || '未命名商品'}</strong>
          <span>${payInfo}</span>
          ${item.place ? `<span>${item.place}</span>` : ''}
        </div>
        <div class="pending-twd-foreign">${foreignText}</div>
      </div>

      <div class="pending-twd-input-wrap">
        <label for="pendingTwdQuickInput">補上台幣金額</label>
        <div class="money-wrap">
          <span class="money-prefix">NT$</span>
          <input
            id="pendingTwdQuickInput"
            type="text"
            inputmode="decimal"
            placeholder="輸入台幣"
            autocomplete="off"
            onkeydown="if(event.key==='Enter'){savePendingTwdAndNext()}"
          />
        </div>
      </div>

      <button
        id="pendingTwdQuickSaveBtn"
        class="primary"
        type="button"
        onclick="savePendingTwdAndNext()"
      >儲存並下一筆</button>

      <button
        class="secondary"
        type="button"
        style="margin-top:8px"
        onclick="editExpense('${item.id}')"
      >開啟完整紀錄</button>
    </div>
  `;
}

function renderPendingTwdQuick(){
  const content=document.getElementById('pendingTwdQuickContent');
  const progress=document.getElementById('pendingTwdProgress');
  if(!content || !progress) return;

  pendingTwdQuickItems=pendingTwdItems();

  if(!pendingTwdQuickItems.length){
    progress.textContent='已完成';
    content.innerHTML=`
      <div class="pending-twd-done">
        <div>✓</div>
        <strong>台幣金額都補完了</strong>
        <span>目前沒有待補台幣的消費紀錄。</span>
        <button class="primary" type="button" onclick="backToTrip()">返回旅行首頁</button>
      </div>
    `;
    renderTripSummary();
    return;
  }

  if(pendingTwdQuickIndex >= pendingTwdQuickItems.length){
    pendingTwdQuickIndex=0;
  }

  const item=pendingTwdQuickItems[pendingTwdQuickIndex];
  progress.textContent=`${pendingTwdQuickIndex+1} / ${pendingTwdQuickItems.length}`;
  content.innerHTML=pendingTwdQuickCard(item);

  attachMoneyFormat('pendingTwdQuickInput');

  setTimeout(()=>{
    const input=document.getElementById('pendingTwdQuickInput');
    if(input) input.focus();
  },80);
}

function openPendingTwd(){
  if(isCurrentTripArchived()){
    // 封存旅行維持原本的查看模式，不提供快速修改。
    document.getElementById('recordsSubtitle').textContent = currentTrip.name + ' · 待補台幣金額';
    allRecordSource=pendingTwdItems();
    setupRecordFilters();
    applyRecordFilters();
    showPage('page-records');
    return;
  }

  pendingTwdQuickMode=true;
  pendingTwdQuickIndex=0;
  document.getElementById('recordsSubtitle').textContent =
    currentTrip.name + ' · 快速補台幣';

  setPendingTwdQuickUi(true);
  renderPendingTwdQuick();
  showPage('page-records');
}

function exitPendingTwdQuickMode(){
  pendingTwdQuickMode=false;
  pendingTwdQuickItems=[];
  pendingTwdQuickIndex=0;
  setPendingTwdQuickUi(false);

  document.getElementById('recordsSubtitle').textContent =
    currentTrip.name + ' · 待補台幣金額';

  allRecordSource=pendingTwdItems();
  setupRecordFilters();
  applyRecordFilters();
}

async function savePendingTwdAndNext(){
  if(!currentTrip || isCurrentTripArchived()) return;

  const item=pendingTwdQuickItems[pendingTwdQuickIndex];
  const input=document.getElementById('pendingTwdQuickInput');
  const btn=document.getElementById('pendingTwdQuickSaveBtn');
  if(!item || !input) return;

  const raw=rawNumber(input.value);
  const amount=Number(raw);

  if(raw==='' || !Number.isFinite(amount) || amount<=0){
    alert('請輸入大於 0 的台幣金額。');
    input.focus();
    return;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent='儲存中…';
  }

  const idx=(currentTrip.expenses || []).findIndex(x=>x.id===item.id);
  if(idx<0){
    renderPendingTwdQuick();
    return;
  }

  const previous=currentTrip.expenses[idx];
  const updated={
    ...previous,
    twd:amount,
    updatedAt:new Date().toISOString(),
    cloudFingerprint:previous.cloudFingerprint || '',
    syncStatus:getApiUrl() ? 'pending' : 'local',
    lastSyncError:''
  };

  currentTrip.expenses[idx]=updated;
  persist();
  renderTripSummary();

  // 快速模式先確保本機已存好，再切下一筆。
  pendingTwdQuickIndex=0;
  renderPendingTwdQuick();

  if(getApiUrl()){
    syncRecord(
      'updateExpense',
      currentTrip,
      'expenses',
      updated
    ).then(()=>{
      persist();
      renderTripSummary();
    });
  }
}


function goSettings(){
  renderSettings();
  showPage('page-settings');
}

function renderSettings(){
  setTimeout(updateCloudStatusUI,0);
  setTimeout(renderSyncErrorDetails,0);
  setTimeout(renderBackupSummary,0);
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
  alert('固定記帳對象為 Wen、Clark、Anna。其他同行人請在建立旅行時用「＋新增同行人」，只會套用在該趟旅行。');
  const input=document.getElementById('newPerson');
  if(input) input.value='';
}
function removePerson(v){
  alert('Wen、Clark、Anna 為固定記帳對象，不會從設定中刪除。');
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

function syncTargetSheetLabel(q, record){
  if(q.action==='createTrip') return '建立旅行 / Google Sheet';
  if(q.recordType==='pretrip') return '先前費用';
  if(q.recordType==='exchange') return '換匯紀錄';
  if(q.recordType==='expenses'){
    const pay=record?.pay || '';
    if(pay==='信用卡') return '購買商品 信用卡';
    if(pay==='交通卡') return '購買商品 交通卡';
    return '購買商品 現金';
  }
  return '—';
}

function formatSyncErrorTime(value){
  if(!value) return '尚未記錄';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('zh-TW',{
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    minute:'2-digit',
    hour12:false
  });
}

function syncActionText(action){
  const map={
    createTrip:'建立旅行',
    addExpense:'新增消費',
    updateExpense:'修改消費',
    deleteExpense:'刪除消費',
    addPretrip:'新增先前費用',
    updatePretrip:'修改先前費用',
    deletePretrip:'刪除先前費用',
    addExchange:'新增換匯',
    updateExchange:'修改換匯',
    deleteExchange:'刪除換匯'
  };
  return map[action] || action || '同步資料';
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
      const date=record?.date ? dateWithWeekday(record.date) : '—';
      const sheetLabel=syncTargetSheetLabel(q,record);
      const actionText=syncActionText(q.action);
      const failedAt=formatSyncErrorTime(q.lastErrorAt || q.createdAt);
      const conflict=!!q.conflictCloudRecord;

      return `
        <div class="sync-error-card ${conflict?'sync-error-conflict':''}">
          <div class="sync-error-title-row">
            <strong>${syncQueueLabel(q)}｜${title}</strong>
            <span class="sync-error-kind">${conflict?'資料衝突':'同步失敗'}</span>
          </div>

          <div class="sync-error-detail-grid">
            <div><span>旅行</span><strong>${trip?.name || '旅行資料'}</strong></div>
            <div><span>日期</span><strong>${date}</strong></div>
            <div><span>操作</span><strong>${actionText}</strong></div>
            <div><span>Sheet 分頁</span><strong>${sheetLabel}</strong></div>
            <div class="sync-error-detail-wide"><span>最後失敗</span><strong>${failedAt}</strong></div>
          </div>

          <div class="sync-error-message">
            <span>錯誤原因</span>
            <strong>${q.lastError || '未知錯誤'}</strong>
          </div>

          ${conflict ? `
            <div class="sync-conflict-note">雲端內容已被其他裝置或 Google Sheet 修改，請選擇要保留的版本。</div>
            <div class="sync-conflict-actions">
              <button
                class="sync-retry-btn"
                type="button"
                onclick="resolveSyncConflict('${q.queueId}','cloud')"
              >使用雲端版本</button>
              <button
                class="sync-retry-btn sync-conflict-local"
                type="button"
                onclick="resolveSyncConflict('${q.queueId}','local')"
              >保留本機版本</button>
            </div>
          ` : `
            <button
              class="sync-retry-btn"
              type="button"
              onclick="retrySingleSync('${q.queueId}')"
              ${q.retrying?'disabled':''}
            >${q.retrying?'只同步這筆中…':'只同步這一筆'}</button>
          `}
        </div>`;
    }).join('');
}

function backupTripCount(){
  return Array.isArray(state.trips) ? state.trips.length : 0;
}

function backupRecordCount(){
  return (state.trips || []).reduce((sum,trip)=>
    sum +
    (trip.expenses || []).length +
    (trip.pretrip || []).length +
    (trip.exchange || []).length
  ,0);
}

function renderBackupSummary(){
  const el=document.getElementById('backupSummary');
  if(!el) return;
  el.textContent=`目前：${backupTripCount()} 趟旅行 · ${backupRecordCount()} 筆紀錄`;
}

function backupFileName(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  return `travel-ledger-backup_${y}${m}${day}_${hh}${mm}.json`;
}

function exportTravelBackup(){
  const payload={
    app:'travel-accounting',
    backupVersion:1,
    exportedAt:new Date().toISOString(),
    webVersion:typeof WEB_APP_VERSION==='string' ? WEB_APP_VERSION : '',
    data:{
      people:[...(state.people || [])],
      cards:[...(state.cards || [])],
      trips:JSON.parse(JSON.stringify(state.trips || [])),
      lastSyncAt:state.lastSyncAt || ''
    }
  };

  const blob=new Blob(
    [JSON.stringify(payload,null,2)],
    {type:'application/json;charset=utf-8'}
  );
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=backupFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  alert(`備份已建立：${backupTripCount()} 趟旅行、${backupRecordCount()} 筆紀錄。`);
}

function validateTravelBackup(payload){
  if(!payload || payload.app!=='travel-accounting'){
    throw new Error('這不是旅遊記帳網站的備份檔。');
  }
  if(!payload.data || !Array.isArray(payload.data.trips)){
    throw new Error('備份檔內容不完整，找不到旅行資料。');
  }
  if(!Array.isArray(payload.data.people) || !Array.isArray(payload.data.cards)){
    throw new Error('備份檔缺少記帳對象或卡別設定。');
  }
  return payload.data;
}

let pendingBackupRestoreSummary=null;

function backupDataSummary(data){
  const trips=Array.isArray(data?.trips) ? data.trips : [];
  const expenseCount=trips.reduce((s,t)=>s+(t.expenses||[]).length,0);
  const pretripCount=trips.reduce((s,t)=>s+(t.pretrip||[]).length,0);
  const exchangeCount=trips.reduce((s,t)=>s+(t.exchange||[]).length,0);
  return {
    tripCount:trips.length,
    expenseCount,
    pretripCount,
    exchangeCount,
    recordCount:expenseCount+pretripCount+exchangeCount
  };
}

function showBackupRestoreChoice(payload,data){
  const summary=backupDataSummary(data);
  pendingBackupRestoreSummary={
    exportedAt:payload.exportedAt || '',
    ...summary
  };

  const overlay=document.getElementById('backupRestoreOverlay');
  const timeEl=document.getElementById('backupRestoreTime');
  const tripsEl=document.getElementById('backupRestoreTrips');
  const recordsEl=document.getElementById('backupRestoreRecords');
  const noteEl=document.getElementById('backupRestoreNote');
  const progress=document.getElementById('backupRestoreProgress');
  const cloudBtn=document.getElementById('backupRestoreCloudBtn');
  const localBtn=document.getElementById('backupRestoreLocalBtn');

  if(timeEl){
    timeEl.textContent=payload.exportedAt
      ? new Date(payload.exportedAt).toLocaleString('zh-TW')
      : '未知時間';
  }
  if(tripsEl) tripsEl.textContent=summary.tripCount+' 趟';
  if(recordsEl){
    recordsEl.textContent=
      summary.recordCount+' 筆（消費 '+summary.expenseCount+
      '、先前費用 '+summary.pretripCount+
      '、換匯 '+summary.exchangeCount+'）';
  }
  if(noteEl){
    noteEl.textContent=getApiUrl()
      ? '你可以只保留在這台裝置，或把備份中的資料新增／更新回 Google Sheets。雲端中備份沒有的額外紀錄不會被刪除。'
      : '目前尚未設定 Apps Script 網址，因此只能先還原到這台裝置。之後設定網址後仍可再同步。';
  }
  if(progress){
    progress.classList.add('hidden');
    progress.textContent='';
  }
  if(cloudBtn){
    cloudBtn.disabled=!getApiUrl();
    cloudBtn.textContent='同步備份到 Google Sheets';
  }
  if(localBtn){
    localBtn.disabled=false;
    localBtn.textContent='只保留在這台裝置';
  }
  if(overlay) overlay.classList.remove('hidden');
}

function keepBackupLocalOnly(){
  state.backupRestoreLocalOnly=true;
  state.backupRestoreLocalOnlyAt=new Date().toISOString();
  persist();
  renderSettings();
  renderHome();

  const overlay=document.getElementById('backupRestoreOverlay');
  if(overlay) overlay.classList.add('hidden');
  pendingBackupRestoreSummary=null;

  alert(
    '已保留在這台裝置。\n\n'+
    'Google Sheet 沒有被修改。首頁會標示「已還原備份｜目前僅此裝置」。'
  );
  goHome();
}

function updateBackupRestoreProgress(done,total,message){
  const el=document.getElementById('backupRestoreProgress');
  if(!el) return;
  el.classList.remove('hidden');
  const pct=total ? Math.round(done/total*100) : 0;
  el.innerHTML=
    '<strong>'+pct+'%</strong>'+
    '<span>'+message+'</span>'+
    '<div class="backup-restore-progress-bar"><i style="width:'+pct+'%"></i></div>';
}

async function syncRestoredBackupToCloud(){
  if(!getApiUrl()){
    alert('請先設定 Google Apps Script Web App URL。');
    return false;
  }

  const cloudBtn=document.getElementById('backupRestoreCloudBtn');
  const localBtn=document.getElementById('backupRestoreLocalBtn');
  if(cloudBtn){
    cloudBtn.disabled=true;
    cloudBtn.textContent='同步中…';
  }
  if(localBtn) localBtn.disabled=true;

  const trips=state.trips || [];
  const total=
    trips.length+
    trips.reduce((s,t)=>
      s+(t.expenses||[]).length+(t.pretrip||[]).length+(t.exchange||[]).length
    ,0);

  let done=0;
  let lastRevision='';
  const errors=[];

  try{
    for(const trip of trips){
      updateBackupRestoreProgress(done,total,'準備 '+(trip.name||'旅行')+'…');

      try{
        const created=await postToCloud(cloudPayloadForTrip(trip));
        trip.spreadsheetId=created.spreadsheetId || trip.spreadsheetId || '';
        trip.spreadsheetUrl=created.spreadsheetUrl || trip.spreadsheetUrl || '';
        trip.cloudStatus='synced';
        trip.lastSyncError='';
        if(created?.cloudRevision) lastRevision=String(created.cloudRevision);
      }catch(err){
        trip.cloudStatus='pending';
        trip.lastSyncError=err?.message || String(err);
        enqueueSync('createTrip',trip.id,'trip',trip.id,cloudPayloadForTrip(trip));
        errors.push((trip.name||'旅行')+'：'+trip.lastSyncError);
        done++;
        continue;
      }

      done++;
      updateBackupRestoreProgress(done,total,'已建立／確認 '+(trip.name||'旅行'));

      const groups=[
        ['expenses','addExpense'],
        ['pretrip','addPretrip'],
        ['exchange','addExchange']
      ];

      for(const [type,action] of groups){
        for(const item of (trip[type] || [])){
          try{
            const payload={
              ...cloudPayloadForRecord(action,trip,item),
              spreadsheetId:trip.spreadsheetId,
              forceOverwrite:true
            };
            const result=await postToCloud(payload);
            item.syncStatus='synced';
            item.lastSyncError='';
            item.conflictCloudRecord=null;
            if(result?.cloudFingerprint) item.cloudFingerprint=result.cloudFingerprint;
            if(result?.cloudRevision) lastRevision=String(result.cloudRevision);
            state.syncQueue=state.syncQueue.filter(
              q=>!(q.tripId===trip.id && q.recordId===item.id)
            );
          }catch(err){
            item.syncStatus='pending';
            item.lastSyncError=err?.message || String(err);
            enqueueSync(action,trip.id,type,item.id,{
              ...cloudPayloadForRecord(action,trip,item),
              spreadsheetId:trip.spreadsheetId,
              forceOverwrite:true
            });
            errors.push(
              (trip.name||'旅行')+'｜'+(item.name||item.type||item.id)+'：'+item.lastSyncError
            );
          }

          done++;
          updateBackupRestoreProgress(
            done,total,
            '同步 '+(trip.name||'旅行')+'｜'+(item.name||item.type||'紀錄')
          );
        }
      }
    }

    state.backupRestoreLocalOnly=false;
    state.backupRestoreLocalOnlyAt='';
    state.restoredFromBackupCloudAt=new Date().toISOString();
    if(lastRevision){
      lastCloudRevision=lastRevision;
      state.lastCloudRevision=lastRevision;
    }
    state.lastSyncAt=new Date().toISOString();
    persist();
    renderSettings();
    renderHome();

    const overlay=document.getElementById('backupRestoreOverlay');
    if(overlay) overlay.classList.add('hidden');
    pendingBackupRestoreSummary=null;

    if(errors.length){
      alert(
        '備份已大致同步完成，但仍有 '+errors.length+' 筆待處理。\n\n'+
        '失敗的資料已自動加入「待同步」，不需要重新匯入備份。'
      );
    }else{
      alert(
        '備份已同步回 Google Sheets。\n\n'+
        '備份中的資料已新增／更新完成；雲端原本額外存在的紀錄沒有被刪除。'
      );
    }

    goHome();
    return errors.length===0;

  }catch(err){
    alert('備份同步中斷：\n'+(err?.message || err));
    return false;
  }finally{
    if(cloudBtn){
      cloudBtn.disabled=false;
      cloudBtn.textContent='同步備份到 Google Sheets';
    }
    if(localBtn) localBtn.disabled=false;
  }
}

async function handleBackupImport(event){
  const input=event && event.target;
  const file=input && input.files ? input.files[0] : null;
  if(!file) return;

  try{
    const text=await file.text();
    const payload=JSON.parse(text);
    const data=validateTravelBackup(payload);
    const summary=backupDataSummary(data);

    const exportedAt=payload.exportedAt
      ? new Date(payload.exportedAt).toLocaleString('zh-TW')
      : '未知時間';

    const ok=confirm(
      '準備匯入備份：\n'+
      '備份時間：'+exportedAt+'\n'+
      '旅行：'+summary.tripCount+' 趟\n'+
      '紀錄：'+summary.recordCount+' 筆\n\n'+
      '這會先取代「這台裝置」目前的本機旅行資料。\n'+
      'Apps Script 網址仍會保留。\n\n'+
      '匯入完成後，你可以再選擇是否同步回 Google Sheets。\n\n'+
      '確定要繼續嗎？'
    );

    if(!ok) return;

    const currentApiUrl=state.apiUrl || '';

    state={
      ...state,
      people:[...data.people],
      cards:[...data.cards],
      trips:JSON.parse(JSON.stringify(data.trips)),
      apiUrl:currentApiUrl,
      syncQueue:[],
      lastSyncAt:data.lastSyncAt || '',
      restoredFromBackupAt:new Date().toISOString(),
      backupRestoreLocalOnly:true
    };

    // 先當成本機快照；只有使用者選擇同步雲端後才真正上傳。
    (state.trips || []).forEach(trip=>{
      trip.cloudStatus='local';
      ['expenses','pretrip','exchange'].forEach(type=>{
        (trip[type] || []).forEach(item=>{
          item.syncStatus='local';
          item.lastSyncError='';
          item.conflictCloudRecord=null;
        });
      });
    });

    currentTrip=null;
    persist();
    renderSettings();
    renderHome();
    goHome();
    showBackupRestoreChoice(payload,data);

  }catch(err){
    alert('匯入失敗：\n'+(err && err.message ? err.message : String(err)));
  }finally{
    if(input) input.value='';
  }
}
