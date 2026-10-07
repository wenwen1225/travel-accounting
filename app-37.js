// v103：資金同步狀態細分到 CASH / WOWPASS / TOSS；後端仍維持整包快照同步。
// 只有真正異動的帳戶顯示待同步；轉移會標記來源與目標兩個帳戶。
(()=>{
  const VER='2026.10.07-v103';
  const BG_GAP=15000;
  const lastSync={};
  const ACCOUNT_IDS=['CASH','WOWPASS','TOSS'];
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const snap=v=>{try{return JSON.stringify(v||{});}catch(e){return '';}};
  const clone=v=>{try{return JSON.parse(JSON.stringify(v||{}));}catch(e){return {};}};

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
      const created=Number(a.initialCreatedAt||remembered||0);
      trip.fundAccounts.accounts[id]={...a,
        initial:num(a.initial),
        initialDate:String(a.initialDate||''),
        initialSet:typeof a.initialSet==='boolean'?a.initialSet:(num(a.initial)!==0||String(a.initialDate||'').trim()!==''),
        initialCreatedAt:created,
        entries:Array.isArray(a.entries)?a.entries:[]
      };
      if(created)trip.fundInitialCreatedAt[id]=created;
    });
    ensureAccountStatus(trip);
    return trip.fundAccounts;
  }
  function ensureAccountStatus(trip){
    if(!trip)return {};
    if(!trip.fundAccountCloudStatus||typeof trip.fundAccountCloudStatus!=='object')trip.fundAccountCloudStatus={};
    const fallback=trip.fundCloudStatus==='synced'?'synced':(getApiUrl?.()?'pending':'local');
    ACCOUNT_IDS.forEach(id=>{
      if(!trip.fundAccountCloudStatus[id])trip.fundAccountCloudStatus[id]=fallback;
    });
    if(!trip.fundLastSyncedSnapshot&&trip.fundCloudStatus==='synced'&&trip.fundAccounts){
      trip.fundLastSyncedSnapshot=clone(trip.fundAccounts);
    }
    return trip.fundAccountCloudStatus;
  }
  function fundStatus(trip){
    if(!trip)return 'pending';
    ensureAccountStatus(trip);
    const vals=ACCOUNT_IDS.map(id=>trip.fundAccountCloudStatus[id]);
    if(vals.every(v=>v==='synced'))return 'synced';
    if(vals.every(v=>v==='local'))return 'local';
    return 'pending';
  }
  function transferSlice(st,id){
    return (Array.isArray(st?.transfers)?st.transfers:[])
      .filter(t=>String(t.from||'')===id||String(t.to||'')===id)
      .map(t=>({id:String(t.id||''),date:String(t.date||''),from:String(t.from||''),to:String(t.to||''),amount:num(t.amount),fee:num(t.fee),note:String(t.note||'')}));
  }
  function changedAccounts(trip,currentState=trip?.fundAccounts){
    if(!trip||!currentState)return [];
    const base=trip.fundLastSyncedSnapshot;
    if(!base)return ACCOUNT_IDS.filter(id=>currentState.accounts?.[id]||transferSlice(currentState,id).length);
    return ACCOUNT_IDS.filter(id=>{
      const aNow=currentState.accounts?.[id]||{};
      const aOld=base.accounts?.[id]||{};
      if(snap(aNow)!==snap(aOld))return true;
      return snap(transferSlice(currentState,id))!==snap(transferSlice(base,id));
    });
  }
  function markFundDirty(trip,ids){
    if(!trip)return;
    const map=ensureAccountStatus(trip);
    const touched=[...new Set((ids||[]).filter(id=>ACCOUNT_IDS.includes(id)))];
    touched.forEach(id=>map[id]=getApiUrl?.()?'pending':'local');
    trip.fundCloudStatus=fundStatus(trip);
    if(touched.length)trip.fundLastSyncError='';
  }
  function accountFromPill(pill){
    const shell=pill.closest('.fund-swipe-shell');
    if(shell?.dataset?.account)return String(shell.dataset.account);
    const card=pill.closest('.fund-record-card, .fund-record-v87');
    const onclick=card?.getAttribute('onclick')||'';
    const m=onclick.match(/openFundRecordV84\('[^']*','[^']*','([^']+)'\)/);
    return m?m[1]:'';
  }
  function refreshFundPills(){
    if(!currentTrip)return;
    const map=ensureAccountStatus(currentTrip);
    document.querySelectorAll('.fund-sync-pill').forEach(p=>{
      const accountId=accountFromPill(p);
      const st=accountId&&map[accountId]?map[accountId]:fundStatus(currentTrip);
      p.classList.toggle('synced',st==='synced');
      p.classList.toggle('pending',st!=='synced');
      p.textContent=st==='synced'?'已同步':st==='local'?'僅本機':'待同步';
      p.dataset.fundAccount=accountId||'';
    });
  }

  async function backgroundFundSyncV103(tripId,force=false){
    const trip=tripById(tripId);if(!trip)return false;
    ensureState(trip);
    if(!getApiUrl?.()){
      const map=ensureAccountStatus(trip);
      changedAccounts(trip).forEach(id=>map[id]='local');
      trip.fundCloudStatus=fundStatus(trip);persist();refreshFundPills();return false;
    }
    const now=Date.now();
    if(!force&&lastSync[tripId]&&now-lastSync[tripId]<BG_GAP)return false;
    lastSync[tripId]=now;
    const snapshot=clone(trip.fundAccounts||{accounts:{},transfers:[]});
    let attemptAccounts=changedAccounts(trip,snapshot);
    if(!attemptAccounts.length){
      const map=ensureAccountStatus(trip);
      attemptAccounts=ACCOUNT_IDS.filter(id=>map[id]!=='synced');
    }
    markFundDirty(trip,attemptAccounts);
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
        ensureState(latest);
        latest.fundLastSyncedSnapshot=clone(snapshot);
        const pendingAfter=changedAccounts(latest,latest.fundAccounts);
        const map=ensureAccountStatus(latest);
        ACCOUNT_IDS.forEach(id=>{
          map[id]=pendingAfter.includes(id)?'pending':'synced';
        });
        latest.fundCloudStatus=fundStatus(latest);
        latest.fundLastSyncError='';
        if(typeof markSyncSuccess==='function')markSyncSuccess();
        persist();
      }
      refreshFundPills();
      return true;
    }catch(err){
      const latest=tripById(tripId);
      if(latest){
        const map=ensureAccountStatus(latest);
        attemptAccounts.forEach(id=>map[id]='pending');
        latest.fundCloudStatus=fundStatus(latest);
        latest.fundLastSyncError=String(err?.message||err);persist();
      }
      refreshFundPills();
      return false;
    }
  }
  window.backgroundFundSyncV86=backgroundFundSyncV103;
  window.backgroundFundSyncV90=backgroundFundSyncV103;
  window.backgroundFundSyncV91=backgroundFundSyncV103;
  window.backgroundFundSyncV97=backgroundFundSyncV103;
  window.backgroundFundSyncV103=backgroundFundSyncV103;
  window.refreshFundPillsV103=refreshFundPills;

  const previousAddEntry=window.addFundEntryV83;
  if(typeof previousAddEntry==='function')window.addFundEntryV83=function(){
    const r=previousAddEntry.apply(this,arguments);
    if(currentTrip){markFundDirty(currentTrip,changedAccounts(currentTrip));persist();refreshFundPills();}
    return r;
  };
  const previousAddTransfer=window.addFundTransferV83;
  if(typeof previousAddTransfer==='function')window.addFundTransferV83=function(){
    const r=previousAddTransfer.apply(this,arguments);
    if(currentTrip){markFundDirty(currentTrip,changedAccounts(currentTrip));persist();refreshFundPills();}
    return r;
  };
  const previousSelectFund=window.selectFundAccountV83;
  if(typeof previousSelectFund==='function')window.selectFundAccountV83=function(){
    const r=previousSelectFund.apply(this,arguments);
    if(currentTrip){markFundDirty(currentTrip,changedAccounts(currentTrip));persist();refreshFundPills();}
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
    ensureState(currentTrip);
    commitPending();
    const st=ensureState(currentTrip),id=activeFundId();
    const a=st.accounts[id]||(st.accounts[id]={initial:0,initialDate:'',initialSet:false,initialCreatedAt:0,entries:[]});
    const input=document.getElementById('fundInitialInput'),date=document.getElementById('fundInitialDate');
    const raw=String(input?.value??'').trim();
    if(raw!==''){
      const nextInitial=num(raw),nextDate=date?.value||currentTrip.start||'';
      const changed=!a.initialSet||num(a.initial)!==nextInitial||String(a.initialDate||'')!==String(nextDate);
      a.initial=nextInitial;a.initialSet=true;a.initialDate=nextDate;
      if(changed||!Number(a.initialCreatedAt||0))a.initialCreatedAt=Date.now();
      currentTrip.fundInitialCreatedAt[id]=Number(a.initialCreatedAt||Date.now());
    }
    currentTrip.fundAccounts=st;
    markFundDirty(currentTrip,changedAccounts(currentTrip));
    persist();
    const tripId=currentTrip.id;
    if(typeof closeFundManagerV83==='function')closeFundManagerV83();
    if(typeof openTrip==='function')openTrip(tripId);
    setTimeout(()=>backgroundFundSyncV103(tripId,true),0);
  };

  function deleteFund(kind,id,accountId,fromManager=false){
    if(!currentTrip)return;
    if(currentTrip.archived)return typeof archiveReadOnlyAlert==='function'?archiveReadOnlyAlert():null;
    const label=kind==='transfer'?'這筆帳戶轉移（含手續費）':kind==='initial'?'這筆初始餘額':'這筆資金紀錄';
    if(!confirm(`確定要刪除${label}嗎？\n刪除後會重新計算相關帳戶餘額。`))return;
    const st=ensureState(currentTrip);
    if(kind==='transfer'){
      st.transfers=(st.transfers||[]).filter(t=>String(t.id)!==String(id));
    }else if(kind==='initial'&&st.accounts[accountId]){
      st.accounts[accountId].initial=0;st.accounts[accountId].initialDate='';st.accounts[accountId].initialSet=false;st.accounts[accountId].initialCreatedAt=0;
      if(currentTrip.fundInitialCreatedAt)delete currentTrip.fundInitialCreatedAt[accountId];
    }else if(st.accounts[accountId]){
      st.accounts[accountId].entries=(st.accounts[accountId].entries||[]).filter(e=>String(e.id)!==String(id));
    }
    currentTrip.fundAccounts=st;
    markFundDirty(currentTrip,changedAccounts(currentTrip));persist();
    const tripId=currentTrip.id;
    if(fromManager){
      if(typeof closeFundManagerV83==='function')closeFundManagerV83();
      if(typeof openTrip==='function')openTrip(tripId);
    }else if(typeof openRecords==='function')openRecords();
    setTimeout(()=>backgroundFundSyncV103(tripId,true),0);
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
    if(trip?.fundAccounts&&fundStatus(trip)==='pending')setTimeout(()=>backgroundFundSyncV103(id,false),0);
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
    refreshFundPills();
    return r;
  };
  const previousRecords=window.openRecords;
  window.openRecords=function(){
    const r=typeof previousRecords==='function'?previousRecords.apply(this,arguments):undefined;
    setTimeout(refreshFundPills,0);
    return r;
  };

  (state?.trips||[]).forEach(trip=>{
    if(!trip?.fundAccounts)return;
    ensureState(trip);
    Object.entries(trip.fundAccounts.accounts||{}).forEach(([id,a])=>{
      if(a?.initialSet&&!Number(a.initialCreatedAt||0)){
        const ts=Date.now();a.initialCreatedAt=ts;trip.fundInitialCreatedAt[id]=ts;
      }
    });
    ensureAccountStatus(trip);
    trip.fundCloudStatus=fundStatus(trip);
  });
  try{persist();}catch(e){}
  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
})();
