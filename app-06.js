function addCard(){
  const v=document.getElementById('newCard').value.trim();
  if(!v || state.cards.includes(v)) return;
  state.cards.push(v);persist();document.getElementById('newCard').value='';renderSettings();
}
function removeCard(v){
  if(!confirm(`刪除卡別「${v}」？既有紀錄不會被刪除。`))return;
  state.cards=state.cards.filter(x=>x!==v);persist();renderSettings();
}
function openTripSettings(){ goSettings(); }


function deleteCurrentExpense(){
  if(!currentTrip || !editingExpenseId) return;
  const item = (currentTrip.expenses || []).find(x => x.id === editingExpenseId);
  if(!item) return;

  if(getApiUrl() && item.syncStatus === 'synced'){
    alert('這筆資料已同步到 Google Sheets。雲端刪除功能會在串接 Google Sheets 時一起補上，目前先不刪除，避免雲端與網頁資料不一致。');
    return;
  }

  if(!confirm('確定要刪除這筆紀錄嗎？刪除後無法復原。')) return;

  currentTrip.expenses = (currentTrip.expenses || []).filter(x => x.id !== editingExpenseId);
  state.syncQueue = (state.syncQueue || []).filter(q => q.recordId !== editingExpenseId);
  editingExpenseId = null;
  persist();
  alert('這筆紀錄已刪除。');
  openTrip(currentTrip.id);
}

function deleteCurrentTrip(){
  if(!currentTrip) return;

  if(getApiUrl() && currentTrip.cloudStatus === 'synced'){
    alert('這趟旅行已建立 Google Sheet。雲端刪除功能會在串接 Google Sheets 時一起補上，目前先不刪除，避免資料不一致。');
    return;
  }

  const name = currentTrip.name;
  if(!confirm(`確定要刪除「${name}」嗎？這趟旅行裡的所有本機紀錄都會一起刪除，而且無法復原。`)) return;

  const tripId = currentTrip.id;
  state.trips = state.trips.filter(t => t.id !== tripId);
  state.syncQueue = (state.syncQueue || []).filter(q => q.tripId !== tripId);
  currentTrip = null;
  persist();
  alert('旅行已刪除。');
  goHome();
}


document.getElementById('tripStart').addEventListener('change', syncTripDates);
document.getElementById('tripEnd').addEventListener('change', ()=>validateTripDates(false));
syncTripDates();
