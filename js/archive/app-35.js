// v101：全部紀錄依「寫入 / 建立時間」倒序。
// 修正 v93 誤用 window.allRecordSource；直接操作全域 lexical allRecordSource。
(()=>{
  const FUND_V101_SORT_VERSION='2026.10.07-v101';

  function toMs(v){
    if(v===undefined||v===null||v==='')return 0;
    if(typeof v==='number'&&Number.isFinite(v))return v;
    const n=Number(v);if(Number.isFinite(n)&&n>0)return n;
    const d=Date.parse(String(v));return Number.isFinite(d)?d:0;
  }
  function idTime(id){
    const m=String(id||'').match(/(\d{13})/);
    return m?Number(m[1]):0;
  }
  function fundCreatedAt(item){
    if(!item?._fundRecord||!currentTrip?.fundAccounts)return 0;
    const st=currentTrip.fundAccounts;
    if(item._fundKind==='initial'){
      return toMs(st.accounts?.[item.accountId]?.initialCreatedAt)
        ||toMs(currentTrip?.fundInitialCreatedAt?.[item.accountId]);
    }
    if(item._fundKind==='transfer'){
      const t=(st.transfers||[]).find(x=>String(x.id)===String(item._fundId));
      return toMs(t?.createdAt)||idTime(t?.id)||idTime(item._fundId);
    }
    const e=(st.accounts?.[item.accountId]?.entries||[]).find(x=>String(x.id)===String(item._fundId));
    return toMs(e?.createdAt)||idTime(e?.id)||idTime(item._fundId);
  }
  function writeTime(item){
    return toMs(item?.createdAt)
      ||toMs(item?.created_at)
      ||toMs(item?.writeAt)
      ||toMs(item?.updatedAt)
      ||fundCreatedAt(item)
      ||idTime(item?.id)
      ||idTime(item?._fundId);
  }
  function sortByWriteTime(){
    try{
      if(typeof allRecordSource==='undefined'||!Array.isArray(allRecordSource))return;
      const sorted=allRecordSource
        .map((item,index)=>({item,index,time:writeTime(item)}))
        .sort((a,b)=>{
          if(a.time&&b.time&&b.time!==a.time)return b.time-a.time;
          if(a.time&&!b.time)return -1;
          if(!a.time&&b.time)return 1;
          return a.index-b.index;
        })
        .map(x=>x.item);
      allRecordSource.length=0;
      allRecordSource.push(...sorted);
    }catch(e){
      console.warn('v101 write-time sort skipped:',e);
    }
  }

  const baseOpenRecordsV101=window.openRecords;
  window.openRecords=function(){
    const r=typeof baseOpenRecordsV101==='function'?baseOpenRecordsV101.apply(this,arguments):undefined;
    sortByWriteTime();
    if(typeof applyRecordFilters==='function')applyRecordFilters();
    return r;
  };

  try{window.WEB_VERSION=FUND_V101_SORT_VERSION;}catch(e){}
  const webEl=document.getElementById('webVersionText');if(webEl)webEl.textContent=FUND_V101_SORT_VERSION;
})();
