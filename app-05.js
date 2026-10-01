async function saveExpense(){
  clearRequiredErrors();
  const okDate = requireTextField('expenseDate','請選擇日期');
  const okQty = requireNumberField('expenseQty','請填寫大於 0 的數量');
  const okName = requireTextField('expenseName','請填寫品名');
  const okForeign = requireNumberField('expenseForeign','請填寫外幣金額');
  const okPlace = requireTextField('expensePlace','請填寫購買地點');
  if(!(okDate && okQty && okName && okForeign && okPlace)) return;

  const expenseDateValue=document.getElementById('expenseDate').value;
  if(expenseDateValue < currentTrip.start || expenseDateValue > currentTrip.end){
    alert(`購買商品日期只能填在旅行期間：${currentTrip.start} ～ ${currentTrip.end}`);
    return;
  }

  const twdRaw = rawNumber(document.getElementById('expenseTwd').value);
  const item = {
    id: editingExpenseId || ('e_' + Date.now()),
    type:'購買商品',
    person:selectedPerson,
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
  const item = {
    id:editingPretripId || ('p_'+Date.now()),
    type:'先前費用',
    person:selectedPretripPerson,
    name,date,
    pay:document.getElementById('pretripPay').value,
    twd:Number(rawNumber(document.getElementById('pretripTwd').value)||0),
    foreign:Number(rawNumber(document.getElementById('pretripForeign').value)||0),
    card:document.getElementById('pretripCard').value,
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

function openRecords(){
  document.getElementById('recordsSubtitle').textContent = currentTrip.name + ' · 點任一紀錄可修改或刪除';
  const all = [
    ...(currentTrip.expenses||[]),
    ...(currentTrip.pretrip||[]),
    ...(currentTrip.exchange||[])
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const box=document.getElementById('allRecords');
  box.innerHTML = all.length ? all.map(recordHtml).join('') : `<div class="empty">還沒有紀錄</div>`;
  showPage('page-records');
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
