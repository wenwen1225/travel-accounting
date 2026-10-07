// v109：TOSS 記帳支援與現金相同的匯率換算；WOWPASS 維持不變。
// 僅擴充既有 v61SupportedRatePay 判斷，不新增事件、不修改同步或資金核心。
(()=>{
  const VER='2026.10.07-v109';

  // v61 的匯率 UI / 計算流程本來就共用這個判斷；加入 Toss 即可沿用現金同一套換算。
  if(typeof window.v61SupportedRatePay==='function'){
    window.v61SupportedRatePay=function(){
      return ['信用卡','交通卡','現金','Toss'].includes(selectedPay);
    };
  }else if(typeof v61SupportedRatePay==='function'){
    v61SupportedRatePay=function(){
      return ['信用卡','交通卡','現金','Toss'].includes(selectedPay);
    };
  }

  // 若使用者剛好停在記帳表單，立即刷新顯示；沒有表單時不做任何事。
  try{
    if(typeof v61BindRateInput==='function')v61BindRateInput();
    if(typeof v61RefreshRateDisplay==='function')v61RefreshRateDisplay();
  }catch(e){}

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web)web.textContent=VER;
})();
