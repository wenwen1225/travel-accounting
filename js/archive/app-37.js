// v104：共同資金同步狀態改為「明確記錄實際異動帳戶」，不再用整包快照 diff 猜測。
// 後端仍維持整包快照同步；前端 CASH / WOWPASS / TOSS 各自顯示同步狀態。
(()=>{
  const VER='2026.10.07-v104';
  const BG_GAP=15000;
  const ACCOUNT_IDS=['CASH','WOWPASS','TOSS'];
  const lastSync={};
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const clone=v=>{try{return JSON.parse(JSON.stringify(v||{}));}catch(e){return {};}};
  const same=(a,b)=>{try{return JSON.stringify(a)===JSON.stringify(b);}catch(e){return false;}};

  function tripById(id){return (state?.trips||[]).find(t=>String(t.id)===String(id));}
  function activeFundId(){
    const btn=document.querySelector('#fundAccountTabs button.active');
    const m=(btn?.getAttribute('onclick')||'').match(/selectFundAccountV83\('([^']+)'\)/);
    return m?m[1]:'CASH';
  }
  function ensureState(trip=currentTrip){
    if(!trip)return {accounts:{},transfers:[]};
    if(!trip.fundAccounts||typeof trip.fundAccounts!=='object')trip.fundAccounts={accounts:{},transfers:[]};
    if(!trip.fundAccounts.accounts||typeof trip.fundAccounts.accounts!=='object')trip.fundAccounts.accounts={};
    if(!Array.isArray(trip.fundAccounts.transfers))trip.fundAccounts.transfers=[];
    if(!trip.fundInitialCreatedAt||typeof trip.fundInitialCreatedAt!=='object')trip.fundInitialCreatedAt={};
    ACCOUNT_IDS.forEach(id=>{
      const a=trip.fundAccounts.accounts[id]||{};
      const remembered=Number(trip.fundInitialCreatedAt[id]||0);
      trip.fundAccounts.accounts[id]={...a,
        initial:num(a.initial),
        initialDate:String(a.initialDate||''),
        initialSet:typeof a.initialSet==='boolean'?a.initialSet:(num(a.initial)!==0||String(a.initialDate||'').trim()!==''),
        initialCreatedAt:Number(a.initialCreatedAt||remembered||0),
        entries:Array.isArray(a.entries)?a.entries:[]
      };
      if(trip.fundAccounts.accounts[id].initialCreatedAt)trip.fundInitialCreatedAt[id]=trip.fundAccounts.accounts[id].initialCreatedAt;
    });
    ensureTracking(trip);
    return trip.fundAccounts;
  }
  function ensureTracking(trip){
    if(!trip)return {};
    if(!trip.fundAccountCloudStatus||typeof trip.fundAccountCloudStatus!=='object')trip.fundAccountCloudStatus={};
    if(!trip.fundAccountRevision||typeof trip.fundAccountRevision!=='object')trip.fundAccountRevision={};
    const fallback=trip.fundCloudStatus==='synced'?'synced':(trip.fundCloudStatus==='local'?'local':(getApiUrl?.()?'pending':'local'));
    ACCOUNT_IDS.forEach(id=>{
      if(!trip.fundAccountCloudStatus[id])trip.fundAccountCloudStatus[id]=fallback;
      if(!Number.isFinite(Number(trip.fundAccountRevision[id])))trip.fundAccountRevision[id]=0;
    });
    return trip.fundAccountCloudStatus;
  }
  function overallStatus(trip){
    const map=ensureTracking(trip);
    const vals=ACCOUNT_IDS.map(id=>map[id]);
    if(vals.every(v=>v==='synced'))return 'synced';
    if(vals.every(v=>v==='local'))return 'local';
    return 'pending';
  }
  function touchAccounts(trip,ids){
    if(!trip)return;
    const map=ensureTracking(trip);
    const touched=[...new Set((ids||[]).filter(id=>ACCOUNT_IDS.includes(id)))];
    touched.forEach(id=>{
      trip.fundAccountRevision[id]=Number(trip.fundAccountRevision[id]||0)+1;
      map[id]=getApiUrl?.()?'pending':'local';
    });
    trip.fundCloudStatus=overallStatus(trip);
    if(touched.length)trip.fundLastSyncError='';
  }
  function accountFromPill(pill){
    if(pill?.dataset?.fundAccount)return String(pill.dataset.fundAccount);
    const shell=pill?.closest('.fund-swipe-shell');
    if(shell?.dataset?.account)return String(shell.dataset.account);
    const card=pill?.closest('.fund-record-card, .fund-record-v87');
    const onclick=card?.getAttribute('onclick')||'';
    const m=onclick.match(/openFundRecordV84\('[^']*','[^']*','([^']+)'\)/);
    return m?m[1]:'';
  }
  function refreshFundPills(){
    if(!currentTrip)return;
    const map=ensureTracking(currentTrip);
    document.querySelectorAll('.fund-sync-pill').forEach(p=>{
      const id=accountFromPill(p);
      const st=id&&map[id]?map[id]:overallStatus(currentTrip);
      p.classList.toggle('synced',st==='synced');
      p.classList.toggle('pending',st!=='synced');
      p.textContent=st==='synced'?'已同步':st==='local'?'僅本機':'待同步';
      if(id)p.dataset.fundAccount=id;
    });
  }

  async function backgroundFundSyncV104(tripId,force=false){
    const trip=tripById(tripId);if(!trip)return false;
    ensureState(trip);
    const map=ensureTracking(trip);
    const attemptAccounts=ACCOUNT_IDS.filter(id=>map[id]==='pending');
    if(!attemptAccounts.length)return true;
    if(!getApiUrl?.()){
      attemptAccounts.forEach(id=>map[id]='local');
      trip.fundCloudStatus=overallStatus(trip);persist();refreshFundPills();return false;
    }
    const now=Date.now();
    if(!force&&lastSync[tripId]&&now-lastSync[tripId]<BG_GAP)return false;
    lastSync[tripId]=now;
    const snapshot=clone(trip.fundAccounts);
    const startRevision={};attemptAccounts.forEach(id=>startRevision[id]=Number(trip.fundAccountRevision[id]||0));
    trip.fundLastSyncError='';persist();refreshFundPills();
    try{
      const ver=await postToCloud({action:'getVersion'});
      if(String(ver?.scriptVersion||'')!=='v56')throw new Error('Apps Script 尚未更新至 v56');
      if(!trip.spreadsheetId){
        const ready=await ensureTripSpreadsheetReady(trip);
        if(!ready||!trip.spreadsheetId)throw new Error('Google Sheet 尚未建立完成');
      }
      await postToCloud({action:'saveFundAccounts',spreadsheetId:trip.spreadsheetId,clientTripId:trip.id,fundAccounts:snapshot});
      const latest=tripById(tripId);
      if(latest){
        ensureState(latest);const latestMap=ensureTracking(latest);
        attemptAccounts.forEach(id=>{
          latestMap[id]=Number(latest.fundAccountRevision[id]||0)===startRevision[id]?'synced':'pending';
        });
        latest.fundCloudStatus=overallStatus(latest);
        latest.fundLastSyncError='';persist();
      }
      refreshFundPills();return true;
    }catch(err){
      const latest=tripById(tripId);
      if(latest){
        const latestMap=ensureTracking(latest);
        attemptAccounts.forEach(id=>latestMap[id]='pending');
        latest.fundCloudStatus=overallStatus(latest);
        latest.fundLastSyncError=String(err?.message||err);persist();
      }
      refreshFundPills();return false;
    }
  }
  window.backgroundFundSyncV86=backgroundFundSyncV104;
  window.backgroundFundSyncV90=backgroundFundSyncV104;
  window.backgroundFundSyncV91=backgroundFundSyncV104;
  window.backgroundFundSyncV97=backgroundFundSyncV104;
  window.backgroundFundSyncV103=backgroundFundSyncV104;
  window.backgroundFundSyncV104=backgroundFundSyncV104;
  window.refreshFundPillsV103=refreshFundPills;
  window.refreshFundPillsV104=refreshFundPills;

  const previousAddEntry=window.addFundEntryV83;
  if(typeof previousAddEntry==='function')window.addFundEntryV83=function(){
    const id=activeFundId();
    const before=(currentTrip?.fundAccounts?.accounts?.[id]?.entries||[]).length;
    const r=previousAddEntry.apply(this,arguments);
    const after=(currentTrip?.fundAccounts?.accounts?.[id]?.entries||[]).length;
    if(currentTrip&&after>before){touchAccounts(currentTrip,[id]);persist();refreshFundPills();}
    return r;
  };

  const previousAddTransfer=window.addFundTransferV83;
  if(typeof previousAddTransfer==='function')window.addFundTransferV83=function(){
    const from=String(document.getElementById('fundTransferFrom')?.value||'');
    const to=String(document.getElementById('fundTransferTo')?.value||'');
    const before=(currentTrip?.fundAccounts?.transfers||[]).length;
    const r=previousAddTransfer.apply(this,arguments);
    const after=(currentTrip?.fundAccounts?.transfers||[]).length;
    if(currentTrip&&after>before){touchAccounts(currentTrip,[from,to]);persist();refreshFundPills();}
    return r;
  };

  // 切換頁籤本身不算異動；但舊核心會在切換時順便保存前一帳戶的初始餘額，因此只在資料真的改變時標記前一帳戶。
  const previousSelectFund=window.selectFundAccountV83;
  if(typeof previousSelectFund==='function')window.selectFundAccountV83=function(id){
    const previousId=activeFundId();
    const before=clone(currentTrip?.fundAccounts?.accounts?.[previousId]||{});
    const r=previousSelectFund.apply(this,arguments);
    const after=currentTrip?.fundAccounts?.accounts?.[previousId]||{};
    if(currentTrip&&!same(before,after)){touchAccounts(currentTrip,[previousId]);persist();refreshFundPills();}
    return r;
  };

  function commitPending(){
    const entry=Math.abs(num(document.getElementById('fundEntryAmount')?.value));
    const transfer=Math.abs(num(document.getElementById('fundTransferAmount')?.value));
    if(entry>0&&typeof window.addFundEntryV83==='function')window.addFundEntryV83();
    if(transfer>0&&typeof window.addFundTransferV83==='function')window.addFundTransferV83();
  }

  window.saveFundAccountsV83=function(){
    if(!currentTrip)return;
    ensureState(currentTrip);commitPending();
    const st=ensureState(currentTrip),id=activeFundId();
    const a=st.accounts[id]||(st.accounts[id]={initial:0,initialDate:'',initialSet:false,initialCreatedAt:0,entries:[]});
    const before={initial:num(a.initial),initialDate:String(a.initialDate||''),initialSet:!!a.initialSet};
    const input=document.getElementById('fundInitialInput'),date=document.getElementById('fundInitialDate');
    const raw=String(input?.value??'').trim();
    if(raw!==''){
      const nextInitial=num(raw),nextDate=date?.value||currentTrip.start||'';
      const changed=!a.initialSet||num(a.initial)!==nextInitial||String(a.initialDate||'')!==String(nextDate);
      a.initial=nextInitial;a.initialSet=true;a.initialDate=nextDate;
      if(changed||!Number(a.initialCreatedAt||0))a.initialCreatedAt=Date.now();
      currentTrip.fundInitialCreatedAt[id]=Number(a.initialCreatedAt||Date.now());
    }
    const after={initial:num(a.initial),initialDate:String(a.initialDate||''),initialSet:!!a.initialSet};
    if(!same(before,after))touchAccounts(currentTrip,[id]);
    currentTrip.fundAccounts=st;persist();
    const tripId=currentTrip.id;
    if(typeof closeFundManagerV83==='function')closeFundManagerV83();
    if(typeof openTrip==='function')openTrip(tripId);
    setTimeout(()=>backgroundFundSyncV104(tripId,true),0);
  };

  function deleteFund(kind,id,accountId,fromManager=false){
    if(!currentTrip)return;
    if(currentTrip.archived)return typeof archiveReadOnlyAlert==='function'?archiveReadOnlyAlert():null;
    const label=kind==='transfer'?'這筆帳戶轉移（含手續費）':kind==='initial'?'這筆初始餘額':'這筆資金紀錄';
    if(!confirm(`確定要刪除${label}嗎？\n刪除後會重新計算相關帳戶餘額。`))return;
    const st=ensureState(currentTrip);let touched=[];
    if(kind==='transfer'){
      const old=(st.transfers||[]).find(t=>String(t.id)===String(id));
      if(old)touched=[String(old.from||''),String(old.to||'')];
      st.transfers=(st.transfers||[]).filter(t=>String(t.id)!==String(id));
    }else if(kind==='initial'&&st.accounts[accountId]){
      touched=[accountId];
      st.accounts[accountId].initial=0;st.accounts[accountId].initialDate='';st.accounts[accountId].initialSet=false;st.accounts[accountId].initialCreatedAt=0;
      if(currentTrip.fundInitialCreatedAt)delete currentTrip.fundInitialCreatedAt[accountId];
    }else if(st.accounts[accountId]){
      touched=[accountId];
      st.accounts[accountId].entries=(st.accounts[accountId].entries||[]).filter(e=>String(e.id)!==String(id));
    }
    currentTrip.fundAccounts=st;touchAccounts(currentTrip,touched);persist();
    const tripId=currentTrip.id;
    if(fromManager){
      if(typeof closeFundManagerV83==='function')closeFundManagerV83();
      if(typeof openTrip==='function')openTrip(tripId);
    }else if(typeof openRecords==='function')openRecords();
    setTimeout(()=>backgroundFundSyncV104(tripId,true),0);
  }
  window.deleteFundRecordV84=(kind,id,accountId)=>deleteFund(kind,id,accountId,false);
  window.removeFundEntryV83=id=>deleteFund('entry',id,activeFundId(),true);
  window.removeFundTransferV83=id=>deleteFund('transfer',id,'',true);

  const previousOpenTrip=window.openTrip;
  window.openTrip=function(id){
    const trip=tripById(id),saved=trip?.cloudStatus;
    if(trip?.fundAccounts&&saved==='pending')trip.cloudStatus='fund-independent';
    const r=typeof previousOpenTrip==='function'?previousOpenTrip.apply(this,arguments):undefined;
    if(trip&&saved==='pending')trip.cloudStatus=saved;
    if(trip?.fundAccounts&&overallStatus(trip)==='pending')setTimeout(()=>backgroundFundSyncV104(id,false),0);
    return r;
  };

  const previousOpenFund=window.openFundManagerV83;
  if(typeof previousOpenFund==='function')window.openFundManagerV83=function(){
    const r=previousOpenFund.apply(this,arguments);
    setTimeout(()=>{
      const overlay=document.getElementById('fundManagerOverlay');
      const btn=[...(overlay?.querySelectorAll('button')||[])].find(b=>(b.textContent||'').trim()==='取消');
      if(btn)btn.textContent='關閉';
    },0);
    return r;
  };

  const previousApply=window.applyRecordFilters;
  window.applyRecordFilters=function(){
    const r=typeof previousApply==='function'?previousApply.apply(this,arguments):undefined;
    refreshFundPills();return r;
  };
  const previousRecords=window.openRecords;
  window.openRecords=function(){
    const r=typeof previousRecords==='function'?previousRecords.apply(this,arguments):undefined;
    setTimeout(refreshFundPills,0);return r;
  };

  (state?.trips||[]).forEach(trip=>{
    if(!trip?.fundAccounts)return;
    ensureState(trip);ensureTracking(trip);trip.fundCloudStatus=overallStatus(trip);
  });
  try{persist();}catch(e){}
  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
})();