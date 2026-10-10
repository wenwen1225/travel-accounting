// v113：修正 Toss 輸入外幣後「換算匯率」區塊消失。
// 僅調整前端匯率 UI 顯示；不碰同步與 Apps Script 後端。
(()=>{
  const VER='2026.10.11-v113-toss-rate-ui';

  function isTossPay(pay){
    return String(pay||'').trim().toLowerCase()==='toss';
  }

  function supportsRateV113(){
    return ['信用卡','交通卡','現金'].includes(selectedPay) || isTossPay(selectedPay);
  }

  // 統一修正 v61 的付款方式判斷，避免 Toss 因大小寫或舊版判斷而被當成不支援匯率。
  try{
    v61SupportedRatePay=function(){ return supportsRateV113(); };
    window.v61SupportedRatePay=v61SupportedRatePay;
  }catch(e){}

  function forceTossRateUi(){
    if(!isTossPay(selectedPay)) return;

    const group=document.getElementById('cashRateGroup');
    const input=document.getElementById('cashRate');
    const direct=document.getElementById('cashRateDirectBtn');
    const inverse=document.getElementById('cashRateInverseBtn');
    const hint=document.getElementById('cashRateHint');
    const code=currentTrip?.currency||'';
    const mode=typeof rateModeCurrent==='function' ? rateModeCurrent() : '';

    if(group){
      group.classList.remove('hidden');
      const label=group.querySelector('label');
      if(label) label.innerHTML='換算匯率 <span class="tiny">（可直接輸入）</span>';
    }
    if(input){
      input.classList.remove('hidden');
      input.disabled=false;
      input.placeholder='可直接輸入匯率；也可填台幣後自動反推';
    }
    if(direct){
      direct.textContent=`1 ${code} = ? TWD`;
      direct.classList.toggle('active',mode===RATE_MODE_FOREIGN_TO_TWD);
    }
    if(inverse){
      inverse.textContent=`1 TWD = ? ${code}`;
      inverse.classList.toggle('active',mode===RATE_MODE_TWD_TO_FOREIGN);
    }
    if(hint){
      hint.textContent=mode===RATE_MODE_FOREIGN_TO_TWD
        ? `輸入匯率後：${code} × 匯率 = TWD`
        : `輸入匯率後：${code} ÷ 匯率 = TWD`;
    }
  }

  function refreshTossRateUi(){
    try{
      if(typeof v61RefreshRateDisplay==='function') v61RefreshRateDisplay();
    }catch(e){}
    forceTossRateUi();
  }

  // 舊版 foreign input listener 會再呼叫 refreshExpenseRateUi，該函式只把「現金」視為可輸入匯率，
  // 因此 Toss 在輸入外幣後可能被隱藏。這裡在該輪 input 處理結束後再統一恢復 Toss 匯率 UI。
  document.addEventListener('input',(event)=>{
    if(event?.target?.id!=='expenseForeign' && event?.target?.id!=='expenseTwd' && event?.target?.id!=='cashRate') return;
    if(!isTossPay(selectedPay)) return;
    setTimeout(refreshTossRateUi,0);
  });

  document.addEventListener('click',(event)=>{
    const btn=event?.target?.closest?.('#paySeg button');
    if(!btn) return;
    const pay=btn.dataset?.pay || btn.textContent || '';
    if(!isTossPay(pay)) return;
    setTimeout(refreshTossRateUi,0);
  });

  // 開啟 / 編輯消費時也再確認一次，避免舊版函式於 render 後覆蓋。
  if(typeof window.openAdd==='function'){
    const baseOpenAddV113=window.openAdd;
    window.openAdd=function(){
      const r=baseOpenAddV113.apply(this,arguments);
      setTimeout(refreshTossRateUi,0);
      return r;
    };
  }

  if(typeof window.editExpense==='function'){
    const baseEditExpenseV113=window.editExpense;
    window.editExpense=function(){
      const r=baseEditExpenseV113.apply(this,arguments);
      setTimeout(refreshTossRateUi,0);
      return r;
    };
  }

  // 版本顯示。
  const baseRenderSettingsV113=window.renderSettings;
  if(typeof baseRenderSettingsV113==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV113.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
  setTimeout(refreshTossRateUi,0);
})();
