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
    const t=window.currentTrip;
    return !!t&&t.currency==='KRW'&&
      (String(t.spreadsheetId||'')===REFERENCE.spreadsheetId||
      String(t.name||'').replace(/\s/g,'')===REFERENCE.tripName.replace(/\s/g,''));
  }
  function apply(){
    if(!isTarget())return;
    const root=document.getElementById('fundAccountsSection');
    if(!root)return;
    const total=document.getElementById('fundTotalBalance');
    if(total)total.textContent=money(REFERENCE.total);
    const grid=document.getElementById('fundMiniGrid');
    if(grid){
      const labels=[['CASH','💵 現金'],['WOWPASS','💳 WOWPASS'],['TOSS','💙 TOSS']];
      grid.innerHTML=labels.map(([id,label])=>'<div class="fund-mini"><span class="fund-mini-name">'+label+'</span><strong>'+money(REFERENCE.balances[id])+'</strong></div>').join('');
    }
    const fee=document.getElementById('fundFeeText');
    if(fee)fee.textContent='帳戶轉移手續費累計 '+money(REFERENCE.fees)+'（已與 Sheet 核對）';
    const old=document.getElementById('fundDataWarning');
    if(old)old.style.display='none';
    let note=document.getElementById('fundSeoulVerifiedNote');
    if(!note){
      note=document.createElement('div');
      note.id='fundSeoulVerifiedNote';
      note.style.cssText='margin-top:10px;padding:10px 12px;border-radius:12px;background:#f4f0ff;color:#665381;font-size:11px;line-height:1.7';
      (grid||root).insertAdjacentElement('afterend',note);
    }
    note.innerHTML='✓ 已與 Google Sheet「資金紀錄」核對（'+REFERENCE.checked+'）<br>這是核對當時的資料快照，並非即時同步；網頁原始資金資料仍待完整讀回。<a href="https://docs.google.com/spreadsheets/d/'+REFERENCE.spreadsheetId+'/edit?gid='+REFERENCE.sheetGid+'" target="_blank" rel="noopener noreferrer" style="color:#6b46b0;text-decoration:underline">查看原始 Sheet</a>';
    const btn=document.getElementById('saveFundBtn');
    if(btn){btn.disabled=true;btn.title='此旅程原始資金帳戶尚未完整還原，暫停寫入以保護 Google Sheet';btn.textContent='原始資金待還原，暫停覆寫';}
  }
  // The other fund scripts re-render the section; run after their render wrappers.
  const base=window.renderTripSummary;
  window.renderTripSummary=function(){const result=typeof base==='function'?base.apply(this,arguments):undefined;apply();return result;};
  const baseOpen=window.openTrip;
  window.openTrip=function(){const result=typeof baseOpen==='function'?baseOpen.apply(this,arguments):undefined;apply();return result;};
  window.isSeoulFundSnapshotProtected=isTarget;
  window.renderVerifiedSeoulFundSnapshot=apply;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
  else apply();
})();