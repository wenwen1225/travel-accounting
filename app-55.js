// v125：退稅方式僅保留「現金 / 信用卡」，移除「其他」。
(()=>{
  const VER='2026.10.12-v125-refund-method-cleanup';

  function cleanupRefundMethods(){
    const overlay=document.getElementById('refundSettlementOverlay');
    if(!overlay)return;
    overlay.querySelectorAll('.refund-method-btn').forEach(btn=>{
      if(String(btn.dataset.method||'')==='其他')btn.remove();
    });
    const row=overlay.querySelector('.refund-method-row');
    if(row)row.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';

    const hidden=document.getElementById('refundSettlementMethod');
    if(hidden && hidden.value==='其他')hidden.value='現金';
  }

  const observer=new MutationObserver(()=>cleanupRefundMethods());
  observer.observe(document.documentElement,{childList:true,subtree:true});

  const baseComplete=window.completeTaxRefundV114;
  if(typeof baseComplete==='function'){
    window.completeTaxRefundV114=function(){
      const r=baseComplete.apply(this,arguments);
      setTimeout(cleanupRefundMethods,0);
      return r;
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const el=document.getElementById('webVersionText');
    if(el)el.textContent=VER;
  }

  cleanupRefundMethods();
  applyVersion();
})();
