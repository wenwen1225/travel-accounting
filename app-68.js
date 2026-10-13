// v140：統一全部紀錄「只看換匯／只看資金」兩顆按鈕的圓角、尺寸與外觀。
// 純前端視覺調整，不改篩選邏輯、同步或後端。
(()=>{
  const VER='2026.10.13-v140-record-filter-button-style';

  function installStyle(){
    if(document.getElementById('recordFilterButtonV140Style')) return;
    const s=document.createElement('style');
    s.id='recordFilterButtonV140Style';
    s.textContent=`
      #recordsFilterCard .record-special-actions-v139 > button{
        height:52px !important;
        min-height:52px !important;
        padding:0 14px !important;
        border-radius:18px !important;
        box-sizing:border-box !important;
        font-size:16px !important;
        font-weight:800 !important;
        line-height:1 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }
      @media(max-width:380px){
        #recordsFilterCard .record-special-actions-v139 > button{
          height:48px !important;
          min-height:48px !important;
          border-radius:16px !important;
          font-size:14px !important;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function apply(){ installStyle(); }

  const baseOpenRecords=window.openRecords;
  if(typeof baseOpenRecords==='function'){
    window.openRecords=function(){
      const r=baseOpenRecords.apply(this,arguments);
      setTimeout(apply,0);
      return r;
    };
  }

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const w=document.getElementById('webVersionText');
      if(w) w.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  setTimeout(apply,0);
})();
