// v68：最近紀錄與全部紀錄使用白／粉交錯底色，提升辨識度。
// 只處理列表視覺與版本顯示，不修改同步、刪除、queue 或 Apps Script。
const FORMAL_FRONTEND_VERSION_V68='2026.10.03-v68';

function v68ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=FORMAL_FRONTEND_VERSION_V68;
}

if(typeof checkBackendVersion==='function'){
  const v68BaseCheckBackendVersion=checkBackendVersion;
  checkBackendVersion=async function(){
    try{
      return await v68BaseCheckBackendVersion.apply(this,arguments);
    }finally{
      v68ApplyVersion();
    }
  };
}

if(typeof renderSettings==='function'){
  const v68BaseRenderSettings=renderSettings;
  renderSettings=function(){
    const result=v68BaseRenderSettings.apply(this,arguments);
    v68ApplyVersion();
    return result;
  };
}

function v68SetRowTone(el,index){
  if(!el || el.classList.contains('empty')) return;
  const pink=index%2===1;
  el.classList.toggle('v68-row-pink',pink);
  el.classList.toggle('v68-row-white',!pink);
}

function v68ApplyAlternatingRows(){
  const recent=document.getElementById('recentRecords');
  if(recent){
    [...recent.children]
      .filter(el=>!el.classList.contains('empty'))
      .forEach((el,index)=>v68SetRowTone(el,index));
  }

  const all=document.getElementById('allRecords');
  if(all){
    [...all.children]
      .filter(el=>!el.classList.contains('empty'))
      .forEach((shell,index)=>{
        v68SetRowTone(shell,index);
        const content=shell.querySelector('.v66-swipe-content, .v64-swipe-content');
        if(content) v68SetRowTone(content,index);
        const card=content?.firstElementChild;
        if(card) v68SetRowTone(card,index);
      });
  }
}

function v68InstallStyles(){
  if(document.getElementById('v68AlternatingStyle')) return;
  const style=document.createElement('style');
  style.id='v68AlternatingStyle';
  style.textContent=`
    #recentRecords > .v68-row-white,
    #allRecords .v68-row-white{background:#ffffff!important}

    #recentRecords > .v68-row-pink,
    #allRecords .v68-row-pink{background:#fff1f7!important}

    #recentRecords > .v68-row-pink:hover,
    #allRecords .v68-row-pink:hover{background:#fdeaf3!important}

    #recentRecords > *{
      transition:background-color .15s ease;
    }

    #allRecords .v66-swipe-content,
    #allRecords .v64-swipe-content{
      transition:transform .18s ease,background-color .15s ease!important;
    }
  `;
  document.head.appendChild(style);
}

if(typeof renderRecent==='function'){
  const v68BaseRenderRecent=renderRecent;
  renderRecent=function(){
    const result=v68BaseRenderRecent.apply(this,arguments);
    requestAnimationFrame(v68ApplyAlternatingRows);
    return result;
  };
}

if(typeof applyRecordFilters==='function'){
  const v68BaseApplyRecordFilters=applyRecordFilters;
  applyRecordFilters=function(){
    const result=v68BaseApplyRecordFilters.apply(this,arguments);
    requestAnimationFrame(v68ApplyAlternatingRows);
    return result;
  };
}

if(typeof window.openRecords==='function'){
  const v68BaseOpenRecords=window.openRecords;
  window.openRecords=function(){
    const result=v68BaseOpenRecords.apply(this,arguments);
    setTimeout(v68ApplyAlternatingRows,0);
    return result;
  };
}

v68InstallStyles();
v68ApplyVersion();
requestAnimationFrame(v68ApplyAlternatingRows);
setTimeout(v68ApplyVersion,0);
