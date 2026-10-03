// v62 loader：先載入原本 app-07，再套用 v61 與 v62 手機同步修正。
(function(){
  const base=document.createElement('script');
  base.src='app-07-base-v58.js?v=58';
  base.onload=()=>{
    const patch61=document.createElement('script');
    patch61.src='app-sync-v61.js?v=61';
    patch61.onload=()=>{
      const patch62=document.createElement('script');
      patch62.src='app-sync-v62.js?v=62';
      document.head.appendChild(patch62);
    };
    document.head.appendChild(patch61);
  };
  base.onerror=()=>console.error('app-07 base load failed');
  document.head.appendChild(base);
})();
