// v143：韓國專屬付款功能分流。
// KRW 才使用 WOWPASS / TOSS；非 KRW 的共同付款只保留現金。
// JPY 交通卡維持原本支援；不修改同步、換匯、退稅、統計或後端。
(()=>{
  const VER='2026.10.13-v143-korea-payment-split';
  const isKr=()=>String(currentTrip?.currency||'').toUpperCase()==='KRW';

  // 非韓國不再提供「電子支付」共同付款；韓國共同錢包仍為 WOWPASS。
  window.sharedPaymentMethodForCurrency=function(currency){
    return String(currency||'').toUpperCase()==='KRW' ? 'Wowpass' : '';
  };

  // 共同支出規則：現金永遠可用；WOWPASS / TOSS 僅 KRW。
  window.isSharedExpensePay=function(pay){
    const p=String(pay||'').trim().toLowerCase();
    if(p==='現金') return true;
    if(!isKr()) return false;
    return p==='wowpass' || p==='toss';
  };

  function applyPaymentVisibility(){
    if(!currentTrip) return;
    const kr=isKr();
    const seg=document.getElementById('paySeg');
    if(seg){
      [...seg.querySelectorAll('button')].forEach(btn=>{
        const pay=String(btn.dataset.pay||btn.textContent||'').trim().toLowerCase();
        if(pay==='電子支付' || pay==='wowpass' || pay==='toss'){
          btn.classList.toggle('hidden',!kr);
        }
      });
    }

    const sharedBtn=document.getElementById('sharedWalletPayBtn');
    if(sharedBtn){
      if(kr){
        sharedBtn.dataset.pay='Wowpass';
        sharedBtn.textContent='Wowpass';
        sharedBtn.classList.remove('hidden');
      }else{
        sharedBtn.dataset.pay='';
        sharedBtn.textContent='';
        sharedBtn.classList.add('hidden');
      }
    }

    // 快速新增卡片文案也依國家切換，避免非韓國還看到 WOWPASS 提示。
    const cashCard=document.querySelector('#page-trip .action-card[onclick*="openAdd(\'cash\')"]');
    if(cashCard){
      const strong=cashCard.querySelector('strong');
      const span=cashCard.querySelector('span');
      if(strong) strong.textContent='現金 / 當地支付';
      if(span) span.textContent=kr ? '共同支出；WOWPASS / TOSS' : '共同現金支出';
    }
  }

  // 核心 openAdd 會呼叫這個函式，所以直接改成依 KRW 顯示/隱藏。
  window.configureSharedPaymentButton=function(){
    const btn=document.getElementById('sharedWalletPayBtn');
    if(!btn || !currentTrip) return;
    if(isKr()){
      btn.dataset.pay='Wowpass';
      btn.textContent='Wowpass';
      btn.classList.remove('hidden');
    }else{
      btn.dataset.pay='';
      btn.textContent='';
      btn.classList.add('hidden');
    }
  };

  const baseOpenAdd=window.openAdd;
  if(typeof baseOpenAdd==='function'){
    window.openAdd=function(type){
      const r=baseOpenAdd.apply(this,arguments);
      if(currentTrip && type==='cash' && !isKr()){
        const title=document.getElementById('addTitle');
        const sub=document.getElementById('addSubtitle');
        if(title) title.textContent='新增現金支出';
        if(sub) sub.textContent=`${currentTrip.name} · 共同現金支出`;
      }
      setTimeout(applyPaymentVisibility,0);
      return r;
    };
  }

  const baseEditExpense=window.editExpense;
  if(typeof baseEditExpense==='function'){
    window.editExpense=function(){
      const r=baseEditExpense.apply(this,arguments);
      setTimeout(applyPaymentVisibility,0);
      return r;
    };
  }

  const baseOpenTrip=window.openTrip;
  if(typeof baseOpenTrip==='function'){
    window.openTrip=function(){
      const r=baseOpenTrip.apply(this,arguments);
      setTimeout(applyPaymentVisibility,0);
      return r;
    };
  }

  const baseRenderTripSummary=window.renderTripSummary;
  if(typeof baseRenderTripSummary==='function'){
    window.renderTripSummary=function(){
      const r=baseRenderTripSummary.apply(this,arguments);
      setTimeout(applyPaymentVisibility,0);
      return r;
    };
  }

  // 額外保護：非 KRW 若某個舊 UI 還嘗試點到韓國專屬付款，不讓它成為新紀錄的付款方式。
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#paySeg button');
    if(!btn || isKr()) return;
    const pay=String(btn.dataset.pay||btn.textContent||'').trim().toLowerCase();
    if(pay==='wowpass' || pay==='toss' || pay==='電子支付'){
      e.preventDefault();
      e.stopImmediatePropagation();
      if(typeof window.selectPay==='function') window.selectPay('現金');
      setTimeout(applyPaymentVisibility,0);
    }
  },true);

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const w=document.getElementById('webVersionText');
      if(w) w.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
  setTimeout(()=>{if(currentTrip)applyPaymentVisibility();},0);
})();

// v144：載入退稅機台欄位完整同步補丁。
(()=>{
  if(document.getElementById('v144TaxRefundMachineSyncLoader')) return;
  const s=document.createElement('script');
  s.id='v144TaxRefundMachineSyncLoader';
  s.src='app-72.js?v=144';
  s.async=false;
  document.body.appendChild(s);
})();
