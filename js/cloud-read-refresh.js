// Cross-device read-only refresh. Never auto-replays the local write queue.
(()=>{
  'use strict';
  let running=false,last=0;
  async function refresh(force=false){
    if(running||!getApiUrl()||navigator.onLine===false)return false;
    if(state.backupRestoreLocalOnly)return false;
    if((state.syncQueue||[]).length)return false;
    if(typeof directRecordSyncRunning!=='undefined'&&directRecordSyncRunning)return false;
    if(typeof queueSyncRunning!=='undefined'&&queueSyncRunning)return false;
    if(typeof cloudWriteCount!=='undefined'&&cloudWriteCount>0)return false;
    if(typeof cloudPullRunning!=='undefined'&&cloudPullRunning)return false;
    if(typeof fastWriteChain!=='undefined'){
      // Pending in-flight local writes are represented by syncStatus pending.
      if((state.trips||[]).some(t=>['expenses','pretrip','exchange'].some(k=>(t[k]||[]).some(r=>r.syncStatus==='pending'))))return false;
    }
    if(!force&&Date.now()-last<60000)return false;
    last=Date.now();running=true;
    try{
      // Existing pullCloudTrips only reads getAllData and merges cloud records.
      return await pullCloudTrips({silent:true});
    }catch(err){
      console.warn('背景讀取雲端失敗',err);return false;
    }finally{running=false;}
  }
  const boot=()=>{
    setTimeout(()=>refresh(),2500);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
    window.addEventListener('online',()=>refresh(true));
    setInterval(()=>{if(!document.hidden)refresh();},90000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
