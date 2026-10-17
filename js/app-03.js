const EXPENSE_CATEGORY_OPTIONS = ['餐飲','購物','交通','住宿','娛樂','專輯小卡','飾品','超商','其他（自行輸入）'];

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
      handler.includes('openTripStats') ||
      handler.includes('openTripSettlement');

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

function localTodayYmd(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function todayPaymentLabel(item){
  if(!item) return '其他';
  if(item.pay==='信用卡') return item.card ? `信用卡 · ${item.card}` : '信用卡';
  if(item.pay==='交通卡') return '交通卡';
  if(item.pay==='現金') return '現金';
  if(item.pay==='Wowpass') return 'Wowpass';
  if(item.pay==='電子支付') return '電子支付';
  return item.pay || '其他';
}

function renderTodayOverview(){
  if(!currentTrip) return;

  const today=localTodayYmd();
  const todayItems=(currentTrip.expenses || []).filter(
    item=>normalizeTripDateValue(item.date)===today
  );

  const dateEl=document.getElementById('todayOverviewDate');
  const emptyEl=document.getElementById('todayOverviewEmpty');
  const contentEl=document.getElementById('todayOverviewContent');
  const twdEl=document.getElementById('todayOverviewTwd');
  const foreignEl=document.getElementById('todayOverviewForeign');
  const countEl=document.getElementById('todayOverviewCount');
  const pendingEl=document.getElementById('todayOverviewPending');
  const paymentsEl=document.getElementById('todayOverviewPayments');

  if(dateEl) dateEl.textContent=dateWithWeekday(today);

  if(!todayItems.length){
    if(emptyEl) emptyEl.classList.remove('hidden');
    if(contentEl) contentEl.classList.add('hidden');
    return;
  }

  if(emptyEl) emptyEl.classList.add('hidden');
  if(contentEl) contentEl.classList.remove('hidden');

  const totalTwd=todayItems.reduce(
    (sum,item)=>sum+Number(item.twd || 0),
    0
  );

  const totalForeign=todayItems.reduce(
    (sum,item)=>sum+Number(item.foreign || 0),
    0
  );

  const pending=todayItems.filter(
    item=>item.twd===null || item.twd==='' || Number(item.twd)===0
  ).length;

  if(twdEl) twdEl.textContent=fmtMoney(totalTwd,'TWD');
  if(foreignEl){
    foreignEl.textContent=
      currencySymbol(currentTrip.currency)+
      Number(totalForeign).toLocaleString('en-US');
  }
  if(countEl) countEl.textContent=todayItems.length;
  if(pendingEl) pendingEl.textContent=pending;

  const paymentMap={};
  todayItems.forEach(item=>{
    const label=todayPaymentLabel(item);
    if(!paymentMap[label]){
      paymentMap[label]={
        label,
        twd:0,
        foreign:0,
        count:0
      };
    }
    paymentMap[label].count++;
    paymentMap[label].twd += Number(item.twd || 0);
    paymentMap[label].foreign += Number(item.foreign || 0);
  });

  const rows=Object.values(paymentMap).sort(
    (a,b)=>
      (b.twd||0)-(a.twd||0) ||
      (b.foreign||0)-(a.foreign||0)
  );

  if(paymentsEl){
    paymentsEl.innerHTML=rows.map(row=>`
      <div class="today-payment-row">
        <div>
          <strong>${row.label}</strong>
          <span>${row.count} 筆</span>
        </div>
        <div>
          <strong>${fmtMoney(row.twd,'TWD')}</strong>
          <span>${currencySymbol(currentTrip.currency)}${Number(row.foreign||0).toLocaleString('en-US')}</span>
        </div>
      </div>
    `).join('');
  }
}

function settlementSpendRecords(){
  if(!currentTrip) return [];
  return [
    ...(currentTrip.expenses || []),
    ...(currentTrip.pretrip || [])
  ];
}

function settlementPaymentLabel(item){
  if(!item) return '未分類';
  if(item.pay==='信用卡'){
    return item.card && item.card!=='無'
      ? '信用卡 · '+item.card
      : '信用卡';
  }
  if(item.pay==='交通卡') return '交通卡';
  if(item.pay==='現金') return '現金';
  if(item.pay==='Wowpass') return 'Wowpass';
  if(item.pay==='電子支付') return '電子支付';
  if(item.pay==='轉帳') return '轉帳';
  return item.pay || '其他';
}

function settlementMoneyRows(map){
  const rows=Object.values(map).sort(
    (a,b)=>(b.twd||0)-(a.twd||0) || (b.foreign||0)-(a.foreign||0)
  );

  if(!rows.length){
    return '<div class="empty">目前沒有可整理的支出</div>';
  }

  return rows.map(row=>`
    <div class="settlement-row">
      <div>
        <strong>${row.label}</strong>
        <span>${row.count} 筆</span>
      </div>
      <div>
        <strong>${fmtMoney(row.twd||0,'TWD')}</strong>
        <span>${currencySymbol(currentTrip.currency)}${Number(row.foreign||0).toLocaleString('en-US')}</span>
      </div>
    </div>
  `).join('');
}


function healthMedian(values){
  const nums=values.map(Number).filter(v=>Number.isFinite(v) && v>0).sort((a,b)=>a-b);
  if(!nums.length) return 0;
  const mid=Math.floor(nums.length/2);
  return nums.length%2 ? nums[mid] : (nums[mid-1]+nums[mid])/2;
}

function healthDuplicateGroups(){
  const groups=[];
  const configs=[
    ['expenses', currentTrip?.expenses || [], item =>
      [
        normalizeTripDateValue(item.date),
        normalizedRecordName(item.name),
        Number(item.foreign||0)
      ].join('|')
    ],
    ['pretrip', currentTrip?.pretrip || [], item =>
      [
        normalizeTripDateValue(item.date),
        normalizedRecordName(item.name),
        Number(item.twd||0),
        Number(item.foreign||0)
      ].join('|')
    ],
    ['exchange', currentTrip?.exchange || [], item =>
      [
        normalizeTripDateValue(item.date),
        Number(item.twd||0),
        Number(item.foreign||0)
      ].join('|')
    ]
  ];

  configs.forEach(([type,list,keyFn])=>{
    const map=new Map();
    list.forEach(item=>{
      const key=keyFn(item);
      if(!key || key.startsWith('||')) return;
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(item);
    });
    for(const items of map.values()){
      if(items.length>1) groups.push({type,items});
    }
  });
  return groups;
}

function healthMissingFieldIssues(){
  const issues=[];

  (currentTrip?.expenses || []).forEach(item=>{
    const missing=[];
    if(!normalizeTripDateValue(item.date)) missing.push('日期');
    if(!String(item.name||'').trim()) missing.push('品名');
    if(!(Number(item.qty)>0)) missing.push('數量');
    if(!(Number(item.foreign)>0)) missing.push('外幣金額');
    if(!String(item.place||'').trim()) missing.push('購買地點');
    if(!String(item.category||'').trim()) missing.push('分類');
    if(item.pay==='信用卡' && !String(item.card||'').trim()) missing.push('卡別');
    if((item.pay==='信用卡' || item.pay==='交通卡') && !String(item.person||'').trim()) missing.push('記帳人員');
    if(missing.length) issues.push({type:'expenses',item,missing});
  });

  (currentTrip?.pretrip || []).forEach(item=>{
    const missing=[];
    if(!normalizeTripDateValue(item.date)) missing.push('日期');
    if(!String(item.name||'').trim()) missing.push('項目');
    if(!String(item.person||'').trim()) missing.push('付款人員');
    if(!String(item.pay||'').trim()) missing.push('付款方式');
    if(Number(item.twd||0)<=0 && Number(item.foreign||0)<=0) missing.push('金額');
    if(item.pay==='信用卡' && (!item.card || item.card==='無')) missing.push('卡別');
    if(missing.length) issues.push({type:'pretrip',item,missing});
  });

  (currentTrip?.exchange || []).forEach(item=>{
    const missing=[];
    if(!normalizeTripDateValue(item.date)) missing.push('日期');
    if(!(Number(item.twd)>0)) missing.push('台幣金額');
    if(!(Number(item.foreign)>0)) missing.push('外幣金額');
    if(!String(item.place||'').trim()) missing.push('地點');
    if(missing.length) issues.push({type:'exchange',item,missing});
  });

  return issues;
}

function healthAnomalousAmountIssues(){
  const all=[
    ...(currentTrip?.expenses || []).map(item=>({type:'expenses',item})),
    ...(currentTrip?.pretrip || []).map(item=>({type:'pretrip',item}))
  ];

  const twdMedian=healthMedian(all.map(x=>x.item.twd));
  const foreignMedian=healthMedian(all.map(x=>x.item.foreign));

  const twdThreshold=Math.max(100000, twdMedian ? twdMedian*20 : 0);
  const foreignThreshold=Math.max(
    currentTrip?.currency==='KRW' ? 5000000 :
    currentTrip?.currency==='JPY' ? 500000 :
    currentTrip?.currency==='USD' ? 5000 :
    currentTrip?.currency==='EUR' ? 5000 :
    200000,
    foreignMedian ? foreignMedian*20 : 0
  );

  return all.filter(({item})=>{
    const twd=Number(item.twd||0);
    const foreign=Number(item.foreign||0);
    return twd>=1000000 || twd>twdThreshold || foreign>foreignThreshold;
  }).map(x=>({...x,twdThreshold,foreignThreshold}));
}

function healthRecordTitle(type,item){
  if(type==='expenses') return item.name || '未命名消費';
  if(type==='pretrip') return item.name || '未命名先前費用';
  return '換匯紀錄';
}

function healthRecordAmount(type,item){
  if(type==='exchange'){
    return fmtMoney(item.twd||0,'TWD')+' → '+currencySymbol(currentTrip.currency)+Number(item.foreign||0).toLocaleString('en-US');
  }
  const parts=[];
  if(item.twd!==null && item.twd!=='' && Number(item.twd)!==0) parts.push(fmtMoney(item.twd,'TWD'));
  if(Number(item.foreign||0)!==0) parts.push(currencySymbol(currentTrip.currency)+Number(item.foreign||0).toLocaleString('en-US'));
  return parts.join(' / ') || '未填金額';
}

function openHealthRecord(type,id){
  if(type==='expenses') return editExpense(id);
  if(type==='pretrip' && typeof editPretrip==='function') return editPretrip(id);
  if(type==='exchange' && typeof editExchange==='function') return editExchange(id);
}

function healthIssueCard(title,detail,type,item,badge='需確認'){
  const id=item?.id || '';
  return `
    <div class="card health-issue-card">
      <div class="health-issue-head">
        <div>
          <strong>${title}</strong>
          <span>${dateWithWeekday(item?.date) || '未填日期'} · ${healthRecordTitle(type,item)}</span>
        </div>
        <span class="health-issue-badge">${badge}</span>
      </div>
      <div class="health-issue-detail">${detail}</div>
      <div class="health-issue-amount">${healthRecordAmount(type,item)}</div>
      ${id ? `<button class="secondary health-open-btn" type="button" onclick="openHealthRecord('${type}','${id}')">開啟這筆紀錄</button>` : ''}
    </div>
  `;
}

function openTripHealthCheck(){
  if(!currentTrip) return;
  renderTripHealthCheck();
  showPage('page-health');
}

function renderTripHealthCheck(){
  if(!currentTrip) return;

  const expenses=currentTrip.expenses || [];
  const tripQueue=(state.syncQueue || []).filter(q=>q.tripId===currentTrip.id);
  const conflicts=tripQueue.filter(q=>q.conflictCloudRecord || q.lastError==='資料衝突：雲端版本已被修改');
  const pendingTwd=expenses.filter(item=>item.twd===null || item.twd==='' || Number(item.twd)===0);
  const missingCategory=expenses.filter(item=>!String(item.category||'').trim());
  const duplicates=healthDuplicateGroups();
  const missingFields=healthMissingFieldIssues();
  const anomalies=healthAnomalousAmountIssues();

  const subtitle=document.getElementById('healthSubtitle');
  if(subtitle) subtitle.textContent=currentTrip.name+' · '+dateWithWeekday(currentTrip.start)+' ～ '+dateWithWeekday(currentTrip.end);

  const summary=[
    {label:'待補台幣',count:pendingTwd.length,good:'都已補齊'},
    {label:'待同步',count:tripQueue.length,good:'沒有待同步'},
    {label:'同步衝突',count:conflicts.length,good:'沒有衝突'},
    {label:'缺少分類',count:missingCategory.length,good:'分類完整'},
    {label:'疑似重複',count:duplicates.length,good:'未發現重複'},
    {label:'必要欄位缺漏',count:missingFields.length,good:'欄位完整'},
    {label:'異常大額',count:anomalies.length,good:'未發現異常'}
  ];

  const summaryEl=document.getElementById('healthSummary');
  if(summaryEl){
    summaryEl.innerHTML=summary.map(x=>`
      <div class="health-summary-row ${x.count?'is-warn':'is-ok'}">
        <div class="health-summary-dot">${x.count?'!':'✓'}</div>
        <strong>${x.label}</strong>
        <span>${x.count ? x.count+' 筆' : x.good}</span>
      </div>
    `).join('');
  }

  const issueHtml=[];

  pendingTwd.slice(0,20).forEach(item=>{
    issueHtml.push(healthIssueCard(
      '待補台幣',
      '這筆消費已有外幣金額，但台幣尚未補上。',
      'expenses',item,'待補'
    ));
  });

  missingFields.slice(0,20).forEach(({type,item,missing})=>{
    issueHtml.push(healthIssueCard(
      '必要欄位缺漏',
      '缺少：'+missing.join('、'),
      type,item,'缺漏'
    ));
  });

  anomalies.slice(0,20).forEach(({type,item})=>{
    issueHtml.push(healthIssueCard(
      '疑似異常大額',
      '金額明顯高於這趟旅行的大多數紀錄，請確認是否多打一個 0、幣別或台幣欄位填反。',
      type,item,'大額'
    ));
  });

  duplicates.slice(0,10).forEach(group=>{
    const first=group.items[0];
    const names=group.items.map(x=>healthRecordTitle(group.type,x)).join('、');
    issueHtml.push(healthIssueCard(
      '疑似重複紀錄',
      '同一天、相同項目／金額出現 '+group.items.length+' 次：'+names,
      group.type,first,'重複'
    ));
  });

  const issuesEl=document.getElementById('healthIssues');
  const issueSection=document.getElementById('healthIssueSection');
  if(issuesEl){
    issuesEl.innerHTML=issueHtml.length
      ? issueHtml.join('')
      : '<div class="card health-all-clear"><div>✓</div><strong>目前沒有需要確認的紀錄</strong><span>這次健檢沒有發現缺漏、重複或異常大額。</span></div>';
  }
  if(issueSection) issueSection.classList.remove('hidden');

  const totalProblems=
    pendingTwd.length+
    tripQueue.length+
    conflicts.length+
    missingCategory.length+
    duplicates.length+
    missingFields.length+
    anomalies.length;

  const statusCard=document.getElementById('healthStatusCard');
  const statusIcon=document.getElementById('healthStatusIcon');
  const statusTitle=document.getElementById('healthStatusTitle');
  const statusText=document.getElementById('healthStatusText');

  if(statusCard){
    statusCard.classList.toggle('health-complete',totalProblems===0);
    statusCard.classList.toggle('health-warning',totalProblems>0);
  }
  if(statusIcon) statusIcon.textContent=totalProblems===0?'✓':'!';
  if(statusTitle) statusTitle.textContent=totalProblems===0?'資料目前看起來正常':'有資料需要確認';
  if(statusText){
    statusText.textContent=totalProblems===0
      ? '沒有發現待補、同步、缺漏、重複或異常大額。'
      : '共偵測到 '+totalProblems+' 個提醒；健檢只提示，不會自動修改資料。';
  }

  const pendingBtn=document.getElementById('healthPendingTwdBtn');
  if(pendingBtn){
    pendingBtn.disabled=pendingTwd.length===0 || isCurrentTripArchived();
    pendingBtn.textContent=pendingTwd.length
      ? '前往補台幣（'+pendingTwd.length+' 筆）'
      : '台幣金額已補完';
  }

  const syncBtn=document.getElementById('healthSyncBtn');
  if(syncBtn){
    syncBtn.disabled=tripQueue.length===0 || !getApiUrl() || (typeof navigator!=='undefined' && navigator.onLine===false);
    syncBtn.textContent=tripQueue.length
      ? '同步待處理資料（'+tripQueue.length+' 筆）'
      : '同步已完成';
  }
}

function openTripSettlement(){
  if(!currentTrip) return;
  renderTripSettlement();
  showPage('page-settlement');
}

function renderTripSettlement(){
  if(!currentTrip) return;

  const spendRecords=settlementSpendRecords();
  const expenses=currentTrip.expenses || [];
  const pretrip=currentTrip.pretrip || [];
  const exchange=currentTrip.exchange || [];

  const pendingTwd=expenses.filter(
    item=>item.twd===null || item.twd==='' || Number(item.twd)===0
  ).length;

  const tripQueue=(state.syncQueue || []).filter(q=>q.tripId===currentTrip.id);
  const conflictQueue=tripQueue.filter(
    q=>q.conflictCloudRecord || q.lastError==='資料衝突：雲端版本已被修改'
  );
  const pendingSync=tripQueue.length;
  const cloudConfigured=!!getApiUrl();
  const offline=typeof navigator!=='undefined' && navigator.onLine===false;

  const totalTwd=spendRecords.reduce(
    (sum,item)=>sum+Number(item.twd||0),0
  );
  const totalForeign=spendRecords.reduce(
    (sum,item)=>sum+Number(item.foreign||0),0
  );

  const subtitle=document.getElementById('settlementSubtitle');
  if(subtitle){
    subtitle.textContent=
      currentTrip.name+' · '+dateWithWeekday(currentTrip.start)+' ～ '+dateWithWeekday(currentTrip.end);
  }

  const totalTwdEl=document.getElementById('settlementTotalTwd');
  const totalForeignEl=document.getElementById('settlementTotalForeign');
  if(totalTwdEl) totalTwdEl.textContent=fmtMoney(totalTwd,'TWD');
  if(totalForeignEl){
    totalForeignEl.textContent=
      currentTrip.currency+' '+
      Number(totalForeign).toLocaleString('en-US');
  }

  const checklist=[
    {
      label:'待補台幣',
      ok:pendingTwd===0,
      value:pendingTwd===0 ? '已完成' : pendingTwd+' 筆'
    },
    {
      label:'待同步資料',
      ok:pendingSync===0,
      value:pendingSync===0 ? '已同步' : pendingSync+' 筆'
    },
    {
      label:'同步衝突',
      ok:conflictQueue.length===0,
      value:conflictQueue.length===0 ? '沒有衝突' : conflictQueue.length+' 筆'
    },
    {
      label:'網路狀態',
      ok:!offline,
      value:offline ? '目前離線' : '已連線'
    },
    {
      label:'Google Sheets',
      ok:cloudConfigured && !!currentTrip.spreadsheetId,
      value:!cloudConfigured
        ? '尚未設定同步'
        : currentTrip.spreadsheetId
          ? '已連結'
          : '尚未建立 Sheet'
    }
  ];

  const checklistEl=document.getElementById('settlementChecklist');
  if(checklistEl){
    checklistEl.innerHTML=checklist.map(item=>`
      <div class="settlement-check-row ${item.ok?'is-ok':'is-warn'}">
        <div class="settlement-check-dot">${item.ok?'✓':'!'}</div>
        <strong>${item.label}</strong>
        <span>${item.value}</span>
      </div>
    `).join('');
  }

  const unfinished=
    pendingTwd+
    pendingSync+
    conflictQueue.length+
    (offline?1:0)+
    ((!cloudConfigured || !currentTrip.spreadsheetId)?1:0);

  const statusCard=document.getElementById('settlementStatusCard');
  const statusIcon=document.getElementById('settlementStatusIcon');
  const statusTitle=document.getElementById('settlementStatusTitle');
  const statusText=document.getElementById('settlementStatusText');

  if(statusCard){
    statusCard.classList.toggle('settlement-complete',unfinished===0);
    statusCard.classList.toggle('settlement-incomplete',unfinished>0);
  }
  if(statusIcon) statusIcon.textContent=unfinished===0 ? '✓' : '!';
  if(statusTitle){
    statusTitle.textContent=unfinished===0
      ? '這趟旅行已整理完成'
      : '還有項目需要處理';
  }
  if(statusText){
    statusText.textContent=unfinished===0
      ? '台幣金額、同步與雲端資料目前都已完成。'
      : '依照下方收尾檢查逐項處理即可。';
  }

  const paymentMap={};
  spendRecords.forEach(item=>{
    const label=settlementPaymentLabel(item);
    if(!paymentMap[label]){
      paymentMap[label]={label,twd:0,foreign:0,count:0};
    }
    paymentMap[label].count++;
    paymentMap[label].twd+=Number(item.twd||0);
    paymentMap[label].foreign+=Number(item.foreign||0);
  });

  const paymentEl=document.getElementById('settlementPayments');
  if(paymentEl) paymentEl.innerHTML=settlementMoneyRows(paymentMap);

  const personMap={};
  const individualExpenses=expenses.filter(
    item=>item.pay==='信用卡' || item.pay==='交通卡'
  );

  [...individualExpenses,...pretrip].forEach(item=>{
    const label=item.person || '未指定';
    if(!personMap[label]){
      personMap[label]={label,twd:0,foreign:0,count:0};
    }
    personMap[label].count++;
    personMap[label].twd+=Number(item.twd||0);
    personMap[label].foreign+=Number(item.foreign||0);
  });

  const peopleEl=document.getElementById('settlementPeople');
  if(peopleEl){
    peopleEl.innerHTML=Object.keys(personMap).length
      ? settlementMoneyRows(personMap)
      : '<div class="empty">目前沒有可歸屬到個人的支出</div>';
  }

  const exchangeTwd=exchange.reduce(
    (sum,item)=>sum+Number(item.twd||0),0
  );
  const exchangeForeign=exchange.reduce(
    (sum,item)=>sum+Number(item.foreign||0),0
  );

  const exchangeEl=document.getElementById('settlementExchange');
  if(exchangeEl){
    exchangeEl.innerHTML=exchange.length
      ? `
        <div class="settlement-row">
          <div>
            <strong>換匯總額</strong>
            <span>${exchange.length} 筆換匯紀錄</span>
          </div>
          <div>
            <strong>${fmtMoney(exchangeTwd,'TWD')}</strong>
            <span>${currencySymbol(currentTrip.currency)}${Number(exchangeForeign).toLocaleString('en-US')}</span>
          </div>
        </div>
      `
      : '<div class="empty">這趟旅行沒有換匯紀錄</div>';
  }

  const pendingBtn=document.getElementById('settlementPendingBtn');
  if(pendingBtn){
    pendingBtn.disabled=pendingTwd===0 || isCurrentTripArchived();
    pendingBtn.textContent=pendingTwd
      ? '前往補台幣（'+pendingTwd+' 筆）'
      : '台幣金額已補完';
  }

  const syncBtn=document.getElementById('settlementSyncBtn');
  if(syncBtn){
    syncBtn.disabled=pendingSync===0 || offline || !cloudConfigured;
    syncBtn.textContent=pendingSync
      ? '立即同步待處理資料（'+pendingSync+' 筆）'
      : '同步已完成';
  }
}

function renderDailyCloseReminder(){
  if(!currentTrip) return;

  const box=document.getElementById('dailyCloseReminder');
  const subtitle=document.getElementById('dailyCloseSubtitle');
  const badge=document.getElementById('dailyCloseBadge');
  const itemsEl=document.getElementById('dailyCloseItems');
  const actionsEl=document.getElementById('dailyCloseActions');
  if(!box || !subtitle || !badge || !itemsEl || !actionsEl) return;

  const now=new Date();
  const hour=now.getHours();
  const today=localTodayYmd();
  const tripStatus=getTripStatus(currentTrip.start,currentTrip.end);

  // 每日收尾提醒只在旅行中且晚上 7 點後出現。
  if(currentTrip.archived || tripStatus.label!=='旅行中' || hour<19){
    box.classList.add('hidden');
    return;
  }

  const todayItems=(currentTrip.expenses || []).filter(
    x=>normalizeTripDateValue(x.date)===today
  );
  const todayPending=todayItems.filter(
    x=>x.twd===null || x.twd==='' || Number(x.twd)===0
  ).length;
  const todayPendingSync=todayItems.filter(
    x=>x.syncStatus==='pending'
  ).length;
  const todayConflict=todayItems.filter(
    x=>x.syncStatus==='conflict'
  ).length;

  const issues=[];
  if(todayItems.length===0){
    issues.push({
      text:'今天還沒有任何消費紀錄，確認今天是否真的沒有支出。',
      type:'warn'
    });
  }else{
    issues.push({
      text:`今天已記 ${todayItems.length} 筆消費。`,
      type:'ok'
    });
  }
  if(todayPending>0){
    issues.push({
      text:`還有 ${todayPending} 筆尚未補台幣。`,
      type:'warn'
    });
  }
  if(todayPendingSync>0){
    issues.push({
      text:`今天有 ${todayPendingSync} 筆等待同步 Google Sheets。`,
      type:'warn'
    });
  }
  if(todayConflict>0){
    issues.push({
      text:`今天有 ${todayConflict} 筆同步衝突需要處理。`,
      type:'warn'
    });
  }

  const done=
    todayItems.length>0 &&
    todayPending===0 &&
    todayPendingSync===0 &&
    todayConflict===0;

  box.classList.remove('hidden');
  subtitle.textContent=dateWithWeekday(today)+' · 晚上收尾檢查';
  badge.textContent=done ? '今日完成' : '待整理';
  badge.className='daily-close-badge '+(done?'is-done':'is-pending');

  itemsEl.innerHTML=issues.map(item=>`
    <div class="daily-close-item ${item.type}">
      <span>${item.type==='ok'?'✓':'!'}</span>
      <div>${item.text}</div>
    </div>
  `).join('');

  const actions=[];
  if(todayPending>0){
    actions.push('<button class="pill" type="button" onclick="openPendingTwd()">補台幣</button>');
  }
  if(todayPendingSync>0 || todayConflict>0){
    actions.push('<button class="pill" type="button" onclick="goSettings()">查看同步</button>');
  }
  actionsEl.innerHTML=actions.join('');
}

function renderTripSummary(){
  const expenses = currentTrip.expenses||[];
  const pretrip = currentTrip.pretrip||[];
  const totalTwd = [...expenses,...pretrip].reduce((s,x)=>s+Number(x.twd||0),0);
  const totalForeign = [...expenses,...pretrip].reduce((s,x)=>s+Number(x.foreign||0),0);
  const today = localTodayYmd();
  const todayTwd = expenses.filter(x=>x.date===today).reduce((s,x)=>s+Number(x.twd||0),0);
  document.getElementById('totalTwd').textContent = fmtMoney(totalTwd,'TWD');
  document.getElementById('totalForeign').textContent = `${currentTrip.currency} ${new Intl.NumberFormat().format(totalForeign)}`;
  document.getElementById('todayTwd').textContent = fmtMoney(todayTwd,'TWD');
  const pendingTwd = expenses.filter(x => x.twd === null || x.twd === '' || Number(x.twd) === 0).length;
  document.getElementById('pendingTwdCount').textContent = pendingTwd;
  renderTodayOverview();
  renderDailyCloseReminder();
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
        ${x.category?`<div class="record-category">${x.category}</div>`:''}
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
  setExpenseCategoryValue(item.category || '');
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

function updateExpenseCategoryCustom(){
  const select=document.getElementById('expenseCategory');
  const group=document.getElementById('expenseCategoryCustomGroup');
  if(!select || !group) return;
  group.classList.toggle('hidden',select.value!=='其他（自行輸入）');
}

function getExpenseCategoryValue(){
  const select=document.getElementById('expenseCategory');
  if(!select) return '';
  if(select.value!=='其他（自行輸入）') return select.value;
  return (document.getElementById('expenseCategoryCustom')?.value || '').trim();
}

function setExpenseCategoryValue(value){
  const select=document.getElementById('expenseCategory');
  const custom=document.getElementById('expenseCategoryCustom');
  if(!select) return;

  const v=String(value || '').trim();
  const preset=EXPENSE_CATEGORY_OPTIONS.includes(v) && v!=='其他（自行輸入）';

  select.value=preset ? v : (v ? '其他（自行輸入）' : '');
  if(custom) custom.value=preset ? '' : v;
  updateExpenseCategoryCustom();
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
  setExpenseCategoryValue('');
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

  const statsSheetStatus=document.getElementById('statsSheetSyncStatus');
  const statsSheetBtn=document.getElementById('statsSheetSyncBtn');
  if(statsSheetStatus){
    statsSheetStatus.textContent = currentTrip.spreadsheetId
      ? '可手動更新 Sheet 統計分頁'
      : '這趟旅行尚未建立 Google Sheet';
    statsSheetStatus.classList.remove('stats-sheet-sync-ok','stats-sheet-sync-error');
  }
  if(statsSheetBtn){
    statsSheetBtn.disabled = !currentTrip.spreadsheetId || !getApiUrl();
    statsSheetBtn.textContent = '更新 Sheet 統計';
  }
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


async function refreshStatsSheetManually(){
  if(!currentTrip) return;

  const btn=document.getElementById('statsSheetSyncBtn');
  const status=document.getElementById('statsSheetSyncStatus');

  if(!getApiUrl()){
    alert('請先到設定填入 Google Apps Script Web App URL。');
    return;
  }

  if(!currentTrip.spreadsheetId){
    alert('這趟旅行尚未建立 Google Sheet，請先完成同步。');
    return;
  }

  if(btn){
    btn.disabled=true;
    btn.textContent='更新中…';
  }
  if(status){
    status.textContent='正在更新 Google Sheet 的「旅行統計」分頁…';
    status.classList.remove('stats-sheet-sync-ok','stats-sheet-sync-error');
  }

  try{
    const data=await postToCloud({
      action:'refreshStats',
      spreadsheetId:currentTrip.spreadsheetId,
      clientTripId:currentTrip.id
    });

    const now=new Date();
    const time=now.toLocaleTimeString('zh-TW',{
      hour:'2-digit',
      minute:'2-digit',
      hour12:false
    });

    if(status){
      status.textContent='已更新完成 · '+time;
      status.classList.add('stats-sheet-sync-ok');
      status.classList.remove('stats-sheet-sync-error');
    }

    if(btn){
      btn.textContent='更新完成';
    }

    markSyncSuccess();

  }catch(err){
    const message=err && err.message ? err.message : String(err);
    const friendlyMessage = message==='HTTP_404'
      ? 'Apps Script Web App 網址目前無法使用，請確認設定中的 /exec 網址是最新部署版本。'
      : message;

    if(status){
      status.textContent='更新失敗：'+friendlyMessage;
      status.classList.add('stats-sheet-sync-error');
      status.classList.remove('stats-sheet-sync-ok');
    }

    alert('旅行統計更新失敗：\n'+friendlyMessage);

  }finally{
    if(btn){
      btn.disabled=false;
      if(btn.textContent==='更新中…') btn.textContent='更新 Sheet 統計';
    }
  }
}
