// v90：共同資金帳戶核心（現金 / WOWPASS / TOSS）。
// 直接整理原 v83，不再以額外 patch 覆寫整站事件。後端搭配 Apps Script v56。
(()=>{
  const FUND_WEB_VERSION='2026.10.07-v90';
  const FUND_EXPECTED_BACKEND='v56';

  const fundNum=v=>{
    const n=Number(String(v??'').replace(/,/g,''));
    return Number.isFinite(n)?n:0;
  };
  const fundFmt=v=>Number(v||0).toLocaleString('en-US');
  const fundMoney=v=>(currentTrip?currencySymbol(currentTrip.currency):'')+fundFmt(v);
  const fundToday=()=>{
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const fundDefs=trip=>{
    const defs=[{id:'CASH',label:'現金',pay:'現金',icon:'💵'}];
    if(String(trip?.currency||'')==='KRW'){
      defs.push({id:'WOWPASS',label:'WOWPASS',pay:'Wowpass',icon:'💳'});
      defs.push({id:'TOSS',label:'TOSS',pay:'Toss',icon:'💙'});
    }
    return defs;
  };
  const fundDateLabel=ymd=>{
    const m=String(ymd||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return ymd||'';
    const d=new Date(+m[1],+m[2]-1,+m[3],12,0,0);
    return `${m[1]}/${m[2]}/${m[3]}（${['日','一','二','三','四','五','六'][d.getDay()]}）`;
  };
  function fundDateOptions(selected=''){
    if(!currentTrip)return [];
    const parse=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3],12,0,0):null;};
    const start=parse(currentTrip.start)||new Date();
    const end=parse(currentTrip.end)||start;
    const from=new Date(start);from.setDate(from.getDate()-30);
    const to=new Date(end);to.setDate(to.getDate()+7);
    const set=new Set([fundToday(),selected].filter(Boolean));
    for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){
      set.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    return [...set].sort();
  }
  function fillFundDateSelect(el,selected){
    if(!el)return;
    const wanted=selected||fundToday();
    el.innerHTML=fundDateOptions(wanted).map(v=>`<option value="${v}">${fundDateLabel(v)}</option>`).join('');
    el.value=wanted;
  }
  function bindMoney(el){
    if(!el||el.dataset.fundBound==='1')return;
    el.dataset.fundBound='1';
    el.addEventListener('input',()=>{
      let raw=String(el.value||'').replace(/,/g,'').replace(/[^0-9.]/g,'');
      const parts=raw.split('.');
      const i=(parts[0]||'').replace(/^0+(?=\d)/,'');
      const grouped=i?Number(i).toLocaleString('en-US'):'';
      el.value=grouped+(parts.length>1?'.'+parts.slice(1).join('').slice(0,6):'');
    });
  }
  function initialWasSet(a){
    return Boolean(a?.initialSet)||fundNum(a?.initial)!==0||String(a?.initialDate||'').trim()!=='';
  }
  function normalizeAccount(a={}){
    return {
      initial:fundNum(a.initial),
      initialDate:String(a.initialDate||''),
      initialSet:typeof a.initialSet==='boolean'?a.initialSet:initialWasSet(a),
      entries:Array.isArray(a.entries)?a.entries.map(e=>({
        id:String(e.id||''),date:String(e.date||''),amount:fundNum(e.amount),type:String(e.type||'調整'),note:String(e.note||'')
      })).filter(e=>e.id&&e.amount!==0):[]
    };
  }
  function migrateLocalFundState(){
    if(!currentTrip)return {accounts:{},transfers:[]};
    let state=currentTrip.fundAccounts;
    if(!state||typeof state!=='object')state={accounts:{},transfers:[]};
    if(!state.accounts||typeof state.accounts!=='object')state.accounts={};
    if(!Array.isArray(state.transfers))state.transfers=[];

    if(!state.accounts.CASH&&currentTrip.cashWallet){
      const old=currentTrip.cashWallet||{};
      state.accounts.CASH={
        initial:fundNum(old.initial),
        initialDate:String(old.initialDate||currentTrip.start||''),
        initialSet:fundNum(old.initial)!==0||String(old.initialDate||'').trim()!=='',
        entries:(Array.isArray(old.adjustments)?old.adjustments:[]).map(a=>({
          id:String(a.id||('legacy_'+Date.now())),date:String(a.date||''),amount:fundNum(a.amount),type:'調整',note:String(a.note||'')
        })).filter(a=>a.amount!==0)
      };
    }
    fundDefs(currentTrip).forEach(def=>{state.accounts[def.id]=normalizeAccount(state.accounts[def.id]||{});});
    state.transfers=state.transfers.map(t=>({
      id:String(t.id||''),date:String(t.date||''),from:String(t.from||''),to:String(t.to||''),
      amount:Math.max(0,fundNum(t.amount)),fee:Math.max(0,fundNum(t.fee)),note:String(t.note||'')
    })).filter(t=>t.id&&t.from&&t.to&&t.from!==t.to&&t.amount>0);
    currentTrip.fundAccounts=state;
    return state;
  }
  function calcFunds(){
    const state=migrateLocalFundState();
    const defs=fundDefs(currentTrip);
    const balances={},income={},spend={};
    defs.forEach(d=>{
      const a=state.accounts[d.id]||{};
      balances[d.id]=initialWasSet(a)?fundNum(a.initial):0;
      income[d.id]=initialWasSet(a)?fundNum(a.initial):0;
      spend[d.id]=0;
    });
    defs.forEach(d=>(state.accounts[d.id]?.entries||[]).forEach(e=>{
      balances[d.id]+=fundNum(e.amount);
      if(e.amount>0)income[d.id]+=fundNum(e.amount);else spend[d.id]+=Math.abs(fundNum(e.amount));
    }));
    (currentTrip.exchange||[]).forEach(e=>{
      const a=fundNum(e.foreign);balances.CASH=(balances.CASH||0)+a;
      if(a>0)income.CASH=(income.CASH||0)+a;else spend.CASH=(spend.CASH||0)+Math.abs(a);
    });
    const payToId={'現金':'CASH','Wowpass':'WOWPASS','Toss':'TOSS'};
    (currentTrip.expenses||[]).forEach(e=>{
      const id=payToId[e.pay];if(!id||balances[id]===undefined)return;
      const a=fundNum(e.foreign);balances[id]-=a;spend[id]+=Math.max(0,a);
    });
    let fees=0;
    state.transfers.forEach(t=>{
      if(balances[t.from]===undefined||balances[t.to]===undefined)return;
      balances[t.from]-=fundNum(t.amount)+fundNum(t.fee);
      balances[t.to]+=fundNum(t.amount);
      fees+=fundNum(t.fee);spend[t.from]+=fundNum(t.fee);
    });
    return {state,defs,balances,income,spend,fees,total:defs.reduce((s,d)=>s+(balances[d.id]||0),0)};
  }

  function ensureTossPayButton(){
    const seg=document.getElementById('paySeg');if(!seg)return;
    let btn=document.getElementById('tossPayBtn');
    if(!btn){
      btn=document.createElement('button');btn.id='tossPayBtn';btn.type='button';btn.dataset.pay='Toss';btn.textContent='Toss';
      btn.onclick=()=>selectPay('Toss');seg.appendChild(btn);
    }
    btn.classList.toggle('hidden',String(currentTrip?.currency||'')!=='KRW');
  }
  if(typeof isSharedExpensePay==='function'){
    isSharedExpensePay=function(pay){return pay==='現金'||pay==='Wowpass'||pay==='Toss'||pay==='電子支付';};
  }
  const baseOpenAdd=window.openAdd;
  window.openAdd=function(type){
    ensureTossPayButton();
    const r=typeof baseOpenAdd==='function'?baseOpenAdd(type):undefined;
    if(type==='cash'){
      ensureTossPayButton();
      const toss=document.getElementById('tossPayBtn');if(toss)toss.classList.toggle('hidden',String(currentTrip?.currency||'')!=='KRW');
      const shared=document.getElementById('sharedWalletPayBtn');
      if(shared&&currentTrip?.currency==='KRW'){shared.dataset.pay='Wowpass';shared.textContent='Wowpass';}
      const title=document.getElementById('addTitle');if(title)title.textContent=currentTrip?.currency==='KRW'?'新增現金 / WOWPASS / TOSS':'新增現金 / 當地支付';
    }
    return r;
  };
  const baseEditExpense=window.editExpense;
  if(typeof baseEditExpense==='function'){
    window.editExpense=function(id){
      ensureTossPayButton();const r=baseEditExpense(id);
      const item=(currentTrip?.expenses||[]).find(x=>x.id===id);
      if(item?.pay==='Toss'){
        const toss=document.getElementById('tossPayBtn');if(toss)toss.classList.remove('hidden');
        if(typeof selectPay==='function')selectPay('Toss');
        const pg=document.getElementById('expensePersonGroup');if(pg)pg.classList.add('hidden');
        try{selectedPerson='共同';}catch(e){}
      }
      return r;
    };
  }

  function ensureFundStyles(){
    if(document.getElementById('fundV90Styles'))return;
    const s=document.createElement('style');s.id='fundV90Styles';s.textContent=`
      #cashWalletSection{display:none!important}
      .fund-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
      .fund-mini{border:1px solid var(--line);border-radius:15px;padding:11px;background:#faf8ff;min-width:0}
      .fund-mini span{display:block;font-size:11px;color:var(--muted);font-weight:700}.fund-mini strong{display:block;margin-top:4px;font-size:15px;overflow:hidden;text-overflow:ellipsis}
      .fund-total{font-size:27px;font-weight:900;margin-top:4px}.fund-fee{font-size:11px;color:var(--muted);margin-top:5px}
      .fund-dialog{max-width:470px;text-align:left}.fund-dialog h2,.fund-dialog>.sub{text-align:center}
      .fund-account-tabs{display:flex;gap:7px;overflow:auto;margin:14px 0}.fund-account-tabs button{white-space:nowrap;flex:1}.fund-account-tabs button.active{background:var(--primary);color:#fff;border-color:var(--primary)}
      .fund-date{width:100%;height:52px;border:1px solid var(--line);border-radius:16px;background:#fff;padding:0 13px;font:inherit}
      .fund-entry-list{max-height:155px;overflow:auto;border-top:1px solid var(--line);margin-top:10px}.fund-entry-row{display:flex;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}.fund-entry-row span{display:block;color:var(--muted)}
      .fund-remove{border:0;background:transparent;color:var(--danger);font-weight:800}.fund-transfer-box{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
      .fund-two{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fund-three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px}
      .fund-mode-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:7px 0 9px}.fund-mode-btn{height:44px;border-radius:14px;border:1px solid var(--line);font-weight:900;background:#fff}
      .fund-mode-btn.income{color:#15803d;background:#effaf2}.fund-mode-btn.expense{color:#c2415a;background:#fff0f3}.fund-mode-btn.adjust{color:#7c3aed;background:#f5f0ff}
      .fund-mode-btn.active{box-shadow:inset 0 0 0 2px currentColor}
      .fund-subtype-row{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}.fund-subtype-btn{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;color:var(--muted)}
      .fund-subtype-btn.active{color:var(--primary);border-color:var(--primary);background:#f7f2ff}
      @media(max-width:560px){.fund-grid{grid-template-columns:1fr}.fund-two,.fund-three{grid-template-columns:1fr}.fund-dialog{max-height:88vh;overflow:auto}}
    `;document.head.appendChild(s);
  }
  function ensureFundSection(){
    ensureFundStyles();let sec=document.getElementById('fundAccountsSection');if(sec)return sec;
    const hero=document.querySelector('#page-trip .hero');if(!hero)return null;
    sec=document.createElement('div');sec.id='fundAccountsSection';sec.className='section';
    sec.innerHTML=`<div class="section-title">${currentTrip?.currency==='KRW'?'韓國共同資金':'外幣現金'} <small>共同支出帳戶</small></div><div class="card cash-wallet-card"><div class="cash-wallet-label">總剩餘資金</div><div id="fundTotalBalance" class="fund-total">—</div><div id="fundFeeText" class="fund-fee"></div><div id="fundMiniGrid" class="fund-grid"></div><button class="primary" style="margin-top:14px" type="button" onclick="openFundManagerV83()">管理資金 / 帳戶轉移</button></div>`;
    hero.insertAdjacentElement('afterend',sec);return sec;
  }
  function renderFundSection(){
    if(!currentTrip)return;ensureFundSection();
    const old=document.getElementById('cashWalletSection');if(old)old.style.display='none';
    const c=calcFunds();
    const total=document.getElementById('fundTotalBalance');if(total)total.textContent=fundMoney(c.total);
    const fee=document.getElementById('fundFeeText');if(fee)fee.textContent=c.fees?`帳戶轉移手續費累計 ${fundMoney(c.fees)}`:'帳戶間轉移不計入收入／支出；手續費會列為實際支出';
    const grid=document.getElementById('fundMiniGrid');if(grid)grid.innerHTML=c.defs.map(d=>`<div class="fund-mini"><span>${d.icon} ${d.label}</span><strong>${fundMoney(c.balances[d.id]||0)}</strong></div>`).join('');
  }

  let activeFundAccount='CASH';
  function currentEntryType(){return document.getElementById('fundEntryType')?.value||'儲值';}
  function entryMode(type){return type==='支出'?'expense':type.startsWith('調整')?'adjust':'income';}
  function renderFundEntryButtons(){
    const type=currentEntryType();const mode=entryMode(type);
    ['income','expense','adjust'].forEach(m=>document.getElementById('fundMode_'+m)?.classList.toggle('active',m===mode));
    const sub=document.getElementById('fundSubtypeRow');if(!sub)return;
    const options=mode==='income'?['儲值','退款','其他收入']:mode==='expense'?['支出']:['調整增加','調整減少'];
    sub.innerHTML=options.map(v=>`<button type="button" class="fund-subtype-btn ${v===type?'active':''}" onclick="setFundEntryTypeV90('${v}')">${v==='支出'?'手動支出':v.replace('其他收入','其他')}</button>`).join('');
  }
  window.setFundEntryModeV90=function(mode){
    const hidden=document.getElementById('fundEntryType');if(!hidden)return;
    hidden.value=mode==='expense'?'支出':mode==='adjust'?'調整增加':'儲值';renderFundEntryButtons();
  };
  window.setFundEntryTypeV90=function(type){const hidden=document.getElementById('fundEntryType');if(hidden)hidden.value=type;renderFundEntryButtons();};

  function ensureFundOverlay(){
    ensureFundStyles();if(document.getElementById('fundManagerOverlay'))return;
    const o=document.createElement('div');o.id='fundManagerOverlay';o.className='save-overlay hidden';o.innerHTML=`<div class="save-dialog fund-dialog"><div class="save-symbol">💰</div><h2>共同資金帳戶</h2><div id="fundManagerSub" class="sub"></div><div id="fundAccountTabs" class="fund-account-tabs"></div>
      <div class="fund-two"><div class="form-group"><label>初始餘額</label><div class="money-wrap"><span class="money-prefix">₩</span><input id="fundInitialInput" type="text" inputmode="decimal" placeholder="例如：100,000"></div></div><div class="form-group"><label>初始日期</label><select id="fundInitialDate" class="fund-date"></select></div></div>
      <div class="form-group"><label>新增收入 / 支出 / 調整</label><input id="fundEntryType" type="hidden" value="儲值"><div class="fund-mode-row"><button id="fundMode_income" type="button" class="fund-mode-btn income" onclick="setFundEntryModeV90('income')">收入</button><button id="fundMode_expense" type="button" class="fund-mode-btn expense" onclick="setFundEntryModeV90('expense')">支出</button><button id="fundMode_adjust" type="button" class="fund-mode-btn adjust" onclick="setFundEntryModeV90('adjust')">調整</button></div><div id="fundSubtypeRow" class="fund-subtype-row"></div><div class="money-wrap"><span class="money-prefix">₩</span><input id="fundEntryAmount" type="text" inputmode="decimal" placeholder="0"></div></div>
      <div class="fund-two"><div class="form-group"><label>日期</label><select id="fundEntryDate" class="fund-date"></select></div><div class="form-group"><label>備註</label><input id="fundEntryNote" placeholder="例如：信用卡儲值"></div></div><button class="secondary" type="button" onclick="addFundEntryV83()">＋ 加入這筆收支</button><div id="fundEntryList" class="fund-entry-list"></div>
      <div id="fundTransferBox" class="fund-transfer-box"><strong>帳戶間轉移</strong><div class="tiny" style="margin:5px 0 10px">本金只是移動，不算收入／支出；手續費會算來源帳戶的實際支出。</div><div class="fund-two"><div class="form-group"><label>從</label><select id="fundTransferFrom"></select></div><div class="form-group"><label>轉到</label><select id="fundTransferTo"></select></div></div><div class="fund-two"><div class="form-group"><label>轉入金額</label><div class="money-wrap"><span class="money-prefix">₩</span><input id="fundTransferAmount" type="text" inputmode="decimal" placeholder="例如：4,000"></div></div><div class="form-group"><label>手續費</label><div class="money-wrap"><span class="money-prefix">₩</span><input id="fundTransferFee" type="text" inputmode="decimal" placeholder="例如：500"></div></div></div><div class="fund-two"><div class="form-group"><label>日期</label><select id="fundTransferDate" class="fund-date"></select></div><div class="form-group"><label>備註</label><input id="fundTransferNote" placeholder="選填"></div></div><button class="secondary" type="button" onclick="addFundTransferV83()">＋ 加入轉移</button><div id="fundTransferList" class="fund-entry-list"></div></div>
      <button id="saveFundBtn" class="primary" style="margin-top:15px" type="button" onclick="saveFundAccountsV83()">儲存資金設定</button><button class="secondary" style="margin-top:9px" type="button" onclick="closeFundManagerV83()">取消</button></div>`;
    document.body.appendChild(o);
    ['fundInitialInput','fundEntryAmount','fundTransferAmount','fundTransferFee'].forEach(id=>bindMoney(document.getElementById(id)));
    renderFundEntryButtons();
  }
  function captureInitial(a){
    if(!a)return;
    const input=document.getElementById('fundInitialInput');const date=document.getElementById('fundInitialDate');
    const raw=String(input?.value??'').trim();
    if(raw!==''){
      a.initial=fundNum(raw);a.initialSet=true;a.initialDate=date?.value||a.initialDate||currentTrip.start||fundToday();
    }
  }
  function renderFundManager(){
    if(!currentTrip)return;ensureFundOverlay();
    const c=calcFunds(),state=c.state,defs=c.defs;
    if(!defs.some(d=>d.id===activeFundAccount))activeFundAccount=defs[0].id;
    document.getElementById('fundManagerSub').textContent=`${currentTrip.name} · ${currentTrip.currency}`;
    document.getElementById('fundAccountTabs').innerHTML=defs.map(d=>`<button type="button" class="secondary ${d.id===activeFundAccount?'active':''}" onclick="selectFundAccountV83('${d.id}')">${d.icon} ${d.label}<br><small>${fundMoney(c.balances[d.id]||0)}</small></button>`).join('');
    const a=state.accounts[activeFundAccount]||normalizeAccount();
    document.getElementById('fundInitialInput').value=a.initialSet?fundFmt(a.initial):'';
    fillFundDateSelect(document.getElementById('fundInitialDate'),a.initialDate||currentTrip.start||fundToday());
    fillFundDateSelect(document.getElementById('fundEntryDate'),fundToday());fillFundDateSelect(document.getElementById('fundTransferDate'),fundToday());
    renderFundEntryButtons();
    document.getElementById('fundEntryList').innerHTML=(a.entries||[]).slice().reverse().map(e=>`<div class="fund-entry-row"><div><strong>${e.amount>0?'+':''}${fundMoney(e.amount)}</strong><span>${fundDateLabel(e.date)} · ${e.type}${e.note?' · '+e.note:''}</span></div><button class="fund-remove" onclick="removeFundEntryV83('${e.id}')">刪除</button></div>`).join('');
    const opts=defs.map(d=>`<option value="${d.id}">${d.label}</option>`).join('');
    const from=document.getElementById('fundTransferFrom'),to=document.getElementById('fundTransferTo');from.innerHTML=opts;to.innerHTML=opts;from.value=activeFundAccount;to.value=defs.find(d=>d.id!==activeFundAccount)?.id||activeFundAccount;
    document.getElementById('fundTransferBox').classList.toggle('hidden',defs.length<2);
    document.getElementById('fundTransferList').innerHTML=state.transfers.slice().reverse().map(t=>{const fd=defs.find(d=>d.id===t.from),td=defs.find(d=>d.id===t.to);return `<div class="fund-entry-row"><div><strong>${fd?.label||t.from} → ${td?.label||t.to} ${fundMoney(t.amount)}</strong><span>${fundDateLabel(t.date)}${t.fee?` · 手續費 ${fundMoney(t.fee)}`:''}${t.note?' · '+t.note:''}</span></div><button class="fund-remove" onclick="removeFundTransferV83('${t.id}')">刪除</button></div>`;}).join('');
  }
  window.openFundManagerV83=function(){if(!currentTrip)return;if(currentTrip.archived)return typeof archiveReadOnlyAlert==='function'?archiveReadOnlyAlert():null;renderFundManager();document.getElementById('fundManagerOverlay').classList.remove('hidden');};
  window.closeFundManagerV83=()=>document.getElementById('fundManagerOverlay')?.classList.add('hidden');
  window.selectFundAccountV83=function(id){const st=migrateLocalFundState();captureInitial(st.accounts[activeFundAccount]);activeFundAccount=id;currentTrip.fundAccounts=st;persist();renderFundManager();};
  window.addFundEntryV83=function(){
    const st=migrateLocalFundState(),a=st.accounts[activeFundAccount];if(!a)return;captureInitial(a);
    const type=currentEntryType();let amount=Math.abs(fundNum(document.getElementById('fundEntryAmount').value));if(!amount)return alert('請輸入金額');
    if(type==='支出'||type==='調整減少')amount=-amount;
    a.entries.push({id:'fund_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),date:document.getElementById('fundEntryDate').value||fundToday(),amount,type,note:document.getElementById('fundEntryNote').value.trim()});
    currentTrip.fundAccounts=st;persist();document.getElementById('fundEntryAmount').value='';document.getElementById('fundEntryNote').value='';renderFundManager();renderFundSection();
  };
  window.removeFundEntryV83=function(id){const st=migrateLocalFundState(),a=st.accounts[activeFundAccount];if(a)a.entries=(a.entries||[]).filter(e=>e.id!==id);currentTrip.fundAccounts=st;persist();renderFundManager();renderFundSection();};
  window.addFundTransferV83=function(){
    const st=migrateLocalFundState();const from=document.getElementById('fundTransferFrom').value,to=document.getElementById('fundTransferTo').value;const amount=Math.abs(fundNum(document.getElementById('fundTransferAmount').value)),fee=Math.abs(fundNum(document.getElementById('fundTransferFee').value));
    if(from===to)return alert('來源與目標帳戶不能相同');if(!amount)return alert('請輸入轉移金額');
    st.transfers.push({id:'transfer_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),date:document.getElementById('fundTransferDate').value||fundToday(),from,to,amount,fee,note:document.getElementById('fundTransferNote').value.trim()});
    currentTrip.fundAccounts=st;persist();document.getElementById('fundTransferAmount').value='';document.getElementById('fundTransferFee').value='';document.getElementById('fundTransferNote').value='';renderFundManager();renderFundSection();
  };
  window.removeFundTransferV83=function(id){const st=migrateLocalFundState();st.transfers=st.transfers.filter(t=>t.id!==id);currentTrip.fundAccounts=st;persist();renderFundManager();renderFundSection();};
  window.saveFundAccountsV83=async function(){
    if(!currentTrip)return;const st=migrateLocalFundState();captureInitial(st.accounts[activeFundAccount]);currentTrip.fundAccounts=st;persist();renderFundSection();
    const btn=document.getElementById('saveFundBtn');if(btn){btn.disabled=true;btn.textContent='儲存中…';}
    try{
      if(!getApiUrl())throw new Error('尚未設定 Google Apps Script Web App URL');
      const ready=await ensureTripSpreadsheetReady(currentTrip);if(!ready||!currentTrip.spreadsheetId)throw new Error('Google Sheet 尚未建立完成');
      const result=await postToCloud({action:'saveFundAccounts',spreadsheetId:currentTrip.spreadsheetId,clientTripId:currentTrip.id,fundAccounts:st});
      if(result?.fundAccounts)currentTrip.fundAccounts=result.fundAccounts;currentTrip.cloudStatus='synced';currentTrip.lastSyncError='';if(typeof markSyncSuccess==='function')markSyncSuccess();persist();renderFundSection();closeFundManagerV83();alert('共同資金已同步，Google Sheet「資金紀錄」也已更新。');
    }catch(err){currentTrip.cloudStatus='pending';currentTrip.lastSyncError=String(err?.message||err);persist();alert('資金設定已保留在手機，但雲端尚未更新：\n'+currentTrip.lastSyncError);}
    finally{if(btn){btn.disabled=false;btn.textContent='儲存資金設定';}}
  };

  const baseOpenTrip=window.openTrip;
  window.openTrip=function(id){const r=typeof baseOpenTrip==='function'?baseOpenTrip(id):undefined;ensureTossPayButton();renderFundSection();return r;};
  const baseRenderTripSummary=window.renderTripSummary;
  if(typeof baseRenderTripSummary==='function')window.renderTripSummary=function(){const r=baseRenderTripSummary();renderFundSection();return r;};

  if(typeof checkBackendVersion==='function'){
    checkBackendVersion=async function(silent=true){
      const webEl=document.getElementById('webVersionText'),scriptEl=document.getElementById('scriptVersionText'),statusEl=document.getElementById('versionMatchStatus'),btn=document.getElementById('versionCheckBtn');if(webEl)webEl.textContent=FUND_WEB_VERSION;
      if(!getApiUrl()){if(scriptEl)scriptEl.textContent='尚未設定';if(statusEl){statusEl.textContent='尚未設定 Apps Script Web App URL';statusEl.className='version-check-status version-check-error';}return false;}
      if(btn)btn.disabled=true;
      try{const data=await postToCloud({action:'getVersion'});const v=String(data.scriptVersion||'');const ok=v===FUND_EXPECTED_BACKEND;state.lastScriptVersion=v;state.lastVersionCheckAt=new Date().toISOString();persist();if(scriptEl)scriptEl.textContent=v||'未知版本';if(statusEl){statusEl.textContent=ok?'版本一致，可以正常同步':'版本不一致：網站需要 '+FUND_EXPECTED_BACKEND+'，目前後端是 '+(v||'未知');statusEl.className='version-check-status '+(ok?'version-check-ok':'version-check-error');}if(!ok&&!silent)alert('Apps Script 版本不一致。\n網站需要：'+FUND_EXPECTED_BACKEND+'\n目前後端：'+(v||'未知版本')+'\n\n請部署 v56 Apps Script。');return ok;}
      catch(err){if(scriptEl)scriptEl.textContent='檢查失敗';if(statusEl){statusEl.textContent='無法讀取 Apps Script 版本：'+(err?.message||err);statusEl.className='version-check-status version-check-error';}return false;}
      finally{if(btn)btn.disabled=false;}
    };
  }
  try{window.WEB_VERSION=FUND_WEB_VERSION;}catch(e){}
  const webEl=document.getElementById('webVersionText');if(webEl)webEl.textContent=FUND_WEB_VERSION;
  ensureFundStyles();ensureTossPayButton();
})();