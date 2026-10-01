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

document.getElementById('tripStart').addEventListener('change', syncTripDates);
document.getElementById('tripEnd').addEventListener('change', ()=>validateTripDates(false));
syncTripDates();
