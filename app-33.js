// v86：共同資金改為本機先存、背景同步；資金紀錄依收入/支出/調整分色；恢復右滑刪除。
// 後端仍搭配 v56。
(()=>{
  const FUND_V86_VERSION='2026.10.06-v86';
  const BG_SYNC_GAP=15000;
  const lastBgSync={};

  const num=v=>{
    const n=Number(String(v??'').replace(/,/g,''));
    return Number.isFinite(n)?n:0;
  };
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>(currentTrip?currencySymbol(currentTrip.currency):'')+Number(v||0).toLocaleString('en-US');

  function activeFundId(){
    const btn=document.querySelector('#fundAccountTabs button.active');
    const onclick=btn?.getAttribute('onclick')||'';
    const m=onclick.match(/selectFundAccountV83\('([^']+)'\)/);
    return m?m[1]:'CASH';
  }

  function ensureState(){
    if(!currentTrip) return {accounts:{},transfers:[]};
    if(!currentTrip.fundAccounts||typeof currentTrip.fundAccounts!=='object') currentTrip.fundAccounts={accounts:{},transfers:[]};
    if(!currentTrip.fundAccounts.accounts||typeof currentTrip.fundAccounts.accounts!=='object') currentTrip.fundAccounts.accounts={};
    if(!Array.isArray(currentTrip.fundAccounts.transfers)) currentTrip.fundAccounts.transfers=[];
    ['CASH','WOWPASS','TOSS'].forEach(id=>{
      if(!currentTrip.fundAccounts.accounts[id]) currentTrip.fundAccounts.accounts[id]={initial:0,initialDate:'',entries:[]};
      if(!Array.isArray(currentTrip.fundAccounts.accounts[id].entries)) currentTrip.fundAccounts.accounts[id].entries=[];
    });
    return currentTrip.fundAccounts;
  }

  function snapshotString(st){
    try{return JSON.stringify(st||{});}catch(e){return '';}
  }

  async function backgroundFundSyncV86(tripId,force=false){
    const trip=(state?.trips||[]).find(t=>t.id===tripId);
    if(!trip||!getApiUrl?.()) return false;
    const now=Date.now();
    if(!force && lastBgSync[tripId] && now-lastBgSync[tripId]<BG_SYNC_GAP) return false;
    lastBgSync[tripId]=now;

    const snapshot=JSON.parse(JSON.stringify(trip.fundAccounts||{accounts:{},transfers:[]}));
    const snapshotKey=snapshotString(snapshot);
    trip.cloudStatus='pending';
    trip.lastSyncError='';
    persist();

    try{
      const ver=await postToCloud({action:'getVersion'});
      if(String(ver?.scriptVersion||'')!=='v56') throw new Error('Apps Script 尚未更新至 v56');
      if(!trip.spreadsheetId){
        const ready=await ensureTripSpreadsheetReady(trip);
        if(!ready||!trip.spreadsheetId) throw new Error('Google Sheet 尚未建立完成');
      }
      await postToCloud({action:'saveFundAccounts',spreadsheetId:trip.spreadsheetId,clientTripId:trip.id,fundAccounts:snapshot});
      const latest=(state?.trips||[]).find(t=>t.id===tripId);
      if(latest && snapshotString(latest.fundAccounts)===snapshotKey){
        latest.cloudStatus='synced';
        latest.lastSyncError='';
        if(typeof markSyncSuccess==='function') markSyncSuccess();
        persist();
      }
      return true;
    }catch(err){
      const latest=(state?.trips||[]).find(t=>t.id===tripId);
      if(latest){
        latest.cloudStatus='pending';
        latest.lastSyncError=String(err?.message||err);
        persist();
      }
      return false;
    }
  }
  window.backgroundFundSyncV86=backgroundFundSyncV86;

  // 資金設定：像一般記帳一樣，本機先完成，不等待 Google Sheets。
  window.saveFundAccountsV83=function(){
    if(!currentTrip) return;
    const st=ensureState();
    const id=activeFundId();
    const a=st.accounts[id]||(st.accounts[id]={initial:0,initialDate:'',entries:[]});
    const input=document.getElementById('fundInitialInput');
    const date=document.getElementById('fundInitialDate');
    if(input) a.initial=num(input.value);
    if(date) a.initialDate=date.value||currentTrip.start||'';
    currentTrip.fundAccounts=st;
    currentTrip.cloudStatus=getApiUrl?.()?'pending':'local';
    persist();

    const tripId=currentTrip.id;
    if(typeof closeFundManagerV83==='function') closeFundManagerV83();
    if(typeof openTrip==='function') openTrip(tripId);

    // 不阻塞畫面，背景同步。
    setTimeout(()=>backgroundFundSyncV86(tripId,true),0);
  };

  // 刪除也改成本機先刪；確認後立即更新畫面，再背景同步 Sheet。
  window.deleteFundRecordV84=function(kind,id,accountId){
    if(!currentTrip)return;
    if(currentTrip.archived)return typeof archiveReadOnlyAlert==='function'?archiveReadOnlyAlert():null;
    const label=kind==='transfer'?'這筆帳戶轉移（含手續費）':kind==='initial'?'這筆初始餘額':'這筆資金紀錄';
    if(!confirm(`確定要刪除${label}嗎？\n刪除後會重新計算相關帳戶餘額。`)) return;

    const st=ensureState();
    if(kind==='transfer'){
      st.transfers=(st.transfers||[]).filter(t=>String(t.id)!==String(id));
    }else if(kind==='initial'){
      if(st.accounts[accountId]){
        st.accounts[accountId].initial=0;
        st.accounts[accountId].initialDate='';
      }
    }else if(st.accounts[accountId]){
      st.accounts[accountId].entries=(st.accounts[accountId].entries||[]).filter(e=>String(e.id)!==String(id));
    }
    currentTrip.fundAccounts=st;
    currentTrip.cloudStatus=getApiUrl?.()?'pending':'local';
    persist();
    const tripId=currentTrip.id;
    if(typeof openRecords==='function') openRecords();
    setTimeout(()=>backgroundFundSyncV86(tripId,true),0);
  };

  function colorClass(item){
    if(!item?._fundRecord) return '';
    const type=String(item.fundType||'');
    if(item._fundKind==='transfer') return 'fund-v86-transfer';
    if(type.includes('調整')) return 'fund-v86-adjust';
    const signed=Number(item.signedAmount??0);
    if(item._fundKind==='initial' || signed>0 || ['儲值','退款','其他收入'].some(x=>type.includes(x))) return 'fund-v86-income';
    if(signed<0 || type.includes('支出')) return 'fund-v86-expense';
    return 'fund-v86-neutral';
  }

  function ensureStyles(){
    if(document.getElementById('fundV86Styles'))return;
    const s=document.createElement('style');
    s.id='fundV86Styles';
    s.textContent=`
      .fund-swipe-shell{position:relative;overflow:hidden;border-bottom:1px solid var(--line);touch-action:pan-y}
      .fund-swipe-shell:last-child{border-bottom:0}
      .fund-swipe-delete{position:absolute;left:0;top:0;bottom:0;width:86px;border:0;background:#ffe7e7;color:#c24141;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:1}
      .fund-swipe-content{position:relative;z-index:2;background:#fff;transform:translateX(0);transition:transform .18s ease;will-change:transform}
      .fund-swipe-shell.is-open .fund-swipe-content{transform:translateX(86px)}
      .fund-v86-income .fund-swipe-content{background:#effaf2}
      .fund-v86-expense .fund-swipe-content{background:#fff0f3}
      .fund-v86-adjust .fund-swipe-content{background:#f5f0ff}
      .fund-v86-transfer .fund-swipe-content{background:#eef6ff}
      .fund-v86-income .fund-record-amount strong{color:#15803d!important}
      .fund-v86-expense .fund-record-amount strong{color:#c2415a!important}
      .fund-v86-adjust .fund-record-amount strong{color:#7c3aed!important}
      .fund-v86-transfer .fund-record-amount strong{color:#2563eb!important}
      .fund-record-actions{display:none!important}
      .fund-v86-hint{font-size:11px;color:var(--muted);margin-top:6px}
    `;
    document.head.appendChild(s);
  }

  const baseRecordHtmlV86=window.recordHtml;
  window.recordHtml=function(item){
    if(!item?._fundRecord) return typeof baseRecordHtmlV86==='function'?baseRecordHtmlV86(item):'';
    const base=typeof baseRecordHtmlV86==='function'?baseRecordHtmlV86(item):'';
    const inner=base.replace(/^<div class="fund-record-card"[^>]*>/,'<div class="fund-record-card">').replace(/<div class="fund-record-actions">[\s\S]*?<\/div>\s*<\/div>$/,'</div>');
    const cls=colorClass(item);
    return `<div class="fund-swipe-shell ${cls}" data-kind="${safe(item._fundKind)}" data-id="${safe(item._fundId)}" data-account="${safe(item.accountId)}">
      <button class="fund-swipe-delete" type="button">刪除</button>
      <div class="fund-swipe-content">${inner}</div>
    </div>`;
  };

  function closeOtherSwipe(except){
    document.querySelectorAll('.fund-swipe-shell.is-open').forEach(x=>{if(x!==except)x.classList.remove('is-open');});
  }

  function bindSwipe(){
    ensureStyles();
    document.querySelectorAll('.fund-swipe-shell').forEach(shell=>{
      if(shell.dataset.swipeBound==='1') return;
      shell.dataset.swipeBound='1';
      const content=shell.querySelector('.fund-swipe-content');
      const del=shell.querySelector('.fund-swipe-delete');
      let sx=0,sy=0,dx=0,tracking=false,horizontal=false;

      content?.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse' && e.button!==0)return;
        sx=e.clientX;sy=e.clientY;dx=0;tracking=true;horizontal=false;
      });
      content?.addEventListener('pointermove',e=>{
        if(!tracking)return;
        const x=e.clientX-sx,y=e.clientY-sy;
        if(!horizontal && Math.abs(x)>8 && Math.abs(x)>Math.abs(y)) horizontal=true;
        if(!horizontal)return;
        dx=Math.max(0,Math.min(100,x));
        content.style.transition='none';
        content.style.transform=`translateX(${dx}px)`;
        e.preventDefault();
      });
      const finish=()=>{
        if(!tracking)return;
        tracking=false;
        content.style.transition='';
        content.style.transform='';
        if(horizontal && dx>=55){closeOtherSwipe(shell);shell.classList.add('is-open');}
        else shell.classList.remove('is-open');
        setTimeout(()=>{dx=0;horizontal=false;},0);
      };
      content?.addEventListener('pointerup',finish);
      content?.addEventListener('pointercancel',finish);

      del?.addEventListener('click',e=>{
        e.stopPropagation();
        shell.classList.remove('is-open');
        deleteFundRecordV84(shell.dataset.kind||'',shell.dataset.id||'',shell.dataset.account||'');
      });
    });
  }

  const baseApplyRecordFiltersV86=window.applyRecordFilters;
  window.applyRecordFilters=function(){
    const r=typeof baseApplyRecordFiltersV86==='function'?baseApplyRecordFiltersV86():undefined;
    bindSwipe();
    return r;
  };

  const baseOpenRecordsV86=window.openRecords;
  window.openRecords=function(){
    const r=typeof baseOpenRecordsV86==='function'?baseOpenRecordsV86():undefined;
    bindSwipe();
    return r;
  };

  // 後端升到 v56 後，之前 pending 的資金資料在開旅行時自動背景補同步。
  const baseOpenTripV86=window.openTrip;
  window.openTrip=function(id){
    const r=typeof baseOpenTripV86==='function'?baseOpenTripV86(id):undefined;
    const trip=(state?.trips||[]).find(t=>t.id===id);
    if(trip?.fundAccounts && trip.cloudStatus==='pending') setTimeout(()=>backgroundFundSyncV86(id,false),0);
    return r;
  };

  // 前端版本顯示校正。
  try{window.WEB_VERSION=FUND_V86_VERSION;}catch(e){}
})();
