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


async function deleteCurrentExpense(){
  if(!currentTrip || !editingExpenseId) return;
  const item = (currentTrip.expenses || []).find(x => x.id === editingExpenseId);
  if(!item) return;

  if(!confirm('確定要刪除這筆紀錄嗎？刪除後無法復原。')) return;

  if(getApiUrl() && item.syncStatus === 'synced'){
    try{
      await postToCloud({
        action:'deleteExpense',
        spreadsheetId:currentTrip.spreadsheetId || '',
        clientTripId:currentTrip.id,
        recordId:item.id
      });
    }catch(err){
      alert('Google Sheets 刪除失敗，所以這筆本機紀錄先保留。請確認 Apps Script 已更新後再試一次。');
      return;
    }
  }

  currentTrip.expenses = (currentTrip.expenses || []).filter(x => x.id !== editingExpenseId);
  state.syncQueue = (state.syncQueue || []).filter(q => q.recordId !== editingExpenseId);
  editingExpenseId = null;
  persist();
  alert('這筆紀錄已刪除。');
  openTrip(currentTrip.id);
}

async function deleteCurrentTrip(){
  if(!currentTrip) return;

  const name = currentTrip.name;
  const hasCloudSheet = !!currentTrip.spreadsheetId;

  if(!confirm(
    hasCloudSheet
      ? `確定要刪除「${name}」嗎？網站紀錄與對應的 Google Sheet 都會一起刪除，而且無法從網站復原。`
      : `確定要刪除「${name}」嗎？這趟旅行裡的所有本機紀錄都會一起刪除，而且無法復原。`
  )) return;

  if(getApiUrl() && hasCloudSheet){
    try{
      await postToCloud({
        action:'deleteTrip',
        spreadsheetId:currentTrip.spreadsheetId,
        clientTripId:currentTrip.id,
        tripName:currentTrip.name
      });
    }catch(err){
      alert('Google Sheet 刪除失敗，所以網站中的旅行先保留。請確認 Apps Script 已更新後再試一次。');
      return;
    }
  }

  const tripId = currentTrip.id;
  state.trips = state.trips.filter(t => t.id !== tripId);
  state.syncQueue = (state.syncQueue || []).filter(q => q.tripId !== tripId);
  currentTrip = null;
  persist();
  alert(hasCloudSheet ? '旅行與對應的 Google Sheet 已刪除。' : '旅行已刪除。');
  goHome();
}

async function deleteCurrentPretrip(){
  if(!currentTrip || !editingPretripId) return;
  const item=(currentTrip.pretrip||[]).find(x=>x.id===editingPretripId);
  if(!item) return;
  if(!confirm('確定要刪除這筆先前費用嗎？刪除後無法復原。')) return;
  if(getApiUrl() && item.syncStatus==='synced'){
    try{
      await postToCloud({
        action:'deletePretrip',
        spreadsheetId:currentTrip.spreadsheetId||'',
        clientTripId:currentTrip.id,
        recordId:item.id
      });
    }catch(err){
      alert('Google Sheets 刪除失敗，本機資料先保留：'+(err?.message||err));
      return;
    }
  }
  currentTrip.pretrip=(currentTrip.pretrip||[]).filter(x=>x.id!==editingPretripId);
  state.syncQueue=(state.syncQueue||[]).filter(q=>q.recordId!==editingPretripId);
  editingPretripId=null;
  persist();
  alert('這筆先前費用已刪除。');
  openTrip(currentTrip.id);
}

async function deleteCurrentExchange(){
  if(!currentTrip || !editingExchangeId) return;
  const item=(currentTrip.exchange||[]).find(x=>x.id===editingExchangeId);
  if(!item) return;
  if(!confirm('確定要刪除這筆換匯紀錄嗎？刪除後無法復原。')) return;
  if(getApiUrl() && item.syncStatus==='synced'){
    try{
      await postToCloud({
        action:'deleteExchange',
        spreadsheetId:currentTrip.spreadsheetId||'',
        clientTripId:currentTrip.id,
        recordId:item.id
      });
    }catch(err){
      alert('Google Sheets 刪除失敗，本機資料先保留：'+(err?.message||err));
      return;
    }
  }
  currentTrip.exchange=(currentTrip.exchange||[]).filter(x=>x.id!==editingExchangeId);
  state.syncQueue=(state.syncQueue||[]).filter(q=>q.recordId!==editingExchangeId);
  editingExchangeId=null;
  persist();
  alert('這筆換匯紀錄已刪除。');
  openTrip(currentTrip.id);
}

document.getElementById('tripStart').addEventListener('change', syncTripDates);
document.getElementById('tripEnd').addEventListener('change', ()=>validateTripDates(false));
syncTripDates();
