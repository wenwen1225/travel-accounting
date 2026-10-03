// app-09 loader：先載入完整 v61，再疊加 v62 表單穩定性與 v63 日期選擇修正。
(()=>{
  const base=document.createElement('script');
  base.src='app-09-base-v61.js?v=61';
  base.async=false;
  base.onload=()=>{
    const patch=document.createElement('script');
    patch.src='app-10.js?v=62';
    patch.async=false;
    patch.onload=()=>{
      const datePatch=document.createElement('script');
      datePatch.src='app-11.js?v=63';
      datePatch.async=false;
      document.body.appendChild(datePatch);
    };
    document.body.appendChild(patch);
  };
  document.body.appendChild(base);
})();
