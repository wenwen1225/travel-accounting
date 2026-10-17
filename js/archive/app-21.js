// v73：海外退稅標註功能。
// 僅新增退稅 UI / 記錄欄位 / 待處理清單，不改既有同步、統計、備份與記帳流程。
const TAX_REFUND_PATCH_VERSION='2026.10.04-v73';
const TAX_REFUND_STATUS_INSTANT='當下已退稅✅';
const TAX_REFUND_STATUS_NONE='無法退稅✖️';
const TAX_REFUND_STATUS_MACHINE='找機台退稅❗️';

let taxRefundSaveSnapshot=null;

function taxRefundEscapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function taxRefundInstallStyles(){
  if(document.getElementById('taxRefundV73Style')) return;
  const style=document.createElement('style');
  style.id='taxRefundV73Style';
  style.textContent=`
    .tax-refund-options{display:grid;gap:8px}
    .tax-refund-option{width:100%;text-align:left;border:1px solid #e5dff0;background:#fff;border-radius:14px;padding:11px 13px;color:#3d3647;font-weight:700;cursor:pointer;transition:.15s ease}
    .tax-refund-option.active{border-color:#b8a8eb;background:#f6f2ff;color:#604db2;box-shadow:0 4px 12px rgba(109,84,177,.08)}
    .tax-refund-machine-box{margin-top:10px;padding:12px;border-radius:14px;background:#fff7dc;border:1px solid #efd789}
    .tax-refund-machine-box .tiny{color:#7b651c;margin-top:6px}
    .tax-refund-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .tax-refund-badge{display:inline-flex;align-items:center;max-width:100%;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;line-height:1.35}
    .tax-refund-badge.instant{background:#e9f8ef;color:#2f7c4d}
    .tax-refund-badge.none{background:#fdeeee;color:#a33f3f}
    .tax-refund-badge.machine{background:#fff4cf;color:#89640e}
    .tax-refund-badge.machine-place{background:#fffaf0;color:#7a641f;border:1px solid #f0dfae;white-space:normal}
    .tax-refund-alert-card{padding:15px 16px;background:#fff6da;border:1px solid #efd680}
    .tax-refund-alert-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .tax-refund-alert-copy strong{display:block;font-size:15px}
    .tax-refund-alert-copy span{display:block;margin-top:4px;color:#7c6417;font-size:12px;line-height:1.45}
    .tax-refund-preview{display:grid;gap:8px;margin-top:12px}
    .tax-refund-preview-item{padding:10px 11px;background:rgba(255,255,255,.78);border-radius:12px}
    .tax-refund-preview-item strong{display:block;font-size:13px}
    .tax-refund-preview-item span{display:block;margin-top:3px;color:#765f18;font-size:11px;line-height:1.4}
    .tax-refund-preview-more{margin-top:8px;color:#765f18;font-size:11px;font-weight:700}
  `;
  document.head.appendChild(style);
}

function taxRefundEnsureExpenseUi(){
  taxRefundInstallStyles();
  if(document.getElementById('taxRefundGroup')) return;

  const expenseForm=document.getElementById('expenseForm');
  const note=document.getElementById('expenseNote');
  const noteGroup=note?.closest('.form-group');
  if(!expenseForm || !noteGroup) return;

  const group=document.createElement('div');
  group.id='taxRefundGroup';
  group.className='form-group';
  group.dataset.status='';
  group.innerHTML=`
    <label>退稅狀態</label>
    <div class="tax-refund-options">
      <button type="button" class="tax-refund-option" data-refund-status="${TAX_REFUND_STATUS_INSTANT}" onclick="setTaxRefundStatus('${TAX_REFUND_STATUS_INSTANT}')">${TAX_REFUND_STATUS_INSTANT}</button>
      <button type="button" class="tax-refund-option" data-refund-status="${TAX_REFUND_STATUS_NONE}" onclick="setTaxRefundStatus('${TAX_REFUND_STATUS_NONE}')">${TAX_REFUND_STATUS_NONE}</button>
      <button type="button" class="tax-refund-option" data-refund-status="${TAX_REFUND_STATUS_MACHINE}" onclick="setTaxRefundStatus('${TAX_REFUND_STATUS_MACHINE}')">${TAX_REFUND_STATUS_MACHINE}</button>
    </div>
    <div id="taxRefundMachineGroup" class="tax-refund-machine-box hidden">
      <label for="taxRefundMachine" style="font-size:13px">退稅機台／地點</label>
      <input id="taxRefundMachine" type="text" placeholder="例如：Global Tax Free｜仁川機場 T1" autocomplete="off" />
      <div class="tiny">可手動輸入不同退稅公司、機台或地點。</div>
    </div>
  `;
  expenseForm.insertBefore(group,noteGroup);
}

function setTaxRefundStatus(status){
  taxRefundEnsureExpenseUi();
  const group=document.getElementById('taxRefundGroup');
  if(!group) return;

  group.dataset.status=status || '';
  group.querySelectorAll('.tax-refund-option').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.refundStatus===status);
  });

  const machineGroup=document.getElementById('taxRefundMachineGroup');
  if(machineGroup){
    machineGroup.classList.toggle('hidden',status!==TAX_REFUND_STATUS_MACHINE);
  }
}

function taxRefundReadForm(){
  taxRefundEnsureExpenseUi();
  const status=document.getElementById('taxRefundGroup')?.dataset.status || '';
  const machine=status===TAX_REFUND_STATUS_MACHINE
    ? (document.getElementById('taxRefundMachine')?.value || '').trim()
    : '';
  return {status,machine};
}

function taxRefundApplyForm(status='',machine=''){
  taxRefundEnsureExpenseUi();
  setTaxRefundStatus(status || '');
  const input=document.getElementById('taxRefundMachine');
  if(input) input.value=machine || '';
}

function taxRefundApplyToItem(item,snapshot){
  if(!item) return item;
  const data=snapshot || {status:item.refundStatus||'',machine:item.refundMachine||''};
  item.refundStatus=data.status || '';
  item.refundMachine=data.status===TAX_REFUND_STATUS_MACHINE ? (data.machine || '') : '';
  return item;
}

function taxRefundStatusClass(status){
  if(status===TAX_REFUND_STATUS_INSTANT) return 'instant';
  if(status===TAX_REFUND_STATUS_NONE) return 'none';
  if(status===TAX_REFUND_STATUS_MACHINE) return 'machine';
  return '';
}

function taxRefundRecordBadges(item){
  const status=String(item?.refundStatus || '');
  if(!status) return '';
  const machine=String(item?.refundMachine || '');
  return `
    <div class="tax-refund-badges">
      <span class="tax-refund-badge ${taxRefundStatusClass(status)}">${taxRefundEscapeHtml(status)}</span>
      ${status===TAX_REFUND_STATUS_MACHINE && machine
        ? `<span class="tax-refund-badge machine-place">${taxRefundEscapeHtml(machine)}</span>`
        : ''}
    </div>`;
}

function taxRefundPendingItems(){
  if(!currentTrip) return [];
  return (currentTrip.expenses || [])
    .filter(item=>item.refundStatus===TAX_REFUND_STATUS_MACHINE)
    .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}

function taxRefundEnsurePendingSection(){
  const page=document.getElementById('page-trip');
  if(!page || document.getElementById('taxRefundPendingSection')) return;

  const quickAddSection=[...page.querySelectorAll('.section')].find(section=>{
    const title=section.querySelector('.section-title');
    return title && title.textContent.trim()==='快速新增';
  });
  if(!quickAddSection) return;

  const section=document.createElement('div');
  section.id='taxRefundPendingSection';
  section.className='section hidden';
  section.innerHTML=`
    <div class="card tax-refund-alert-card">
      <div class="tax-refund-alert-head">
        <div class="tax-refund-alert-copy">
          <strong>找機台退稅❗️</strong>
          <span>目前有 <b id="taxRefundPendingCount">0</b> 筆還需要找機台處理</span>
        </div>
        <button class="pill" type="button" onclick="openTaxRefundPendingList()">查看</button>
      </div>
      <div id="taxRefundPendingPreview" class="tax-refund-preview"></div>
      <div id="taxRefundPendingMore" class="tax-refund-preview-more hidden"></div>
    </div>`;

  quickAddSection.parentElement.insertBefore(section,quickAddSection);
}

function renderTaxRefundPendingSection(){
  taxRefundEnsurePendingSection();
  const section=document.getElementById('taxRefundPendingSection');
  const countEl=document.getElementById('taxRefundPendingCount');
  const preview=document.getElementById('taxRefundPendingPreview');
  const more=document.getElementById('taxRefundPendingMore');
  if(!section || !countEl || !preview || !more) return;

  const items=taxRefundPendingItems();
  section.classList.toggle('hidden',items.length===0);
  countEl.textContent=items.length;

  preview.innerHTML=items.slice(0,3).map(item=>`
    <div class="tax-refund-preview-item">
      <strong>${taxRefundEscapeHtml(item.name || '未命名商品')}</strong>
      <span>${taxRefundEscapeHtml(item.refundMachine || '尚未填寫退稅機台／地點')}</span>
    </div>`).join('');

  const remaining=Math.max(0,items.length-3);
  more.classList.toggle('hidden',remaining===0);
  more.textContent=remaining ? `另外還有 ${remaining} 筆待處理` : '';
}

function openTaxRefundPendingList(){
  if(!currentTrip) return;
  if(typeof pendingTwdQuickMode!=='undefined') pendingTwdQuickMode=false;
  if(typeof pendingTwdQuickItems!=='undefined') pendingTwdQuickItems=[];
  if(typeof pendingTwdQuickIndex!=='undefined') pendingTwdQuickIndex=0;
  if(typeof setPendingTwdQuickUi==='function') setPendingTwdQuickUi(false);

  const subtitle=document.getElementById('recordsSubtitle');
  if(subtitle) subtitle.textContent=currentTrip.name+' · 找機台退稅❗️ 待處理';

  allRecordSource=taxRefundPendingItems();
  setupRecordFilters();
  applyRecordFilters();
  showPage('page-records');
}

// 新增消費：確保退稅欄位存在，且每次開新表單時清空。
if(typeof resetExpenseForm==='function'){
  const v73BaseResetExpenseForm=resetExpenseForm;
  resetExpenseForm=function(){
    const result=v73BaseResetExpenseForm.apply(this,arguments);
    taxRefundApplyForm('','');
    return result;
  };
}

if(typeof openAdd==='function'){
  const v73BaseOpenAdd=openAdd;
  openAdd=function(type){
    const result=v73BaseOpenAdd.apply(this,arguments);
    if(['expense','credit','transit','cash'].includes(type)){
      taxRefundEnsureExpenseUi();
    }
    return result;
  };
}

// 編輯消費：帶回既有退稅狀態與機台資訊。
if(typeof editExpense==='function'){
  const v73BaseEditExpense=editExpense;
  editExpense=function(id){
    const item=(currentTrip?.expenses || []).find(x=>x.id===id);
    const result=v73BaseEditExpense.apply(this,arguments);
    taxRefundApplyForm(item?.refundStatus || '',item?.refundMachine || '');
    return result;
  };
}

// 儲存前先驗證「找機台退稅」一定有填機台／地點。
if(typeof saveExpense==='function'){
  const v73BaseSaveExpense=saveExpense;
  saveExpense=async function(){
    taxRefundEnsureExpenseUi();
    const snapshot=taxRefundReadForm();
    if(snapshot.status===TAX_REFUND_STATUS_MACHINE && !snapshot.machine){
      alert('請填寫退稅機台／地點。');
      document.getElementById('taxRefundMachine')?.focus();
      return;
    }

    const editId=typeof editingExpenseId!=='undefined' ? editingExpenseId : null;
    taxRefundSaveSnapshot=snapshot;
    try{
      const result=await v73BaseSaveExpense.apply(this,arguments);

      // 無雲端時，修改紀錄不會經過 syncRecord，這裡補上本機欄位。
      if(editId && typeof editingExpenseId!=='undefined' && editingExpenseId!==editId){
        const item=(currentTrip?.expenses || []).find(x=>x.id===editId);
        if(item){
          taxRefundApplyToItem(item,snapshot);
          persist();
          renderTaxRefundPendingSection();
        }
      }
      return result;
    }finally{
      taxRefundSaveSnapshot=null;
    }
  };
}

// 新增紀錄在第一次 persist 前就放入退稅欄位，確保離線也不會漏資料。
if(typeof confirmSaved==='function'){
  const v73BaseConfirmSaved=confirmSaved;
  confirmSaved=async function(type,item,cloudAction){
    if(type==='expenses' && item){
      taxRefundApplyToItem(item,taxRefundSaveSnapshot || taxRefundReadForm());
    }
    return v73BaseConfirmSaved.apply(this,arguments);
  };
}

// 任何消費同步前再次確保 payload 帶有退稅欄位；快速補台幣等既有更新則沿用原值。
if(typeof syncRecord==='function'){
  const v73BaseSyncRecord=syncRecord;
  syncRecord=async function(action,trip,type,item){
    if(type==='expenses' && item){
      if(taxRefundSaveSnapshot){
        taxRefundApplyToItem(item,taxRefundSaveSnapshot);
        persist();
      }else{
        item.refundStatus=item.refundStatus || '';
        item.refundMachine=item.refundStatus===TAX_REFUND_STATUS_MACHINE ? (item.refundMachine || '') : '';
      }
    }
    return v73BaseSyncRecord.apply(this,arguments);
  };
}

// 最近紀錄與全部紀錄都直接顯示退稅標籤。
if(typeof recordHtml==='function'){
  const v73BaseRecordHtml=recordHtml;
  recordHtml=function(item){
    let html=v73BaseRecordHtml.apply(this,arguments);
    if(item?.type!=='購買商品' || !item?.refundStatus) return html;
    const badges=taxRefundRecordBadges(item);
    const marker='<div style="margin-top:5px">';
    if(html.includes(marker)){
      html=html.replace(marker,badges+marker);
    }
    return html;
  };
}

// 搜尋時也可用退稅狀態／機台關鍵字找到紀錄。
if(typeof recordSearchText==='function'){
  const v73BaseRecordSearchText=recordSearchText;
  recordSearchText=function(item){
    return [
      v73BaseRecordSearchText.apply(this,arguments),
      item?.refundStatus || '',
      item?.refundMachine || ''
    ].join(' ').toLowerCase();
  };
}

// 旅行首頁另外列出「找機台退稅❗️」待處理項目。
if(typeof renderTripSummary==='function'){
  const v73BaseRenderTripSummary=renderTripSummary;
  renderTripSummary=function(){
    const result=v73BaseRenderTripSummary.apply(this,arguments);
    renderTaxRefundPendingSection();
    return result;
  };
}

// 版本顯示只更新前端版本文字，不碰後端版本相容檢查。
function taxRefundApplyFrontendVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=TAX_REFUND_PATCH_VERSION;
}

taxRefundInstallStyles();
taxRefundEnsureExpenseUi();
taxRefundEnsurePendingSection();
renderTaxRefundPendingSection();
taxRefundApplyFrontendVersion();
setTimeout(taxRefundApplyFrontendVersion,0);
