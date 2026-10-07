// v92：全部紀錄排序修正。
// 日期由新到舊；同一天依建立時間由新到舊。只處理排序，不碰資金輸入/同步/刪除核心。
(()=>{
  const SORT_WEB_VERSION='2026.10.07-v92';

  function createdTs(item){
    const vals=[item?.createdAt,item?.created_at,item?.timestamp,item?._fundId,item?.id];
    for(const v of vals){
      if(v==null)continue;
      if(typeof v==='number'&&Number.isFinite(v))return v;
      const s=String(v);
      if(/\d{4}-\d{2}-\d{2}T/.test(s)){
        const t=Date.parse(s);if(!Number.isNaN(t))return t;
      }
      const m=s.match(/(\d{13})/);
      if(m)return Number(m[1]);
    }
    // 初始餘額沒有建立時間，視為同一天較早的紀錄。
    if(item?._fundKind==='initial')return 0;
    return 0;
  }

  function sortNewest(){
    if(typeof allRecordSource==='undefined'||!Array.isArray(allRecordSource))return;
    const decorated=allRecordSource.map((item,index)=>({item,index,ts:createdTs(item)}));
    decorated.sort((a,b)=>{
      const ad=String(a.item?.date||''),bd=String(b.item?.date||'');
      const d=bd.localeCompare(ad);
      if(d)return d;
      if(b.ts!==a.ts)return b.ts-a.ts;
      return a.index-b.index;
    });
    allRecordSource=decorated.map(x=>x.item);
  }

  const baseOpenRecordsV92=window.openRecords;
  window.openRecords=function(){
    const r=typeof baseOpenRecordsV92==='function'?baseOpenRecordsV92():undefined;
    sortNewest();
    if(typeof applyRecordFilters==='function')applyRecordFilters();
    return r;
  };

  const baseApplyRecordFiltersV92=window.applyRecordFilters;
  window.applyRecordFilters=function(){
    sortNewest();
    return typeof baseApplyRecordFiltersV92==='function'?baseApplyRecordFiltersV92():undefined;
  };

  try{window.WEB_VERSION=SORT_WEB_VERSION;}catch(e){}
  const webEl=document.getElementById('webVersionText');if(webEl)webEl.textContent=SORT_WEB_VERSION;
})();
