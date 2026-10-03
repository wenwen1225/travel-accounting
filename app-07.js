// v64 loader：先載入原本 app-07，再套用 v61、v62、v63 與後端 v53 配套修正。
(function(){
  const base=document.createElement('script');
  base.src='app-07-base-v58.js?v=58';
  base.onload=()=>{
    const patch61=document.createElement('script');
    patch61.src='app-sync-v61.js?v=61';
    patch61.onload=()=>{
      const patch62=document.createElement('script');
      patch62.src='app-sync-v62.js?v=62';
      patch62.onload=()=>{
        const patch63=document.createElement('script');
        patch63.src='app-sync-v63.js?v=63';
        patch63.onload=()=>{
          const patch64=document.createElement('script');
          patch64.src='app-sync-v64.js?v=64';
          document.head.appendChild(patch64);
        };
        document.head.appendChild(patch63);
      };
      document.head.appendChild(patch62);
    };
    document.head.appendChild(patch61);
  };
  base.onerror=()=>console.error('app-07 base load failed');
  document.head.appendChild(base);
})();
