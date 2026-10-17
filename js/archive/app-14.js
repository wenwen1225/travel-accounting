// v66：修正版本檢查後被 v61 蓋回，以及全部紀錄右滑刪除未正確套用。
// 只處理版本顯示與紀錄列表 UI；不修改 syncRecord、queue、重試或 Apps Script 同步邏輯。
const FORMAL_FRONTEND_VERSION_V66='2026.10.03-v66';

function v66ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V66;
}

// v61 的 checkBackendVersion 內部會把網站版本文字寫回 v61。
// 保留原本版本檢查邏輯，只在檢查完成後重新套用目前前端版本。
if(typeof checkBackendVersion==='function'){
  const v66BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v66BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v66ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v66BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v66BaseRenderSettings.apply(this,arguments);
    v66ApplyVersion();
    return result;
  };
}

function v66RecordBucket(item){
  if((currentTrip?.expenses||[]).some(x=>x.id===item.id)) return 'expenses';
  if((currentTrip?.pretrip||[]).some(x=>x.id===item.id)) return 'pretrip';
  if((currentTrip?.exchange||[]).some(x=>x.id===item.id)) return 'exchange';
  return '';
}

function v66FilteredRecords(){
  const keyword=(document.getElementById('recordSearch')?.value||'').trim().toLowerCase();
  const date=document.getElementById('recordFilterDate')?.value||'';
  const person=document.getElementById('recordFilterPerson')?.value||'';
  const pay=document.getElementById('recordFilterPay')?.value||'';
  const card=document.getElementById('recordFilterCard')?.value||'';
  return (allRecordSource||[]).filter(item=>{
    if(keyword && !recordSearchText(item).includes(keyword)) return false;
    if(date && normalizeTripDateValue(item.date)!==date) return false;
    if(person && item.person!==person) return false;
    if(pay && item.pay!==pay) return false;
    if(card && item.card!==card) return false;
    return true;
  });
}

function v66RowHtml(item){
  const type=v66RecordBucket(item);
  if(!type || isCurrentTripArchived()) return recordHtml(item);
  return `
    <div class="v66-swipe-shell" data-record-type="${type}" data-record-id="${item.id}">
      <div class="v66-delete-underlay">
        <button type="button" class="v66-delete-btn" onclick="event.stopPropagation();v64SwipeDelete('${type}','${item.id}')">確認刪除</button>
      </div>
      <div class="v66-swipe-content">${recordHtml(item)}</div>
    </div>`;
}

function v66InstallStyles(){
  if(document.getElementById('v66SwipeStyle')) return;
  const style=document.createElement('style');
  style.id='v66SwipeStyle';
  style.textContent=`
    #allRecords .v66-swipe-shell{position:relative;overflow:hidden;border-radius:14px;margin-bottom:10px;touch-action:pan-y;background:#e4545e}
    #allRecords .v66-delete-underlay{position:absolute;left:0;top:0;bottom:0;width:112px;display:flex;align-items:stretch;z-index:1;background:#e4545e}
    #allRecords .v66-delete-btn{width:112px;border:0;background:#e4545e;color:#fff;font-size:13px;font-weight:800;padding:0 12px}
    #allRecords .v66-swipe-content{position:relative;z-index:2;transform:translate3d(0,0,0);transition:transform .18s ease;background:#fff;touch-action:pan-y;will-change:transform}
    #allRecords .v66-swipe-shell.is-open .v66-swipe-content{transform:translate3d(112px,0,0)}
    #allRecords .v66-swipe-shell::after{content:'›';position:absolute;right:9px;top:50%;transform:translateY(-50%);z-index:4;color:#b7adbf;font-size:20px;font-weight:700;pointer-events:none;opacity:.65}
    #allRecords .v66-swipe-shell.is-open::after{opacity:0}
  `;
  document.head.appendChild(style);
}

function v66CloseOthers(except){
  document.querySelectorAll('#allRecords .v66-swipe-shell.is-open').forEach(row=>{
    if(row!==except) row.classList.remove('is-open');
  });
}

function v66BindSwipe(){
  document.querySelectorAll('#allRecords .v66-swipe-shell').forEach(shell=>{
    if(shell.dataset.v66Bound==='1') return;
    shell.dataset.v66Bound='1';
    const content=shell.querySelector('.v66-swipe-content');
    if(!content) return;

    let startX=0,startY=0,lastX=0,lastY=0,dragging=false,horizontal=false,wasMoved=false;

    const begin=(x,y)=>{
      startX=lastX=x;
      startY=lastY=y;
      dragging=true;
      horizontal=false;
      wasMoved=false;
      content.style.transition='none';
      v66CloseOthers(shell);
    };

    const move=(x,y,e)=>{
      if(!dragging) return;
      lastX=x; lastY=y;
      const dx=x-startX;
      const dy=y-startY;
      if(!horizontal){
        if(Math.abs(dx)<6 && Math.abs(dy)<6) return;
        if(Math.abs(dy)>Math.abs(dx)){
          dragging=false;
          content.style.transition='';
          content.style.transform='';
          return;
        }
        horizontal=true;
      }
      const alreadyOpen=shell.classList.contains('is-open');
      const base=alreadyOpen?112:0;
      const pos=Math.max(0,Math.min(112,base+dx));
      if(Math.abs(dx)>8) wasMoved=true;
      content.style.transform=`translate3d(${pos}px,0,0)`;
      if(e?.cancelable) e.preventDefault();
    };

    const finish=()=>{
      if(!horizontal){
        content.style.transition='';
        content.style.transform='';
        dragging=false;
        return;
      }
      const dx=lastX-startX;
      const wasOpen=shell.classList.contains('is-open');
      const open=wasOpen ? dx>-35 : dx>30;
      content.style.transition='';
      content.style.transform='';
      shell.classList.toggle('is-open',open);
      dragging=false;
      horizontal=false;
      setTimeout(()=>{wasMoved=false;},120);
    };

    // Touch Events：iPhone Safari 最穩定的路徑。
    content.addEventListener('touchstart',e=>{
      const t=e.touches?.[0];
      if(t) begin(t.clientX,t.clientY);
    },{passive:true});
    content.addEventListener('touchmove',e=>{
      const t=e.touches?.[0];
      if(t) move(t.clientX,t.clientY,e);
    },{passive:false});
    content.addEventListener('touchend',finish,{passive:true});
    content.addEventListener('touchcancel',finish,{passive:true});

    // Pointer Events：桌機與其他手機瀏覽器。
    content.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch') return;
      begin(e.clientX,e.clientY);
    });
    content.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch') return;
      move(e.clientX,e.clientY,e);
    });
    content.addEventListener('pointerup',e=>{
      if(e.pointerType==='touch') return;
      finish();
    });

    // 右滑後不誤觸原本的編輯 onclick；已展開時點卡片會先收回。
    content.addEventListener('click',e=>{
      if(wasMoved || shell.classList.contains('is-open')){
        e.preventDefault();
        e.stopImmediatePropagation();
        if(shell.classList.contains('is-open') && !wasMoved) shell.classList.remove('is-open');
      }
    },true);
  });
}

// 直接接管「全部紀錄」的列表重畫，確保每一筆一定有 swipe wrapper。
applyRecordFilters=function(){
  const box=document.getElementById('allRecords');
  if(!box) return;
  const filtered=v66FilteredRecords();
  const count=document.getElementById('recordFilterCount');
  if(count) count.textContent=`${filtered.length} / ${allRecordSource.length} 筆`;
  box.innerHTML=filtered.length
    ? filtered.map(v66RowHtml).join('')
    : `<div class="empty">沒有符合條件的紀錄</div>`;
  requestAnimationFrame(v66BindSwipe);
};

if(typeof window.openRecords==='function'){
  const v66BaseOpenRecords=window.openRecords;
  window.openRecords=function(){
    const result=v66BaseOpenRecords.apply(this,arguments);
    // 基底 openRecords 可能先用舊 renderer 畫一次，這裡強制用 v66 再畫。
    setTimeout(()=>{
      applyRecordFilters();
      const sub=document.getElementById('recordsSubtitle');
      if(sub) sub.textContent=currentTrip.name+' · 點一下修改｜從卡片中央往右滑可刪除';
    },0);
    return result;
  };
}

v66InstallStyles();
v66ApplyVersion();
setTimeout(v66ApplyVersion,0);
