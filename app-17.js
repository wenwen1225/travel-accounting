// v69：純前端記帳體驗優化：金額鍵盤、日期分隔、複製上一筆設定、待補台幣醒目標籤。
// 不修改 syncRecord、queue、背景同步、重試或 Apps Script。
const FORMAL_FRONTEND_VERSION_V69='2026.10.03-v69';

function v69ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V69;
}

if(typeof checkBackendVersion==='function'){
  const v69BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v69BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v69ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v69BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v69BaseRenderSettings.apply(this,arguments);
    v69ApplyVersion();
    return result;
  };
}

function v69InstallStyles(){
  if(document.getElementById('v69UsabilityStyle')) return;
  const style=document.createElement('style');
  style.id='v69UsabilityStyle';
  style.textContent=`
    .v69-money-tools{display:flex;gap:8px;margin-top:7px}
    .v69-money-tools button{border:1px solid #e1d8ee;background:#fff;color:#6c5c79;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:800;min-height:34px}
    .v69-money-tools button:active{transform:scale(.98)}

    .v69-copy-wrap{margin:0 0 16px 0}
    .v69-copy-btn{width:100%;border:1px dashed #cbb9ef;background:#faf7ff;color:#7157c8;border-radius:14px;padding:11px 14px;font-size:13px;font-weight:800}
    .v69-copy-btn:disabled{opacity:.45}

    #allRecords .v69-date-separator{display:flex;align-items:center;gap:10px;margin:16px 2px 8px;color:#5d5368;font-size:13px;font-weight:900}
    #allRecords .v69-date-separator::after{content:'';height:1px;flex:1;background:#e8dfef}
    #allRecords .v69-date-separator:first-child{margin-top:2px}

    .pending-badge{display:inline-flex!important;align-items:center!important;gap:6px!important;background:#fff1dd!important;color:#a65d00!important;border:1px solid #ffc978!important;border-radius:999px!important;padding:5px 9px!important;font-size:12px!important;font-weight:900!important;line-height:1!important;white-space:nowrap!important;box-shadow:0 2px 8px rgba(191,112,0,.10)!important}
    .pending-badge::before{content:'!';display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:#f4a62a;color:#fff;font-size:11px;font-weight:900}

    .v69-mini-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:10060;background:rgba(35,31,43,.94);color:#fff;padding:10px 15px;border-radius:999px;font-size:13px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:88vw;text-align:center}
  `;
  document.head.appendChild(style);
}

function v69ShowToast(text){
  let el=document.getElementById('v69MiniToast');
  if(!el){
    el=document.createElement('div');
    el.id='v69MiniToast';
    el.className='v69-mini-toast';
    document.body.appendChild(el);
  }
  el.textContent=text;
  el.style.display='block';
  clearTimeout(v69ShowToast.timer);
  v69ShowToast.timer=setTimeout(()=>{el.style.display='none';},1800);
}

function v69MoneyInputIds(){
  return ['expenseForeign','expenseTwd','pretripTwd','pretripForeign','exchangeTwd','exchangeForeign','pendingTwdQuickInput'];
}

function v69DispatchInput(el){
  if(!el) return;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}

function v69AppendZeros(inputId){
  const input=document.getElementById(inputId);
  if(!input) return;
  const raw=String(input.value||'').replace(/[^0-9.\-]/g,'');
  if(!raw || raw==='0'){
    input.value='1,000';
  }else if(!raw.includes('.')){
    const n=Number(raw);
    input.value=Number.isFinite(n) ? (n*1000).toLocaleString('en-US') : input.value;
  }else{
    input.value=raw+'000';
  }
  v69DispatchInput(input);
  input.focus();
}

function v69ClearMoney(inputId){
  const input=document.getElementById(inputId);
  if(!input) return;
  input.value='';
  v69DispatchInput(input);
  input.focus();
}

function v69EnhanceMoneyInput(inputId){
  const input=document.getElementById(inputId);
  if(!input) return;
  input.setAttribute('inputmode','decimal');
  input.setAttribute('enterkeyhint','done');
  input.setAttribute('autocomplete','off');
  input.setAttribute('autocorrect','off');
  input.setAttribute('spellcheck','false');

  if(document.getElementById(inputId+'V69Tools')) return;
  const host=document.createElement('div');
  host.id=inputId+'V69Tools';
  host.className='v69-money-tools';
  host.innerHTML=`
    <button type="button" onclick="v69AppendZeros('${inputId}')">+000</button>
    <button type="button" onclick="v69ClearMoney('${inputId}')">清除</button>`;
  const wrap=input.closest('.money-wrap') || input;
  wrap.insertAdjacentElement('afterend',host);
}

function v69EnhanceMoneyInputs(){
  v69MoneyInputIds().forEach(v69EnhanceMoneyInput);
}

function v69LastExpense(){
  const list=currentTrip?.expenses||[];
  return list.length ? list[list.length-1] : null;
}

function v69CopyPreviousExpense(){
  if(!currentTrip || editingExpenseId) return;
  const last=v69LastExpense();
  if(!last){
    v69ShowToast('目前沒有上一筆消費可以複製');
    return;
  }

  const shared=typeof isSharedExpensePay==='function' && isSharedExpensePay(last.pay);
  if(!shared && last.person){
    selectedPerson=last.person;
    if(typeof renderPersonChips==='function') renderPersonChips('personChips',selectedPerson,'selectPerson');
  }

  if(last.pay && typeof selectPay==='function') selectPay(last.pay);

  const card=document.getElementById('cardType');
  if(card && last.card && [...card.options].some(o=>o.value===last.card)) card.value=last.card;

  const place=document.getElementById('expensePlace');
  if(place) place.value=last.place||'';

  if(typeof setExpenseCategoryValue==='function') setExpenseCategoryValue(last.category||'');

  // 品名、數量、外幣、台幣、備註刻意不複製，避免誤存上一筆內容。
  const name=document.getElementById('expenseName');
  const foreign=document.getElementById('expenseForeign');
  const twd=document.getElementById('expenseTwd');
  const note=document.getElementById('expenseNote');
  const qty=document.getElementById('expenseQty');
  if(name) name.value='';
  if(foreign) foreign.value='';
  if(twd) twd.value='';
  if(note) note.value='';
  if(qty) qty.value=1;

  v69ShowToast('已帶入上一筆的人員、付款方式、卡別、地點與分類');
}

function v69InstallCopyButton(){
  const form=document.getElementById('expenseForm');
  if(!form || document.getElementById('v69CopyPreviousWrap')) return;

  const wrap=document.createElement('div');
  wrap.id='v69CopyPreviousWrap';
  wrap.className='v69-copy-wrap';
  wrap.innerHTML='<button id="v69CopyPreviousBtn" type="button" class="v69-copy-btn" onclick="v69CopyPreviousExpense()">複製上一筆設定</button>';
  form.insertAdjacentElement('afterbegin',wrap);
}

function v69RefreshCopyButton(){
  v69InstallCopyButton();
  const wrap=document.getElementById('v69CopyPreviousWrap');
  const btn=document.getElementById('v69CopyPreviousBtn');
  if(!wrap || !btn) return;
  const show=!editingExpenseId;
  wrap.style.display=show?'block':'none';
  btn.disabled=!(currentTrip?.expenses||[]).length;
}

function v69FindRecordById(id){
  return (allRecordSource||[]).find(x=>x.id===id) ||
    (currentTrip?.expenses||[]).find(x=>x.id===id) ||
    (currentTrip?.pretrip||[]).find(x=>x.id===id) ||
    (currentTrip?.exchange||[]).find(x=>x.id===id) || null;
}

function v69ApplyDateSeparators(){
  const box=document.getElementById('allRecords');
  if(!box) return;
  box.querySelectorAll('.v69-date-separator').forEach(el=>el.remove());

  const rows=[...box.querySelectorAll('.v66-swipe-shell')];
  let lastDate='';
  rows.forEach((row,index)=>{
    const item=v69FindRecordById(row.dataset.recordId||'');
    const date=normalizeTripDateValue(item?.date||'');
    if(date && date!==lastDate){
      const sep=document.createElement('div');
      sep.className='v69-date-separator';
      sep.textContent=dateWithWeekday(date)||date;
      row.insertAdjacentElement('beforebegin',sep);
      lastDate=date;
    }

    // 日期分隔不參與白／粉交錯，資料列本身維持連續交錯。
    const pink=index%2===1;
    row.classList.toggle('v68-row-pink',pink);
    row.classList.toggle('v68-row-white',!pink);
    const content=row.querySelector('.v66-swipe-content');
    if(content){
      content.classList.toggle('v68-row-pink',pink);
      content.classList.toggle('v68-row-white',!pink);
      const card=content.firstElementChild;
      if(card){
        card.classList.toggle('v68-row-pink',pink);
        card.classList.toggle('v68-row-white',!pink);
      }
    }
  });
}

if(typeof renderRecent==='function'){
  const v69BaseRenderRecent=renderRecent;
  renderRecent=function(){
    const result=v69BaseRenderRecent.apply(this,arguments);
    requestAnimationFrame(()=>{
      if(typeof v68ApplyAlternatingRows==='function') v68ApplyAlternatingRows();
    });
    return result;
  };
}

if(typeof applyRecordFilters==='function'){
  const v69BaseApplyRecordFilters=applyRecordFilters;
  applyRecordFilters=function(){
    const result=v69BaseApplyRecordFilters.apply(this,arguments);
    requestAnimationFrame(v69ApplyDateSeparators);
    return result;
  };
}

if(typeof window.openRecords==='function'){
  const v69BaseOpenRecords=window.openRecords;
  window.openRecords=function(){
    const result=v69BaseOpenRecords.apply(this,arguments);
    setTimeout(v69ApplyDateSeparators,0);
    return result;
  };
}

if(typeof window.openAdd==='function'){
  const v69BaseOpenAdd=window.openAdd;
  window.openAdd=function(){
    const result=v69BaseOpenAdd.apply(this,arguments);
    setTimeout(()=>{
      v69EnhanceMoneyInputs();
      v69RefreshCopyButton();
    },0);
    return result;
  };
}

if(typeof window.editExpense==='function'){
  const v69BaseEditExpense=window.editExpense;
  window.editExpense=function(){
    const result=v69BaseEditExpense.apply(this,arguments);
    setTimeout(()=>{
      v69EnhanceMoneyInputs();
      v69RefreshCopyButton();
    },0);
    return result;
  };
}

v69InstallStyles();
v69EnhanceMoneyInputs();
v69InstallCopyButton();
v69ApplyVersion();
requestAnimationFrame(v69ApplyDateSeparators);
setTimeout(v69ApplyVersion,0);
