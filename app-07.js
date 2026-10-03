// v60 loader：先載入原本 app-07，再套用手機同步修正。
(function(){
  const base=document.createElement('script');
  base.src='app-07-base-v58.js?v=58';
  base.onload=()=>{
    const patch=document.createElement('script');
    patch.src='app-sync-v59.js?v=60';
    document.head.appendChild(patch);
  };
  base.onerror=()=>console.error('app-07 base load failed');
  document.head.appendChild(base);
})();
