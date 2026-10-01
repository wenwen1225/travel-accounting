function openTrip(id){
  currentTrip = state.trips.find(t=>t.id===id);
  if(!currentTrip) return goHome();
  document.getElementById('tripTitle').textContent = currentTrip.name;
  document.getElementById('tripSubtitle').textContent = `${currentTrip.start} ～ ${currentTrip.end} · ${currentTrip.currency}`;
  renderTripSummary();
  showPage('page-trip');
}

function renderTripSummary(){
  const expenses = currentTrip.expenses||[];
  const pretrip = currentTrip.pretrip||[];
  const totalTwd = [...expenses,...pretrip].reduce((s,x)=>s+Number(x.twd||0),0);
  const totalForeign = expenses.reduce((s,x)=>s+Number(x.foreign||0),0);
  const today = new Date().toISOString().slice(0,10);
  const todayTwd = expenses.filter(x=>x.date===today).reduce((s,x)=>s+Number(x.twd||0),0);
  document.getElementById('totalTwd').textContent = fmtMoney(totalTwd,'TWD');
  document.getElementById('totalForeign').textContent = `${currentTrip.currency} ${new Intl.NumberFormat().format(totalForeign)}`;
  document.getElementById('todayTwd').textContent = fmtMoney(todayTwd,'TWD');
  const pendingTwd = expenses.filter(x => x.twd === null || x.twd === '' || Number(x.twd) === 0).length;
  document.getElementById('pendingTwdCount').textContent = pendingTwd;
  renderRecent();
}

function renderRecent(){
  const box = document.getElementById('recentRecords');
  const items = [...(currentTrip.expenses||[])].slice(-5).reverse();
  if(!items.length){
    box.innerHTML = `<div class="empty">還沒有消費紀錄</div>`;
    return;
  }
  box.innerHTML = items.map(recordHtml).join('');
}


function recordHtml(x){
  const foreignText = x.foreign ? `${currencySymbol(currentTrip.currency)}${Number(x.foreign).toLocaleString('en-US')}` : '';
  const twdMissing = x.type === '購買商品' && (x.twd === null || x.twd === '' || Number(x.twd) === 0);
  const twdText = twdMissing ? '<span class="pending-badge">待補台幣</span>' : fmtMoney(x.twd||0,'TWD');
  const editable = x.type === '購買商品';
  return `
    <div class="record ${editable?'editable':''}" ${editable?`onclick="editExpense('${x.id}')"`:''}>
      <div class="avatar person-avatar ${personClass(x.person||'')}">${(x.person||'?').slice(0,1).toUpperCase()}</div>
      <div class="record-main">
        <strong>${x.name || x.type || '紀錄'}</strong>
        <span>${x.date||''} · ${x.person||''}${x.pay?` · ${x.pay}`:''}${x.card?` · ${x.card}`:''}</span>
        ${x.place?`<div class="record-note">${x.place}</div>`:''}
        <div style="margin-top:5px">${syncBadgeHtml(x)}</div>
      </div>
      <div class="record-amt">
        <strong>${twdText}</strong>
        ${foreignText ? `<span>${foreignText}</span>`:''}
      </div>
    </div>`;
}

function editExpense(id){
  const item = (currentTrip.expenses||[]).find(x=>x.id===id);
  if(!item) return;
  editingExpenseId = id;
  document.getElementById('expenseForm').classList.remove('hidden');
  document.getElementById('pretripForm').classList.add('hidden');
  document.getElementById('exchangeForm').classList.add('hidden');
  fillCards();

  document.getElementById('addTitle').textContent='修改購買紀錄';
  document.getElementById('addSubtitle').textContent=`${currentTrip.name} · ${currentTrip.currency}`;
  selectedPerson = item.person;
  renderPersonChips('personChips',selectedPerson,'selectPerson');
  selectPay(item.pay || '信用卡');
  document.getElementById('expenseDate').value = item.date || '';
  document.getElementById('expenseQty').value = item.qty || 1;
  document.getElementById('expenseName').value = item.name || '';
  document.getElementById('expenseForeign').value = item.foreign ? Number(item.foreign).toLocaleString('en-US') : '';
  document.getElementById('expenseTwd').value = item.twd ? Number(item.twd).toLocaleString('en-US') : '';
  document.getElementById('expensePlace').value = item.place || '';
  document.getElementById('expenseNote').value = item.note || '';
  document.getElementById('foreignLabel').innerHTML = `外幣金額 ${currentTrip.currency} <span class="danger">*</span>`;
  document.getElementById('foreignSymbol').textContent = currencySymbol(currentTrip.currency);
  attachMoneyFormat('expenseForeign'); attachMoneyFormat('expenseTwd');
  if(item.card && [...document.getElementById('cardType').options].some(o=>o.value===item.card)){
    document.getElementById('cardType').value = item.card;
  }
  clearRequiredErrors();
  showPage('page-add');
}

function renderPersonChips(targetId, selected, setterName){
  const box = document.getElementById(targetId);
  const people = currentTrip.people || state.people;
  box.innerHTML = people.map(p=>`<button class="chip person-chip ${personClass(p)} ${p===selected?'active':''}" onclick="${setterName}('${p}')">${p}</button>`).join('');
}
function selectPerson(p){ selectedPerson=p; renderPersonChips('personChips',selectedPerson,'selectPerson'); }
function selectPretripPerson(p){ selectedPretripPerson=p; renderPersonChips('pretripPersonChips',selectedPretripPerson,'selectPretripPerson'); }

function selectPay(p){
  selectedPay=p;
  document.querySelectorAll('#paySeg button').forEach(b=>b.classList.toggle('active',b.dataset.pay===p));
  document.getElementById('cardTypeGroup').classList.toggle('hidden',p!=='信用卡');
}

function fillCards(){
  const options = state.cards.map(c=>`<option value="${c}">${c}</option>`).join('');
  document.getElementById('cardType').innerHTML = options;
  document.getElementById('pretripCard').innerHTML = `<option value="">無／不適用</option>`+options;
}


function resetExpenseForm(){
  editingExpenseId = null;
  selectedPay = '信用卡';

  const today = new Date().toISOString().slice(0,10);

  document.getElementById('expenseDate').value = today;
  document.getElementById('expenseQty').value = 1;
  document.getElementById('expenseName').value = '';
  document.getElementById('expenseForeign').value = '';
  document.getElementById('expenseTwd').value = '';
  document.getElementById('expensePlace').value = '';
  document.getElementById('expenseNote').value = '';

  if(currentTrip && currentTrip.people && currentTrip.people.length){
    selectedPerson = currentTrip.people[0];
    renderPersonChips('personChips', selectedPerson, 'selectPerson');
  }

  fillCards();
  selectPay('信用卡');

  if(state.cards && state.cards.length){
    document.getElementById('cardType').value = state.cards[0];
  }

  clearRequiredErrors();
}

