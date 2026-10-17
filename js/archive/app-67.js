// v139：全部紀錄的「只看資金／只看換匯」改為左右等寬排列。
// 純前端版面調整，不改篩選邏輯、同步或後端。
(()=>{
  const VER='2026.10.13-v139-record-filter-action-layout';

  function installStyle(){
    if(document.getElementById('recordFilterActionV139Style')) return;
    const s=document.createElement('style');
    s.id='recordFilterActionV139Style';
    s.textContent=`
      #recordsFilterCard .record-special-actions-v139{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        width:100%;
        margin-top:10px;
        align-items:stretch;
      }
      #recordsFilterCard .record-special-actions-v139 > button{
        width:100% !important;
        min-width:0 !important;
        margin:0 !important;
        justify-content:center;
        white-space:nowrap;
      }
      @media(max-width:380px){
        #recordsFilterCard .record-special-actions-v139{gap:8px}
        #recordsFilterCard .record-special-actions-v139 > button{font-size:14px;padding-left:8px;padding-right:8px}
      }
    `;
    document.head.appendChild(s);
  }

  function arrange(){
    const card=document.getElementById('recordsFilterCard');
    if(!card) return;
    installStyle();

    const buttons=[...card.querySelectorAll('button')];
    const fund=buttons.find(b=>String(b.textContent||'').includes('只看資金'));
    const exchange=buttons.find(b=>String(b.textContent||'').includes('只看換匯'));
    if(!fund||!exchange) return;

    let row=card.querySelector('.record-special-actions-v139');
    if(!row){
      row=document.createElement('div');
      row.className='record-special-actions-v139';
      const anchor=fund.parentElement===card?fund:fund.parentElement;
      (anchor||fund).insertAdjacentElement('beforebegin',row);
    }

    if(fund.parentElement!==row) row.appendChild(fund);
    if(exchange.parentElement!==row) row.appendChild(exchange);

    // 若舊版各自留下空容器，只移除真正空的，避免影響其他控制項。
    [...card.children].forEach(el=>{
      if(el===row) return;
      if(el.children.length===0 && !String(el.textContent||'').trim() && !['INPUT','SELECT','BUTTON'].includes(el.tagName)){
        el.remove();
      }
    });
  }

  const baseOpenRecords=window.openRecords;
  if(typeof baseOpenRecords==='function'){
    window.openRecords=function(){
      const r=baseOpenRecords.apply(this,arguments);
      setTimeout(arrange,0);
      setTimeout(arrange,80);
      return r;
    };
  }

  const baseApply=window.applyRecordFilters;
  if(typeof baseApply==='function'){
    window.applyRecordFilters=function(){
      const r=baseApply.apply(this,arguments);
      setTimeout(arrange,0);
      return r;
    };
  }

  const baseClear=window.clearRecordFilters;
  if(typeof baseClear==='function'){
    window.clearRecordFilters=function(){
      const r=baseClear.apply(this,arguments);
      setTimeout(arrange,0);
      return r;
    };
  }

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const w=document.getElementById('webVersionText');
      if(w)w.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  setTimeout(arrange,0);
})();
