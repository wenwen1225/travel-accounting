// v141：全部紀錄「只看換匯／只看資金」未選取時改為白底，只有目前選取項目才顯示紫色。
// 純前端視覺狀態調整，不改篩選資料、同步或後端。
(()=>{
  const VER='2026.10.13-v141-record-filter-selected-state';

  function installStyle(){
    if(document.getElementById('recordFilterSelectedV141Style')) return;
    const s=document.createElement('style');
    s.id='recordFilterSelectedV141Style';
    s.textContent=`
      #recordsFilterCard .record-special-actions-v139 > button{
        background:#fff !important;
        color:#6f52c8 !important;
        border:1.5px solid #d9cffa !important;
        box-shadow:none !important;
      }
      #recordsFilterCard .record-special-actions-v139 > button.is-selected-v141{
        background:#efe8ff !important;
        color:#6c42d8 !important;
        border-color:#bca8ff !important;
        box-shadow:0 0 0 1px rgba(124,92,219,.04) !important;
      }
    `;
    document.head.appendChild(s);
  }

  function typeSelect(card){
    const groups=[...card.querySelectorAll('.form-group')];
    for(const g of groups){
      const label=String(g.querySelector('label')?.textContent||'').trim();
      if(label.includes('紀錄類型')) return g.querySelector('select');
    }
    return null;
  }

  function syncState(){
    installStyle();
    const card=document.getElementById('recordsFilterCard');
    if(!card) return;
    const row=card.querySelector('.record-special-actions-v139');
    if(!row) return;
    const select=typeSelect(card);
    const value=String(select?.value||'').trim();
    [...row.querySelectorAll('button')].forEach(btn=>{
      const text=String(btn.textContent||'');
      const selected=(text.includes('只看資金') && value.includes('資金')) ||
                     (text.includes('只看換匯') && value.includes('換匯'));
      btn.classList.toggle('is-selected-v141',selected);
    });
  }

  const baseOpenRecords=window.openRecords;
  if(typeof baseOpenRecords==='function'){
    window.openRecords=function(){
      const r=baseOpenRecords.apply(this,arguments);
      setTimeout(syncState,0);setTimeout(syncState,80);
      return r;
    };
  }

  const baseApply=window.applyRecordFilters;
  if(typeof baseApply==='function'){
    window.applyRecordFilters=function(){
      const r=baseApply.apply(this,arguments);
      setTimeout(syncState,0);
      return r;
    };
  }

  const baseClear=window.clearRecordFilters;
  if(typeof baseClear==='function'){
    window.clearRecordFilters=function(){
      const r=baseClear.apply(this,arguments);
      setTimeout(syncState,0);
      return r;
    };
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#recordsFilterCard .record-special-actions-v139 > button');
    if(btn) setTimeout(syncState,0);
  });
  document.addEventListener('change',e=>{
    if(e.target.closest?.('#recordsFilterCard')) setTimeout(syncState,0);
  });

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const w=document.getElementById('webVersionText');if(w)w.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  setTimeout(syncState,0);
})();
