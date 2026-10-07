// v99：帳戶轉移「轉到帳戶」排除來源帳戶。
// 安全版：不覆寫任何既有函式、不使用 MutationObserver，只監聽這兩個下拉選單與資金視窗內點擊。
(()=>{
  const FUND_TRANSFER_VERSION='2026.10.07-v99';

  function syncTransferTargetOptions(){
    const from=document.getElementById('fundTransferFrom');
    const to=document.getElementById('fundTransferTo');
    if(!from||!to)return;

    const source=String(from.value||'');
    const previous=String(to.value||'');
    const choices=Array.from(from.options).map(o=>({
      value:String(o.value||''),
      label:String(o.textContent||o.value||'')
    }));
    const allowed=choices.filter(o=>o.value&&o.value!==source);

    to.innerHTML='';
    allowed.forEach(o=>{
      const opt=document.createElement('option');
      opt.value=o.value;
      opt.textContent=o.label;
      to.appendChild(opt);
    });

    if(allowed.some(o=>o.value===previous))to.value=previous;
    else if(allowed.length)to.value=allowed[0].value;
    to.disabled=allowed.length===0;
  }

  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='fundTransferFrom'){
      syncTransferTargetOptions();
    }
  });

  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    if(!target)return;
    const button=target.closest('button');
    const openedByFundButton=button&&String(button.getAttribute('onclick')||'').includes('openFundManagerV83');
    const clickedInsideFundManager=Boolean(target.closest('#fundManagerOverlay'));
    if(openedByFundButton||clickedInsideFundManager){
      setTimeout(syncTransferTargetOptions,0);
    }
  });

  try{window.WEB_VERSION=FUND_TRANSFER_VERSION;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=FUND_TRANSFER_VERSION;
})();
