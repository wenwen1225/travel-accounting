// Seoul archived trip: instant cached display + authoritative read-only GAS balances.
// No mutations to trip state, Google Sheets, or fundAccounts.
(()=>{
  'use strict';
  const SHEET='1iOki0_URAhwnALSbbBzUymoKETxJ6kfqnmkXqYyYtJ8';
  const TRIP='首爾 26_10_09_11';
  const KEY='travel_fund_balance_readonly_'+SHEET;
  const BASELINE={balances:{CASH:52050,WOWPASS:9817,TOSS:1400},total:63267};
  const money=n=>'₩'+Number(n).toLocaleString('en-US');
  let live=null, status='idle', requestId=0, pending=false, lastTripId=null;
  function target(){
    const t=typeof currentTrip!=='undefined'?currentTrip:null;
    return !!t&&t.currency==='KRW'&&(String(t.spreadsheetId||'')===SHEET||
      String(t.name||'').replace(/\s/g,'')===TRIP.replace(/\s/g,''));
  }
  function validated(value){
    if(!value||!value.balances)return null;
    const b={};
    for(const id of ['CASH','WOWPASS','TOSS']){
      const n=Number(value.balances[id]);
      if(!Number.isFinite(n))return null;
      b[id]=n;
    }
    const total=Number(value.total);
    if(!Number.isFinite(total)||Math.abs(total-(b.CASH+b.WOWPASS+b.TOSS))>0.001)return null;
    if(value.spreadsheetId&&String(value.spreadsheetId)!==SHEET)return null;
    return {balances:b,total,at:value.at||null};
  }
  function cached(){
    try{return validated(JSON.parse(localStorage.getItem(KEY)||'null'));}catch(_){return null;}
  }
  function display(){
    if(!target())return;
    const root=document.getElementById('fundAccountsSection');
    if(!root)return;
    const data=live||cached()||BASELINE;
    const source=live?'live':cached()?'cache':'baseline';
    const total=document.getElementById('fundTotalBalance');
    const grid=document.getElementById('fundMiniGrid');
    if(total)total.textContent=money(data.total);
    if(grid){
      const defs=[['CASH','💵 現金'],['WOWPASS','💳 WOWPASS'],['TOSS','💙 TOSS']];
      grid.innerHTML=defs.map(([id,label])=>'<div class="fund-mini"><span class="fund-mini-name">'+label+'</span><strong>'+money(data.balances[id])+'</strong></div>').join('');
    }
    const warning=document.getElementById('fundDataWarning');
    if(warning)warning.style.display='none';
    let note=document.getElementById('fundSeoulVerifiedNote');
    if(!note){
      note=document.createElement('div');
      note.id='fundSeoulVerifiedNote';
      note.style.cssText='margin-top:10px;padding:10px 12px;border-radius:12px;background:#f4f0ff;color:#665381;font-size:11px;line-height:1.7';
      (grid||root).insertAdjacentElement('afterend',note);
    }
    if(source==='live'){
      note.textContent='✓ 已從 GAS 讀取 Google Sheet「資金紀錄」最新餘額（唯讀）。';
    }else if(source==='cache'){
      note.textContent='ⓘ 先顯示上次成功同步的資金餘額'+(data.at?'（'+new Date(data.at).toLocaleString('zh-TW')+'）':'')+'；'+(status==='loading'?'正在背景更新…':status==='error'?'目前無法連線，請稍後重試。':'等待雲端更新。');
    }else{
      note.textContent='ⓘ 目前顯示 2026-10-19 已核對的歷史餘額，並非即時資料；'+(status==='loading'?'正在背景更新…':status==='error'?'雲端讀取失敗，請確認後端部署。':'等待雲端更新。');
    }
    const btn=document.getElementById('saveFundBtn');
    if(btn){btn.disabled=true;btn.title='首爾歷史資金唯讀保護，避免覆寫 Sheet';btn.textContent='首爾資金唯讀保護中';}
  }
  async function refresh(){
    if(!target()||pending||typeof getApiUrl!=='function'||!getApiUrl()||typeof postToCloud!=='function')return;
    pending=true;const token=++requestId,tripId=currentTrip.id;
    status='loading';display();
    try{
      const response=await postToCloud({action:'getFundBalances',spreadsheetId:SHEET});
      const value=validated(response);
      if(!value)throw new Error('INVALID_FUND_BALANCES');
      if(token!==requestId)return;
      const data={...value,at:new Date().toISOString()};
      live=data;status='ok';
      try{localStorage.setItem(KEY,JSON.stringify(data));}catch(_){}
    }catch(err){
      if(token===requestId)status='error';
      console.warn('首爾資金唯讀同步失敗',err);
    }finally{
      pending=false;
      if(token===requestId&&target()&&String(currentTrip.id)===String(tripId))display();
    }
  }
  const previousRender=window.renderTripSummary;
  window.renderTripSummary=function(){
    const result=typeof previousRender==='function'?previousRender.apply(this,arguments):undefined;
    display();return result;
  };
  const previousOpen=window.openTrip;
  window.openTrip=function(){
    const result=typeof previousOpen==='function'?previousOpen.apply(this,arguments):undefined;
    if(target()){
      if(String(currentTrip.id)!==String(lastTripId)){live=null;lastTripId=currentTrip.id;}
      display();refresh();
    }
    return result;
  };
  window.isSeoulFundSnapshotProtected=target;
  window.renderVerifiedSeoulFundSnapshot=display;
  window.checkSeoulFundCloudReadOnly=refresh;
  const boot=()=>{if(target()){display();refresh();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
