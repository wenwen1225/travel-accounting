// v121：待退稅卡片與完成退稅視窗顯示原購買外幣金額，避免同名商品混淆。
// 純前端顯示，不修改 Apps Script、Sheet 欄位或同步格式。
(()=>{
  const VER='2026.10.11-v121-refund-purchase-amount';

  function moneyText(item){
    const amount=Number(item?.foreign||0);
    if(!(amount>0))return '';
    const symbol=typeof currencySymbol==='function'?currencySymbol(currentTrip?.currency):'';
    return `${symbol}${amount.toLocaleString('en-US')}`;
  }

  function decoratePendingCards(){
    if(!currentTrip)return;
    const items=typeof taxRefundPendingItems==='function'?taxRefundPendingItems().slice(0,3):[];
    const cards=[...document.querySelectorAll('#taxRefundPendingPreview .tax-refund-preview-item')];
    cards.forEach((card,index)=>{
      const item=items[index];
      if(!item)return;
      let amount=card.querySelector('.tax-refund-purchase-amount');
      if(!amount){
        amount=document.createElement('div');
        amount.className='tax-refund-purchase-amount';
        const firstSpan=card.querySelector('span');
        if(firstSpan) firstSpan.insertAdjacentElement('afterend',amount);
        else card.appendChild(amount);
      }
      const text=moneyText(item);
      amount.textContent=text?`購買金額：${text}`:'購買金額：未記錄';
    });
  }

  function installStyles(){
    if(document.getElementById('refundAmountV121Style'))return;
    const s=document.createElement('style');
    s.id='refundAmountV121Style';
    s.textContent=`
      .tax-refund-purchase-amount{margin-top:4px;font-size:12px;font-weight:900;color:#4f4658}
      #refundSettlementSummary .refund-v121-amount{display:inline-block;margin-top:4px;font-weight:900;color:#4f4658}
    `;
    document.head.appendChild(s);
  }

  const baseRenderPending=window.renderTaxRefundPendingSection;
  if(typeof baseRenderPending==='function'){
    window.renderTaxRefundPendingSection=function(){
      const r=baseRenderPending.apply(this,arguments);
      setTimeout(decoratePendingCards,0);
      return r;
    };
  }

  // v120 的快捷按鈕會呼叫此全域函式；包一層，讓完成退稅視窗也顯示原購買金額。
  const baseComplete=window.completeTaxRefundV114;
  if(typeof baseComplete==='function'){
    window.completeTaxRefundV114=function(id,button){
      const item=(currentTrip?.expenses||[]).find(x=>String(x.id)===String(id));
      const r=baseComplete.apply(this,arguments);
      setTimeout(()=>{
        const summary=document.getElementById('refundSettlementSummary');
        if(!summary||!item)return;
        let row=summary.querySelector('.refund-v121-amount');
        if(!row){
          row=document.createElement('span');
          row.className='refund-v121-amount';
          summary.appendChild(document.createElement('br'));
          summary.appendChild(row);
        }
        const text=moneyText(item);
        row.textContent=text?`原購買金額：${text}`:'原購買金額：未記錄';
      },0);
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

  installStyles();
  applyVersion();
  setTimeout(decoratePendingCards,0);
})();
