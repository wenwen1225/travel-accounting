// v63.7.4 — Read-only reconciliation of stale local sync markers.
// Never uploads transactions, merges cloud content, or deletes local records.
(()=>{
  'use strict';
  let running=false,lastAttempt=0,lastResult='';
  const $=id=>document.getElementById(id);
  function unresolved(){
    const queue=new Set((state.syncQueue||[]).map(q=>String(q.tripId)+'|'+String(q.recordId)));
    const result=[];
    for(const trip of state.trips||[]){
      for(const type of ['expenses','pretrip','exchange']){
        for(const item of trip[type]||[]){
          if(!['pending','conflict'].includes(item.syncStatus))continue;
          if(queue.has(String(trip.id)+'|'+String(item.id)))continue;
          result.push({trip,type,item});
        }
      }
    }
    return result;
  }
  const str=v=>String(v??'').trim();
  const numeric=v=>{
    if(v===null||v===undefined||str(v)==='')return null;
    const n=Number(str(v).replace(/,/g,''));return Number.isFinite(n)?n:null;
  };
  function same(local,cloud){
    if(str(local.id)!==str(cloud.id))return false;
    // Verify every populated identity/amount field that the cloud response supplies.
    const identity=['date','name','pay','person','card','place'];
    for(const key of identity){
      if(str(local[key])&&str(cloud[key])&&str(local[key])!==str(cloud[key]))return false;
    }
    for(const key of ['foreign','twd','quantity']){
      const a=numeric(local[key]),b=numeric(cloud[key]);
      if(a!==null&&b!==null&&Math.abs(a-b)>0.00001)return false;
    }
    return true;
  }
  async function reconcile(manual=false){
    if(running)return;
    if(!getApiUrl()||navigator.onLine===false)return;
    if(typeof cloudWriteCount!=='undefined'&&cloudWriteCount>0)return;
    if(typeof directRecordSyncRunning!=='undefined'&&directRecordSyncRunning)return;
    if(typeof queueSyncRunning!=='undefined'&&queueSyncRunning)return;
    if(state.backupRestoreLocalOnly)return;
    const targets=unresolved();
    if(!targets.length){if(manual)alert('目前沒有需要核對的本機同步標記。');return;}
    if(!manual&&Date.now()-lastAttempt<120000)return;
    lastAttempt=Date.now();running=true;
    const btn=$('homeCloudReconcile');
    if(btn){btn.disabled=true;btn.textContent='正在核對 Google Sheets…';}
    try{
      const data=await postToCloud({action:'getAllData'});
      if(!Array.isArray(data.trips))throw new Error('雲端未回傳旅行清單');
      let confirmed=0,unconfirmed=0;
      const liveQueue=new Set((state.syncQueue||[]).map(q=>String(q.tripId)+'|'+String(q.recordId)));
      for(const target of targets){
        if(liveQueue.has(String(target.trip.id)+'|'+String(target.item.id)))continue;
        const cloudTrip=data.trips.find(t=>str(t.id)===str(target.trip.id) && (!target.trip.spreadsheetId||!t.spreadsheetId||str(t.spreadsheetId)===str(target.trip.spreadsheetId)));
        const cloudItem=(cloudTrip?.[target.type]||[]).find(r=>str(r.id)===str(target.item.id));
        if(!cloudItem||!same(target.item,cloudItem)){unconfirmed++;continue;}
        // Do not overwrite any amount or field; only fix the stale status.
        if(!['pending','conflict'].includes(target.item.syncStatus))continue;
        target.item.syncStatus='synced';
        target.item.lastSyncError='';
        target.item.conflictCloudRecord=null;
        if(cloudItem.cloudFingerprint)target.item.cloudFingerprint=cloudItem.cloudFingerprint;
        confirmed++;
      }
      if(confirmed){
        persist();
        if(typeof renderHome==='function')renderHome();
        if(currentTrip&&typeof renderTripSummary==='function')renderTripSummary();
      }
      lastResult='核對完成：'+confirmed+' 筆已確認寫入雲端，'+unconfirmed+' 筆仍需人工核對。';
      if(manual)alert(lastResult);
    }catch(err){
      lastResult='核對失敗：'+String(err?.message||err);
      if(manual)alert(lastResult+'。本機資料未更動。');
    }finally{
      running=false;
      if(btn){btn.disabled=false;btn.textContent='核對雲端紀錄';}
      if(typeof updateHomeSyncStatus==='function')updateHomeSyncStatus();
    }
  }
  function drawButton(){
    const box=$('homeSyncStatus');
    if(!box)return;
    const parent=box.parentElement;
    if(!parent)return;
    let button=$('homeCloudReconcile');
    if(!button){
      button=document.createElement('button');button.id='homeCloudReconcile';button.type='button';
      button.style.cssText='display:none;margin-top:10px;padding:9px 13px;border:1px solid #c9b7e9;border-radius:10px;background:#f3edff;color:#7251a1;font-size:13px;font-weight:700;';
      button.textContent='核對雲端紀錄';
      button.addEventListener('click',()=>reconcile(true));
      parent.appendChild(button);
    }
    button.style.display=unresolved().length?'inline-block':'none';
  }
  function start(){
    drawButton();
    setInterval(()=>{
      drawButton();
      if(unresolved().length)reconcile(false);
    },5000);
    if(unresolved().length)setTimeout(()=>reconcile(false),1400);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})();
