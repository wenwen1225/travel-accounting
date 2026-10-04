// v77：全部紀錄中的換匯紀錄 avatar 由「?」改成「$」。
// 僅調整顯示，不修改任何資料、同步或記帳流程。
const EXCHANGE_RECORD_ICON_PATCH_VERSION='2026.10.04-v77';

if(typeof recordHtml==='function'){
  const v77BaseRecordHtml=recordHtml;
  recordHtml=function(item){
    let html=v77BaseRecordHtml.apply(this,arguments);
    if(item?.type!=='換匯') return html;

    // 原本換匯沒有 person，avatar 會顯示「?」。只替換該 avatar 文字。
    html=html.replace(
      /(<div class="avatar person-avatar[^>]*>)\?(<\/div>)/,
      '$1$$$2'
    );
    return html;
  };
}

function v77ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=EXCHANGE_RECORD_ICON_PATCH_VERSION;
}

v77ApplyVersion();
setTimeout(v77ApplyVersion,0);
