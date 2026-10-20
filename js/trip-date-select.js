// Travel-date picker: regular expenses are restricted to the trip range.
// Pretrip, exchange, fund entries and transfers retain unrestricted date pickers.
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
  function fill(selected){
    const el=$('expenseDate'),trip=typeof currentTrip!=='undefined'?currentTrip:null;
    if(!el||!trip||!valid(trip.start)||!valid(trip.end))return;
    const start=new Date(trip.start+'T12:00:00'),end=new Date(trip.end+'T12:00:00');
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)return;
    const options=[],days=Math.min(366,Math.round((end-start)/86400000)+1);
    const names=['日','一','二','三','四','五','六'];
    for(let i=0;i<days;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);
      const v=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      options.push({value:v,label:(d.getMonth()+1)+'/'+d.getDate()+'（'+names[d.getDay()]+'）'});
    }
    const desired=valid(selected)?selected:(valid(el.value)?el.value:'');
    el.replaceChildren(...options.map(o=>{const opt=document.createElement('option');opt.value=o.value;opt.textContent=o.label;return opt;}));
    const today=new Date(),todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    el.value=options.some(o=>o.value===desired)?desired:options.some(o=>o.value===todayStr)?todayStr:options.length?options[0].value:'';
  }
  function install(){
    if(typeof openAdd==='function'){
      const original=openAdd;
      window.openAdd=function(){fill();return original.apply(this,arguments);};
    }
    if(typeof editExpense==='function'){
      const original=editExpense;
      window.editExpense=function(){
        const id=arguments[0],item=(currentTrip?.expenses||[]).find(e=>String(e.id)===String(id));
        fill(item?.date);
        return original.apply(this,arguments);
      };
    }
    if(typeof resetExpenseForm==='function'){
      const original=resetExpenseForm;
      window.resetExpenseForm=function(){fill();return original.apply(this,arguments);};
    }
    fill();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
