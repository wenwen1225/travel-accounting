// v85：共同支付前端一致化。現金 / WOWPASS / TOSS 不顯示記帳人員；信用卡 / 交通卡才顯示。
// 純前端修正，後端仍搭配 v56。
(()=>{
  const SHARED_PAYS_V85=new Set(['現金','Wowpass','Toss','電子支付']);

  function isSharedPayV85(pay){
    return SHARED_PAYS_V85.has(String(pay||''));
  }

  function syncPersonUiV85(pay){
    const group=document.getElementById('expensePersonGroup');
    if(!group) return;
    const shared=isSharedPayV85(pay);
    group.classList.toggle('hidden',shared);
    if(shared){
      try{ selectedPerson='共同'; }catch(e){}
    }
  }

  // 不改原本付款選擇邏輯，只在選完付款方式後同步「記帳人員」顯示狀態。
  const baseSelectPayV85=window.selectPay;
  window.selectPay=function(pay){
    const result=typeof baseSelectPayV85==='function' ? baseSelectPayV85(pay) : undefined;
    syncPersonUiV85(pay);
    return result;
  };

  // 開啟新增頁時再校正一次，避免舊版 openAdd 將欄位狀態覆蓋回去。
  const baseOpenAddV85=window.openAdd;
  window.openAdd=function(type){
    const result=typeof baseOpenAddV85==='function' ? baseOpenAddV85(type) : undefined;
    if(type==='cash'){
      syncPersonUiV85(typeof selectedPay!=='undefined' ? selectedPay : '現金');
      const subtitle=document.getElementById('addSubtitle');
      if(subtitle && currentTrip?.currency==='KRW') subtitle.textContent=`${currentTrip.name} · 現金 / WOWPASS / TOSS 皆為共同支出`;
    }
    return result;
  };

  // 編輯舊紀錄時，WOWPASS / TOSS / 現金也一律不顯示人員欄。
  const baseEditExpenseV85=window.editExpense;
  window.editExpense=function(id){
    const result=typeof baseEditExpenseV85==='function' ? baseEditExpenseV85(id) : undefined;
    const item=(currentTrip?.expenses||[]).find(x=>x.id===id);
    if(item) syncPersonUiV85(item.pay);
    return result;
  };

  // 畫面文字一致化。
  function updateSharedCopyV85(){
    const btn=[...document.querySelectorAll('#page-trip .action-card')].find(b=>(b.getAttribute('onclick')||'').includes("openAdd('cash')"));
    if(btn){
      const strong=btn.querySelector('strong');
      const span=btn.querySelector('span');
      if(strong) strong.textContent=currentTrip?.currency==='KRW'?'現金 / WOWPASS / TOSS':'現金 / 當地支付';
      if(span) span.textContent='共同支出，不需選記帳人員';
    }
  }

  const baseOpenTripV85=window.openTrip;
  window.openTrip=function(id){
    const result=typeof baseOpenTripV85==='function' ? baseOpenTripV85(id) : undefined;
    updateSharedCopyV85();
    return result;
  };

  // 今日總覽、結算的付款名稱補上 TOSS，避免顯示成其他。
  const baseTodayPaymentLabelV85=window.todayPaymentLabel;
  window.todayPaymentLabel=function(item){
    if(item?.pay==='Toss') return 'TOSS';
    return typeof baseTodayPaymentLabelV85==='function' ? baseTodayPaymentLabelV85(item) : (item?.pay||'其他');
  };

  const baseSettlementPaymentLabelV85=window.settlementPaymentLabel;
  window.settlementPaymentLabel=function(item){
    if(item?.pay==='Toss') return 'TOSS';
    return typeof baseSettlementPaymentLabelV85==='function' ? baseSettlementPaymentLabelV85(item) : (item?.pay||'未分類');
  };
})();
