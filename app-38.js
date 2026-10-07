// v102：帳戶轉移安全版。
// 來源/目標帳戶防呆、保留未儲存初始餘額，並在「加入轉移 / 儲存資金設定」兩個按鈕層保證執行餘額不足提醒。
(()=>{
  const FUND_TRANSFER_VERSION='2026.10.07-v102';
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const money=v=>`${currentTrip?.currency==='KRW'?'₩':(typeof currencySymbol==='function'?currencySymbol(currentTrip?.currency):'')}${Number(v||0).toLocaleString('en-US')}`;
  const labels={CASH:'現金',WOWPASS:'WOWPASS',TOSS:'TOSS'};
  let skipNextCoreWarning=false;

  function activeFundId(){
    const btn=document.querySelector('#fundAccountTabs button.active');
    const m=(btn?.getAttribute('onclick')||'').match(/selectFundAccountV83\('([^']+)'\)/);
    return m?m[1]:'CASH';
  }
  function captureInitialDraft(){
    const input=document.getElementById('fundInitialInput');
    const date=document.getElementById('fundInitialDate');
    if(!input)return null;
    return {accountId:activeFundId(),value:String(input.value??''),date:String(date?.value||'')};
  }
  function restoreInitialDraft(draft){
    if(!draft||draft.accountId!==activeFundId())return;
    const input=document.getElementById('fundInitialInput');
    const date=document.getElementById('fundInitialDate');
    if(input)input.value=draft.value;
    if(date&&draft.date)date.value=draft.date;
  }

  function syncTransferTargetOptions(){
    const from=document.getElementById('fundTransferFrom');
    const to=document.getElementById('fundTransferTo');
    if(!from||!to)return;
    const source=String(from.value||'');
    const previous=String(to.value||'');
    const choices=Array.from(from.options).map(o=>({value:String(o.value||''),label:String(o.textContent||o.value||'')}));
    const allowed=choices.filter(o=>o.value&&o.value!==source);
    to.innerHTML='';
    allowed.forEach(o=>{const opt=document.createElement('option');opt.value=o.value;opt.textContent=o.label;to.appendChild(opt);});
    if(allowed.some(o=>o.value===previous))to.value=previous;
    else if(allowed.length)to.value=allowed[0].value;
    to.disabled=allowed.length===0;
  }

  function accountBalances(){
    const balances={CASH:0,WOWPASS:0,TOSS:0};
    const st=currentTrip?.fundAccounts||{};
    const accounts=st.accounts||{};
    Object.keys(balances).forEach(id=>{
      const a=accounts[id]||{};
      const initialSet=Boolean(a.initialSet)||num(a.initial)!==0||String(a.initialDate||'').trim()!=='';
      balances[id]=initialSet?num(a.initial):0;
      (Array.isArray(a.entries)?a.entries:[]).forEach(e=>{balances[id]+=num(e.amount);});
    });
    (Array.isArray(currentTrip?.exchange)?currentTrip.exchange:[]).forEach(e=>{balances.CASH+=num(e.foreign);});
    const payToId={'現金':'CASH','Wowpass':'WOWPASS','Toss':'TOSS'};
    (Array.isArray(currentTrip?.expenses)?currentTrip.expenses:[]).forEach(e=>{
      const id=payToId[e.pay];if(id)balances[id]-=num(e.foreign);
    });
    (Array.isArray(st.transfers)?st.transfers:[]).forEach(t=>{
      if(!(t.from in balances)||!(t.to in balances))return;
      balances[t.from]-=Math.abs(num(t.amount))+Math.abs(num(t.fee));
      balances[t.to]+=Math.abs(num(t.amount));
    });

    // 畫面上的初始餘額若尚未儲存，檢查時仍以畫面值為準。
    const draft=captureInitialDraft();
    if(draft&&draft.value.trim()!==''){
      const id=draft.accountId;
      const stored=num(accounts[id]?.initial);
      balances[id]=(balances[id]||0)-stored+num(draft.value);
    }
    return balances;
  }

  function transferValues(){
    return {
      from:String(document.getElementById('fundTransferFrom')?.value||''),
      to:String(document.getElementById('fundTransferTo')?.value||''),
      amount:Math.abs(num(document.getElementById('fundTransferAmount')?.value)),
      fee:Math.abs(num(document.getElementById('fundTransferFee')?.value))
    };
  }

  function confirmTransferBalance(){
    const {from,amount,fee}=transferValues();
    if(!from||!(amount>0))return true;
    const balance=num(accountBalances()[from]);
    const required=amount+fee;
    if(required<=balance)return true;
    return confirm(`⚠️ ${labels[from]||from} 餘額不足\n\n目前餘額：${money(balance)}\n本次需扣：${money(required)}${fee?`\n（轉入 ${money(amount)} + 手續費 ${money(fee)}）`:''}\n轉移後餘額：${money(balance-required)}\n\n仍要繼續建立這筆轉移嗎？`);
  }

  function bindTransferButtons(){
    const overlay=document.getElementById('fundManagerOverlay');
    if(!overlay)return;
    const addBtn=[...overlay.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('addFundTransferV83'));
    const saveBtn=document.getElementById('saveFundBtn');

    if(addBtn&&addBtn.dataset.balanceGuardV102!=='1'){
      addBtn.dataset.balanceGuardV102='1';
      addBtn.addEventListener('click',e=>{
        if(confirmTransferBalance()){
          skipNextCoreWarning=true;
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      },true);
    }

    if(saveBtn&&saveBtn.dataset.balanceGuardV102!=='1'){
      saveBtn.dataset.balanceGuardV102='1';
      saveBtn.addEventListener('click',e=>{
        const amount=Math.abs(num(document.getElementById('fundTransferAmount')?.value));
        if(!(amount>0))return;
        if(confirmTransferBalance()){
          skipNextCoreWarning=true;
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      },true);
    }
  }

  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='fundTransferFrom')syncTransferTargetOptions();
  });

  const baseOpenFundManager=window.openFundManagerV83;
  if(typeof baseOpenFundManager==='function'){
    window.openFundManagerV83=function(){
      const r=baseOpenFundManager.apply(this,arguments);
      setTimeout(()=>{syncTransferTargetOptions();bindTransferButtons();},0);
      return r;
    };
  }

  const baseAddFundEntry=window.addFundEntryV83;
  if(typeof baseAddFundEntry==='function'){
    window.addFundEntryV83=function(){
      const draft=captureInitialDraft();
      const r=baseAddFundEntry.apply(this,arguments);
      restoreInitialDraft(draft);
      setTimeout(bindTransferButtons,0);
      return r;
    };
  }

  const baseAddFundTransfer=window.addFundTransferV83;
  if(typeof baseAddFundTransfer==='function'){
    window.addFundTransferV83=function(){
      const draft=captureInitialDraft();
      if(skipNextCoreWarning){
        skipNextCoreWarning=false;
      }else if(!confirmTransferBalance()){
        return;
      }
      const r=baseAddFundTransfer.apply(this,arguments);
      restoreInitialDraft(draft);
      setTimeout(()=>{syncTransferTargetOptions();bindTransferButtons();},0);
      return r;
    };
  }

  try{window.WEB_VERSION=FUND_TRANSFER_VERSION;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=FUND_TRANSFER_VERSION;
})();
