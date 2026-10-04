// app-09 loader：依序載入 v61～v76。僅串接前端補丁，不修改同步主流程。
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
                  v69.onload=()=>{
                    const v70=document.createElement('script');
                    v70.src='app-18.js?v=70';
                    v70.async=false;
                    v70.onload=()=>{
                      const v71=document.createElement('script');
                      v71.src='app-19.js?v=71';
                      v71.async=false;
                      v71.onload=()=>{
                        const v72=document.createElement('script');
                        v72.src='app-20.js?v=72';
                        v72.async=false;
                        v72.onload=()=>{
                          const v73=document.createElement('script');
                          v73.src='app-21.js?v=73';
                          v73.async=false;
                          v73.onload=()=>{
                            const v74=document.createElement('script');
                            v74.src='app-22.js?v=74';
                            v74.async=false;
                            v74.onload=()=>{
                              const v76=document.createElement('script');
                              v76.src='app-23.js?v=76';
                              v76.async=false;
                              document.body.appendChild(v76);
                            };
                            document.body.appendChild(v74);
                          };
                          document.body.appendChild(v73);
                        };
                        document.body.appendChild(v72);
                      };
                      document.body.appendChild(v71);
                    };
                    document.body.appendChild(v70);
                  };
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
        document.body.appendChild(uiPatch);
      };
      document.body.appendChild(datePatch);
    };
    document.body.appendChild(patch);
  };
  document.body.appendChild(base);
})();