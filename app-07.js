// Stable 3 loader：原本 v58 功能 + stable2 + 表單直送/JSONP 確認。
(function(){
  const base=document.createElement('script');
  base.src='app-07-base-v58.js?v=58';
  base.onload=()=>{
    const stable=document.createElement('script');
    stable.src='app-sync-stable1.js?v=2';
    stable.onload=()=>{
      const stable3=document.createElement('script');
      stable3.src='app-sync-stable3.js?v=3';
      stable3.onerror=()=>console.error('stable3 sync patch load failed');
      document.head.appendChild(stable3);
    };
    stable.onerror=()=>console.error('stable sync patch load failed');
    document.head.appendChild(stable);
  };
  base.onerror=()=>console.error('app load failed');
  document.head.appendChild(base);
})();
