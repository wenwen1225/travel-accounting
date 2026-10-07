// v93：全部紀錄只依「寫入 / 建立時間」倒序。
// 不改交易日期、不碰資金輸入核心；刪除後重新排序顯示。
(()=>{
  const FUND_V93_VERSION='2026.10.07-v93';

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
      return toMs(st.accounts?.[item.accountId]?.initialCreatedAt);
    }
    if(item._fundKind==='transfer'){
      const t=(st.transfers||[]).find(x=>String(x.id)===String(item._fundId));
      return toMs(t?.createdAt)||idTime(t?.id)||idTime(item._fundId);
    }
    const e=(st.accounts?.[item.accountId]?.entries||[]).find(x=>String(x.id)===String(item._fundId));
    return toMs(e?.createdAt)||idTime(e?.id)||idTime(item._fundId);
  }
  function writeTime(item){
    return toMs(item?.createdAt)||toMs(item?.created_at)||toMs(item?.writeAt)||toMs(item?.updatedAt)||fundCreatedAt(item)||idTime(item?.id)||idTime(item?._fundId);
  }
  function sortByWriteTime(){
    if(!Array.isArray(window.allRecordSource))return;
    window.allRecordSource=window.allRecordSource
      .map((item,index)=>({item,index,time:writeTime(item)}))
      .sort((a,b)=>{
        if(b.time!==a.time)return b.time-a.time;
        return b.index-a.index;
      })
      .map(x=>x.item);
  }

  const baseOpenRecordsV93=window.openRecords;
  window.openRecords=function(){
    const r=typeof baseOpenRecordsV93==='function'?baseOpenRecordsV93():undefined;
    sortByWriteTime();
    if(typeof applyRecordFilters==='function')applyRecordFilters();
    return r;
  };

  const baseDeleteFundRecordV93=window.deleteFundRecordV84;
  if(typeof baseDeleteFundRecordV93==='function'){
    window.deleteFundRecordV84=function(kind,id,accountId){
      const r=baseDeleteFundRecordV93(kind,id,accountId);
      setTimeout(()=>{
        sortByWriteTime();
        if(typeof applyRecordFilters==='function')applyRecordFilters();
      },0);
      return r;
    };
  }

  try{window.WEB_VERSION=FUND_V93_VERSION;}catch(e){}
  const webEl=document.getElementById('webVersionText');if(webEl)webEl.textContent=FUND_V93_VERSION;
})();
