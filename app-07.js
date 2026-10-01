renderHome();

setTimeout(autoSyncPendingRecords, 1200);

window.addEventListener('online', ()=>{
  setTimeout(autoSyncPendingRecords, 500);
});

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    setTimeout(autoSyncPendingRecords, 500);
  }
});

// 網頁開著時每 60 秒檢查一次待同步資料
setInterval(autoSyncPendingRecords, 60000);
