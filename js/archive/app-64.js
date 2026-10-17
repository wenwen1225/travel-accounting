// v136：資金帳戶依旅程幣別分流＋每日現金流摘要。
// KRW：現金 / WOWPASS / TOSS；其他幣別：僅現金。
// 每日摘要顯示收入、支出、累計剩餘；不修改後端與既有資金資料。
(()=>{
  const VER='2026.10.13-v136-fund-currency-daily-summary';
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const ymd=v=>{
    if(typeof normalizeTripDateValue==='function') return normalizeTripDateValue(v)||'';
    const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}-${m[3]}`:'';
  };
  const tripCurrency=()=>String(currentTrip?.currency||'').toUpperCase();
  const activeIds=()=>tripCurrency()==='KRW'?['CASH','WOWPASS','TOSS']:['CASH'];
  const sym=()=>{try{return currencySymbol(tripCurrency());}catch(e){return tripCurrency()+' ';}};
  const money=v=>sym()+Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});

  function dateRange(){
    const dates=new Set();
    const add=v=>{const d=ymd(v);if(d)dates.add(d);};
    const parse=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3],12):null;};
    const start=parse(ymd(currentTrip?.start));
    const end=parse(ymd(currentTrip?.end));
    if(start&&end){
      const a=start<=end?start:end,b=start<=end?end:start;
      for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)){
        add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
    }
    const st=currentTrip?.fundAccounts||{};
    activeIds().forEach(id=>{
      const a=st.accounts?.[id];
      add(a?.initialDate||currentTrip?.start);
      (a?.entries||[]).forEach(e=>add(e.date));
    });
    (currentTrip?.exchange||[]).forEach(e=>add(e.date));
    (currentTrip?.expenses||[]).forEach(e=>add(e.date));
    (st.transfers||[]).forEach(t=>add(t.date));
    return [...dates].sort();
  }

  function dailyRows(){
    if(!currentTrip)return [];
    const ids=new Set(activeIds());
    const st=currentTrip.fundAccounts||{accounts:{},transfers:[]};
    const map=new Map();
    const ensure=date=>{
      const d=ymd(date);if(!d)return null;
      if(!map.has(d))map.set(d,{date:d,income:0,spend:0,delta:0,initial:0});
      return map.get(d);
    };

    // 初始餘額：影響剩餘，但不列入當日收入。
    ids.forEach(id=>{
      const a=st.accounts?.[id];
      if(!a)return;
      const hasInitial=Boolean(a.initialSet)||num(a.initial)!==0||String(a.initialDate||'').trim()!=='';
      if(hasInitial){
        const r=ensure(a.initialDate||currentTrip.start);
        if(r){r.initial+=num(a.initial);r.delta+=num(a.initial);}
      }
      (a.entries||[]).forEach(e=>{
        const amount=num(e.amount);const r=ensure(e.date);if(!r||!amount)return;
        r.delta+=amount;
        if(amount>0)r.income+=amount;else r.spend+=Math.abs(amount);
      });
    });

    // 任意幣別換匯已將「旅程主幣別的現金增減」保留在 foreign。
    (currentTrip.exchange||[]).forEach(e=>{
      const amount=num(e.foreign);const r=ensure(e.date);if(!r||!amount)return;
      r.delta+=amount;
      if(amount>0)r.income+=amount;else r.spend+=Math.abs(amount);
    });

    // 只有目前旅程可用的共同資金帳戶才會納入。
    const payToId={'現金':'CASH','Wowpass':'WOWPASS','Toss':'TOSS'};
    (currentTrip.expenses||[]).forEach(e=>{
      const id=payToId[e.pay];
      if(!id||!ids.has(id))return;
      const amount=Math.max(0,num(e.foreign));const r=ensure(e.date);if(!r||!amount)return;
      r.delta-=amount;r.spend+=amount;
    });

    // 帳戶間本金只是移動；只有手續費會減少總資金並列支出。
    (st.transfers||[]).forEach(t=>{
      if(!ids.has(String(t.from||''))||!ids.has(String(t.to||'')))return;
      const fee=Math.max(0,num(t.fee));const r=ensure(t.date);if(!r||!fee)return;
      r.delta-=fee;r.spend+=fee;
    });

    dateRange().forEach(ensure);
    let balance=0;
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>{
      balance+=r.delta;
      return {...r,balance};
    });
  }

  function installStyles(){
    if(document.getElementById('fundDailyV136Style'))return;
    const s=document.createElement('style');s.id='fundDailyV136Style';s.textContent=`
      .fund-rule-note{margin:8px 0 0;font-size:11px;color:var(--muted);line-height:1.55}
      .fund-daily-card{margin-top:12px;padding:0;overflow:hidden}
      .fund-daily-head{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.15fr;gap:6px;padding:10px 12px;background:#f7f3ff;color:#6f52c8;font-size:11px;font-weight:900;text-align:right}
      .fund-daily-head span:first-child{text-align:left}
      .fund-daily-row{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.15fr;gap:6px;padding:11px 12px;border-top:1px solid var(--line);font-size:12px;align-items:center;text-align:right;background:#fff}
      .fund-daily-row:nth-child(odd){background:#fffafd}.fund-daily-date{text-align:left;font-weight:800}.fund-daily-income{color:#2f7c4d}.fund-daily-spend{color:#b4535b}.fund-daily-balance{font-weight:900;color:#5f48b5}
      .fund-daily-note{padding:9px 12px;border-top:1px solid var(--line);font-size:10.5px;color:var(--muted);line-height:1.5;background:#faf8fd}
      @media(max-width:420px){.fund-daily-head,.fund-daily-row{grid-template-columns:1.25fr .9fr .9fr 1.1fr;padding-left:9px;padding-right:9px;font-size:10.5px}.fund-daily-row{font-size:11px}}
    `;document.head.appendChild(s);
  }

  function dateLabel(date){
    try{return dateWithWeekday(date).replace(/^\d{4}\//,'');}catch(e){return date;}
  }

  function ensureDailySection(){
    installStyles();
    const fund=document.getElementById('fundAccountsSection');
    if(!fund)return null;
    let sec=document.getElementById('fundDailySummaryV136');
    if(!sec){
      sec=document.createElement('div');sec.id='fundDailySummaryV136';sec.className='section';
      fund.insertAdjacentElement('afterend',sec);
    }
    return sec;
  }

  function renderDailySummary(){
    if(!currentTrip)return;
    const sec=ensureDailySection();if(!sec)return;
    const rows=dailyRows();
    const title=tripCurrency()==='KRW'?'每日共同資金流':'每日現金流';
    sec.innerHTML=`
      <div class="section-title">${title} <small>${tripCurrency()}</small></div>
      <div class="card fund-daily-card">
        <div class="fund-daily-head"><span>日期</span><span>收入</span><span>支出</span><span>剩餘</span></div>
        ${rows.length?rows.map(r=>`<div class="fund-daily-row"><span class="fund-daily-date">${dateLabel(r.date)}</span><span class="fund-daily-income">${r.income?('+'+money(r.income)):'—'}</span><span class="fund-daily-spend">${r.spend?('-'+money(r.spend)):'—'}</span><span class="fund-daily-balance">${money(r.balance)}</span></div>`).join(''):'<div class="empty">目前還沒有資金紀錄</div>'}
        <div class="fund-daily-note">初始餘額會計入「剩餘」，但不列為當日收入。換匯、現金／共同帳戶消費、手動收支與帳戶轉移手續費都會自動反映。</div>
      </div>`;
  }

  function applyCurrencyRules(){
    if(!currentTrip)return;
    const isKr=tripCurrency()==='KRW';
    const sec=document.getElementById('fundAccountsSection');
    if(sec){
      const title=sec.querySelector('.section-title');
      if(title)title.innerHTML=isKr?'韓國共同資金 <small>現金・WOWPASS・TOSS</small>':`${tripCurrency()} 現金 <small>此旅程僅使用現金帳戶</small>`;
      const label=sec.querySelector('.cash-wallet-label');
      if(label)label.textContent=isKr?'總剩餘資金':'現金剩餘';
      const btn=sec.querySelector('button[onclick*="openFundManagerV83"]');
      if(btn)btn.textContent=isKr?'管理資金 / 帳戶轉移':'管理現金';
      let note=sec.querySelector('.fund-rule-note');
      if(!note){note=document.createElement('div');note.className='fund-rule-note';const grid=document.getElementById('fundMiniGrid');grid?.insertAdjacentElement('afterend',note);}
      if(note)note.textContent=isKr?'韓國旅程分為現金、WOWPASS、TOSS 三個共同資金帳戶。':'非韓國旅程只計算現金帳戶，不會把 WOWPASS / TOSS 納入餘額或每日現金流。';
    }

    const overlay=document.getElementById('fundManagerOverlay');
    if(overlay){
      const h2=overlay.querySelector('h2');if(h2)h2.textContent=isKr?'共同資金帳戶':'外幣現金';
      const transfer=document.getElementById('fundTransferBox');if(transfer)transfer.classList.toggle('hidden',!isKr);
      const symbol=sym();
      overlay.querySelectorAll('.money-prefix').forEach(x=>x.textContent=symbol);
      document.querySelectorAll('#fundAccountTabs button').forEach(btn=>{
        const code=String(btn.getAttribute('onclick')||'');
        if(!isKr&&(code.includes("'WOWPASS'")||code.includes("'TOSS'")))btn.classList.add('hidden');
      });
    }
  }

  function refreshAll(){applyCurrencyRules();renderDailySummary();}

  const baseRenderTripSummary=window.renderTripSummary;
  if(typeof baseRenderTripSummary==='function'){
    window.renderTripSummary=function(){
      const r=baseRenderTripSummary.apply(this,arguments);
      setTimeout(refreshAll,0);
      return r;
    };
  }

  const baseOpenTrip=window.openTrip;
  if(typeof baseOpenTrip==='function'){
    window.openTrip=function(){
      const r=baseOpenTrip.apply(this,arguments);
      setTimeout(refreshAll,0);
      return r;
    };
  }

  const baseOpenFund=window.openFundManagerV83;
  if(typeof baseOpenFund==='function'){
    window.openFundManagerV83=function(){
      const r=baseOpenFund.apply(this,arguments);
      setTimeout(applyCurrencyRules,0);
      return r;
    };
  }

  const baseSelectFund=window.selectFundAccountV83;
  if(typeof baseSelectFund==='function'){
    window.selectFundAccountV83=function(){
      const r=baseSelectFund.apply(this,arguments);
      setTimeout(applyCurrencyRules,0);
      return r;
    };
  }

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){const r=baseRenderSettings.apply(this,arguments);const w=document.getElementById('webVersionText');if(w)w.textContent=VER;return r;};
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
  setTimeout(()=>{if(currentTrip)refreshAll();},0);
})();
