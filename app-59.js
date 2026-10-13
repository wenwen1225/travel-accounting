// v129：後端 v61.4 相容修正。只修正 getVersion 回應，讓 v128 任意幣別換匯辨識 v61.4；不改同步/新增/刪除核心。
(()=>{
  const VER='2026.10.13-v129-backend-61.4-compat';
  const basePostToCloud=window.postToCloud;
  if(typeof basePostToCloud==='function'){
    window.postToCloud=async function(payload){
      const result=await basePostToCloud.apply(this,arguments);
      if(payload?.action==='getVersion'){
        const build=String(result?.backendBuildVersion||'');
        if(build.includes('v61.4')){
          return {...result,backendBuildVersion:build+' v61.3-compatible'};
        }
      }
      return result;
    };
  }

  const oldRenderSettings=window.renderSettings;
  if(typeof oldRenderSettings==='function'){
    window.renderSettings=function(){
      const result=oldRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web)web.textContent=VER;
      return result;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
