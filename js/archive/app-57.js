// v127：修正換匯刪除同步。只處理 deleteCurrentExchange，不動新增/修改/換匯 UI/其他同步。
(()=>{
  const VER='2026.10.13-v127-exchange-delete-sync';

  window.deleteCurrentExchange=async function(){
    if(isCurrentTripArchived()) return archiveReadOnlyAlert();
    if(!currentTrip || !editingExchangeId) return;

    const id=editingExchangeId;
    const item=(currentTrip.exchange||[]).find(x=>x.id===id);
    if(!item) return;
    if(!confirm(deleteRecordConfirmText('exchange',item))) return;

    // 只要這趟旅行已經有雲端 Sheet，就嘗試刪除雲端紀錄。
    // 舊版只在 syncStatus==='synced' 時才刪雲端；若狀態遺失，就會只刪本機、Sheet 留殘影。
    if(getApiUrl() && currentTrip.spreadsheetId){
      try{
        await postToCloud({
          action:'deleteExchange',
          spreadsheetId:currentTrip.spreadsheetId,
          clientTripId:currentTrip.id,
          recordId:item.id,
          baseFingerprint:item.cloudFingerprint || ''
        });
      }catch(err){
        const message=String(err?.message || err || '');
        // 如果雲端本來就沒有這筆（例如尚未同步的本機資料），視為已達成刪除狀態。
        if(!message.includes('找不到要刪除的換匯紀錄')){
          alert('Google Sheets 刪除失敗，本機資料先保留：'+message);
          return;
        }
      }
    }

    currentTrip.exchange=(currentTrip.exchange||[]).filter(x=>x.id!==id);
    state.syncQueue=(state.syncQueue||[]).filter(q=>q.recordId!==id);
    editingExchangeId=null;
    persist();
    alert('這筆換匯紀錄已刪除，Google Sheets 也會同步移除。');
    openTrip(currentTrip.id);
  };

  const oldRenderSettings=window.renderSettings;
  if(typeof oldRenderSettings==='function'){
    window.renderSettings=function(){
      const result=oldRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return result;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
