// v87：全部紀錄補「只看資金」；資金卡片改回白/淡粉交錯＋左側類型徽章；資金輸入改為收入/支出/調整按鈕。
// 純前端修正，後端仍搭配 v56。
(()=>{
  const FUND_V87_VERSION='2026.10.07-v87';

  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>(currentTrip?currencySymbol(currentTrip.currency):'')+Number(v||0).toLocaleString('en-US');

  function fundVisual(item){
    const type=String(item?.fundType||'');
    if(item?._fundKind==='transfer') return {key:'transfer',label:'轉',cls:'fund-badge-transfer'};
    if(type.includes('調整')) return {key:'adjust',label:'調',cls:'fund-badge-adjust'};
    const signed=Number(item?.signedAmount??0);
    if(item?._fundKind==='initial' || signed>0 || ['儲值','退款','其他收入'].some(x=>type.includes(x))) return {key:'income',label:'收',cls:'fund-badge-income'};
    return {key:'expense',label:'支',cls:'fund-badge-expense'};
  }

  function ensureStylesV87(){
    if(document.getElementById('fundV87Styles')) return;
    const s=document.createElement('style');
    s.id='fundV87Styles';
    s.textContent=`
      /* v87：資金紀錄跟一般紀錄維持同一個白/淡粉節奏，不整張染類型色 */
      .fund-swipe-shell .fund-swipe-content{background:#fff!important}
      #allRecords>.fund-swipe-shell:nth-child(even) .fund-swipe-content{background:#fff4f6!important}
      .fund-record-v87{display:flex;gap:12px;align-items:flex-start;padding:15px 14px;min-height:92px}
      .fund-type-badge{width:44px;height:44px;flex:0 0 44px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:950;margin-top:2px}
      .fund-badge-income{background:#e8f8ee;color:#15803d}
      .fund-badge-expense{background:#ffe9ee;color:#c2415a}
      .fund-badge-adjust{background:#f1eaff;color:#7c3aed}
      .fund-badge-transfer{background:#e8f2ff;color:#2563eb}
      .fund-record-main{flex:1;min-width:0}
      .fund-record-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .fund-record-title{min-width:0}
      .fund-record-title strong{display:block;font-size:14px;color:var(--text);line-height:1.35}
      .fund-record-title span{display:block;margin-top:5px;font-size:11px;color:var(--muted);line-height:1.4}
      .fund-record-money{text-align:right;white-space:nowrap}
      .fund-record-money strong{display:block;font-size:15px;line-height:1.25}
      .fund-record-money span{display:block;margin-top:5px;font-size:11px;color:var(--muted)}
      .fund-record-v87.income .fund-record-money strong{color:#15803d}
      .fund-record-v87.expense .fund-record-money strong{color:#c2415a}
      .fund-record-v87.adjust .fund-record-money strong{color:#7c3aed}
      .fund-record-v87.transfer .fund-record-money strong{color:#2563eb}

      .fund-category-wrap{margin:2px 0 12px}
      .fund-category-label{display:block;font-size:12px;font-weight:800;color:var(--text);margin-bottom:7px}
      .fund-category-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .fund-category-btn{height:43px;border-radius:13px;border:1px solid var(--line);background:#fff;font-weight:900;font-size:13px}
      .fund-category-btn[data-cat="income"].active{background:#e8f8ee;border-color:#bce8ca;color:#15803d}
      .fund-category-btn[data-cat="expense"].active{background:#ffe9ee;border-color:#f7c5d0;color:#c2415a}
      .fund-category-btn[data-cat="adjust"].active{background:#f1eaff;border-color:#d9c8ff;color:#7c3aed}
      .fund-subtype-label{display:block;font-size:11px;color:var(--muted);margin:8px 0 5px}
      #fundEntryType.fund-subtype-select{height:46px;border-radius:13px}

      .fund-quick-filter{display:inline-flex!important;align-items:center;justify-content:center;gap:5px}
      .fund-quick-filter.active{background:#8b5cf6!important;color:#fff!important;border-color:#8b5cf6!important}
      @media(max-width:560px){.fund-record-v87{padding:14px 12px}.fund-category-buttons{gap:6px}.fund-category-btn{font-size:12px}}
    `;
    document.head.appendChild(s);
  }

  // -------- 全部紀錄：加一顆「只看資金」快捷篩選 --------
  function ensureFundQuickFilterV87(){
    const typeSel=document.getElementById('recordFilterTypeV84');
    if(!typeSel) return;
    if(document.getElementById('recordOnlyFundV87')) return;

    const exchangeBtn=[...document.querySelectorAll('#page-records button')].find(b=>String(b.textContent||'').includes('只看換匯'));
    if(!exchangeBtn) return;

    const btn=document.createElement('button');
    btn.id='recordOnlyFundV87';
    btn.type='button';
    btn.className=(exchangeBtn.className||'pill')+' fund-quick-filter';
    btn.textContent='💰 只看資金';
    btn.onclick=()=>{
      const sel=document.getElementById('recordFilterTypeV84');
      if(!sel)return;
      const on=sel.value==='資金紀錄';
      if(on){
        sel.value='';
      }else{
        if(typeof clearRecordFilters==='function') clearRecordFilters(false);
        sel.value='資金紀錄';
      }
      syncFundQuickFilterStateV87();
      if(typeof applyRecordFilters==='function') applyRecordFilters();
    };
    exchangeBtn.parentElement?.insertBefore(btn,exchangeBtn);
  }

  function syncFundQuickFilterStateV87(){
    const btn=document.getElementById('recordOnlyFundV87');
    const sel=document.getElementById('recordFilterTypeV84');
    if(btn) btn.classList.toggle('active',sel?.value==='資金紀錄');
  }

  // 資金卡片：左側徽章區分「收 / 支 / 調 / 轉」，背景回到一般紀錄交錯色。
  const baseRecordHtmlV87=window.recordHtml;
  window.recordHtml=function(item){
    if(!item?._fundRecord) return typeof baseRecordHtmlV87==='function'?baseRecordHtmlV87(item):'';
    const v=fundVisual(item);
    const isTransfer=item._fundKind==='transfer';
    const signed=isTransfer?-Math.abs(Number(item.foreign||0)+Number(item.fee||0)):Number(item.signedAmount||0);
    const amountText=isTransfer
      ? `轉移 ${money(item.foreign)}${item.fee?` · 手續費 ${money(item.fee)}`:''}`
      : `${signed>0?'+':signed<0?'−':''}${money(Math.abs(signed))}`;
    const balanceLabel=isTransfer
      ? `${String(item.name||'').split(' → ')[0]||'來源'} 餘額 ${money(item.balance)}`
      : `${item.pay||''} 餘額 ${money(item.balance)}`;
    const detail=[dateWithWeekday(item.date)||item.date||'未填日期',item.fundType||'資金紀錄',item.note||''].filter(Boolean).join(' · ');
    return `<div class="fund-swipe-shell" data-kind="${safe(item._fundKind)}" data-id="${safe(item._fundId)}" data-account="${safe(item.accountId)}">
      <button class="fund-swipe-delete" type="button">刪除</button>
      <div class="fund-swipe-content">
        <div class="fund-record-v87 ${v.key}" onclick="openFundRecordV84('${safe(item._fundKind)}','${safe(item._fundId)}','${safe(item.accountId)}')">
          <div class="fund-type-badge ${v.cls}">${v.label}</div>
          <div class="fund-record-main">
            <div class="fund-record-top">
              <div class="fund-record-title"><strong>${safe(item.name||'資金紀錄')}</strong><span>${safe(detail)}</span></div>
              <div class="fund-record-money"><strong>${safe(amountText)}</strong><span>${safe(balanceLabel)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  };

  // -------- 資金管理：收入 / 支出 / 調整改成顏色按鈕 --------
  let activeCategoryV87='income';
  const categoryMapV87={
    income:[['儲值','儲值'],['退款','退款'],['其他收入','其他收入']],
    expense:[['支出','手動支出']],
    adjust:[['調整增加','增加'],['調整減少','減少']]
  };

  function inferCategoryV87(value){
    value=String(value||'');
    if(value==='支出')return 'expense';
    if(value==='調整增加'||value==='調整減少')return 'adjust';
    return 'income';
  }

  function setFundCategoryV87(cat,keepValue=''){
    if(!categoryMapV87[cat])cat='income';
    activeCategoryV87=cat;
    const sel=document.getElementById('fundEntryType');
    if(sel){
      const old=keepValue||sel.value;
      sel.innerHTML=categoryMapV87[cat].map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      if([...sel.options].some(o=>o.value===old))sel.value=old;
      sel.classList.add('fund-subtype-select');
    }
    document.querySelectorAll('.fund-category-btn').forEach(b=>b.classList.toggle('active',b.dataset.cat===cat));
  }
  window.setFundCategoryV87=setFundCategoryV87;

  function ensureFundCategoryButtonsV87(){
    const sel=document.getElementById('fundEntryType');
    if(!sel)return;
    if(document.getElementById('fundCategoryWrapV87')){
      setFundCategoryV87(inferCategoryV87(sel.value),sel.value);
      return;
    }
    const group=sel.closest('.form-group');
    if(!group)return;
    const wrap=document.createElement('div');
    wrap.id='fundCategoryWrapV87';
    wrap.className='fund-category-wrap';
    wrap.innerHTML=`<span class="fund-category-label">類型</span><div class="fund-category-buttons">
      <button type="button" class="fund-category-btn" data-cat="income" onclick="setFundCategoryV87('income')">收入</button>
      <button type="button" class="fund-category-btn" data-cat="expense" onclick="setFundCategoryV87('expense')">支出</button>
      <button type="button" class="fund-category-btn" data-cat="adjust" onclick="setFundCategoryV87('adjust')">調整</button>
    </div><span class="fund-subtype-label">細項</span>`;
    group.insertBefore(wrap,sel);
    setFundCategoryV87(activeCategoryV87,sel.value);
  }

  const baseOpenFundManagerV87=window.openFundManagerV83;
  window.openFundManagerV83=function(){
    const r=typeof baseOpenFundManagerV87==='function'?baseOpenFundManagerV87():undefined;
    ensureFundCategoryButtonsV87();
    return r;
  };

  const baseSelectFundAccountV87=window.selectFundAccountV83;
  window.selectFundAccountV83=function(id){
    const r=typeof baseSelectFundAccountV87==='function'?baseSelectFundAccountV87(id):undefined;
    ensureFundCategoryButtonsV87();
    return r;
  };

  // 每次重新渲染全部紀錄後，補快捷按鈕與狀態。
  const baseApplyRecordFiltersV87=window.applyRecordFilters;
  window.applyRecordFilters=function(){
    const r=typeof baseApplyRecordFiltersV87==='function'?baseApplyRecordFiltersV87():undefined;
    ensureStylesV87();
    ensureFundQuickFilterV87();
    syncFundQuickFilterStateV87();
    return r;
  };

  const baseOpenRecordsV87=window.openRecords;
  window.openRecords=function(){
    const r=typeof baseOpenRecordsV87==='function'?baseOpenRecordsV87():undefined;
    ensureStylesV87();
    ensureFundQuickFilterV87();
    syncFundQuickFilterStateV87();
    if(typeof applyRecordFilters==='function') applyRecordFilters();
    return r;
  };

  // 下拉手動切換時，也同步快捷按鈕狀態。
  document.addEventListener('change',e=>{
    if(e.target?.id==='recordFilterTypeV84') syncFundQuickFilterStateV87();
  });

  ensureStylesV87();
  try{window.WEB_VERSION=FUND_V87_VERSION;}catch(e){}
})();
