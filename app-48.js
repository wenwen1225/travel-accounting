// v118：複製上一筆設定時，一併複製「品名」。
// 金額、數量與備註仍不複製，避免誤存上一筆金額。
(()=>{
  const VER='2026.10.11-v118-copy-item-name';

  if(typeof v69CopyPreviousExpense==='function'){
    v69CopyPreviousExpense=function(){
      if(!currentTrip || editingExpenseId) return;
      const list=currentTrip?.expenses||[];
      const last=list.length ? list[list.length-1] : null;
      if(!last){
        if(typeof v69ShowToast==='function') v69ShowToast('目前沒有上一筆消費可以複製');
        return;
      }

      const shared=typeof isSharedExpensePay==='function' && isSharedExpensePay(last.pay);
      if(!shared && last.person){
        selectedPerson=last.person;
        if(typeof renderPersonChips==='function') renderPersonChips('personChips',selectedPerson,'selectPerson');
      }

      if(last.pay && typeof selectPay==='function') selectPay(last.pay);

      const card=document.getElementById('cardType');
      if(card && last.card && [...card.options].some(o=>o.value===last.card)) card.value=last.card;

      const name=document.getElementById('expenseName');
      if(name) name.value=last.name||'';

      const place=document.getElementById('expensePlace');
      if(place) place.value=last.place||'';

      if(typeof setExpenseCategoryValue==='function') setExpenseCategoryValue(last.category||'');

      // 仍不複製容易誤存的欄位。
      const foreign=document.getElementById('expenseForeign');
      const twd=document.getElementById('expenseTwd');
      const note=document.getElementById('expenseNote');
      const qty=document.getElementById('expenseQty');
      if(foreign) foreign.value='';
      if(twd) twd.value='';
      if(note) note.value='';
      if(qty) qty.value=1;

      if(typeof v69ShowToast==='function'){
        v69ShowToast('已帶入上一筆的品名、人員、付款方式、卡別、地點與分類');
      }
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web) web.textContent=VER;
  }

  const baseRenderSettingsV118=window.renderSettings;
  if(typeof baseRenderSettingsV118==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV118.apply(this,arguments);
      applyVersion();
      return r;
    };
  }

  applyVersion();
})();
