// v115：機台退稅完成後保留原本退稅公司／機台名稱。
// 修正 v73 的 syncRecord 在「機台退稅完成✅」同步時會把 refundMachine 清空的相容問題。
// 不修改 Apps Script 後端與既有 Sheet 結構。
(()=>{
  const VER='2026.10.11-v115';
  const COMPLETED='機台退稅完成✅';

  // v73 的同步包裝只有「找機台退稅❗️」會保留 refundMachine。
  // v114 新增完成狀態後，直接從首頁按完成會進到 syncRecord，舊邏輯因此會把機台名稱清空。
  // 這裡在完成狀態同步期間提供既有 snapshot，讓 v114 的 taxRefundApplyToItem
  // 同時保留 refundStatus 與 refundMachine，再交給原同步流程處理。
  if(typeof syncRecord==='function'){
    const baseSyncRecordV115=syncRecord;
    syncRecord=async function(action,trip,type,item){
      const preserveMachine = type==='expenses' && item?.refundStatus===COMPLETED;
      let previousSnapshot=null;
      let canUseSnapshot=false;

      if(preserveMachine){
        try{
          if(typeof taxRefundSaveSnapshot!=='undefined'){
            previousSnapshot=taxRefundSaveSnapshot;
            taxRefundSaveSnapshot={
              status:COMPLETED,
              machine:String(item?.refundMachine||'')
            };
            canUseSnapshot=true;
          }
        }catch(e){}
      }

      try{
        return await baseSyncRecordV115.apply(this,arguments);
      }finally{
        if(canUseSnapshot){
          try{ taxRefundSaveSnapshot=previousSnapshot; }catch(e){}
        }
      }
    };
  }

  // 再保險：每次完成狀態套回表單／紀錄時，機台名稱都維持原值。
  if(typeof taxRefundApplyToItem==='function'){
    const baseApplyToItemV115=taxRefundApplyToItem;
    taxRefundApplyToItem=function(item,snapshot){
      const oldMachine=String(item?.refundMachine||'');
      const result=baseApplyToItemV115.apply(this,arguments);
      if(result?.refundStatus===COMPLETED && !result.refundMachine){
        result.refundMachine=String(snapshot?.machine||oldMachine||'');
      }
      return result;
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web) web.textContent=VER;
  }

  const baseRenderSettingsV115=window.renderSettings;
  if(typeof baseRenderSettingsV115==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV115.apply(this,arguments);
      applyVersion();
      return r;
    };
  }

  applyVersion();
})();
