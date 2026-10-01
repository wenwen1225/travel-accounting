let statsChartData = {
  peopleStats:[],
  paymentStats:[],
  purchaseGroups:[],
  dailyRows:[],
  topDay:null
};
let statsViewMode = 'detail';

function openTrip(id){
  currentTrip = state.trips.find(t=>t.id===id);
  if(!currentTrip) return goHome();
  document.getElementById('tripTitle').textContent = currentTrip.name;
  const startText = dateWithWeekday(currentTrip.start);
  const endText = dateWithWeekday(currentTrip.end);
  document.getElementById('tripSubtitle').textContent = `${startText} ～ ${endText} · ${tripDurationText(currentTrip.start,currentTrip.end)} · ${currentTrip.currency}`;
  renderTripSummary();
  applyTransitActionVisibility();
  applyTripArchiveUi();
  showPage('page-trip');
}

function isCurrentTripArchived(){
  return !!(currentTrip && currentTrip.archived);
}

function applyTripArchiveUi(){
  if(!currentTrip) return;
  const archived=!!currentTrip.archived;

  const notice=document.getElementById('archiveNotice');
  if(notice) notice.classList.toggle('hidden',!archived);

  const archiveBtn=document.getElementById('archiveTripBtn');
  if(archiveBtn){
    archiveBtn.textContent=archived ? '解除封存' : '封存這趟旅行';
    archiveBtn.classList.toggle('archive-button-active',archived);
  }

  const deleteBtn=document.getElementById('deleteTripBtn');
  if(deleteBtn) deleteBtn.classList.toggle('hidden',archived);

  document.querySelectorAll('#page-trip .action-card').forEach(btn=>{
    const handler=btn.getAttribute('onclick') || '';
    const readonlyAllowed =
      handler.includes('openRecords') ||
      handler.includes('openTripStats');

    btn.disabled=archived && !readonlyAllowed;
    btn.classList.toggle('archive-disabled',archived && !readonlyAllowed);
  });

  const pendingBtn=document.querySelector('#page-trip .section-title .pill');
  if(pendingBtn){
    pendingBtn.disabled=false;
  }
}

function archiveReadOnlyAlert(){
  alert('這趟旅行已封存，目前只能查看。請先解除封存後再修改資料。');
}

function applyTransitActionVisibility(){
  const btn=document.getElementById('transitActionCard');
  if(!btn || !currentTrip) return;
  const supported=['KRW','JPY'].includes(currentTrip.currency);
  btn.classList.toggle('hidden',!supported);
}

function renderTripSummary(){
  const expenses = currentTrip.expenses||[];
  const pretrip = currentTrip.pretrip||[];
  const totalTwd = [...expenses,...pretrip].reduce((s,x)=>s+Number(x.twd||0),0);
  const totalForeign = [...expenses,...pretrip].reduce((s,x)=>s+Number(x.foreign||0),0);
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
  const sharedExpense = x.type==='購買商品' && isSharedExpensePay(x.pay);
  const displayPerson = sharedExpense ? '共同支出' : (x.person||'');
  const avatarText = sharedExpense ? '共' : (x.person||'?').slice(0,1).toUpperCase();
  const editable = !isCurrentTripArchived() && ['購買商品','先前費用','換匯'].includes(x.type);
  const clickAction = x.type === '購買商品'
    ? `editExpense('${x.id}')`
    : x.type === '先前費用'
      ? `editPretrip('${x.id}')`
      : x.type === '換匯'
        ? `editExchange('${x.id}')`
        : '';
  return `
    <div class="record ${editable?'editable':''}" ${editable?`onclick="${clickAction}"`:''}>
      <div class="avatar person-avatar ${sharedExpense?'':personClass(x.person||'')}">${avatarText}</div>
      <div class="record-main">
        <strong>${x.name || x.type || '紀錄'}</strong>
        <span>${dateWithWeekday(x.date)} · ${displayPerson}${x.pay?` · ${x.pay}`:''}${x.card?` · ${x.card}`:''}</span>
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
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
  const item = (currentTrip.expenses||[]).find(x=>x.id===id);
  if(!item) return;
  editingExpenseId = id;
  document.getElementById('deleteExpenseBtn').classList.remove('hidden');
  document.getElementById('expenseForm').classList.remove('hidden');
  document.getElementById('pretripForm').classList.add('hidden');
  document.getElementById('exchangeForm').classList.add('hidden');
  fillCards();

  document.getElementById('addTitle').textContent='修改購買紀錄';
  document.getElementById('addSubtitle').textContent=`${currentTrip.name} · ${currentTrip.currency}`;
  configureSharedPaymentButton();
  const sharedExpense = isSharedExpensePay(item.pay);
  const transitExpense = isTransitExpensePay(item.pay);
  document.getElementById('expensePersonGroup').classList.toggle('hidden',sharedExpense);
  document.querySelectorAll('#paySeg button').forEach(btn=>{
    const pay=btn.dataset.pay;
    let show=false;
    if(sharedExpense) show = pay==='現金' || pay===sharedPaymentMethodForCurrency(currentTrip.currency) || pay===item.pay;
    else if(transitExpense) show = pay==='交通卡';
    else show = pay==='信用卡';
    btn.classList.toggle('hidden',!show);
  });
  selectedPerson = sharedExpense ? '共同' : item.person;
  if(!sharedExpense) renderPersonChips('personChips',selectedPerson,'selectPerson');
  selectPay(item.pay || '信用卡');
  document.getElementById('expenseDate').min = currentTrip.start;
  document.getElementById('expenseDate').max = currentTrip.end;
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
function selectPretripPerson(p){
  selectedPretripPerson=p;
  const el=document.getElementById('pretripPerson');
  if(el) el.value=p;
}

function fillPretripPeople(){
  const el=document.getElementById('pretripPerson');
  if(!el || !currentTrip) return;
  const people=currentTrip.people || state.people || [];
  el.innerHTML=people.map(p=>`<option value="${p}">${p}</option>`).join('');
  if(!people.includes(selectedPretripPerson)) selectedPretripPerson=people[0] || '';
  el.value=selectedPretripPerson;
}

function updatePretripCardVisibility(){
  const pay=document.getElementById('pretripPay')?.value || '信用卡';
  const group=document.getElementById('pretripCardGroup');
  if(group) group.classList.toggle('hidden',pay!=='信用卡');
}

function sharedPaymentMethodForCurrency(currency){
  if(currency==='KRW') return 'Wowpass';
  return '電子支付';
}

function isSharedExpensePay(pay){
  return pay==='現金' || pay==='Wowpass' || pay==='電子支付';
}

function isTransitExpensePay(pay){
  return pay==='交通卡';
}

function configureSharedPaymentButton(){
  const btn=document.getElementById('sharedWalletPayBtn');
  if(!btn || !currentTrip) return;
  const method=sharedPaymentMethodForCurrency(currentTrip.currency);
  btn.dataset.pay=method;
  btn.textContent=method;
}

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
  const deleteBtn = document.getElementById('deleteExpenseBtn');
  if(deleteBtn) deleteBtn.classList.add('hidden');
  selectedPay = '信用卡';

  const defaultDate = getDefaultExpenseDate();

  document.getElementById('expenseDate').min = currentTrip ? currentTrip.start : '';
  document.getElementById('expenseDate').max = currentTrip ? currentTrip.end : '';
  document.getElementById('expenseDate').value = defaultDate;
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


function editPretrip(id){
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
  const item = (currentTrip.pretrip||[]).find(x=>x.id===id);
  if(!item) return;
  editingPretripId = id;
  document.getElementById('deletePretripBtn').classList.remove('hidden');
  document.getElementById('expenseForm').classList.add('hidden');
  document.getElementById('pretripForm').classList.remove('hidden');
  document.getElementById('exchangeForm').classList.add('hidden');
  fillCards();
  document.getElementById('addTitle').textContent='修改先前費用';
  document.getElementById('addSubtitle').textContent=currentTrip.name;
  selectedPretripPerson = item.person || currentTrip.people[0];
  fillPretripPeople();
  document.getElementById('pretripPerson').value=selectedPretripPerson;
  document.getElementById('pretripName').value=item.name||'';
  document.getElementById('pretripWebsite').value=item.website||'';
  document.getElementById('pretripDate').value=item.date||'';
  document.getElementById('pretripPay').value=item.pay||'信用卡';
  updatePretripCardVisibility();
  document.getElementById('pretripTwd').value=item.twd?Number(item.twd).toLocaleString('en-US'):'';
  document.getElementById('pretripForeign').value=item.foreign?Number(item.foreign).toLocaleString('en-US'):'';
  document.getElementById('pretripCard').value=item.card||'';
  document.getElementById('pretripNote').value=item.note||'';
  document.getElementById('pretripForeignLabel').textContent=`外幣金額 ${currentTrip.currency}`;
  document.getElementById('pretripForeignSymbol').textContent=currencySymbol(currentTrip.currency);
  showPage('page-add');
}

function editExchange(id){
  if(isCurrentTripArchived()) return archiveReadOnlyAlert();
  const item = (currentTrip.exchange||[]).find(x=>x.id===id);
  if(!item) return;
  editingExchangeId = id;
  document.getElementById('deleteExchangeBtn').classList.remove('hidden');
  document.getElementById('expenseForm').classList.add('hidden');
  document.getElementById('pretripForm').classList.add('hidden');
  document.getElementById('exchangeForm').classList.remove('hidden');
  document.getElementById('addTitle').textContent='修改換匯紀錄';
  document.getElementById('addSubtitle').textContent=currentTrip.name;
  document.getElementById('exchangeDate').value=item.date||'';
  document.getElementById('exchangeTwd').value=item.twd?Number(item.twd).toLocaleString('en-US'):'';
  document.getElementById('exchangeForeign').value=item.foreign?Number(item.foreign).toLocaleString('en-US'):'';
  document.getElementById('exchangeRate').value=item.rate||'';
  document.getElementById('exchangePlace').value=item.place||'';
  document.getElementById('exchangeNote').value=item.note||'';
  document.getElementById('exchangeForeignLabel').textContent=`${currentTrip.currency} 外幣`;
  document.getElementById('exchangeForeignSymbol').textContent=currencySymbol(currentTrip.currency);
  showPage('page-add');
}


function getLocalDateYmd(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function getDefaultExpenseDate(){
  const today = getLocalDateYmd();
  if(!currentTrip) return today;

  const start = normalizeTripDateValue(currentTrip.start);
  const end = normalizeTripDateValue(currentTrip.end);

  if(today < start) return start;
  if(today > end) return end;
  return today;
}


function statsAmount(value){
  return fmtMoney(Number(value||0),'TWD');
}

function statsKnownTwd(item){
  return item && item.twd !== null && item.twd !== '' && Number(item.twd) > 0;
}

function statsBarRows(entries,totalTwd,totalForeign,emptyText){
  if(!entries.length){
    return '<div class="empty">'+emptyText+'</div>';
  }

  const max = Math.max(...entries.map(x=>Math.max(x.twdAmount||0,x.foreignAmount||0)),1);

  return entries.map(entry=>{
    const basis = Math.max(entry.twdAmount||0, entry.foreignAmount||0);
    const width = Math.max(4,Math.round((basis/max)*100));
    const twdShare = totalTwd > 0 ? Math.round(((entry.twdAmount||0)/totalTwd)*100) : 0;
    const foreignShare = totalForeign > 0 ? Math.round(((entry.foreignAmount||0)/totalForeign)*100) : 0;

    return `
      <div class="stats-row">
        <div class="stats-row-head">
          <span>${entry.label}</span>
          <strong>${statsAmount(entry.twdAmount||0)}</strong>
        </div>
        <div class="stats-row-foreign">${currentTrip.currency} ${new Intl.NumberFormat().format(entry.foreignAmount||0)}</div>
        <div class="stats-bar"><span style="width:${width}%"></span></div>
        <div class="stats-row-meta">${entry.count} 筆 · 台幣 ${twdShare}% · 外幣 ${foreignShare}%</div>
      </div>`;
  }).join('');
}

function openTripStats(){
  if(!currentTrip) return goHome();

  // 舊旅行也主動要求雲端建立／更新「旅行統計」分頁。
  if(getApiUrl() && currentTrip.spreadsheetId){
    postToCloud({
      action:'refreshStats',
      spreadsheetId:currentTrip.spreadsheetId,
      clientTripId:currentTrip.id
    }).catch(()=>{});
  }

  const expenses = currentTrip.expenses || [];
  const pretrip = currentTrip.pretrip || [];
  const spendRecords = [...expenses,...pretrip];
  const knownRecords = spendRecords.filter(statsKnownTwd);
  const totalTwd = knownRecords.reduce((sum,item)=>sum+Number(item.twd||0),0);
  const totalForeign = spendRecords.reduce((sum,item)=>sum+Number(item.foreign||0),0);
  const pendingCount = expenses.filter(item =>
    item.twd === null || item.twd === '' || Number(item.twd) === 0
  ).length;

  document.getElementById('statsSubtitle').textContent =
    currentTrip.name + ' · ' + tripDurationText(currentTrip.start,currentTrip.end);
  document.getElementById('statsTotalTwd').textContent = statsAmount(totalTwd);
  const foreignEl = document.getElementById('statsTotalForeign');
  if(foreignEl) foreignEl.textContent = currentTrip.currency + ' ' + new Intl.NumberFormat().format(totalForeign);
  document.getElementById('statsRecordCount').textContent = spendRecords.length;
  document.getElementById('statsPendingCount').textContent = pendingCount;
  document.getElementById('statsKnownNote').textContent =
    pendingCount ? '目前以已填台幣金額的紀錄計算' : '所有消費皆已計入台幣統計';

  const personEligible = [
    ...expenses.filter(x=>x.pay==='信用卡' || x.pay==='交通卡'),
    ...pretrip.filter(x=>x.person)
  ];
  const knownPersonEligible = personEligible.filter(statsKnownTwd);

  const peopleNames = [
    ...(currentTrip.people || []),
    ...personEligible.map(x=>x.person).filter(Boolean)
  ].filter((name,index,array)=>array.indexOf(name)===index);

  const peopleStats = peopleNames.map(name=>{
    const rows = knownPersonEligible.filter(x=>x.person===name);
    const allRows = personEligible.filter(x=>x.person===name);
    return {
      label:name,
      twdAmount:rows.reduce((sum,x)=>sum+Number(x.twd||0),0),
      foreignAmount:allRows.reduce((sum,x)=>sum+Number(x.foreign||0),0),
      count:allRows.length
    };
  }).sort((a,b)=>(b.twdAmount||0)-(a.twdAmount||0) || (b.foreignAmount||0)-(a.foreignAmount||0));

  document.getElementById('statsPeople').innerHTML =
    statsBarRows(peopleStats,totalTwd,totalForeign,'目前還沒有可統計的個人支出');

  const paymentMap = {};
  spendRecords.forEach(item=>{
    const label = item.pay || '未分類';
    if(!paymentMap[label]) paymentMap[label]={label,twdAmount:0,foreignAmount:0,count:0};
    paymentMap[label].count++;
    if(statsKnownTwd(item)) paymentMap[label].twdAmount += Number(item.twd||0);
    paymentMap[label].foreignAmount += Number(item.foreign||0);
  });

  const paymentStats = Object.values(paymentMap).sort((a,b)=>(b.twdAmount||0)-(a.twdAmount||0) || (b.foreignAmount||0)-(a.foreignAmount||0));
  document.getElementById('statsPayment').innerHTML =
    statsBarRows(paymentStats,totalTwd,totalForeign,'目前還沒有付款方式資料');

  const localWalletPay = sharedPaymentMethodForCurrency(currentTrip.currency);
  const purchaseGroups = [
    {label:'信用卡個人支出', pays:['信用卡']},
    {label:'交通卡個人支出', pays:['交通卡']},
    {label:'現金共同支出', pays:['現金']},
    {label:localWalletPay+' 共同支出', pays:[localWalletPay]}
  ].map(group=>{
    const rows = expenses.filter(x=>group.pays.includes(x.pay));
    const knownRows = rows.filter(statsKnownTwd);
    return {
      label:group.label,
      twdAmount:knownRows.reduce((sum,x)=>sum+Number(x.twd||0),0),
      foreignAmount:rows.reduce((sum,x)=>sum+Number(x.foreign||0),0),
      count:rows.length
    };
  });

  const purchaseTwd = purchaseGroups.reduce((sum,x)=>sum+x.twdAmount,0);
  const purchaseForeign = purchaseGroups.reduce((sum,x)=>sum+x.foreignAmount,0);

  document.getElementById('statsShared').innerHTML =
    statsBarRows(
      purchaseGroups,
      purchaseTwd,
      purchaseForeign,
      '目前還沒有購買商品紀錄'
    );

  const start = normalizeTripDateValue(currentTrip.start);
  const end = normalizeTripDateValue(currentTrip.end);
  const daily = {};

  expenses.forEach(item=>{
    const date = normalizeTripDateValue(item.date);
    if(!date || date < start || date > end) return;
    if(!daily[date]){
      daily[date]={
        twdAmount:0,
        foreignAmount:0,
        count:0,
        byPay:{}
      };
    }

    const payLabel=item.pay || '未分類';
    if(!daily[date].byPay[payLabel]){
      daily[date].byPay[payLabel]={twdAmount:0,foreignAmount:0,count:0};
    }

    if(statsKnownTwd(item)){
      daily[date].twdAmount += Number(item.twd||0);
      daily[date].byPay[payLabel].twdAmount += Number(item.twd||0);
    }
    daily[date].foreignAmount += Number(item.foreign||0);
    daily[date].byPay[payLabel].foreignAmount += Number(item.foreign||0);
    daily[date].byPay[payLabel].count++;
    daily[date].count++;
  });

  const dailyRows = Object.entries(daily)
    .map(([date,data])=>({date,...data}))
    .sort((a,b)=>a.date.localeCompare(b.date));

  const dailyBox=document.getElementById('statsDaily');
  if(dailyBox){
    dailyBox.innerHTML = dailyRows.length
      ? dailyRows.map(day=>{
          const payOrder=['信用卡','交通卡','現金',localWalletPay];
          const payLines=payOrder
            .filter(pay=>day.byPay[pay] && day.byPay[pay].count)
            .map(pay=>{
              const d=day.byPay[pay];
              return `<div class="stats-daily-pay"><span>${pay}</span><strong>${statsAmount(d.twdAmount)}</strong><small>${currentTrip.currency} ${new Intl.NumberFormat().format(d.foreignAmount||0)}</small></div>`;
            }).join('');

          return `
            <div class="stats-daily-row">
              <div class="stats-daily-head">
                <span>${dateWithWeekday(day.date)}</span>
                <strong>${statsAmount(day.twdAmount)}</strong>
              </div>
              <div class="stats-row-foreign">${currentTrip.currency} ${new Intl.NumberFormat().format(day.foreignAmount||0)} · ${day.count} 筆</div>
              <div class="stats-daily-breakdown">${payLines}</div>
            </div>`;
        }).join('')
      : '<div class="empty">目前還沒有旅途中消費</div>';
  }

  const topDay = [...dailyRows]
    .sort((a,b)=>
      (b.twdAmount||0)-(a.twdAmount||0) ||
      (b.foreignAmount||0)-(a.foreignAmount||0)
    )[0];

  document.getElementById('statsTopDay').innerHTML = topDay
    ? `
      <div class="stats-top-day-date">${dateWithWeekday(topDay.date)}</div>
      <strong>${statsAmount(topDay.twdAmount)}</strong>
      <div class="stats-top-day-foreign">${currentTrip.currency} ${new Intl.NumberFormat().format(topDay.foreignAmount||0)}</div>
      <span>${topDay.count} 筆購買商品</span>
    `
    : '<div class="empty">目前還沒有旅途中消費</div>';

  statsChartData = {
    peopleStats,
    paymentStats,
    purchaseGroups,
    dailyRows,
    topDay
  };
  renderStatsCharts();
  setStatsView(statsViewMode || 'detail');

  showPage('page-stats');
}


function setStatsView(mode){
  statsViewMode = mode === 'chart' ? 'chart' : 'detail';

  const detailBtn=document.getElementById('statsDetailBtn');
  const chartBtn=document.getElementById('statsChartBtn');
  const detailView=document.getElementById('statsDetailView');
  const chartView=document.getElementById('statsChartView');

  if(detailBtn) detailBtn.classList.toggle('active',statsViewMode==='detail');
  if(chartBtn) chartBtn.classList.toggle('active',statsViewMode==='chart');
  if(detailView) detailView.classList.toggle('hidden',statsViewMode!=='detail');
  if(chartView) chartView.classList.toggle('hidden',statsViewMode!=='chart');

  if(statsViewMode==='chart') renderStatsCharts();
}

function weekdayShortLabel(dateStr){
  const normalized=normalizeTripDateValue(dateStr);
  if(!normalized) return '';
  const parts=normalized.split('-').map(Number);
  if(parts.length!==3 || !parts[0] || !parts[1] || !parts[2]) return '';
  const d=new Date(parts[0],parts[1]-1,parts[2],12,0,0);
  const labels=['日','一','二','三','四','五','六'];
  return labels[d.getDay()] || '';
}

function dateWithWeekday(dateStr){
  const normalized=normalizeTripDateValue(dateStr);
  const w=weekdayShortLabel(normalized);
  return normalized ? normalized + (w ? '（'+w+'）' : '') : '';
}

function chartAmountLabel(value,currency='TWD'){
  const n=Number(value||0);
  if(currency==='TWD') return 'NT$'+new Intl.NumberFormat().format(Math.round(n));
  return currency+' '+new Intl.NumberFormat().format(Math.round(n));
}

function renderHorizontalStatsChart(targetId,rows,emptyText){
  const box=document.getElementById(targetId);
  if(!box || !currentTrip) return;

  const data=(rows||[]).filter(x=>
    Number(x.twdAmount||0)>0 || Number(x.foreignAmount||0)>0
  );

  if(!data.length){
    box.innerHTML='<div class="empty">'+emptyText+'</div>';
    return;
  }

  const twdMax=Math.max(...data.map(x=>Number(x.twdAmount||0)),0);
  const foreignMax=Math.max(...data.map(x=>Number(x.foreignAmount||0)),0);
  const useTwd=twdMax>0;
  const maxValue=useTwd ? twdMax : foreignMax;

  box.innerHTML='<div class="stats-hbar-list">'+data.map(row=>{
    const value=useTwd ? Number(row.twdAmount||0) : Number(row.foreignAmount||0);
    const pct=maxValue>0 ? Math.max(4,(value/maxValue)*100) : 0;
    const local=currentTrip.currency+' '+new Intl.NumberFormat().format(Number(row.foreignAmount||0));
    return `
      <div class="stats-hbar-row">
        <div class="stats-hbar-head">
          <span>${row.label}</span>
          <strong>${useTwd ? chartAmountLabel(value) : chartAmountLabel(value,currentTrip.currency)}</strong>
        </div>
        <div class="stats-hbar-track">
          <div class="stats-hbar-fill" style="width:${pct}%"></div>
        </div>
        <div class="stats-hbar-meta">${local} · ${row.count||0} 筆</div>
      </div>`;
  }).join('')+'</div>';
}

function renderPaymentPieChart(){
  const box=document.getElementById('statsPaymentChart');
  if(!box || !currentTrip) return;

  const rows=(statsChartData.paymentStats||[]).filter(x=>
    Number(x.twdAmount||0)>0 || Number(x.foreignAmount||0)>0
  );

  const twdTotal=rows.reduce((s,x)=>s+Number(x.twdAmount||0),0);
  const foreignTotal=rows.reduce((s,x)=>s+Number(x.foreignAmount||0),0);
  const useTwd=twdTotal>0;
  const total=useTwd ? twdTotal : foreignTotal;

  if(!rows.length || total<=0){
    box.innerHTML='<div class="empty">目前還沒有付款方式資料</div>';
    return;
  }

  const palette=['#8f73d6','#b59cf0','#d0bdf7','#8db5df','#8bc8b1','#e7b47d'];
  let acc=0;
  const stops=[];
  const legend=[];

  rows.forEach((row,index)=>{
    const value=useTwd ? Number(row.twdAmount||0) : Number(row.foreignAmount||0);
    if(value<=0) return;
    const start=acc;
    const pct=(value/total)*100;
    acc+=pct;
    const color=palette[index%palette.length];
    stops.push(`${color} ${start.toFixed(2)}% ${acc.toFixed(2)}%`);
    legend.push(`
      <div class="stats-pie-legend-row">
        <span class="stats-pie-dot" style="background:${color}"></span>
        <span class="stats-pie-name">${row.label}</span>
        <strong>${pct.toFixed(1)}%</strong>
        <small>${useTwd ? chartAmountLabel(value) : chartAmountLabel(value,currentTrip.currency)}</small>
      </div>`);
  });

  box.innerHTML=`
    <div class="stats-pie-wrap">
      <div class="stats-pie" style="background:conic-gradient(${stops.join(',')})">
        <div class="stats-pie-center">
          <span>總支出</span>
          <strong>${useTwd ? chartAmountLabel(total) : chartAmountLabel(total,currentTrip.currency)}</strong>
        </div>
      </div>
      <div class="stats-pie-legend">${legend.join('')}</div>
    </div>`;
}

function renderDailyStatsChart(){
  const box=document.getElementById('statsDailyChart');
  if(!box || !currentTrip) return;

  const rows=statsChartData.dailyRows||[];
  if(!rows.length){
    box.innerHTML='<div class="empty">目前還沒有旅途中消費</div>';
    return;
  }

  const twdMax=Math.max(...rows.map(x=>Number(x.twdAmount||0)),0);
  const foreignMax=Math.max(...rows.map(x=>Number(x.foreignAmount||0)),0);
  const useTwd=twdMax>0;
  const maxValue=useTwd ? twdMax : foreignMax;

  box.innerHTML=`
    <div class="stats-bar-chart">
      ${rows.map(day=>{
        const value=useTwd ? Number(day.twdAmount||0) : Number(day.foreignAmount||0);
        const pct=maxValue>0 ? Math.max(4,(value/maxValue)*100) : 0;
        const label=day.date ? day.date.slice(5).replace('-','/')+'（'+weekdayShortLabel(day.date)+'）' : '';
        return `
          <div class="stats-bar-col">
            <div class="stats-bar-value">${useTwd ? chartAmountLabel(value) : chartAmountLabel(value,currentTrip.currency)}</div>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style="height:${pct}%"></div>
            </div>
            <div class="stats-bar-label">${label}</div>
          </div>`;
      }).join('')}
    </div>
    <div class="stats-chart-note">${useTwd ? '以已填台幣金額繪製' : '以當地幣金額繪製'}</div>`;
}

function renderTopDayStatsChart(){
  const box=document.getElementById('statsTopDayChart');
  if(!box || !currentTrip) return;

  const day=statsChartData.topDay;
  if(!day){
    box.innerHTML='<div class="empty">目前還沒有旅途中消費</div>';
    return;
  }

  box.innerHTML=`
    <div class="stats-topday-visual">
      <div class="stats-topday-date">${dateWithWeekday(day.date)}</div>
      <div class="stats-topday-big">${chartAmountLabel(day.twdAmount||0)}</div>
      <div class="stats-topday-local">${currentTrip.currency} ${new Intl.NumberFormat().format(day.foreignAmount||0)}</div>
      <div class="stats-topday-bar"><span style="width:100%"></span></div>
      <div class="stats-topday-meta">${day.count||0} 筆購買商品</div>
    </div>`;
}

function renderStatsCharts(){
  if(!currentTrip) return;

  renderHorizontalStatsChart(
    'statsPeopleChart',
    statsChartData.peopleStats,
    '目前還沒有可統計的個人支出'
  );

  renderPaymentPieChart();

  renderHorizontalStatsChart(
    'statsSharedChart',
    statsChartData.purchaseGroups,
    '目前還沒有購買商品紀錄'
  );

  renderDailyStatsChart();
  renderTopDayStatsChart();
}
