// v100：帳戶轉移目標排除來源帳戶 + 來源餘額不足提醒。
// 僅包裝「加入轉移」這一個函式；不攔截其他按鈕、不使用 MutationObserver。
(()=>{
  const FUND_TRANSFER_VERSION='2026.10.07-v100';
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const money=v=>`${currentTrip?.currency==='KRW'?'₩':(typeof currencySymbol==='function'?currencySymbol(currentTrip?.currency):'')}${Number(v||0).toLocaleString('en-US')}`;
  const labels={CASH:'現金',WOWPASS:'WOWPASS',TOSS:'TOSS'};

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
    return balances;
  }

  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='fundTransferFrom')syncTransferTargetOptions();
  });

  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;if(!target)return;
    const button=target.closest('button');
    const openedByFundButton=button&&String(button.getAttribute('onclick')||'').includes('openFundManagerV83');
    const clickedInsideFundManager=Boolean(target.closest('#fundManagerOverlay'));
    if(openedByFundButton||clickedInsideFundManager)setTimeout(syncTransferTargetOptions,0);
  });

  const baseAddFundTransfer=window.addFundTransferV83;
  if(typeof baseAddFundTransfer==='function'){
    window.addFundTransferV83=function(){
      const from=String(document.getElementById('fundTransferFrom')?.value||'');
      const amount=Math.abs(num(document.getElementById('fundTransferAmount')?.value));
      const fee=Math.abs(num(document.getElementById('fundTransferFee')?.value));
      if(from&&amount>0){
        const balance=num(accountBalances()[from]);
        const required=amount+fee;
        if(required>balance){
          const ok=confirm(`⚠️ ${labels[from]||from} 餘額不足\n\n目前餘額：${money(balance)}\n本次需扣：${money(required)}${fee?`\n（轉入 ${money(amount)} + 手續費 ${money(fee)}）`:''}\n轉移後餘額：${money(balance-required)}\n\n仍要繼續建立這筆轉移嗎？`);
          if(!ok)return;
        }
      }
      return baseAddFundTransfer.apply(this,arguments);
    };
  }

  try{window.WEB_VERSION=FUND_TRANSFER_VERSION;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=FUND_TRANSFER_VERSION;
})();
