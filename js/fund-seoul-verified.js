// 2026-10-19: Read-only reconciliation of the archived Seoul trip with the actual
// Google Sheet 資金紀錄 (gid 1493428233). This is a verified snapshot, NOT a live API.
// Never inject these figures into fundAccounts or send them to saveFundAccounts.
(()=>{
  const REFERENCE={
    tripName:'首爾 26_10_09_11',
    spreadsheetId:'1iOki0_URAhwnALSbbBzUymoKETxJ6kfqnmkXqYyYtJ8',
    sheetGid:'1493428233',
    checked:'2026-10-19',
    balances:{CASH:52050,WOWPASS:9817,TOSS:1400},
    initial:{CASH:82450,WOWPASS:72515,TOSS:0},
    total:63267,fees:200
  };
  const money=n=>'₩'+Number(n).toLocaleString('en-US');
  function isTarget(){
    const t=typeof currentTrip!=='undefined'?currentTrip:null;
    return !!t&&t.currency==='KRW'&&
      (String(t.spreadsheetId||'')===REFERENCE.spreadsheetId||
      String(t.name||'').replace(/\s/g,'')===REFERENCE.tripName.replace(/\s/g,''));
  }
  const numeric=v=>{const n=Number(String(v??0).replace(/,/g,''));return Number.isFinite(n)?n:0;};
  let cloudFunds=null, cloudTrip=null, lastRead='not-checked', requestId=0;
  // Read the existing Sheet only. Google Visualization requires the Sheet to
  // permit this browser to read it; on permission/CORS failure we show pending.
  async function readSheetExchangeRows(){
    const url='https://docs.google.com/spreadsheets/d/'+REFERENCE.spreadsheetId+
      '/gviz/tq?gid='+REFERENCE.sheetGid+'&tqx=out:json&range=A1:H100';
    const res=await fetch(url,{cache:'no-store',credentials:'omit'});
    if(!res.ok)throw new Error('SHEET_READ_'+res.status);
    const raw=await res.text();
    const begin=raw.indexOf('{'),end=raw.lastIndexOf('}');
    if(begin<0||end<begin)throw new Error('SHEET_FORMAT');
    const data=JSON.parse(raw.slice(begin,end+1));
    const rows=(data.table?.rows||[]).map(row=>(row.c||[]).map(cell=>cell?.v??cell?.f??''));
    const found=[];
    let inCash=false;
    for(const row of rows){
      const first=String(row[0]||'');
      if(first.startsWith('現金｜')){inCash=true;continue;}
      if(first.startsWith('WOWPASS｜')||first.startsWith('TOSS｜')){inCash=false;continue;}
      if(!inCash||String(row[1]||'')!=='換匯')continue;
      const id=String(row[7]||'');
      const foreign=numeric(row[3]);
      if(id&&foreign>0)found.push({id,foreign,date:'',pay:'現金'});
    }
    return found;
  }

  function computeFunds(trip,funds){
    if(!trip||!funds?.accounts)return null;
    const ids=['CASH','WOWPASS','TOSS'];
    const accounts=funds.accounts;
    if(!ids.every(id=>{
      const a=accounts[id];
      return a&&(a.initialSet===true||numeric(a.initial)!==0||!!a.initialDate);
    }))return null;
    if(!Array.isArray(funds.transfers))return null;
    const balances={}, seen=new Set();
    for(const id of ids){
      const a=accounts[id];
      if(!Array.isArray(a.entries))return null;
      balances[id]=numeric(a.initial);
      for(const e of a.entries){
        if(e.id&&seen.has('entry:'+e.id))continue;
        if(e.id)seen.add('entry:'+e.id);
        balances[id]+=numeric(e.amount);
      }
    }
    for(const e of trip.exchange||[]){
      if(e.id&&seen.has('exchange:'+e.id))continue;
      if(e.id)seen.add('exchange:'+e.id);
      balances.CASH+=numeric(e.foreign);
    }
    const payMap={'現金':'CASH','Wowpass':'WOWPASS','Toss':'TOSS'};
    for(const e of trip.expenses||[]){
      const id=payMap[e.pay];
      if(!id)continue;
      if(e.id&&seen.has('expense:'+e.id))continue;
      if(e.id)seen.add('expense:'+e.id);
      balances[id]-=numeric(e.foreign);
    }
    let fees=0;
    for(const t of funds.transfers){
      if(!ids.includes(t.from)||!ids.includes(t.to))return null;
      if(t.id&&seen.has('transfer:'+t.id))continue;
      if(t.id)seen.add('transfer:'+t.id);
      balances[t.from]-=numeric(t.amount)+numeric(t.fee);
      balances[t.to]+=numeric(t.amount);
      fees+=numeric(t.fee);
    }
    // Compare source-sheet exchange IDs, not a hardcoded amount.
    if(!Array.isArray(trip.requiredSheetExchanges))return null;
    const cloudExchangeIds=new Set((trip.exchange||[]).map(e=>String(e.id||'')));
    for(const source of trip.requiredSheetExchanges){
      if(!cloudExchangeIds.has(source.id))balances.CASH+=numeric(source.foreign);
    }
    return {balances,fees,total:ids.reduce((n,id)=>n+balances[id],0)};
  }
  async function checkCloudFunds(){
    if(!isTarget()||typeof getApiUrl!=='function'||!getApiUrl()||typeof postToCloud!=='function')return;
    const token=++requestId,tripId=currentTrip.id;
    lastRead='checking';apply();
    try{
      const result=await postToCloud({action:'getAllData'});
      if(token!==requestId)return;
      const match=(result.trips||[]).find(x=>String(x.id)===String(tripId)||String(x.spreadsheetId)===REFERENCE.spreadsheetId);
      const funds=match?.fundAccounts;
      if(match&&funds){
        // The Sheet is the source of truth for exchange rows omitted by GAS.
        // Never mutate cloudTrip, fundAccounts or the spreadsheet itself.
        const sheetExchanges=await readSheetExchangeRows();
        if(token!==requestId)return;
        const checkedTrip={...match,requiredSheetExchanges:sheetExchanges};
        if(sheetExchanges.length&&computeFunds(checkedTrip,funds)){
          cloudTrip=checkedTrip;cloudFunds=funds;lastRead='available';
        }else{cloudTrip=null;cloudFunds=null;lastRead='missing';}
      }else{
        cloudTrip=null;cloudFunds=null;lastRead='missing';
      }
    }catch(err){if(token!==requestId)return;cloudTrip=null;cloudFunds=null;lastRead='unavailable';}
    if(isTarget()&&currentTrip.id===tripId)apply();
  }
  function apply(){
    if(!isTarget())return;
    const root=document.getElementById('fundAccountsSection');
    if(!root)return;
    // Only cloud-returned data drives displayed balances. Never use reference
    // figures as a replacement for missing cloud data.
    const computed=lastRead==='available'?computeFunds(cloudTrip,cloudFunds):null;
    const total=document.getElementById('fundTotalBalance');
    const grid=document.getElementById('fundMiniGrid');
    const old=document.getElementById('fundDataWarning');
    if(old)old.style.display='none';
    if(total)total.textContent=computed?money(computed.total):'待雲端核對';
    if(grid){
      const labels=[['CASH','💵 現金'],['WOWPASS','💳 WOWPASS'],['TOSS','💙 TOSS']];
      grid.innerHTML=labels.map(([id,label])=>'<div class="fund-mini"><span class="fund-mini-name">'+label+'</span><strong>'+(computed?money(computed.balances[id]):'待雲端核對')+'</strong></div>').join('');
    }
    const fee=document.getElementById('fundFeeText');
    if(fee)fee.textContent=computed?'帳戶轉移手續費累計 '+money(computed.fees):'等待完整雲端資金明細';
    let note=document.getElementById('fundSeoulVerifiedNote');
    if(!note){
      note=document.createElement('div');
      note.id='fundSeoulVerifiedNote';
      note.style.cssText='margin-top:10px;padding:10px 12px;border-radius:12px;background:#f4f0ff;color:#665381;font-size:11px;line-height:1.7';
      (grid||root).insertAdjacentElement('afterend',note);
    }
    const matched=computed&&['CASH','WOWPASS','TOSS'].every(id=>computed.balances[id]===REFERENCE.balances[id])&&computed.total===REFERENCE.total;
    const status=lastRead==='checking'?'正在讀取雲端資金資料…':computed?(matched?'已與 2026-10-19 Sheet 核對基準一致':'雲端計算結果與 2026-10-19 Sheet 基準不同，請核對是否有新交易或缺漏'):(lastRead==='unavailable'?'無法讀取雲端資料；為避免錯誤暫不顯示金額':'尚未取得可核對的 Sheet 換匯資料或完整資金帳戶；為避免錯誤暫不顯示金額');
    note.textContent=(computed?'✓ 金額由 GAS 帳戶資料及 Sheet 換匯紀錄計算（非固定金額）。':'⚠ 資金餘額未經完整雲端資料確認。')+' '+status+'。此畫面只讀取，不會修改 Sheet。';
    const btn=document.getElementById('saveFundBtn');
    if(btn){btn.disabled=true;btn.title='首爾資金維持唯讀保護，避免覆寫 Sheet';btn.textContent='首爾資金唯讀保護中';}
  }
  // The other fund scripts re-render the section; run after their render wrappers.
  const base=window.renderTripSummary;
  window.renderTripSummary=function(){const result=typeof base==='function'?base.apply(this,arguments):undefined;apply();return result;};
  const baseOpen=window.openTrip;
  window.openTrip=function(){const result=typeof baseOpen==='function'?baseOpen.apply(this,arguments):undefined;apply();if(isTarget())checkCloudFunds();return result;};
  window.isSeoulFundSnapshotProtected=isTarget;
  window.renderVerifiedSeoulFundSnapshot=apply;
  window.checkSeoulFundCloudReadOnly=checkCloudFunds;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();if(isTarget())checkCloudFunds();});
  else {apply();if(isTarget())checkCloudFunds();}
})();