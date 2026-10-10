// v112：手動「同步待處理」改為一次自動跑完整批，不再每按一次只同步一筆。
(()=>{
  const VER='2026.10.11-v112-batch-sync';
  let batchManualSyncRunning=false;

  function refreshBatchSyncUi(){
    try{ if(typeof refreshSyncProgress==='function') refreshSyncProgress(); }catch(e){}
    try{ if(typeof updateHomeSyncStatus==='function') updateHomeSyncStatus(); }catch(e){}
    try{ if(typeof updateCloudStatusUI==='function') updateCloudStatusUI(); }catch(e){}
    try{ if(typeof renderSettings==='function') renderSettings(); }catch(e){}
    try{ if(currentTrip && typeof renderTripSummary==='function') renderTripSummary(); }catch(e){}
  }

  function markQueueFailure(q,msg){
    const live=(state.syncQueue||[]).find(x=>x.queueId===q.queueId);
    if(live){
      live.lastError=msg;
      live.lastErrorAt=new Date().toISOString();
      live.retrying=false;
    }

    const trip=getTripById(q.tripId);
    if(trip && q.action!=='createTrip'){
      const item=(trip[q.recordType]||[]).find(x=>x.id===q.recordId);
      if(item){
        item.syncStatus='pending';
        item.lastSyncError=msg;
      }
    }
  }

  syncPendingRecords=async function(options={}){
    const silent=!!options.silent;

    if(batchManualSyncRunning || queueSyncRunning || directRecordSyncRunning){
      if(!silent && typeof showQuickSaveToast==='function'){
        showQuickSaveToast('目前仍有資料同步中，完成後再試一次');
      }
      return false;
    }

    if(!getApiUrl()){
      if(!silent) alert('請先填入 Google Apps Script Web App URL。');
      return false;
    }

    if(typeof navigator!=='undefined' && navigator.onLine===false){
      if(!silent) alert('目前沒有網路連線，資料仍安全保存在手機；恢復連線後再同步即可。');
      return false;
    }

    if(!(state.syncQueue||[]).length){
      refreshBatchSyncUi();
      if(!silent) alert('目前沒有待同步資料。');
      return true;
    }

    batchManualSyncRunning=true;
    queueSyncRunning=true;

    let successCount=0;
    let failCount=0;
    const errors=[];
    const processed=new Set();

    try{
      if(typeof actualPendingSyncCount==='function' && typeof syncProgressBatchTotal!=='undefined'){
        syncProgressBatchTotal=Math.max(1,actualPendingSyncCount());
      }
      refreshBatchSyncUi();

      // 每次都從「目前仍存在的 queue」找下一筆，
      // 因此同步期間若又新增待同步資料，也能在同一輪接著處理。
      while(true){
        const q=(state.syncQueue||[]).find(x=>!processed.has(x.queueId));
        if(!q) break;
        processed.add(q.queueId);

        const trip=getTripById(q.tripId);
        if(!trip){
          removeQueued(q.queueId);
          refreshBatchSyncUi();
          continue;
        }

        try{
          let payload=q.payload||{};

          if(q.action!=='createTrip'){
            if(!trip.spreadsheetId){
              const createStillQueued=(state.syncQueue||[]).some(
                x=>x.tripId===trip.id && x.action==='createTrip' && x.queueId!==q.queueId
              );

              if(createStillQueued){
                throw new Error('等待旅行 Google Sheet 建立完成');
              }

              const ready=await ensureTripSpreadsheetReady(trip);
              if(!ready || !trip.spreadsheetId){
                throw new Error('旅行的 Google Sheet 尚未建立完成');
              }
            }

            // 以本機最新內容重建 payload，避免排隊期間資料又被修改。
            const item=(trip[q.recordType]||[]).find(x=>x.id===q.recordId);
            if(item){
              payload=cloudPayloadForRecord(q.action,trip,item);
            }else{
              payload={...payload,spreadsheetId:trip.spreadsheetId||payload.spreadsheetId||''};
            }

            if(/^update|^delete/.test(String(q.action||''))){
              payload={...payload,forceOverwrite:true};
            }
          }

          const data=await postToCloud(payload);

          if(q.action==='createTrip'){
            trip.spreadsheetId=data.spreadsheetId||trip.spreadsheetId||'';
            trip.spreadsheetUrl=data.spreadsheetUrl||trip.spreadsheetUrl||'';
            trip.cloudStatus='synced';
            trip.lastSyncError='';
          }else{
            setRecordSyncState(trip,q.recordType,q.recordId,'synced');
            const item=(trip[q.recordType]||[]).find(x=>x.id===q.recordId);
            if(item){
              item.lastSyncError='';
              item.syncStatus='synced';
              item.conflictCloudRecord=null;
              if(data?.cloudFingerprint) item.cloudFingerprint=data.cloudFingerprint;
            }
            state.syncQueue=(state.syncQueue||[]).filter(
              x=>!(x.tripId===q.tripId && x.recordId===q.recordId)
            );
          }

          removeQueued(q.queueId);
          markSyncSuccess();
          successCount++;
          persist();
          refreshBatchSyncUi();

          // 給手機 Safari / GAS 一點呼吸時間，避免連續請求太密集。
          if(typeof sleepMs==='function') await sleepMs(180);

        }catch(err){
          const msg=String(err?.message||err||'同步失敗');
          markQueueFailure(q,msg);
          failCount++;
          errors.push(msg);
          persist();
          refreshBatchSyncUi();
        }
      }

      persist();
      refreshBatchSyncUi();

      const remaining=(state.syncQueue||[]).length;
      if(!silent){
        if(remaining===0){
          alert(`全部資料已同步完成。\n共完成 ${successCount} 筆。`);
        }else{
          const detail=errors.length
            ? '\n\n未完成原因：\n'+[...new Set(errors)].slice(0,3).join('\n')
            : '';
          alert(`本次已同步 ${successCount} 筆，仍有 ${remaining} 筆待同步。${detail}`);
        }
      }

      return remaining===0;
    }finally{
      queueSyncRunning=false;
      batchManualSyncRunning=false;
      refreshBatchSyncUi();
    }
  };

  try{ window.WEB_VERSION=VER; }catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
})();
