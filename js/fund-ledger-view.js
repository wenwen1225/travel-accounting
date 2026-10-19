// 旅程資金明細：唯讀呈現，不修改任何記帳、同步、退稅或資金資料。
(()=>{
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>((v<0?'-':'')+currencySymbol(currentTrip.currency)+Math.abs(v).toLocaleString('en-US'));
  function rowsFor(trip){
    const defs=[{id:'CASH',label:'現金',pay:'現金'}];
    if(trip.currency==='KRW')defs.push({id:'WOWPASS',label:'WOWPASS',pay:'Wowpass'},{id:'TOSS',label:'TOSS',pay:'Toss'});
    const state=trip.fundAccounts||{accounts:{},transfers:[]},rows=[];
    defs.forEach(d=>{
      const a=state.accounts?.[d.id]||{};
      if(a.initialSet||num(a.initial)!==0||a.initialDate)rows.push({date:a.initialDate||trip.start||'',id:d.id,label:d.label+' 初始餘額',amount:num(a.initial),kind:'initial'});
      (a.entries||[]).forEach(e=>rows.push({date:e.date||'',id:d.id,label:(e.type||'資金調整')+(e.note?' · '+e.note:''),amount:num(e.amount),kind:'manual'}));
    });
    (trip.exchange||[]).forEach(e=>rows.push({date:e.date||'',id:'CASH',label:'換匯收入'+(e.place?' · '+e.place:''),amount:num(e.foreign),kind:'exchange'}));
    (trip.expenses||[]).forEach(e=>{const d=defs.find(x=>x.pay===e.pay);if(d)rows.push({date:e.date||'',id:d.id,label:'消費 · '+(e.name||'未命名'),amount:-num(e.foreign),kind:'expense'});});
    (state.transfers||[]).forEach(t=>{
      rows.push({date:t.date||'',id:t.from,label:'轉出'+(t.note?' · '+t.note:''),amount:-num(t.amount)-num(t.fee),kind:'transfer'});
      rows.push({date:t.date||'',id:t.to,label:'轉入'+(t.note?' · '+t.note:''),amount:num(t.amount),kind:'transfer'});
    });
    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const balances={};rows.forEach(r=>{balances[r.id]=(balances[r.id]||0)+r.amount;r.balance=balances[r.id];});
    return {rows,defs};
  }
  function showFundLedger(){
    if(!currentTrip)return;
    const overlay=document.getElementById('fundLedgerOverlay');if(!overlay)return;
    const {rows,defs}=rowsFor(currentTrip);
    const filter=document.getElementById('fundLedgerAccount');
    const previous=filter.value;
    filter.innerHTML='<option value="">所有帳戶</option>'+defs.map(d=>'<option value="'+d.id+'">'+d.label+'</option>').join('');
    filter.value=defs.some(d=>d.id===previous)?previous:'';
    overlay.classList.remove('hidden');
    renderFundLedgerRows(rows);
  }
  function renderFundLedgerRows(precomputed){
    if(!currentTrip)return;
    const {rows}=precomputed?{rows:precomputed}:rowsFor(currentTrip);
    const account=document.getElementById('fundLedgerAccount')?.value||'';
    const root=document.getElementById('fundLedgerRows');if(!root)return;
    const selected=rows.filter(r=>!account||r.id===account).slice().reverse();
    const defs=rowsFor(currentTrip).defs;
    const missing=defs.filter(d=>{
      const a=currentTrip.fundAccounts?.accounts?.[d.id]||{};
      const confirmed=a.initialSet===true||Number(a.initial||0)!==0||!!a.initialDate;
      const active=rows.some(r=>r.id===d.id&&r.kind!=='initial');
      return active&&!confirmed;
    });
    const uncertain=new Set(missing.map(d=>d.id));
    let warning=document.getElementById('fundLedgerWarning');
    if(!warning){warning=document.createElement('div');warning.id='fundLedgerWarning';warning.style.cssText='padding:9px 11px;border-radius:10px;background:#fff7e9;color:#8b6137;font-size:12px;line-height:1.5;margin:8px 0';root.insertAdjacentElement('beforebegin',warning);}
    warning.style.display=missing.length?'':'none';
    if(missing.length)warning.textContent='缺少初始餘額：'+missing.map(d=>d.label).join('、')+'。以下仍可核對每筆收入／支出，但逐筆餘額暫不顯示，以免誤認為實際結餘。';
    root.innerHTML=selected.length?selected.map(r=>'<div class="fund-ledger-row"><div><div class="fund-ledger-name">'+safe(r.label)+'</div><div class="fund-ledger-meta">'+safe(r.date)+' · '+safe(r.id)+'</div></div><div class="fund-ledger-numbers"><strong class="'+(r.amount<0?'negative':'')+'">'+fmt(r.amount)+'</strong><span>餘額 '+fmt(r.balance)+'</span></div></div>').join(''):'<div class="fund-ledger-empty">目前沒有可顯示的資金流水紀錄</div>';
  }
  function ensure(){
    if(document.getElementById('fundLedgerOverlay'))return;
    const style=document.createElement('style');style.textContent='#fundLedgerOverlay .fund-ledger-dialog{width:min(94vw,490px);max-height:86vh;overflow:auto;text-align:left;padding:20px}#fundLedgerOverlay .fund-ledger-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #eee8f6;padding:11px 2px}#fundLedgerOverlay .fund-ledger-name{font-size:13px;font-weight:700}#fundLedgerOverlay .fund-ledger-meta{font-size:11px;color:#94899f;margin-top:4px}#fundLedgerOverlay .fund-ledger-numbers{text-align:right;white-space:nowrap;font-size:13px}#fundLedgerOverlay .fund-ledger-numbers strong{display:block;color:#594478}#fundLedgerOverlay .fund-ledger-numbers strong.negative{color:#bc6572}#fundLedgerOverlay .fund-ledger-numbers span{font-size:11px;color:#94899f}#fundLedgerOverlay .fund-ledger-empty{text-align:center;padding:25px;color:#968ba2}#fundLedgerOverlay .fund-ledger-hint{font-size:11px;color:#8b7c98;line-height:1.5;margin:10px 0}';
    document.head.append(style);
    const overlay=document.createElement('div');overlay.id='fundLedgerOverlay';overlay.className='save-overlay hidden';overlay.innerHTML='<div class="save-dialog fund-ledger-dialog"><h2>資金流水紀錄</h2><p class="fund-ledger-hint">依日期顯示各帳戶收入、消費、換匯及轉帳。若初始餘額未完整讀回，逐筆餘額僅供核對，不代表實際結餘。此頁僅供查看，不會寫入雲端。</p><div class="form-group"><label>篩選帳戶</label><select id="fundLedgerAccount" onchange="renderFundLedgerRows()"></select></div><div id="fundLedgerRows"></div><button type="button" class="secondary" style="width:100%;margin-top:15px" onclick="document.getElementById(\'fundLedgerOverlay\').classList.add(\'hidden\')">關閉</button></div>';
    document.body.append(overlay);
  }
  window.renderFundLedgerRows=renderFundLedgerRows;
  window.openFundLedger=()=>{ensure();showFundLedger();};
  const base=window.renderTripSummary;
  window.renderTripSummary=function(){const result=typeof base==='function'?base():undefined;const sec=document.getElementById('fundAccountsSection');if(sec&&!document.getElementById('fundLedgerOpenBtn')){const btn=document.createElement('button');btn.id='fundLedgerOpenBtn';btn.type='button';btn.className='secondary';btn.style.cssText='width:100%;margin-top:8px;font-size:12px;border-radius:12px';btn.textContent='查看資金流水紀錄';btn.onclick=window.openFundLedger;sec.querySelector('.fund-overview')?.append(btn);}return result;};
  ensure();
})();