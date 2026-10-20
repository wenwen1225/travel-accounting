// Homepage sync visibility only. Never modifies state, queue or cloud operations.
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const kind={expenses:'消費紀錄',pretrip:'先前費用',exchange:'換匯紀錄'};
  let batch=null;
  function pendingItems(){
    const queued=Array.isArray(state.syncQueue)?state.syncQueue:[];
    const rows=queued.map(q=>{
      const trip=(state.trips||[]).find(t=>t.id===q.tripId);
      const record=(trip?.[q.recordType]||[]).find(r=>r.id===q.recordId);
      return {id:q.queueId,trip:trip?.name||'',name:record?.name||q.payload?.record?.name||kind[q.recordType]||(q.action==='createTrip'?'建立旅行':'待同步資料'),error:q.lastError||'',queued:true,working:false};
    });
    const tracked=new Set(queued.map(q=>String(q.tripId)+'|'+String(q.recordId)));
    for(const trip of state.trips||[]){
      if(trip.cloudStatus==='pending'&&!trip.spreadsheetId&&!tracked.has(String(trip.id)+'|'+String(trip.id))){
        rows.push({id:'trip:'+trip.id,trip:trip.name||'',name:'建立旅行',error:trip.lastSyncError||'',queued:false});
      }
      for(const type of ['expenses','pretrip','exchange']){
        for(const record of trip[type]||[]){
          if(!['pending','conflict'].includes(record.syncStatus))continue;
          if(tracked.has(String(trip.id)+'|'+String(record.id)))continue;
          rows.push({id:'record:'+trip.id+':'+type+':'+record.id,trip:trip.name||'',name:record.name||kind[type],error:record.lastSyncError||'',queued:false,working:true});
        }
      }
    }
    return rows;
  }
  function render(){
    if(typeof state==='undefined')return;
    const box=$('homeSyncStatus'),label=$('homeSyncText'),sub=$('homeLastSync');
    if(!box||!label||!sub)return;
    const items=pendingItems(),queue=Array.isArray(state.syncQueue)?state.syncQueue:[];
    const queuedItems=items.filter(x=>x.queued),unverifiedItems=items.filter(x=>!x.queued);
    const busy=typeof queueSyncRunning!=='undefined'&&queueSyncRunning;
    const direct=typeof cloudWriteCount!=='undefined'&&cloudWriteCount>0;
    const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
    const hasApi=typeof getApiUrl==='function'&&!!getApiUrl();
    let info=$('homeSyncDetails');
    if(!info){
      info=document.createElement('div');info.id='homeSyncDetails';
      info.style.cssText='font-size:12px;margin-top:5px;line-height:1.5;width:100%;';
      (box.querySelector('.home-sync-copy')||box).appendChild(info);
    }
    let rows=$('homeSyncQueueRows');
    if(!rows){
      rows=document.createElement('div');rows.id='homeSyncQueueRows';
      rows.style.cssText='display:grid;gap:6px;margin-top:8px;text-align:left;';
      info.insertAdjacentElement('afterend',rows);
    }
    if(busy&&!batch)batch={ids:new Set(queue.map(q=>q.queueId)),start:queue.length};
    if(!busy&&!direct)batch=null;
    const left=batch?queue.filter(q=>batch.ids.has(q.queueId)).length:0;
    const done=batch?Math.max(0,batch.start-left):0;
    const pct=batch&&batch.start?Math.round(done/batch.start*100):0;
    rows.replaceChildren();
    const complete=batch?[...batch.ids].filter(id=>!queue.some(q=>q.queueId===id)).map(id=>({id,name:'已完成的同步紀錄',done:true})): [];
    const display=[...complete,...items];
    for(const [i,item] of display.slice(0,20).entries()){
      const row=document.createElement('div');
      row.style.cssText='padding:8px 10px;border-radius:9px;background:rgba(125,105,175,.08);font-size:12px;line-height:1.5;overflow-wrap:anywhere;';
      const status=item.done?'✓ 已同步':!item.queued?'? 待核對雲端':item.error&&item.error!=='雲端同步中'?'⚠ 同步失敗':offline?'○ 離線待同步':direct?'↻ 正在同步':'○ 可重試同步';
      const head=document.createElement('div');
      head.textContent=(i+1)+'. '+item.name+' — '+status;
      row.appendChild(head);
      if(item.trip){
        const small=document.createElement('div');small.style.opacity='.72';small.textContent=item.trip;row.appendChild(small);
      }
      if(item.error&&item.error!=='雲端同步中'){
        const small=document.createElement('div');small.style.opacity='.72';small.textContent='原因：'+String(item.error).slice(0,110);row.appendChild(small);
      }
      rows.appendChild(row);
    }
    if(display.length>20){
      const more=document.createElement('div');more.textContent='另有 '+(display.length-20)+' 筆，請至同步設定查看';rows.appendChild(more);
    }
    if(!hasApi){info.textContent=items.length+' 筆本機資料尚未連接 Google Sheets';}
    else if(busy){info.textContent='同步進度 '+done+' / '+batch.start+' 筆（'+pct+'%）｜'+items.length+' 筆尚待確認';}
    else if(offline){info.textContent=items.length+' 筆尚未同步（離線保存在本機）';}
    else if(items.length){info.textContent=queuedItems.length+' 筆可重新同步｜'+unverifiedItems.length+' 筆需核對雲端'+(direct?'｜正在上傳':'');}
    else if(typeof cloudHasNewData!=='undefined'&&cloudHasNewData){info.textContent='0 筆待上傳｜雲端有新資料待更新';}
    else{info.textContent='0 筆待同步｜100% 已同步';}
    if(items.length){
      sub.textContent=queuedItems.length+' 筆待同步｜'+unverifiedItems.length+' 筆待核對';
      if(!busy&&!direct){
        box.className='home-sync-status home-sync-pending';
        if(label.textContent.includes('已全部同步')||label.textContent.includes('同步中'))label.textContent='有資料待同步或核對';
      }
    }
  }
  function install(){
    if(typeof updateHomeSyncStatus!=='function')return;
    const previous=updateHomeSyncStatus;
    updateHomeSyncStatus=function(){const result=previous.apply(this,arguments);render();return result;};
    setInterval(render,700);
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
