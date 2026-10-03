// app-09 loader：依序載入 v61 基底、v62 表單穩定、v63 日期選擇、v64/v65 UI、v66 刪除/版本、v67 自由日期與雲端刪除、v68 列表交錯底色，再以 v69 補上純前端記帳體驗優化。
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
      datePatch.onload=()=>{
        const uiPatch=document.createElement('script');
        uiPatch.src='app-12.js?v=64';
        uiPatch.async=false;
        uiPatch.onload=()=>{
          const swipePatch=document.createElement('script');
          swipePatch.src='app-13.js?v=65';
          swipePatch.async=false;
          swipePatch.onload=()=>{
            const v66=document.createElement('script');
            v66.src='app-14.js?v=66';
            v66.async=false;
            v66.onload=()=>{
              const v67=document.createElement('script');
              v67.src='app-15.js?v=67';
              v67.async=false;
              v67.onload=()=>{
                const v68=document.createElement('script');
                v68.src='app-16.js?v=68';
                v68.async=false;
                v68.onload=()=>{
                  const v69=document.createElement('script');
                  v69.src='app-17.js?v=69';
                  v69.async=false;
                  document.body.appendChild(v69);
                };
                document.body.appendChild(v68);
              };
              document.body.appendChild(v67);
            };
            document.body.appendChild(v66);
          };
          document.body.appendChild(swipePatch);
        };
        document.body.appendChild(datePatch);
      };
      document.body.appendChild(patch);
    };
    document.body.appendChild(base);
  };
  document.body.appendChild(base);
})();
