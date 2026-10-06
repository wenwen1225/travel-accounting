// v84：將共同資金紀錄加入「全部紀錄」；支援篩選、查看、刪除與餘額顯示。
// 後端仍搭配 v56，無需新增 API。
(()=>{
  const FUND_RECORDS_WEB_VERSION='2026.10.06-v84';

  const n=v=>{
    const x=Number(String(v??'').replace(/,/g,''));
    return Number.isFinite(x)?x:0;
  };
  const money=v=>(currentTrip?currencySymbol(currentTrip.currency):'')+Number(v||0).toLocaleString('en-US');
  const defs=()=>{
    const out=[{id:'CASH',label:'現金',pay:'現金'}];
    if(currentTrip?.currency==='KRW'){
      out.push({id:'WOWPASS',label:'WOWPASS',pay:'Wowpass'});
      out.push({id:'TOSS',label:'TOSS',pay:'Toss'});
    }
    return out;
  };
  const def=id=>defs().find(x=>x.id===id)||{id,label:id,pay:id};
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function localFundState(){
    const st=currentTrip?.fundAccounts||{accounts:{},transfers:[]};
    st.accounts=st.accounts&&typeof st.accounts==='object'?st.accounts:{};
    st.transfers=Array.isArray(st.transfers)?st.transfers:[];
    defs().forEach(d=>{
      const a=st.accounts[d.id]||{};
      st.accounts[d.id]={
        initial:n(a.initial),
        initialDate:String(a.initialDate||''),
        entries:Array.isArray(a.entries)?a.entries:[]
      };
    });
    currentTrip.fundAccounts=st;
    return st;
  }

  // 建立完整資金流水，只用來算每筆之後的正確餘額。
  function buildFundLedger(){
    if(!currentTrip) return [];
    const st=localFundState();
    const rows=[];
    let seq=0;
    const push=(row)=>rows.push({...row,_seq:seq++});

    defs().forEach(d=>{
      const a=st.accounts[d.id]||{};
      if(n(a.initial)!==0){
        push({date:a.initialDate||currentTrip.start||'',accountId:d.id,kind:'initial',id:'initial_'+d.id,amount:n(a.initial),title:d.label+' 初始餘額',typeLabel:'初始餘額',editable:true});
      }
      (a.entries||[]).forEach(e=>{
        push({date:String(e.date||''),accountId:d.id,kind:'entry',id:String(e.id||''),amount:n(e.amount),title:d.label+' · '+String(e.type||'資金調整'),typeLabel:String(e.type||'資金調整'),note:String(e.note||''),editable:true});
      });
    });

    (currentTrip.exchange||[]).forEach(e=>push({date:String(e.date||''),accountId:'CASH',kind:'auto_exchange',id:String(e.id||''),amount:n(e.foreign),title:'換匯增加',typeLabel:'換匯'}));

    const payMap={'現金':'CASH','Wowpass':'WOWPASS','Toss':'TOSS'};
    (currentTrip.expenses||[]).forEach(e=>{
      const accountId=payMap[e.pay];
      if(!accountId)return;
      push({date:String(e.date||''),accountId,kind:'auto_expense',id:String(e.id||''),amount:-Math.abs(n(e.foreign)),title:String(e.name||'消費'),typeLabel:'消費'});
    });

    (st.transfers||[]).forEach(t=>{
      const amount=Math.abs(n(t.amount)),fee=Math.abs(n(t.fee));
      push({date:String(t.date||''),accountId:String(t.from||''),kind:'transfer_out',id:String(t.id||''),amount:-amount,title:`${def(t.from).label} → ${def(t.to).label}`,typeLabel:'帳戶轉出',note:String(t.note||''),transfer:t,editable:true});
      if(fee>0) push({date:String(t.date||''),accountId:String(t.from||''),kind:'transfer_fee',id:String(t.id||''),amount:-fee,title:'轉移手續費',typeLabel:'轉移手續費',transfer:t});
      push({date:String(t.date||''),accountId:String(t.to||''),kind:'transfer_in',id:String(t.id||''),amount:amount,title:`${def(t.from).label} → ${def(t.to).label}`,typeLabel:'帳戶轉入',note:String(t.note||''),transfer:t});
    });

    rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')) || a._seq-b._seq);
    const balances={};
    defs().forEach(d=>balances[d.id]=0);
    rows.forEach(r=>{
      if(balances[r.accountId]===undefined) balances[r.accountId]=0;
      balances[r.accountId]+=n(r.amount);
      r.balance=balances[r.accountId];
    });
    return rows;
  }

  // 全部紀錄只加入「不會與原消費／換匯重複」的資金事件。
  function buildFundRecordSource(){
    const ledger=buildFundLedger();
    const seenTransfer=new Set();
    const out=[];
    ledger.forEach(r=>{
      if(r.kind==='auto_exchange'||r.kind==='auto_expense'||r.kind==='transfer_fee'||r.kind==='transfer_in') return;
      if(r.kind==='transfer_out'){
        if(seenTransfer.has(r.id))return;
        seenTransfer.add(r.id);
        const t=r.transfer||{};
        out.push({
          id:'fund_transfer_'+r.id,
          _fundRecord:true,
          _fundKind:'transfer',
          _fundId:r.id,
          accountId:r.accountId,
          date:r.date,
          type:'資金紀錄',
          name:`${def(t.from).label} → ${def(t.to).label}`,
          pay:'資金轉移',
          person:'共同',
          foreign:n(t.amount),
          fee:n(t.fee),
          note:String(t.note||''),
          balance:r.balance,
          fundType:'帳戶轉移'
        });
        return;
      }
      out.push({
        id:'fund_'+r.kind+'_'+r.id,
        _fundRecord:true,
        _fundKind:r.kind,
        _fundId:r.id,
        accountId:r.accountId,
        date:r.date,
        type:'資金紀錄',
        name:r.title,
        pay:def(r.accountId).label,
        person:'共同',
        foreign:Math.abs(n(r.amount)),
        signedAmount:n(r.amount),
        note:r.note||'',
        balance:r.balance,
        fundType:r.typeLabel
      });
    });
    return out;
  }

  function ensureTypeFilter(){
    if(document.getElementById('recordFilterTypeV84')) return;
    const person=document.getElementById('recordFilterPerson');
    if(!person) return;
    const host=person.closest('.form-group')?.parentElement;
    if(!host) return;
    const group=document.createElement('div');
    group.className='form-group';
    group.innerHTML='<label>紀錄類型</label><select id="recordFilterTypeV84" onchange="applyRecordFilters()"><option value="">全部類型</option><option value="購買商品">購買商品</option><option value="先前費用">先前費用</option><option value="換匯">換匯紀錄</option><option value="資金紀錄">資金紀錄</option></select>';
    host.insertBefore(group,person.closest('.form-group'));
  }

  function ensureStyles(){
    if(document.getElementById('fundRecordsV84Styles'))return;
    const s=document.createElement('style');
    s.id='fundRecordsV84Styles';
    s.textContent=`
      .fund-record-card{padding:14px 15px;border-bottom:1px solid var(--line);cursor:pointer}
      .fund-record-card:last-child{border-bottom:0}
      .fund-record-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .fund-record-head strong{display:block;font-size:14px}.fund-record-head span{display:block;color:var(--muted);font-size:11px;margin-top:4px}
      .fund-record-amount{text-align:right;white-space:nowrap}.fund-record-amount strong{font-size:15px}.fund-record-amount span{font-size:11px;color:var(--muted);margin-top:4px}
      .fund-record-actions{display:flex;gap:7px;margin-top:10px}.fund-record-actions button{padding:7px 10px;border-radius:10px;font-size:11px}
      .fund-record-delete{border:1px solid #f3caca;background:#fff7f7;color:var(--danger);font-weight:800}
      .fund-record-positive{color:#15803d}.fund-record-negative{color:var(--danger)}
    `;
    document.head.appendChild(s);
  }

  const baseRecordHtml=window.recordHtml;
  window.recordHtml=function(item){
    if(!item?._fundRecord) return typeof baseRecordHtml==='function'?baseRecordHtml(item):'';
    const d=def(item.accountId);
    const isTransfer=item._fundKind==='transfer';
    const signed=isTransfer?-Math.abs(n(item.foreign)+n(item.fee)):n(item.signedAmount);
    const amountText=isTransfer
      ? `轉移 ${money(item.foreign)}${item.fee?` · 手續費 ${money(item.fee)}`:''}`
      : `${signed>0?'+':signed<0?'−':''}${money(Math.abs(signed))}`;
    const cls=signed>0?'fund-record-positive':signed<0?'fund-record-negative':'';
    return `<div class="fund-record-card" onclick="openFundRecordV84('${safe(item._fundKind)}','${safe(item._fundId)}','${safe(item.accountId)}')">
      <div class="fund-record-head"><div><strong>${safe(item.name)}</strong><span>${safe(dateWithWeekday(item.date)||item.date||'未填日期')} · ${safe(item.fundType||'資金紀錄')}${item.note?' · '+safe(item.note):''}</span></div>
      <div class="fund-record-amount"><strong class="${cls}">${safe(amountText)}</strong><span>${safe(d.label)} 餘額 ${safe(money(item.balance))}</span></div></div>
      <div class="fund-record-actions"><button class="secondary" type="button" onclick="event.stopPropagation();openFundRecordV84('${safe(item._fundKind)}','${safe(item._fundId)}','${safe(item.accountId)}')">管理</button><button class="fund-record-delete" type="button" onclick="event.stopPropagation();deleteFundRecordV84('${safe(item._fundKind)}','${safe(item._fundId)}','${safe(item.accountId)}')">刪除</button></div>
    </div>`;
  };

  const baseOpenRecords=window.openRecords;
  window.openRecords=function(){
    if(typeof baseOpenRecords==='function') baseOpenRecords();
    if(!currentTrip)return;
    ensureStyles();
    ensureTypeFilter();
    const fund=buildFundRecordSource();
    const regular=(allRecordSource||[]).filter(x=>!x?._fundRecord);
    allRecordSource=[...regular,...fund].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    if(document.getElementById('recordsSubtitle')) document.getElementById('recordsSubtitle').textContent=currentTrip.name+' · 包含消費、換匯與共同資金紀錄';
    setupRecordFilters();
    ensureTypeFilter();
    applyRecordFilters();
  };

  window.applyRecordFilters=function(){
    const keyword=(document.getElementById('recordSearch')?.value||'').trim().toLowerCase();
    const date=document.getElementById('recordFilterDate')?.value||'';
    const person=document.getElementById('recordFilterPerson')?.value||'';
    const pay=document.getElementById('recordFilterPay')?.value||'';
    const card=document.getElementById('recordFilterCard')?.value||'';
    const type=document.getElementById('recordFilterTypeV84')?.value||'';
    const filtered=(allRecordSource||[]).filter(item=>{
      if(keyword && !recordSearchText(item).includes(keyword)) return false;
      if(date && normalizeTripDateValue(item.date)!==date) return false;
      if(person && item.person!==person) return false;
      if(pay && item.pay!==pay) return false;
      if(card && item.card!==card) return false;
      if(type && item.type!==type) return false;
      return true;
    });
    const box=document.getElementById('allRecords');
    const count=document.getElementById('recordFilterCount');
    if(count)count.textContent=`${filtered.length} / ${(allRecordSource||[]).length} 筆`;
    if(box)box.innerHTML=filtered.length?filtered.map(recordHtml).join(''):'<div class="empty">沒有符合條件的紀錄</div>';
  };

  const baseClear=window.clearRecordFilters;
  window.clearRecordFilters=function(refresh=true){
    if(typeof baseClear==='function') baseClear(false);
    const t=document.getElementById('recordFilterTypeV84');if(t)t.value='';
    if(refresh)applyRecordFilters();
  };

  window.openFundRecordV84=function(kind,id,accountId){
    if(typeof openFundManagerV83!=='function')return;
    openFundManagerV83();
    setTimeout(()=>{
      if(accountId && typeof selectFundAccountV83==='function') selectFundAccountV83(accountId);
    },0);
  };

  async function syncFundStateSilently(){
    if(!getApiUrl?.()||!currentTrip?.spreadsheetId)return false;
    try{
      const ver=await postToCloud({action:'getVersion'});
      if(String(ver?.scriptVersion||'')!=='v56')return false;
      await postToCloud({action:'saveFundAccounts',spreadsheetId:currentTrip.spreadsheetId,clientTripId:currentTrip.id,fundAccounts:currentTrip.fundAccounts});
      currentTrip.cloudStatus='synced';currentTrip.lastSyncError='';
      if(typeof markSyncSuccess==='function')markSyncSuccess();
      persist();
      return true;
    }catch(err){
      currentTrip.cloudStatus='pending';currentTrip.lastSyncError=String(err?.message||err);persist();
      return false;
    }
  }

  window.deleteFundRecordV84=async function(kind,id,accountId){
    if(!currentTrip)return;
    if(currentTrip.archived)return typeof archiveReadOnlyAlert==='function'?archiveReadOnlyAlert():null;
    const label=kind==='transfer'?'這筆帳戶轉移（含手續費）':kind==='initial'?'這筆初始餘額':'這筆資金紀錄';
    if(!confirm(`確定要刪除${label}嗎？\n刪除後會重新計算相關帳戶餘額。`))return;
    const st=localFundState();
    if(kind==='transfer'){
      st.transfers=(st.transfers||[]).filter(t=>String(t.id)!==String(id));
    }else if(kind==='initial'){
      if(st.accounts[accountId]){st.accounts[accountId].initial=0;st.accounts[accountId].initialDate='';}
    }else{
      if(st.accounts[accountId]) st.accounts[accountId].entries=(st.accounts[accountId].entries||[]).filter(e=>String(e.id)!==String(id));
    }
    currentTrip.fundAccounts=st;persist();
    await syncFundStateSilently();
    openRecords();
  };

  // v84 仍搭配 v56 後端；只更新網站顯示版本。
  const webEl=document.getElementById('webVersionText');
  if(webEl)webEl.textContent=FUND_RECORDS_WEB_VERSION;
  ensureStyles();
})();
