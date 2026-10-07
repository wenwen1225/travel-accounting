// v108：全部紀錄的一般紀錄（購買商品 / 先前費用 / 換匯）支援右滑刪除。
// 僅處理全部紀錄互動；沿用既有刪除 API 與確認流程，不修改資金、救援或後端邏輯。
(()=>{
  const VER='2026.10.07-v108';

  const escAttr=v=>String(v??'')
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');

  function regularKind(item){
    if(!item || item._fundRecord) return '';
    if(item.type==='購買商品') return 'expenses';
    if(item.type==='先前費用') return 'pretrip';
    if(item.type==='換匯') return 'exchange';
    return '';
  }

  function ensureStyles(){
    if(document.getElementById('regularSwipeV108Styles')) return;
    const s=document.createElement('style');
    s.id='regularSwipeV108Styles';
    s.textContent=`
      .regular-swipe-shell{position:relative;overflow:hidden;border-bottom:1px solid var(--line);touch-action:pan-y;background:#fff}
      .regular-swipe-shell:nth-child(even){background:#fff3f7}
      .regular-swipe-shell:last-child{border-bottom:0}
      .regular-swipe-delete{position:absolute;left:0;top:0;bottom:0;width:86px;border:0;background:#ffe7e7;color:#c24141;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:1}
      .regular-swipe-content{position:relative;z-index:2;background:inherit;transform:translateX(0);transition:transform .18s ease;will-change:transform}
      .regular-swipe-content>.record{background:transparent}
      .regular-swipe-shell.is-open .regular-swipe-content{transform:translateX(86px)}
    `;
    document.head.appendChild(s);
  }

  const baseRecordHtmlV108=window.recordHtml;
  if(typeof baseRecordHtmlV108==='function'){
    window.recordHtml=function(item){
      const inner=baseRecordHtmlV108.apply(this,arguments);
      const kind=regularKind(item);
      if(!kind || (typeof isCurrentTripArchived==='function' && isCurrentTripArchived())) return inner;
      return `<div class="regular-swipe-shell" data-kind="${escAttr(kind)}" data-id="${escAttr(item.id)}"><button class="regular-swipe-delete" type="button">刪除</button><div class="regular-swipe-content">${inner}</div></div>`;
    };
  }

  function closeOtherSwipe(except){
    document.querySelectorAll('.regular-swipe-shell.is-open,.fund-swipe-shell.is-open').forEach(x=>{
      if(x!==except) x.classList.remove('is-open');
    });
  }

  async function deleteRegularRecord(kind,id){
    if(!currentTrip) return false;
    if(typeof isCurrentTripArchived==='function' && isCurrentTripArchived()){
      if(typeof archiveReadOnlyAlert==='function') archiveReadOnlyAlert();
      return false;
    }

    try{
      if(kind==='expenses'){
        editingExpenseId=id;
        await deleteCurrentExpense();
      }else if(kind==='pretrip'){
        editingPretripId=id;
        await deleteCurrentPretrip();
      }else if(kind==='exchange'){
        editingExchangeId=id;
        await deleteCurrentExchange();
      }else return false;
    }catch(err){
      console.error('v108 delete regular record failed:',err);
      alert('刪除時發生錯誤，這筆資料目前先保留。');
      return false;
    }

    const list=kind==='expenses'?(currentTrip?.expenses||[]):kind==='pretrip'?(currentTrip?.pretrip||[]):(currentTrip?.exchange||[]);
    const removed=!list.some(x=>String(x.id)===String(id));
    if(removed && typeof openRecords==='function') setTimeout(()=>openRecords(),0);
    return removed;
  }
  window.deleteRegularRecordV108=deleteRegularRecord;

  function bindRegularSwipe(){
    ensureStyles();
    document.querySelectorAll('.regular-swipe-shell').forEach(shell=>{
      if(shell.dataset.swipeBound==='1') return;
      shell.dataset.swipeBound='1';
      const content=shell.querySelector('.regular-swipe-content');
      const del=shell.querySelector('.regular-swipe-delete');
      if(!content || !del) return;

      let sx=0,sy=0,dx=0,tracking=false,horizontal=false,suppressClick=false;
      content.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse' && e.button!==0) return;
        sx=e.clientX; sy=e.clientY; dx=0; tracking=true; horizontal=false; suppressClick=false;
      });
      content.addEventListener('pointermove',e=>{
        if(!tracking) return;
        const x=e.clientX-sx, y=e.clientY-sy;
        if(!horizontal && Math.abs(x)>8 && Math.abs(x)>Math.abs(y)) horizontal=true;
        if(!horizontal) return;
        dx=Math.max(0,Math.min(100,x));
        content.style.transition='none';
        content.style.transform=`translateX(${dx}px)`;
        suppressClick=true;
        e.preventDefault();
      });
      const finish=()=>{
        if(!tracking) return;
        tracking=false;
        content.style.transition='';
        content.style.transform='';
        if(horizontal && dx>=55){ closeOtherSwipe(shell); shell.classList.add('is-open'); }
        else shell.classList.remove('is-open');
        setTimeout(()=>{ dx=0; horizontal=false; suppressClick=false; },250);
      };
      content.addEventListener('pointerup',finish);
      content.addEventListener('pointercancel',finish);
      content.addEventListener('click',e=>{
        if(!suppressClick) return;
        e.preventDefault(); e.stopPropagation();
      },true);
      del.addEventListener('click',async e=>{
        e.preventDefault(); e.stopPropagation();
        shell.classList.remove('is-open');
        await deleteRegularRecord(shell.dataset.kind||'',shell.dataset.id||'');
      });
    });
  }

  const baseApplyV108=window.applyRecordFilters;
  if(typeof baseApplyV108==='function'){
    window.applyRecordFilters=function(){
      const r=baseApplyV108.apply(this,arguments);
      bindRegularSwipe();
      return r;
    };
  }

  const baseOpenRecordsV108=window.openRecords;
  if(typeof baseOpenRecordsV108==='function'){
    window.openRecords=function(){
      const r=baseOpenRecordsV108.apply(this,arguments);
      setTimeout(bindRegularSwipe,0);
      return r;
    };
  }

  const baseRenderSettingsV108=window.renderSettings;
  if(typeof baseRenderSettingsV108==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV108.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return r;
    };
  }

  const baseCheckBackendV108=window.checkBackendVersion;
  if(typeof baseCheckBackendV108==='function'){
    window.checkBackendVersion=async function(){
      const r=await baseCheckBackendV108.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
  ensureStyles();
})();
