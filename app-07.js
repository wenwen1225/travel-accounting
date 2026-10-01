renderHome();

// 啟動時：先補傳本機待同步，再從 Google Sheets 讀回最新資料
setTimeout(syncAndPullCloud, 1200);

// 網路恢復時自動補同步＋讀回
window.addEventListener('online', ()=>{
  setTimeout(syncAndPullCloud, 500);
});

// 從背景切回網站時自動補同步＋讀回
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    setTimeout(syncAndPullCloud, 500);
  }
});

// 網頁開著時每 60 秒同步一次
setInterval(syncAndPullCloud, 60000);
