// v124：恢復首頁「找機台退稅」區塊與「完成退稅」按鈕。
// 原因：v122 重寫 renderTripSummary 後漏掉 renderTaxRefundPendingSection，且舊 v120 會把按鈕綁回舊完成流程。
(()=>{
  const VER='2026.10.12-v124-restore-refund-pending';

  function rebindRefundCompleteButtons(){
    const items=typeof taxRefundPendingItems==='function' ? taxRefundPendingItems().slice(0,3) : [];
    const cards=[...document.querySelectorAll('#taxRefundPendingPreview .tax-refund-preview-item')];
    cards.forEach((card,index)=>{
      const item=items[index];
      if(!item)return;
      let btn=card.querySelector('.tax-refund-complete-btn');
      if(!btn){
        let actions=card.querySelector('.tax-refund-preview-actions');
        if(!actions){
          actions=document.createElement('div');
          actions.className='tax-refund-preview-actions';
          card.appendChild(actions);
        }
        btn=document.createElement('button');
        btn.type='button';
        btn.className='tax-refund-complete-btn';
        btn.textContent='✓ 已完成退稅';
        actions.appendChild(btn);
      }
      const fresh=btn.cloneNode(true);
      fresh.dataset.v124Bound='1';
      fresh.onclick=e=>{
        e.preventDefault();
        e.stopPropagation();
        if(typeof window.completeTaxRefundV114==='function'){
          window.completeTaxRefundV114(item.id,fresh);
        }
      };
      btn.replaceWith(fresh);
    });
  }

  function refreshPendingRefundUi(){
    if(!currentTrip || typeof renderTaxRefundPendingSection!=='function')return;
    try{
      renderTaxRefundPendingSection();
      setTimeout(rebindRefundCompleteButtons,0);
    }catch(e){
      console.error('restore refund pending ui failed',e);
    }
  }

  const baseRenderTripSummary=window.renderTripSummary;
  if(typeof baseRenderTripSummary==='function'){
    window.renderTripSummary=function(){
      const r=baseRenderTripSummary.apply(this,arguments);
      refreshPendingRefundUi();
      return r;
    };
  }

  const baseRenderPending=window.renderTaxRefundPendingSection;
  if(typeof baseRenderPending==='function'){
    window.renderTaxRefundPendingSection=function(){
      const r=baseRenderPending.apply(this,arguments);
      setTimeout(rebindRefundCompleteButtons,0);
      return r;
    };
  }

  const baseOpenTrip=window.openTrip;
  if(typeof baseOpenTrip==='function'){
    window.openTrip=function(){
      const r=baseOpenTrip.apply(this,arguments);
      setTimeout(refreshPendingRefundUi,0);
      return r;
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web)web.textContent=VER;
  }
  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      applyVersion();
      return r;
    };
  }

  applyVersion();
  if(currentTrip)setTimeout(refreshPendingRefundUi,0);
})();
