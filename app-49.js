// v119：首頁機台退稅摘要只顯示 2 筆並使用交錯底色；全部紀錄付款方式正規化去重。
// 純前端補丁，不修改 Google Apps Script / Sheet 結構。
(()=>{
  const VER='2026.10.11-v119-ui-cleanup';

  function canonicalPaymentLabel(value){
    const raw=String(value ?? '').trim();
    if(!raw) return '';
    const key=raw.toLowerCase().replace(/\s+/g,'');
    if(key==='toss') return 'Toss';
    if(key==='wowpass') return 'Wowpass';
    return raw;
  }

  function normalizePaymentFilterOptions(){
    const select=document.getElementById('recordFilterPay');
    if(!select) return;

    const current=canonicalPaymentLabel(select.value);
    const labels=[];
    const seen=new Set();

    [...select.options].forEach((option,index)=>{
      if(index===0 || !option.value) return;
      const label=canonicalPaymentLabel(option.value || option.textContent);
      const key=label.toLocaleLowerCase();
      if(!label || seen.has(key)) return;
      seen.add(key);
      labels.push(label);
    });

    select.innerHTML='';
    const all=document.createElement('option');
    all.value='';
    all.textContent='全部付款方式';
    select.appendChild(all);

    labels.forEach(label=>{
      const option=document.createElement('option');
      option.value=label;
      option.textContent=label;
      select.appendChild(option);
    });

    select.value=labels.includes(current) ? current : '';
  }

  if(typeof setupRecordFilters==='function'){
    const baseSetupRecordFilters=setupRecordFilters;
    setupRecordFilters=function(){
      const result=baseSetupRecordFilters.apply(this,arguments);
      normalizePaymentFilterOptions();
      return result;
    };
  }

  if(typeof applyRecordFilters==='function'){
    const baseApplyRecordFilters=applyRecordFilters;
    applyRecordFilters=function(){
      const paySelect=document.getElementById('recordFilterPay');
      if(paySelect && paySelect.value){
        paySelect.value=canonicalPaymentLabel(paySelect.value);
      }

      // 只在篩選運算期間把大小寫不同的舊資料視為同一付款方式；
      // finally 會立刻還原，不會改動本機資料、同步資料或 Sheet。
      const originals=[];
      try{
        if(typeof allRecordSource!=='undefined' && Array.isArray(allRecordSource)){
          allRecordSource.forEach(item=>{
            if(!item || !Object.prototype.hasOwnProperty.call(item,'pay')) return;
            originals.push([item,item.pay]);
            item.pay=canonicalPaymentLabel(item.pay);
          });
        }
        return baseApplyRecordFilters.apply(this,arguments);
      }finally{
        originals.forEach(([item,pay])=>{ item.pay=pay; });
      }
    };
  }

  function installStyles(){
    if(document.getElementById('uiCleanupV119Style')) return;
    const style=document.createElement('style');
    style.id='uiCleanupV119Style';
    style.textContent=`
      #taxRefundPendingPreview .tax-refund-preview-item.v119-refund-a{
        background:#fffaf6 !important;
        border-color:#f3dfd2 !important;
      }
      #taxRefundPendingPreview .tax-refund-preview-item.v119-refund-b{
        background:#f8f5ff !important;
        border-color:#e5dcfa !important;
      }
    `;
    document.head.appendChild(style);
  }

  function compactTaxRefundPreview(){
    installStyles();
    const preview=document.getElementById('taxRefundPendingPreview');
    if(!preview) return;

    const cards=[...preview.querySelectorAll('.tax-refund-preview-item')];
    cards.forEach((card,index)=>{
      card.classList.remove('v119-refund-a','v119-refund-b');
      if(index>=2){
        card.remove();
        return;
      }
      card.classList.add(index%2===0 ? 'v119-refund-a' : 'v119-refund-b');
    });

    let total=cards.length;
    try{
      if(typeof taxRefundPendingItems==='function'){
        total=taxRefundPendingItems().length;
      }
    }catch(e){}
    const remaining=Math.max(0,total-2);

    const page=document.getElementById('page-trip') || document;
    [...page.querySelectorAll('*')].forEach(el=>{
      if(el.children.length) return;
      const text=String(el.textContent||'').trim();
      if(!/^另外還有\s*\d+\s*筆待處理$/.test(text)) return;
      if(remaining>0){
        el.textContent=`另外還有 ${remaining} 筆待處理`;
        el.style.display='';
      }else{
        el.style.display='none';
      }
    });
  }

  if(typeof renderTaxRefundPendingSection==='function'){
    const baseRenderTaxRefundPendingSection=renderTaxRefundPendingSection;
    renderTaxRefundPendingSection=function(){
      const result=baseRenderTaxRefundPendingSection.apply(this,arguments);
      compactTaxRefundPreview();
      setTimeout(compactTaxRefundPreview,0);
      return result;
    };
  }

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const result=baseRenderSettings.apply(this,arguments);
      const el=document.getElementById('webVersionText');
      if(el) el.textContent=VER;
      return result;
    };
  }

  try{ window.WEB_VERSION=VER; }catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
  installStyles();

  try{
    normalizePaymentFilterOptions();
    compactTaxRefundPreview();
  }catch(e){
    console.warn('v119 UI cleanup skipped:',e);
  }
})();
