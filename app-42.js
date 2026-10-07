// v110：TOSS 記帳支援與現金相同的匯率換算，且固定為共同支出；WOWPASS 維持不變。
// 僅修正 TOSS 表單顯示與既有匯率判斷，不修改同步、資金或後端邏輯。
(()=>{
  const VER='2026.10.07-v110';
  const RATE_PAYS=['信用卡','交通卡','現金','Toss'];

  function supportsRate(){
    return RATE_PAYS.includes(selectedPay);
  }

  function isSharedPayV110(pay){
    const sharedPay=typeof sharedPaymentMethodForCurrency==='function'
      ? sharedPaymentMethodForCurrency(currentTrip?.currency)
      : '現金';
    return pay==='現金' || pay===sharedPay || pay==='Wowpass' || pay==='Toss' || pay==='電子支付';
  }

  // TOSS 為共同支出：不顯示記帳人員，固定 selectedPerson='共同'。
  try{
    v62NormalizePaymentUi=function(pay){
      if(!currentTrip) return;
      selectedPay=pay;
      const personGroup=document.getElementById('expensePersonGroup');
      const card=document.getElementById('cardType');
      const cardGroup=card?.closest('.form-group');
      const shared=isSharedPayV110(pay);

      if(personGroup) personGroup.classList.toggle('hidden',shared);
      if(cardGroup) cardGroup.classList.toggle('hidden',pay!=='信用卡');
      if(card) card.disabled=pay!=='信用卡';

      if(shared){
        selectedPerson='共同';
      }else{
        const people=currentTrip.people||[];
        if(!people.includes(selectedPerson)) selectedPerson=people[0]||'Wen';
      }

      document.querySelectorAll('#personSeg button').forEach(btn=>{
        const active=!shared && btn.dataset.person===selectedPerson;
        btn.classList.toggle('active',active);
      });

      if(typeof v61RefreshRateDisplay==='function') v61RefreshRateDisplay();
    };
    window.v62NormalizePaymentUi=v62NormalizePaymentUi;
  }catch(e){}

  // 匯率區塊顯示判斷：TOSS 沿用現金；WOWPASS 不加入。
  try{
    v61SupportedRatePay=function(){return supportsRate();};
    window.v61SupportedRatePay=v61SupportedRatePay;
  }catch(e){}

  // v62 曾把計算條件寫死為「信用卡 / 交通卡 / 現金」，
  // 在最後載入處統一補上 Toss，事件監聽仍沿用原本 v61，不新增任何 listener。
  try{
    v61CalculateTwdFromRate=function(){
      if(!supportsRate()) return;
      const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
      const rate=Number(rawNumber(document.getElementById('cashRate')?.value||''));
      const twd=document.getElementById('expenseTwd');
      if(!twd || !(foreign>0) || !(rate>0)) return;
      const value=rateModeCurrent()===RATE_MODE_FOREIGN_TO_TWD ? foreign*rate : foreign/rate;
      twd.value=formatNumberString(String(Math.round(value)));
      if(typeof v61RefreshRateDisplay==='function')v61RefreshRateDisplay();
    };
    window.v61CalculateTwdFromRate=v61CalculateTwdFromRate;
  }catch(e){}

  try{
    v61DeriveRateFromAmounts=function(){
      if(!supportsRate()) return;
      const foreign=Number(rawNumber(document.getElementById('expenseForeign')?.value||''));
      const twd=Number(rawNumber(document.getElementById('expenseTwd')?.value||''));
      const input=document.getElementById('cashRate');
      if(!input || !(foreign>0) || !(twd>0)) return;
      input.value=rateFmt(impliedRate(foreign,twd,rateModeCurrent()));
      if(currentTrip){
        currentTrip.cashRateMode=rateModeCurrent();
        persist();
      }
      if(typeof v61RefreshRateDisplay==='function')v61RefreshRateDisplay();
    };
    window.v61DeriveRateFromAmounts=v61DeriveRateFromAmounts;
  }catch(e){}

  // 若目前剛好停在 TOSS 記帳頁，立即修正 UI。
  try{
    if(selectedPay==='Toss' && typeof v62NormalizePaymentUi==='function')v62NormalizePaymentUi('Toss');
    if(typeof v61BindRateInput==='function')v61BindRateInput();
    if(typeof v61RefreshRateDisplay==='function')v61RefreshRateDisplay();
  }catch(e){}

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web)web.textContent=VER;
})();
