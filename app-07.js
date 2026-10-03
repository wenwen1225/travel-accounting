// Stable 1 loader：原本 v58 功能 + 手機穩定直接寫入。
(function(){
  const base=document.createElement('script');
  base.src='app-07-base-v58.js?v=58';
  base.onload=()=>{
    const stable=document.createElement('script');
    stable.src='app-sync-stable1.js?v=1';
    stable.onerror=()=>console.error('stable sync patch load failed');
    document.head.appendChild(stable);
  };
  base.onerror=()=>console.error('app load failed');
  document.head.appendChild(base);
})();
