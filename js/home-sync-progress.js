// Read-only homepage sync queue status: does not change any cloud write or queue logic.
(()=>{
  'use strict';
  const el=id=>document.getElementById(id);
  let batch=null;
  function render(){
    const box=el('homeSyncStatus'),label=el('homeSyncText'),sub=el('homeLastSync');
    if(!box||!label||!sub||typeof state==='undefined')return;
    const queue=Array.isArray(state.syncQueue)?state.syncQueue:[];
    const count=queue.length;
    const busy=typeof queueSyncRunning!=='undefined'&&queueSyncRunning;
    const direct=typeof cloudWriteCount!=='undefined'&&cloudWriteCount>0;
    const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
    const hasApi=typeof getApiUrl==='function'&&!!getApiUrl();
    let info=el('homeSyncDetails');
    if(!info){
      info=document.createElement('div');info.id='homeSyncDetails';
      info.style.cssText='font-size:12px;margin-top:5px;line-height:1.5;width:100%;';
      const copy=box.querySelector('.home-sync-copy');
      if(copy)copy.appendChild(info);else box.appendChild(info);
    }
    if(!hasApi){info.textContent='';return;}
    if(offline){
      info.textContent=count?count+' 筆尚未同步（離線保存在本機）':'目前離線';
      return;
    }
    if(busy){
      if(!batch)batch={start:count,ids:new Set(queue.map(x=>x.queueId))};
      const remaining=queue.filter(x=>batch.ids.has(x.queueId)).length;
      const done=Math.max(0,batch.start-remaining);
      const pct=batch.start?Math.round(done/batch.start*100):0;
      label.textContent='正在同步 '+done+' / '+batch.start+' 筆';
      sub.textContent=count+' 筆待同步';
      info.textContent='同步進度 '+pct+'%'+(count>remaining?'｜含 '+(count-remaining)+' 筆新待同步':'');
      return;
    }
    batch=null;
    if(direct){
      info.textContent=count+' 筆待同步｜正在上傳資料';
      return;
    }
    if(count>0){
      info.textContent=count+' 筆待同步';
      sub.textContent=count+' 筆待同步';
    }else{
      info.textContent='0 筆待同步｜100% 已同步';
    }
  }
  function install(){
    if(typeof updateHomeSyncStatus!=='function')return;
    const previous=updateHomeSyncStatus;
    updateHomeSyncStatus=function(){
      const result=previous.apply(this,arguments);
      render();
      return result;
    };
    // Queue updates already call persist(), which invokes updateHomeSyncStatus.
    // Repaint during asynchronous upload without changing the upload implementation.
    setInterval(render,600);
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
