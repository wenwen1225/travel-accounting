// v98：帳戶轉移「轉到帳戶」排除來源帳戶。
// 僅調整帳戶轉移選單防呆，不改資金計算、同步、刪除或 Sheet 邏輯。
(()=>{
  const FUND_TRANSFER_VERSION='2026.10.07-v98';

  function syncTransferTargetOptions(){
    const from=document.getElementById('fundTransferFrom');
    const to=document.getElementById('fundTransferTo');
    if(!from||!to)return;

    const source=String(from.value||'');
    const previous=String(to.value||'');
    const choices=Array.from(from.options).map(o=>({value:String(o.value||''),label:o.textContent||o.value}));
    const allowed=choices.filter(o=>o.value&&o.value!==source);

    to.innerHTML=allowed.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
    if(allowed.some(o=>o.value===previous))to.value=previous;
    else if(allowed.length)to.value=allowed[0].value;
    to.disabled=allowed.length===0;
  }

  // 使用事件委派，避免資金視窗重新 render 後事件失效。
  document.addEventListener('change',e=>{
    if(e.target?.id==='fundTransferFrom')syncTransferTargetOptions();
  });

  const baseOpenFundManager=window.openFundManagerV83;
  if(typeof baseOpenFundManager==='function'){
    window.openFundManagerV83=function(){
      const r=baseOpenFundManager.apply(this,arguments);
      setTimeout(syncTransferTargetOptions,0);
      return r;
    };
  }

  // 資金管理內容會在加入/刪除紀錄後重新 render；監看畫面後重新套用選項。
  const observer=new MutationObserver(()=>{
    if(document.getElementById('fundTransferFrom')&&document.getElementById('fundTransferTo')){
      syncTransferTargetOptions();
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});

  try{window.WEB_VERSION=FUND_TRANSFER_VERSION;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=FUND_TRANSFER_VERSION;
})();
