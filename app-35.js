// v89：僅做局部資金 UI 修正，不覆寫全站核心事件。
(()=>{
  const VER='2026.10.07-v89';
  const n=v=>{const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0;};

  function activeFundId(){
    const btn=document.querySelector('#fundAccountTabs button.active');
    const m=(btn?.getAttribute('onclick')||'').match(/selectFundAccountV83\('([^']+)'\)/);
    return m?m[1]:'CASH';
  }

  function ensureStyles(){
    if(document.getElementById('fundV89Styles'))return;
    const s=document.createElement('style');
    s.id='fundV89Styles';
    s.textContent=`
      .fund-v89-type{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 10px}
      .fund-v89-type button,.fund-v89-sub button{border:1px solid var(--line);background:#fff;border-radius:14px;height:44px;font-weight:900;font-size:13px}
      .fund-v89-type button[data-cat="income"].active{background:#eaf8ef;color:#15803d;border-color:#bfe6ca}
      .fund-v89-type button[data-cat="expense"].active{background:#fff0f3;color:#c2415a;border-color:#f5c8d1}
      .fund-v89-type button[data-cat="adjust"].active{background:#f3edff;color:#7c3aed;border-color:#dbcaff}
      .fund-v89-sub{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}
      .fund-v89-sub button{height:38px;padding:0 12px;flex:0 0 auto}
      .fund-v89-sub button.active{background:#f5f1ff;color:#6d49d8;border-color:#d8caff}
      #fundEntryType{display:none!important}
      .fund-v89-quick{display:inline-flex;align-items:center;justify-content:center;gap:5px}
      .fund-v89-quick.active{background:#8b5cf6!important;color:#fff!important;border-color:#8b5cf6!important}
      .fund-swipe-shell .fund-swipe-content{background:#fff!important}
      #allRecords>.fund-swipe-shell:nth-child(even) .fund-swipe-content{background:#fff4f6!important}
      .fund-swipe-shell .fund-record-card{position:relative;padding-left:70px!important;min-height:78px}
      .fund-swipe-shell .fund-record-card:before{position:absolute;left:14px;top:15px;width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-weight:950;font-size:16px;content:'資';background:#f0edff;color:#7053c8}
      .fund-swipe-shell.fund-v86-income .fund-record-card:before{content:'收';background:#e8f8ee;color:#15803d}
      .fund-swipe-shell.fund-v86-expense .fund-record-card:before{content:'支';background:#ffe9ee;color:#c2415a}
      .fund-swipe-shell.fund-v86-adjust .fund-record-card:before{content:'調';background:#f1eaff;color:#7c3aed}
      .fund-swipe-shell.fund-v86-transfer .fund-record-card:before{content:'轉';background:#e8f2ff;color:#2563eb}
      .fund-swipe-shell.fund-v86-income .fund-swipe-content,
      .fund-swipe-shell.fund-v86-expense .fund-swipe-content,
      .fund-swipe-shell.fund-v86-adjust .fund-swipe-content,
      .fund-swipe-shell.fund-v86-transfer .fund-swipe-content{background:inherit!important}
    `;
    document.head.appendChild(s);
  }

  const map={
    income:[['儲值','儲值'],['退款','退款'],['其他收入','其他收入']],
    expense:[['支出','手動支出']],
    adjust:[['調整增加','增加'],['調整減少','減少']]
  };

  function inferCat(v){
    if(v==='支出')return 'expense';
    if(v==='調整增加'||v==='調整減少')return 'adjust';
    return 'income';
  }

  function renderSub(cat,keep){
    const sel=document.getElementById('fundEntryType');
    const sub=document.getElementById('fundV89Sub');
    if(!sel||!sub)return;
    const choices=map[cat]||map.income;
    const wanted=choices.some(x=>x[0]===keep)?keep:choices[0][0];
    sel.innerHTML=choices.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
    sel.value=wanted;
    sub.innerHTML=choices.map(([v,l])=>`<button type="button" data-val="${v}" class="${v===wanted?'active':''}">${l}</button>`).join('');
    sub.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      sel.value=b.dataset.val||'';
      sub.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    }));
    document.querySelectorAll('#fundV89Type button').forEach(b=>b.classList.toggle('active',b.dataset.cat===cat));
  }

  function ensureFundButtons(){
    const sel=document.getElementById('fundEntryType');
    if(!sel||document.getElementById('fundV89Type'))return;
    const group=sel.closest('.form-group');
    if(!group)return;
    const oldLabel=group.querySelector(':scope > label');
    if(oldLabel)oldLabel.textContent='新增資金紀錄';
    const type=document.createElement('div');
    type.id='fundV89Type';
    type.className='fund-v89-type';
    type.innerHTML='<button type="button" data-cat="income">收入</button><button type="button" data-cat="expense">支出</button><button type="button" data-cat="adjust">調整</button>';
    const sub=document.createElement('div');sub.id='fundV89Sub';sub.className='fund-v89-sub';
    group.insertBefore(type,sel);group.insertBefore(sub,sel.nextSibling);
    type.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>renderSub(b.dataset.cat||'income','')));
    renderSub(inferCat(sel.value),sel.value);
  }

  function flagMap(){
    if(!currentTrip)return {};
    if(!currentTrip.fundInitialSet||typeof currentTrip.fundInitialSet!=='object') currentTrip.fundInitialSet={};
    const acc=currentTrip.fundAccounts?.accounts||{};
    ['CASH','WOWPASS','TOSS'].forEach(id=>{if(Number(acc[id]?.initial||0)!==0) currentTrip.fundInitialSet[id]=true;});
    return currentTrip.fundInitialSet;
  }

  function syncFlagToAccount(){
    const id=activeFundId();
    const a=currentTrip?.fundAccounts?.accounts?.[id];
    if(!a)return;
    const flags=flagMap();
    if(flags[id]) a.initialSet=true;
    const input=document.getElementById('fundInitialInput');
    if(input && flags[id] && String(input.value||'').trim()==='' && Number(a.initial||0)===0) input.value='0';
  }

  function bindZeroInitial(){
    const input=document.getElementById('fundInitialInput');
    if(!input||input.dataset.v89ZeroBound==='1')return;
    input.dataset.v89ZeroBound='1';
    const save=()=>{
      if(!currentTrip?.fundAccounts?.accounts)return;
      const id=activeFundId();
      const a=currentTrip.fundAccounts.accounts[id];
      if(!a)return;
      const raw=String(input.value??'').trim();
      a.initial=n(raw);
      const flags=flagMap();
      flags[id]=raw!=='';
      a.initialSet=raw!=='';
      const d=document.getElementById('fundInitialDate');
      if(d?.value)a.initialDate=d.value;
      if(typeof persist==='function')persist();
    };
    input.addEventListener('input',save);
    input.addEventListener('change',save);
  }

  function ensureQuickFundFilter(){
    const sel=document.getElementById('recordFilterTypeV84');
    if(!sel||document.getElementById('recordOnlyFundV89'))return;
    const exchange=[...document.querySelectorAll('#page-records button')].find(b=>(b.textContent||'').includes('只看換匯'));
    if(!exchange)return;
    const b=document.createElement('button');
    b.id='recordOnlyFundV89';b.type='button';b.className=(exchange.className||'secondary')+' fund-v89-quick';b.textContent='💰 只看資金';
    b.addEventListener('click',()=>{
      const on=sel.value==='資金紀錄';
      if(!on && typeof clearRecordFilters==='function')clearRecordFilters(false);
      sel.value=on?'':'資金紀錄';
      b.classList.toggle('active',!on);
      if(typeof applyRecordFilters==='function')applyRecordFilters();
    });
    exchange.parentElement?.insertBefore(b,exchange);
  }

  const baseSaveFundV89=window.saveFundAccountsV83;
  if(typeof baseSaveFundV89==='function') window.saveFundAccountsV83=function(){
    syncFlagToAccount();
    return baseSaveFundV89.apply(this,arguments);
  };
  const baseSelectFundV89=window.selectFundAccountV83;
  if(typeof baseSelectFundV89==='function') window.selectFundAccountV83=function(id){
    syncFlagToAccount();
    const r=baseSelectFundV89.apply(this,arguments);
    setTimeout(()=>{syncFlagToAccount();ensureFundButtons();bindZeroInitial();},0);
    return r;
  };
  const baseOpenFundV89=window.openFundManagerV83;
  if(typeof baseOpenFundV89==='function') window.openFundManagerV83=function(){
    const r=baseOpenFundV89.apply(this,arguments);
    setTimeout(()=>{syncFlagToAccount();ensureFundButtons();bindZeroInitial();},0);
    return r;
  };

  function injectZeroInitialRecords(){
    if(!currentTrip||!Array.isArray(window.allRecordSource))return;
    const flags=flagMap();
    const defs=[['CASH','現金'],['WOWPASS','WOWPASS'],['TOSS','TOSS']];
    defs.forEach(([id,label])=>{
      if(!flags[id])return;
      const a=currentTrip.fundAccounts?.accounts?.[id];
      if(!a||Number(a.initial||0)!==0)return;
      const rid='fund_initial_initial_'+id;
      if(allRecordSource.some(x=>x?.id===rid))return;
      allRecordSource.push({id:rid,_fundRecord:true,_fundKind:'initial',_fundId:'initial_'+id,accountId:id,date:a.initialDate||currentTrip.start||'',type:'資金紀錄',name:label+' 初始餘額',pay:label,person:'共同',foreign:0,signedAmount:0,note:'',balance:0,fundType:'初始餘額'});
    });
    allRecordSource.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  const baseOpenRecordsV89=window.openRecords;
  if(typeof baseOpenRecordsV89==='function') window.openRecords=function(){
    const r=baseOpenRecordsV89.apply(this,arguments);
    injectZeroInitialRecords();
    if(typeof applyRecordFilters==='function')applyRecordFilters();
    return r;
  };

  function tick(){
    ensureStyles();
    syncFlagToAccount();
    ensureFundButtons();
    bindZeroInitial();
    ensureQuickFundFilter();
    const web=document.getElementById('webVersionText');
    if(web && !String(web.textContent||'').includes('v89')) web.textContent=VER;
  }

  const obs=new MutationObserver(()=>tick());
  if(document.body)obs.observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener('change',e=>{
    if(e.target?.id==='recordFilterTypeV84') document.getElementById('recordOnlyFundV89')?.classList.toggle('active',e.target.value==='資金紀錄');
  });
  tick();
})();
