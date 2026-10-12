// v123：把 v120 舊退稅 note 自動轉成 v122 正式欄位，避免既有已完成退稅遺失。
(()=>{
  const VER='2026.10.12-v123-refund-legacy-migrate';
  const COMPLETED='機台退稅完成✅';
  const num=v=>{
    const n=Number(String(v??'').replace(/,/g,'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };

  let changed=false;
  (state?.trips||[]).forEach(trip=>{
    (trip.expenses||[]).forEach(item=>{
      const note=String(item?.note||'');
      if(item?.refundStatus!==COMPLETED && !note.includes('【退稅】'))return;
      const match=note.match(/【退稅】([^｜\n]+)｜[A-Z]{3}\s*([0-9,.]+)/);
      if(!match)return;

      if(!item.refundStatus){item.refundStatus=COMPLETED;changed=true;}
      if(!item.refundMethod){item.refundMethod=String(match[1]||'').trim();changed=true;}
      if(!(num(item.refundAmount)>0)){item.refundAmount=num(match[2]);changed=true;}

      if(item.refundMethod==='信用卡'&&!item.refundCard){
        item.refundCard=item.card||'';
        changed=true;
      }

      if(item.refundMethod==='信用卡'&&!(num(item.refundTwdAmount)>0)){
        const foreign=num(item.foreign),twd=num(item.twd),amount=num(item.refundAmount);
        if(foreign>0&&twd>0&&amount>0){
          item.refundTwdAmount=Number((amount*twd/foreign).toFixed(2));
          changed=true;
        }
      }

      if(!item.refundCompletedAt){
        item.refundCompletedAt=item.updatedAt||'';
        changed=true;
      }
    });
  });

  if(changed&&typeof persist==='function')persist();
  if(changed&&currentTrip&&typeof renderTripSummary==='function'){
    try{renderTripSummary();}catch(e){}
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web)web.textContent=VER;
  }
  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      applyVersion();
      return r;
    };
  }
  applyVersion();
})();
