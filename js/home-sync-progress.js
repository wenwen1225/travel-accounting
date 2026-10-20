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
    // Render each queued operation separately; never mutate the queue.
    let rows=el('homeSyncQueueRows');
    if(!rows){
      rows=document.createElement('div');
      rows.id='homeSyncQueueRows';
      rows.style.cssText='display:grid;gap:5px;margin-top:8px;text-align:left;';
      info.insertAdjacentElement('afterend',rows);
    }
    rows.replaceChildren();
    const kind={expenses:'消費紀錄',pretrip:'先前費用',exchange:'換匯紀錄',fundAccounts:'資金帳戶'};
    const action={createTrip:'建立旅行',saveExpense:'新增消費',updateExpense:'修改消費',deleteExpense:'刪除消費'};
    const currentIds=new Set(queue.map(q=>q.queueId));
    const doneIds=batch?Array.from(batch.ids).filter(id=>!currentIds.has(id)):[];
    const items=[
      ...doneIds.map(id=>({id,done:true})),
      ...queue.map(q=>({id:q.queueId,q}))
    ];
    items.slice(0,15).forEach((entry,i)=>{
      const line=document.createElement('div');
      line.style.cssText='padding:6px 8px;border-radius:7px;background:rgba(125,105,175,.08);font-size:12px;line-height:1.45;';
      const q=entry.q;
      const name=entry.done?'已完成的同步紀錄':(action[q.action]||kind[q.recordType]||q.action||'待同步紀錄');
      const stateText=entry.done?'✓ 已同步':q.lastError?'⚠ 同步失敗':busy&&i===doneIds.length?'↻ 正在處理':'○ 待同步';
      line.textContent=(i+1)+'. '+name+' — '+stateText;
      if(q&&q.lastError){line.title=String(q.lastError);line.textContent+='（可至設定查看原因）';}
      rows.appendChild(line);
    });
    if(items.length>15){
      const more=document.createElement('div');more.textContent='另有 '+(items.length-15)+' 筆，請至同步設定查看';rows.appendChild(more);
    }
    if(!hasApi){info.textContent='';rows.replaceChildren();return;}
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
    if(!busy)batch=null;
    if(direct){
      info.textContent=count+' 筆待同步｜正在上傳資料';
      return;
    }
    if(count>0){
      info.textContent=count+' 筆待同步';
      sub.textContent=count+' 筆待同步';
    }else{
      info.textContent=(typeof cloudHasNewData!=='undefined'&&cloudHasNewData)?'0 筆待上傳｜雲端有新資料待更新':'0 筆待同步｜100% 已同步';
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
