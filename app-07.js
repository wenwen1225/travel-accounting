let connectivityHideTimer=null;

function renderConnectivityBanner(mode){
  const box=document.getElementById('connectivityBanner');
  const title=document.getElementById('connectivityTitle');
  const message=document.getElementById('connectivityMessage');
  if(!box || !title || !message) return;

  if(connectivityHideTimer){
    clearTimeout(connectivityHideTimer);
    connectivityHideTimer=null;
  }

  box.classList.remove(
    'hidden',
    'connectivity-offline',
    'connectivity-online',
    'connectivity-synced'
  );

  if(mode==='offline'){
    box.classList.add('connectivity-offline');
    title.textContent='目前離線';
    message.textContent='資料會先安全保存在這台裝置，恢復連線後會自動同步到 Google Sheets。';
    return;
  }

  if(mode==='online'){
    box.classList.add('connectivity-online');
    title.textContent='已恢復連線';
    message.textContent='正在補同步旅途中尚未上傳的資料…';
    return;
  }

  if(mode==='synced'){
    box.classList.add('connectivity-synced');
    title.textContent='已恢復連線';
    message.textContent='目前可以正常同步 Google Sheets。';
    connectivityHideTimer=setTimeout(()=>{
      box.classList.add('hidden');
    },3500);
    return;
  }

  box.classList.add('hidden');
}

function refreshConnectivityState(){
  if(typeof navigator!=='undefined' && navigator.onLine===false){
    renderConnectivityBanner('offline');
  }else{
    renderConnectivityBanner('hidden');
  }
  updateHomeSyncStatus();
  updateCloudStatusUI();
}

renderHome();
refreshConnectivityState();

// 啟動時：先補傳本機待同步，再從 Google Sheets 讀回最新資料
setTimeout(syncAndPullCloud, 1200);

window.addEventListener('offline', ()=>{
  renderConnectivityBanner('offline');
  updateHomeSyncStatus();
  updateCloudStatusUI();
});

// 網路恢復時自動補同步＋讀回
window.addEventListener('online', async ()=>{
  renderConnectivityBanner('online');
  updateHomeSyncStatus();
  updateCloudStatusUI();

  try{
    await syncAndPullCloud();
  }finally{
    if(typeof navigator==='undefined' || navigator.onLine!==false){
      renderConnectivityBanner('synced');
      updateHomeSyncStatus();
      updateCloudStatusUI();
    }
  }
});

// 從背景切回網站時自動補同步＋讀回
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    setTimeout(syncAndPullCloud, 500);
  }
});

// 網頁開著時每 60 秒同步一次
setInterval(syncAndPullCloud, 60000);


function scrollToTop(){
  window.scrollTo({top:0,behavior:'smooth'});
}

function updateScrollTopButton(){
  const btn=document.getElementById('scrollTopBtn');
  if(!btn) return;
  btn.classList.toggle('hidden',window.scrollY < 320);
}

window.addEventListener('scroll',updateScrollTopButton,{passive:true});
document.addEventListener('DOMContentLoaded',updateScrollTopButton);
