// v63：旅行中的記帳日期改成「短旅行日期按鈕／長旅行下拉選單」。
// 只處理日期 UI，不碰同步、queue、重試或 Apps Script。
const FORMAL_FRONTEND_VERSION_V63='2026.10.03-v63';

function v63DateRange(start,end){
  const s=parseLocalDate(normalizeTripDateValue(start));
  const e=parseLocalDate(normalizeTripDateValue(end));
  if(!s || !e || e<s) return [];
  const rows=[];
  const d=new Date(s);
  while(d<=e && rows.length<90){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    rows.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate()+1);
  }
  return rows;
}

function v63Weekday(value){
  const d=parseLocalDate(value);
  if(!d) return '';
  return ['日','一','二','三','四','五','六'][d.getDay()];
}

function v63ShortDate(value){
  const parts=String(value||'').split('-');
  if(parts.length!==3) return value||'';
  return `${Number(parts[1])}/${Number(parts[2])}（${v63Weekday(value)}）`;
}

function v63SetNativeDateValue(inputId,value){
  const input=document.getElementById(inputId);
  if(!input) return;
  input.value=value;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function v63SyncDateControl(inputId){
  const input=document.getElementById(inputId);
  const host=document.getElementById(inputId+'QuickHost');
  if(!input || !host) return;
  const selected=input.value;
  host.querySelectorAll('button[data-date]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.date===selected);
  });
  const select=host.querySelector('select[data-date-select]');
  if(select && selected) select.value=selected;
}

function v63BuildDateControl(inputId){
  const input=document.getElementById(inputId);
  if(!input || !currentTrip) return;

  const dates=v63DateRange(currentTrip.start,currentTrip.end);
  if(!dates.length) return;

  let host=document.getElementById(inputId+'QuickHost');
  if(!host){
    host=document.createElement('div');
    host.id=inputId+'QuickHost';
    host.className='v63-date-host';
    input.insertAdjacentElement('afterend',host);
  }

  input.classList.add('v63-native-date-hidden');

  let selected=input.value;
  if(!dates.includes(selected)){
    const fallback=typeof v62TripSafeDate==='function' ? v62TripSafeDate() : dates[0];
    selected=dates.includes(fallback) ? fallback : dates[0];
    input.value=selected;
  }

  if(dates.length<=7){
    host.innerHTML=`<div class="v63-date-chips">${dates.map(d=>
      `<button type="button" data-date="${d}" class="v63-date-chip${d===selected?' active':''}" onclick="v63ChooseDate('${inputId}','${d}')">${v63ShortDate(d)}</button>`
    ).join('')}</div>`;
  }else{
    host.innerHTML=`<select data-date-select onchange="v63ChooseDate('${inputId}',this.value)">${dates.map(d=>
      `<option value="${d}"${d===selected?' selected':''}>${v63ShortDate(d)}</option>`
    ).join('')}</select>`;
  }
}

function v63ChooseDate(inputId,value){
  v63SetNativeDateValue(inputId,value);
  v63SyncDateControl(inputId);
}

function v63RefreshTravelDateControls(){
  // 先前費用可能發生在出發前，所以保留原本行事曆，不限制在旅行日期。
  ['expenseDate','exchangeDate'].forEach(v63BuildDateControl);
}

function v63InstallStyles(){
  if(document.getElementById('v63DateStyle')) return;
  const style=document.createElement('style');
  style.id='v63DateStyle';
  style.textContent=`
    .v63-native-date-hidden{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;padding:0!important;border:0!important}
    .v63-date-host{width:100%}
    .v63-date-chips{display:flex;flex-wrap:wrap;gap:8px}
    .v63-date-chip{border:1px solid #ddd3ef;background:#fff;color:#655a72;border-radius:12px;padding:9px 11px;font-size:13px;font-weight:700;min-height:40px}
    .v63-date-chip.active{background:#7c5ce7;color:#fff;border-color:#7c5ce7;box-shadow:0 4px 12px rgba(124,92,231,.18)}
    .v63-date-host select{width:100%;min-height:46px;border:1px solid #ddd3ef;border-radius:12px;background:#fff;padding:0 12px;font-size:15px;color:#4e4657}
  `;
  document.head.appendChild(style);
}

const v63BaseOpenAdd=window.openAdd;
window.openAdd=function(type){
  const result=v63BaseOpenAdd(type);
  if(['expense','credit','transit','cash','exchange'].includes(type)){
    setTimeout(v63RefreshTravelDateControls,0);
  }
  return result;
};

if(typeof window.editExpense==='function'){
  const v63BaseEditExpense=window.editExpense;
  window.editExpense=function(id){
    const result=v63BaseEditExpense(id);
    setTimeout(()=>{ v63BuildDateControl('expenseDate'); v63SyncDateControl('expenseDate'); },0);
    return result;
  };
}

if(typeof window.editExchange==='function'){
  const v63BaseEditExchange=window.editExchange;
  window.editExchange=function(id){
    const result=v63BaseEditExchange(id);
    setTimeout(()=>{ v63BuildDateControl('exchangeDate'); v63SyncDateControl('exchangeDate'); },0);
    return result;
  };
}

function v63ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V63;
}

if(typeof renderSettings==='function'){
  const v63BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v63BaseRenderSettings.apply(this,arguments);
    v63ApplyVersion();
    return result;
  };
}

v63InstallStyles();
v63ApplyVersion();
setTimeout(v63ApplyVersion,0);
