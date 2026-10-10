// v114：新增「機台退稅完成✅」狀態，並讓首頁待退稅卡可一鍵標記完成。
// 沿用既有 refundStatus / refundMachine 欄位與 updateExpense 同步，不修改 Apps Script 後端。
(()=>{
  const VER='2026.10.11-v114-tax-refund-complete';
  const COMPLETED='機台退稅完成✅';

  function installStyles(){
    if(document.getElementById('taxRefundV114Style')) return;
    const style=document.createElement('style');
    style.id='taxRefundV114Style';
    style.textContent=`
      .tax-refund-option.completed{border-color:#a9d6b7;background:#eef9f1;color:#34704a}
      .tax-refund-badge.completed{background:#e8f7ee;color:#2f7c4d}
      .tax-refund-preview-actions{display:flex;gap:8px;margin-top:9px}
      .tax-refund-complete-btn{border:0;border-radius:10px;background:#e9f8ef;color:#2f7c4d;font-weight:900;font-size:12px;padding:8px 11px;cursor:pointer}
      .tax-refund-complete-btn:disabled{opacity:.55;cursor:default}
    `;
    document.head.appendChild(style);
  }

  // 在既有三個狀態後加入第四個「機台退稅完成」。
  if(typeof taxRefundEnsureExpenseUi==='function'){
    const baseEnsure=taxRefundEnsureExpenseUi;
    taxRefundEnsureExpenseUi=function(){
      const r=baseEnsure.apply(this,arguments);
      installStyles();
      const box=document.querySelector('#taxRefundGroup .tax-refund-options');
      if(box && !box.querySelector('[data-refund-status="'+COMPLETED+'"]')){
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='tax-refund-option completed';
        btn.dataset.refundStatus=COMPLETED;
        btn.textContent=COMPLETED;
        btn.addEventListener('click',()=>setTaxRefundStatus(COMPLETED));
        box.appendChild(btn);
      }
      return r;
    };
  }

  // 完成狀態仍保留原本的退稅公司／機台資訊，方便之後回查。
  if(typeof setTaxRefundStatus==='function'){
    setTaxRefundStatus=function(status){
      if(typeof taxRefundEnsureExpenseUi==='function') taxRefundEnsureExpenseUi();
      const group=document.getElementById('taxRefundGroup');
      if(!group) return;
      group.dataset.status=status||'';
      group.querySelectorAll('.tax-refund-option').forEach(btn=>{
        btn.classList.toggle('active',btn.dataset.refundStatus===status);
      });
      const machineGroup=document.getElementById('taxRefundMachineGroup');
      if(machineGroup){
        const show=status===TAX_REFUND_STATUS_MACHINE || status===COMPLETED;
        machineGroup.classList.toggle('hidden',!show);
      }
    };
  }

  if(typeof taxRefundReadForm==='function'){
    taxRefundReadForm=function(){
      if(typeof taxRefundEnsureExpenseUi==='function') taxRefundEnsureExpenseUi();
      const status=document.getElementById('taxRefundGroup')?.dataset.status||'';
      const keepMachine=status===TAX_REFUND_STATUS_MACHINE || status===COMPLETED;
      const machine=keepMachine ? (document.getElementById('taxRefundMachine')?.value||'').trim() : '';
      return {status,machine};
    };
  }

  if(typeof taxRefundApplyToItem==='function'){
    taxRefundApplyToItem=function(item,snapshot){
      if(!item) return item;
      const data=snapshot||{status:item.refundStatus||'',machine:item.refundMachine||''};
      item.refundStatus=data.status||'';
      const keepMachine=item.refundStatus===TAX_REFUND_STATUS_MACHINE || item.refundStatus===COMPLETED;
      item.refundMachine=keepMachine ? (data.machine||item.refundMachine||'') : '';
      return item;
    };
  }

  if(typeof taxRefundStatusClass==='function'){
    const baseStatusClass=taxRefundStatusClass;
    taxRefundStatusClass=function(status){
      if(status===COMPLETED) return 'completed';
      return baseStatusClass(status);
    };
  }

  if(typeof taxRefundRecordBadges==='function'){
    taxRefundRecordBadges=function(item){
      const status=String(item?.refundStatus||'');
      if(!status) return '';
      const machine=String(item?.refundMachine||'');
      const showMachine=(status===TAX_REFUND_STATUS_MACHINE || status===COMPLETED) && machine;
      return `
        <div class="tax-refund-badges">
          <span class="tax-refund-badge ${taxRefundStatusClass(status)}">${taxRefundEscapeHtml(status)}</span>
          ${showMachine ? `<span class="tax-refund-badge machine-place">${taxRefundEscapeHtml(machine)}</span>` : ''}
        </div>`;
    };
  }

  async function completeRefund(id,button){
    if(!currentTrip) return false;
    if(typeof isCurrentTripArchived==='function' && isCurrentTripArchived()){
      if(typeof archiveReadOnlyAlert==='function') archiveReadOnlyAlert();
      return false;
    }
    const item=(currentTrip.expenses||[]).find(x=>String(x.id)===String(id));
    if(!item) return false;
    if(item.refundStatus!==TAX_REFUND_STATUS_MACHINE) return true;

    if(button){ button.disabled=true; button.textContent='處理中…'; }

    item.refundStatus=COMPLETED;
    // 保留 refundMachine；後端原本已有此欄，不新增資料表欄位。
    item.refundMachine=item.refundMachine||'';
    item.updatedAt=new Date().toISOString();
    item.syncStatus=getApiUrl?.() ? 'pending' : 'local';
    persist();

    try{
      if(typeof renderTaxRefundPendingSection==='function') renderTaxRefundPendingSection();
      if(typeof renderRecentRecords==='function') renderRecentRecords();
      if(typeof renderTripSummary==='function') renderTripSummary();
    }catch(e){}

    if(getApiUrl?.()){
      try{
        await syncRecord('updateExpense',currentTrip,'expenses',item);
      }catch(e){
        // syncRecord 自己會保留待同步 queue；本機狀態不回滾。
      }
    }

    persist();
    try{
      if(typeof renderTaxRefundPendingSection==='function') renderTaxRefundPendingSection();
      if(typeof renderSettings==='function') renderSettings();
    }catch(e){}
    if(typeof showQuickSaveToast==='function') showQuickSaveToast('已標記機台退稅完成');
    return true;
  }
  window.completeTaxRefundV114=completeRefund;

  // 首頁「找機台退稅」預覽直接提供完成按鈕，不必重新打開整筆紀錄。
  if(typeof renderTaxRefundPendingSection==='function'){
    const baseRenderPending=renderTaxRefundPendingSection;
    renderTaxRefundPendingSection=function(){
      const r=baseRenderPending.apply(this,arguments);
      installStyles();
      const items=typeof taxRefundPendingItems==='function' ? taxRefundPendingItems().slice(0,3) : [];
      const cards=[...document.querySelectorAll('#taxRefundPendingPreview .tax-refund-preview-item')];
      cards.forEach((card,index)=>{
        const item=items[index];
        if(!item || card.querySelector('.tax-refund-complete-btn')) return;
        const actions=document.createElement('div');
        actions.className='tax-refund-preview-actions';
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='tax-refund-complete-btn';
        btn.textContent='✓ 已完成退稅';
        btn.addEventListener('click',e=>{
          e.preventDefault();
          e.stopPropagation();
          completeRefund(item.id,btn);
        });
        actions.appendChild(btn);
        card.appendChild(actions);
      });
      return r;
    };
  }

  // 若使用者從「查看」進入待處理清單，再點進紀錄編輯，也會看到第四個完成狀態。
  const baseOpenPending=window.openTaxRefundPendingList;
  if(typeof baseOpenPending==='function'){
    window.openTaxRefundPendingList=function(){
      const r=baseOpenPending.apply(this,arguments);
      setTimeout(()=>{
        if(typeof taxRefundEnsureExpenseUi==='function') taxRefundEnsureExpenseUi();
      },0);
      return r;
    };
  }

  // 版本顯示固定到 v114。
  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const el=document.getElementById('webVersionText');
      if(el) el.textContent=VER;
      return r;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;
  installStyles();

  // 若目前正停在旅行首頁，立即刷新待退稅卡。
  try{ if(currentTrip && typeof renderTaxRefundPendingSection==='function') renderTaxRefundPendingSection(); }catch(e){}
})();
