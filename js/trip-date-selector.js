// Trip date selector: expense/exchange only. Pretrip date stays unrestricted.
(()=>{
 'use strict';
 const ids=['expenseDate','exchangeDate'];
 const fmt=s=>{const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return s;const d=new Date(+m[1],+m[2]-1,+m[3],12);return (+m[2])+'/'+(+m[3])+'（'+['日','一','二','三','四','五','六'][d.getDay()]+'）';};
 function sync(){
   const trip=typeof currentTrip!=='undefined'?currentTrip:null;
   for(const id of ids){
     const input=document.getElementById(id);if(!input)continue;
     let select=document.getElementById(id+'TripSelect');
     if(!select){
       select=document.createElement('select');select.id=id+'TripSelect';
       select.setAttribute('aria-label','選擇旅行日期');
       select.style.cssText='width:100%;min-height:44px;border-radius:10px;';
       input.insertAdjacentElement('afterend',select);
       select.addEventListener('change',()=>{input.value=select.value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
     }
     if(!trip||!trip.start||!trip.end){select.style.display='none';input.style.display='';continue;}
     const a=new Date(trip.start+'T12:00:00'),b=new Date(trip.end+'T12:00:00');
     const days=Math.round((b-a)/86400000);
     if(!Number.isFinite(days)||days<0||days>90){select.style.display='none';input.style.display='';continue;}
     const values=[];
     for(let i=0;i<=days;i++){const d=new Date(a);d.setDate(a.getDate()+i);values.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));}
     const existing=input.value;
     const signature=trip.id+'|'+trip.start+'|'+trip.end;
     if(select.dataset.signature!==signature){
       select.replaceChildren();
       for(const v of values){const option=document.createElement('option');option.value=v;option.textContent=fmt(v);select.appendChild(option);}
       select.dataset.signature=signature;
     }
     if(values.includes(existing))select.value=existing;
     else if(!values.includes(select.value)){
       const now=new Date();const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
       select.value=values.includes(today)?today:values[0];
       input.value=select.value;
     }
     input.min=trip.start;input.max=trip.end;
     input.style.display='none';select.style.display='';
   }
 }
 function init(){setInterval(sync,400);sync();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
