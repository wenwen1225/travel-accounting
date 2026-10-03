// v65：只修「全部紀錄」右滑刪除手勢；不碰任何同步流程。
const FORMAL_FRONTEND_VERSION_V65='2026.10.03-v65';

function v65InstallSwipeStyles(){
  if(document.getElementById('v65SwipeStyle')) return;
  const style=document.createElement('style');
  style.id='v65SwipeStyle';
  style.textContent=`
    #allRecords .v64-swipe-shell{position:relative!important;overflow:hidden!important;touch-action:pan-y!important;-webkit-user-select:none;user-select:none}
    #allRecords .v64-swipe-content{position:relative!important;z-index:2!important;transform:translate3d(0,0,0);transition:transform .18s ease!important;touch-action:pan-y!important;-webkit-user-drag:none}
    #allRecords .v64-swipe-shell.is-open .v64-swipe-content{transform:translate3d(104px,0,0)!important}
    #allRecords .v64-swipe-action{z-index:1!important}
    #allRecords .v65-swipe-ready::after{content:'›';position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:3;color:#b7adbf;font-size:20px;font-weight:700;pointer-events:none;opacity:.7}
    #allRecords .v64-swipe-shell.is-open.v65-swipe-ready::after{opacity:0}
  `;
  document.head.appendChild(style);
}

function v65CloseOtherSwipeRows(except){
  document.querySelectorAll('#allRecords .v64-swipe-shell.is-open').forEach(row=>{
    if(row!==except) row.classList.remove('is-open');
  });
}

function v65BindSwipeRows(){
  const rows=document.querySelectorAll('#allRecords .v64-swipe-shell');
  rows.forEach(shell=>{
    if(shell.dataset.v65SwipeBound==='1') return;
    shell.dataset.v65SwipeBound='1';
    shell.classList.add('v65-swipe-ready');

    const content=shell.querySelector('.v64-swipe-content');
    if(!content) return;

    let startX=0;
    let startY=0;
    let lastX=0;
    let active=false;
    let horizontal=false;
    let moved=false;

    const begin=(x,y)=>{
      startX=x;
      startY=y;
      lastX=x;
      active=true;
      horizontal=false;
      moved=false;
      content.style.transition='none';
      v65CloseOtherSwipeRows(shell);
    };

    const move=(x,y,event)=>{
      if(!active) return;
      const dx=x-startX;
      const dy=y-startY;
      lastX=x;

      if(!horizontal){
        if(Math.abs(dx)<7 && Math.abs(dy)<7) return;
        if(Math.abs(dy)>Math.abs(dx)){
          active=false;
          content.style.transition='';
          content.style.transform='';
          return;
        }
        horizontal=true;
      }

      // 只接受往右滑；已開啟時允許往左收回。
      const alreadyOpen=shell.classList.contains('is-open');
      const base=alreadyOpen ? 104 : 0;
      const xPos=Math.max(0,Math.min(104,base+dx));
      if(Math.abs(dx)>10) moved=true;
      content.style.transform=`translate3d(${xPos}px,0,0)`;
      if(event && event.cancelable) event.preventDefault();
    };

    const end=()=>{
      if(!active && !horizontal){
        content.style.transition='';
        content.style.transform='';
        return;
      }
      const dx=lastX-startX;
      const wasOpen=shell.classList.contains('is-open');
      const shouldOpen=wasOpen ? dx>-42 : dx>42;
      content.style.transition='';
      content.style.transform='';
      shell.classList.toggle('is-open',shouldOpen);
      active=false;
      horizontal=false;
      setTimeout(()=>{ moved=false; },80);
    };

    // iPhone / iPad Safari
    content.addEventListener('touchstart',e=>{
      const t=e.touches && e.touches[0];
      if(t) begin(t.clientX,t.clientY);
    },{passive:true});
    content.addEventListener('touchmove',e=>{
      const t=e.touches && e.touches[0];
      if(t) move(t.clientX,t.clientY,e);
    },{passive:false});
    content.addEventListener('touchend',end,{passive:true});
    content.addEventListener('touchcancel',end,{passive:true});

    // 桌機／支援 Pointer Events 的瀏覽器也能拖曳測試
    if(window.PointerEvent){
      content.addEventListener('pointerdown',e=>{
        if(e.pointerType==='touch') return; // touch 交給上面的 Safari 路徑，避免重複觸發
        begin(e.clientX,e.clientY);
        try{ content.setPointerCapture(e.pointerId); }catch(_e){}
      });
      content.addEventListener('pointermove',e=>{
        if(e.pointerType==='touch') return;
        move(e.clientX,e.clientY,e);
      });
      content.addEventListener('pointerup',e=>{
        if(e.pointerType==='touch') return;
        end();
      });
    }

    // 滑動後不要誤觸「開啟編輯」。
    content.addEventListener('click',e=>{
      if(moved){
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if(shell.classList.contains('is-open')){
        e.preventDefault();
        e.stopImmediatePropagation();
        shell.classList.remove('is-open');
      }
    },true);
  });
}

// v64 每次篩選後會重畫列表，所以在它之後再補綁一次。
const v65BaseApplyRecordFilters=applyRecordFilters;
applyRecordFilters=function(){
  const result=v65BaseApplyRecordFilters.apply(this,arguments);
  requestAnimationFrame(v65BindSwipeRows);
  return result;
};

const v65BaseOpenRecords=window.openRecords;
window.openRecords=function(){
  const result=v65BaseOpenRecords.apply(this,arguments);
  const sub=document.getElementById('recordsSubtitle');
  if(sub) sub.textContent=currentTrip.name+' · 點一下修改｜從紀錄中間往右滑可刪除';
  requestAnimationFrame(v65BindSwipeRows);
  return result;
};

function v65ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V65;
}

if(typeof renderSettings==='function'){
  const v65BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v65BaseRenderSettings.apply(this,arguments);
    v65ApplyVersion();
    return result;
  };
}

v65InstallSwipeStyles();
v65ApplyVersion();
requestAnimationFrame(v65BindSwipeRows);
