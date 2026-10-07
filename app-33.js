// v91：資金本機先存 / 背景同步 + 全部紀錄右滑刪除。
// 修正：按「儲存資金設定」時，自動提交尚未按「加入」的收支 / 帳戶轉移。
(()=>{
  const FUND_V91_VERSION='2026.10.07-v91';
  const BG_SYNC_GAP=15000;
  const lastBgSync={};
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function activeFundId(){
    const btn=document.querySelector('#fundAccountTabs button.active');
    const m=(btn?.getAttribute('onclick')||'').match(/selectFundAccountV83\('([^']+)'\)/);
    return m?m[1]:'CASH';
  }
  function ensureState(){
    if(!currentTrip)return {accounts:{},transfers:[]};
    if(!currentTrip.fundAccounts||typeof currentTrip.fundAccounts!=='object')currentTrip.fundAccounts={accounts:{},transfers:[]};
    if(!currentTrip.fundAccounts.accounts||typeof currentTrip.fundAccounts.accounts!=='object')currentTrip.fundAccounts.accounts={};
    if(!Array.isArray(currentTrip.fundAccounts.transfers))currentTrip.fundAccounts.transfers=[];
    ['CASH','WOWPASS','TOSS'].forEach(id=>{
      const a=currentTrip.fundAccounts.accounts[id]||{};
      currentTrip.fundAccounts.accounts[id]={
        initial:num(a.initial),
        initialDate:String(a.initialDate||''),
        initialSet:typeof a.initialSet==='boolean'?a.initialSet:(num(a.initial)!==0||String(a.initialDate||'').trim()!==''),
        entries:Array.isArray(a.entries)?a.entries:[]
      };
    });
    return currentTrip.fundAccounts;
  }
  function snapshotString(st){try{return JSON.stringify(st||{});}catch(e){return '';}}

  async function backgroundFundSyncV91(tripId,force=false){
    const trip=(state?.trips||[]).find(t=>t.id===tripId);if(!trip||!getApiUrl?.())return false;
    const now=Date.now();if(!force&&lastBgSync[tripId]&&now-lastBgSync[tripId]<BG_SYNC_GAP)return false;lastBgSync[tripId]=now;
    const snapshot=JSON.parse(JSON.stringify(trip.fundAccounts||{accounts:{},transfers:[]})),snapshotKey=snapshotString(snapshot);
    trip.cloudStatus='pending';trip.lastSyncError='';persist();
    try{
      const ver=await postToCloud({action:'getVersion'});if(String(ver?.scriptVersion||'')!=='v56')throw new Error('Apps Script 尚未更新至 v56');
      if(!trip.spreadsheetId){const ready=await ensureTripSpreadsheetReady(trip);if(!ready||!trip.spreadsheetId)throw new Error('Google Sheet 尚未建立完成');}
      await postToCloud({action:'saveFundAccounts',spreadsheetId:trip.spreadsheetId,clientTripId:trip.id,fundAccounts:snapshot});
      const latest=(state?.trips||[]).find(t=>t.id===tripId);
      if(latest&&snapshotString(latest.fundAccounts)===snapshotKey){latest.cloudStatus='synced';latest.lastSyncError='';if(typeof markSyncSuccess==='function')markSyncSuccess();persist();}
      return true;
    }catch(err){
      const latest=(state?.trips||[]).find(t=>t.id===tripId);if(latest){latest.cloudStatus='pending';latest.lastSyncError=String(err?.message||err);persist();}return false;
    }
  }
  window.backgroundFundSyncV86=backgroundFundSyncV91;
  window.backgroundFundSyncV90=backgroundFundSyncV91;
  window.backgroundFundSyncV91=backgroundFundSyncV91;

  function commitPendingFundFormsV91(){
    if(!currentTrip)return;
    const entryInput=document.getElementById('fundEntryAmount');
    const transferInput=document.getElementById('fundTransferAmount');
    const entryAmount=Math.abs(num(entryInput?.value));
    const transferAmount=Math.abs(num(transferInput?.value));

    // 有填金額但尚未按「＋加入這筆收支」時，儲存設定也要一起提交。
    if(entryAmount>0 && typeof window.addFundEntryV83==='function'){
      window.addFundEntryV83();
    }
    // 有填轉移金額但尚未按「＋加入轉移」時，儲存設定也要一起提交。
    if(transferAmount>0 && typeof window.addFundTransferV83==='function'){
      window.addFundTransferV83();
    }
  }

  window.saveFundAccountsV83=function(){
    if(!currentTrip)return;

    // 先把畫面上尚未按「加入」的收支 / 轉移真正寫入本機資料。
    commitPendingFundFormsV91();

    const st=ensureState(),id=activeFundId(),a=st.accounts[id]||(st.accounts[id]={initial:0,initialDate:'',initialSet:false,entries:[]});
    const input=document.getElementById('fundInitialInput'),date=document.getElementById('fundInitialDate');
    const raw=String(input?.value??'').trim();
    if(raw!==''){
      a.initial=num(raw);a.initialSet=true;a.initialDate=date?.value||currentTrip.start||'';
    }
    currentTrip.fundAccounts=st;currentTrip.cloudStatus=getApiUrl?.()?'pending':'local';persist();
    const tripId=currentTrip.id;
    if(typeof closeFundManagerV83==='function')closeFundManagerV83();
    if(typeof openTrip==='function')openTrip(tripId);
    setTimeout(()=>backgroundFundSyncV91(tripId,true),0);
  };

  window.deleteFundRecordV84=function(kind,id,accountId){
    if(!currentTrip)return;if(currentTrip.archived)return typeof archiveReadOnlyAlert==='function'?archiveReadOnlyAlert():null;
    const label=kind==='transfer'?'這筆帳戶轉移（含手續費）':kind==='initial'?'這筆初始餘額':'這筆資金紀錄';
    if(!confirm(`確定要刪除${label}嗎？\n刪除後會重新計算相關帳戶餘額。`))return;
    const st=ensureState();
    if(kind==='transfer')st.transfers=(st.transfers||[]).filter(t=>String(t.id)!==String(id));
    else if(kind==='initial'&&st.accounts[accountId]){st.accounts[accountId].initial=0;st.accounts[accountId].initialDate='';st.accounts[accountId].initialSet=false;}
    else if(st.accounts[accountId])st.accounts[accountId].entries=(st.accounts[accountId].entries||[]).filter(e=>String(e.id)!==String(id));
    currentTrip.fundAccounts=st;currentTrip.cloudStatus=getApiUrl?.()?'pending':'local';persist();
    const tripId=currentTrip.id;if(typeof openRecords==='function')openRecords();setTimeout(()=>backgroundFundSyncV91(tripId,true),0);
  };

  function ensureStyles(){
    if(document.getElementById('fundSwipeV90Styles'))return;
    const s=document.createElement('style');s.id='fundSwipeV90Styles';s.textContent=`
      .fund-swipe-shell{position:relative;overflow:hidden;border-bottom:1px solid var(--line);touch-action:pan-y;background:#fff}
      .fund-swipe-shell:nth-child(even){background:#fff3f7}
      .fund-swipe-shell:last-child{border-bottom:0}
      .fund-swipe-delete{position:absolute;left:0;top:0;bottom:0;width:86px;border:0;background:#ffe7e7;color:#c24141;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:1}
      .fund-swipe-content{position:relative;z-index:2;background:inherit;transform:translateX(0);transition:transform .18s ease;will-change:transform}
      .fund-swipe-content>.fund-record-card{background:transparent}
      .fund-swipe-shell.is-open .fund-swipe-content{transform:translateX(86px)}
    `;document.head.appendChild(s);
  }

  const baseRecordHtmlV90=window.recordHtml;
  window.recordHtml=function(item){
    if(!item?._fundRecord)return typeof baseRecordHtmlV90==='function'?baseRecordHtmlV90(item):'';
    const inner=typeof baseRecordHtmlV90==='function'?baseRecordHtmlV90(item):'';
    return `<div class="fund-swipe-shell" data-kind="${safe(item._fundKind)}" data-id="${safe(item._fundId)}" data-account="${safe(item.accountId)}"><button class="fund-swipe-delete" type="button">刪除</button><div class="fund-swipe-content">${inner}</div></div>`;
  };
  function closeOtherSwipe(except){document.querySelectorAll('.fund-swipe-shell.is-open').forEach(x=>{if(x!==except)x.classList.remove('is-open');});}
  function bindSwipe(){
    ensureStyles();
    document.querySelectorAll('.fund-swipe-shell').forEach(shell=>{
      if(shell.dataset.swipeBound==='1')return;shell.dataset.swipeBound='1';
      const content=shell.querySelector('.fund-swipe-content'),del=shell.querySelector('.fund-swipe-delete');let sx=0,sy=0,dx=0,tracking=false,horizontal=false;
      content?.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;sx=e.clientX;sy=e.clientY;dx=0;tracking=true;horizontal=false;});
      content?.addEventListener('pointermove',e=>{if(!tracking)return;const x=e.clientX-sx,y=e.clientY-sy;if(!horizontal&&Math.abs(x)>8&&Math.abs(x)>Math.abs(y))horizontal=true;if(!horizontal)return;dx=Math.max(0,Math.min(100,x));content.style.transition='none';content.style.transform=`translateX(${dx}px)`;e.preventDefault();});
      const finish=()=>{if(!tracking)return;tracking=false;content.style.transition='';content.style.transform='';if(horizontal&&dx>=55){closeOtherSwipe(shell);shell.classList.add('is-open');}else shell.classList.remove('is-open');setTimeout(()=>{dx=0;horizontal=false;},0);};
      content?.addEventListener('pointerup',finish);content?.addEventListener('pointercancel',finish);
      del?.addEventListener('click',e=>{e.stopPropagation();shell.classList.remove('is-open');deleteFundRecordV84(shell.dataset.kind||'',shell.dataset.id||'',shell.dataset.account||'');});
    });
  }

  const baseApplyRecordFiltersV90=window.applyRecordFilters;
  window.applyRecordFilters=function(){const r=typeof baseApplyRecordFiltersV90==='function'?baseApplyRecordFiltersV90():undefined;bindSwipe();return r;};
  const baseOpenRecordsV90=window.openRecords;
  window.openRecords=function(){const r=typeof baseOpenRecordsV90==='function'?baseOpenRecordsV90():undefined;bindSwipe();return r;};
  const baseOpenTripV90=window.openTrip;
  window.openTrip=function(id){const r=typeof baseOpenTripV90==='function'?baseOpenTripV90(id):undefined;const trip=(state?.trips||[]).find(t=>t.id===id);if(trip?.fundAccounts&&trip.cloudStatus==='pending')setTimeout(()=>backgroundFundSyncV91(id,false),0);return r;};

  try{window.WEB_VERSION=FUND_V91_VERSION;}catch(e){}
  const webEl=document.getElementById('webVersionText');if(webEl)webEl.textContent=FUND_V91_VERSION;
  ensureStyles();
})();