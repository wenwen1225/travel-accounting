// Universal, read-only fund balance display for every trip with its own Google Sheet.
(()=>{
  'use strict';
  const SEOUL='1iOki0_URAhwnALSbbBzUymoKETxJ6kfqnmkXqYyYtJ8';
  const PREFIX='travel_fund_balance_readonly_';
  const liveBySheet=new Map(), inflight=new Set(), states=new Map(), errors=new Map();
  function trip(){return typeof currentTrip!=='undefined'?currentTrip:null;}
  function sheet(){return String(trip()?.spreadsheetId||'').trim();}
  function valid(response,id){
    if(!response||response.success===false||!response.balances)return null;
    if(response.spreadsheetId&&String(response.spreadsheetId)!==id)return null;
    const balances={};
    for(const [key,value] of Object.entries(response.balances)){
      const n=Number(value);
      if(!Number.isFinite(n))return null;
      balances[key]=n;
    }
    if(!Number.isFinite(balances.CASH))return null;
    const total=Number(response.total);
    if(!Number.isFinite(total)||Math.abs(total-Object.values(balances).reduce((a,b)=>a+b,0))>0.01)return null;
    return {balances,total,at:response.at||null};
  }
  function cached(id){
    try{return valid(JSON.parse(localStorage.getItem(PREFIX+id)||'null'),id);}catch(_){return null;}
  }
  function removeNote(){
    document.getElementById('fundSeoulVerifiedNote')?.remove();
    document.getElementById('fundCloudBalancesNote')?.remove();
  }
  function display(){
    const t=trip(),id=sheet();
    removeNote();
    if(!t||!id||!document.getElementById('fundAccountsSection'))return;
    const data=liveBySheet.get(id)||cached(id);
    const status=states.get(id)||'idle';
    if(!data&&status==='idle'&&typeof getApiUrl==='function'&&getApiUrl())return;
    const grid=document.getElementById('fundMiniGrid');
    const total=document.getElementById('fundTotalBalance');
    const warning=document.getElementById('fundDataWarning');
    const symbol=typeof currencySymbol==='function'?currencySymbol(t.currency):'';
    const money=n=>symbol+Number(n).toLocaleString('en-US');
    if(data){
      if(total)total.textContent=money(data.total);
      if(grid){
        const defs=String(t.currency)==='KRW'?[['CASH','💵 現金'],['WOWPASS','💳 WOWPASS'],['TOSS','💙 TOSS']]:[['CASH','💵 現金']];
        grid.innerHTML=defs.map(([key,label])=>'<div class="fund-mini"><span class="fund-mini-name">'+label+'</span><strong>'+money(data.balances[key]||0)+'</strong></div>').join('');
      }
      if(warning)warning.style.display='none';
    }
    const note=document.createElement('div');
    note.id='fundCloudBalancesNote';
    note.style.cssText='margin-top:10px;padding:10px 12px;border-radius:12px;background:#f4f0ff;color:#665381;font-size:11px;line-height:1.7';
    if(liveBySheet.has(id)){
      note.textContent='✓ 已從 GAS 讀取 Google Sheet「資金紀錄」最新餘額（唯讀）。';
    }else if(data){
      note.textContent='ⓘ 顯示上次成功同步的資金餘額'+(data.at?'（'+new Date(data.at).toLocaleString('zh-TW')+'）':'')+'；'+(status==='loading'?'正在背景更新…':'目前尚未取得最新雲端資料。');
    }else{
      const configured=typeof getApiUrl==='function'&&!!getApiUrl();
      note.textContent=!configured?'ⓘ 此裝置尚未設定 GAS 雲端網址。請至「設定」填入與電腦相同的 Apps Script /exec 網址。':status==='loading'?'ⓘ 正在從雲端核對資金餘額…':'ⓘ 雲端資金讀取失敗：'+(errors.get(id)||'尚未取得有效資料')+'。';
    }
    (grid||document.getElementById('fundAccountsSection')).insertAdjacentElement('afterend',note);
    if(status==='error'||(!data&&status!=='loading')){
      const retry=document.createElement('button');retry.type='button';retry.textContent='↻ 重新讀取資金餘額';retry.style.cssText='display:block;width:100%;margin-top:7px;padding:9px;border-radius:10px;border:1px solid #e1d6f6;background:white;color:#7255a2;font-weight:700';retry.onclick=refresh;note.appendChild(retry);
    }
    if(id===SEOUL){
      const btn=document.getElementById('saveFundBtn');
      if(btn){btn.disabled=true;btn.title='首爾歷史資金唯讀保護';btn.textContent='首爾資金唯讀保護中';}
    }
  }
  async function refresh(){
    const t=trip(),id=sheet();
    if(!t||!id||inflight.has(id))return;
    if(typeof postToCloud!=='function'||typeof getApiUrl!=='function'||!getApiUrl()){states.set(id,'error');errors.set(id,'此裝置沒有設定 GAS 雲端網址');display();return;}
    inflight.add(id);states.set(id,'loading');display();
    try{
      const response=await postToCloud({action:'getFundBalances',spreadsheetId:id});
      const value=valid(response,id);
      if(!value)throw new Error('INVALID_FUND_BALANCES');
      const updated={...value,at:new Date().toISOString()};
      liveBySheet.set(id,updated);states.set(id,'ok');errors.delete(id);
      try{localStorage.setItem(PREFIX+id,JSON.stringify(updated));}catch(_){}
    }catch(err){
      states.set(id,'error');errors.set(id,String(err?.message||err).slice(0,180));console.warn('資金餘額唯讀同步失敗',err);
    }finally{
      inflight.delete(id);
      if(sheet()===id)display();
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
    removeNote();display();refresh();return result;
  };
  // Keep historical Seoul write protection, not a global write lock.
  window.isSeoulFundSnapshotProtected=()=>sheet()===SEOUL;
  window.renderVerifiedSeoulFundSnapshot=display;
  window.checkSeoulFundCloudReadOnly=refresh;
  const boot=()=>{if(trip()){display();refresh();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
