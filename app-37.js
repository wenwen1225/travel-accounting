// v97：資金同步狀態獨立化、初始餘額寫入時間、管理頁刪除統一。
// 僅覆寫共同資金相關函式；不碰一般記帳、換匯、信用卡同步流程。
(()=>{
  const VER='2026.10.07-v97';
  const BG_GAP=15000;
  const lastSync={};
  const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const snap=v=>{try{return JSON.stringify(v||{});}catch(e){return '';}};

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
    ['CASH','WOWPASS','TOSS'].forEach(id=>{
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
    return trip.fundAccounts;
  }
  function fundStatus(trip){
    if(!trip)return 'pending';
    if(!trip.fundCloudStatus)trip.fundCloudStatus='pending';
    return trip.fundCloudStatus;
  }
  function markFundDirty(trip){
    if(!trip)return;
    trip.fundCloudStatus=getApiUrl?.()?'pending':'local';
    trip.fundLastSyncError='';
  }
  function refreshFundPills(){
    const st=fundStatus(currentTrip);
    document.querySelectorAll('.fund-sync-pill').forEach(p=>{
      p.classList.toggle('synced',st==='synced');
      p.classList.toggle('pending',st!=='synced');
      p.textContent=st==='synced'?'已同步':'待同步';
    });
  }

  async function backgroundFundSyncV97(tripId,force=false){
    const trip=tripById(tripId);if(!trip)return false;
    ensureState(trip);
    if(!getApiUrl?.()){trip.fundCloudStatus='local';persist();refreshFundPills();return false;}
    const now=Date.now();
    if(!force&&lastSync[tripId]&&now-lastSync[tripId]<BG_GAP)return false;
    lastSync[tripId]=now;
    const snapshot=JSON.parse(JSON.stringify(trip.fundAccounts||{accounts:{},transfers:[]}));
    const snapshotKey=snap(snapshot);
    trip.fundCloudStatus='pending';trip.fundLastSyncError='';persist();refreshFundPills();
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
        if(snap(latest.fundAccounts)===snapshotKey){
          latest.fundCloudStatus='synced';latest.fundLastSyncError='';
          if(typeof markSyncSuccess==='function')markSyncSuccess();
          persist();
        }
      }
      refreshFundPills();
      return true;
    }catch(err){
      const latest=tripById(tripId);
      if(latest){latest.fundCloudStatus='pending';latest.fundLastSyncError=String(err?.message||err);persist();}
      refreshFundPills();
      return false;
    }
  }
  window.backgroundFundSyncV86=backgroundFundSyncV97;
  window.backgroundFundSyncV90=backgroundFundSyncV97;
  window.backgroundFundSyncV91=backgroundFundSyncV97;
  window.backgroundFundSyncV97=backgroundFundSyncV97;

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
    currentTrip.fundAccounts=st;markFundDirty(currentTrip);persist();
    const tripId=currentTrip.id;
    if(typeof closeFundManagerV83==='function')closeFundManagerV83();
    if(typeof openTrip==='function')openTrip(tripId);
    setTimeout(()=>backgroundFundSyncV97(tripId,true),0);
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
    currentTrip.fundAccounts=st;markFundDirty(currentTrip);persist();
    const tripId=currentTrip.id;
    if(fromManager){
      if(typeof closeFundManagerV83==='function')closeFundManagerV83();
      if(typeof openTrip==='function')openTrip(tripId);
    }else if(typeof openRecords==='function')openRecords();
    setTimeout(()=>backgroundFundSyncV97(tripId,true),0);
  }
  window.deleteFundRecordV84=(kind,id,accountId)=>deleteFund(kind,id,accountId,false);
  window.removeFundEntryV83=id=>deleteFund('entry',id,activeFundId(),true);
  window.removeFundTransferV83=id=>deleteFund('transfer',id,'',true);

  // 舊 v91 的 openTrip 會拿整趟 cloudStatus 判斷資金同步；v97 暫時遮蔽它，改用 fundCloudStatus。
  const previousOpenTrip=window.openTrip;
  window.openTrip=function(id){
    const trip=tripById(id),saved=trip?.cloudStatus;
    if(trip?.fundAccounts&&saved==='pending')trip.cloudStatus='fund-independent';
    const r=typeof previousOpenTrip==='function'?previousOpenTrip.apply(this,arguments):undefined;
    if(trip&&saved==='pending')trip.cloudStatus=saved;
    if(trip?.fundAccounts&&fundStatus(trip)==='pending')setTimeout(()=>backgroundFundSyncV97(id,false),0);
    return r;
  };

  // 資金管理的「取消」其實不會回復已加入的資料，改名「關閉」避免誤會。
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

  // v96 的同步條載入後再以獨立資金狀態校正。
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

  // 舊資料第一次進 v97 時，0 元初始餘額也補上建立時間；不改金額與日期。
  (state?.trips||[]).forEach(trip=>{
    if(!trip?.fundAccounts)return;
    ensureState(trip);
    if(!trip.fundCloudStatus)trip.fundCloudStatus='pending';
    Object.entries(trip.fundAccounts.accounts||{}).forEach(([id,a])=>{
      if(a?.initialSet&&!Number(a.initialCreatedAt||0)){
        const ts=Date.now();a.initialCreatedAt=ts;trip.fundInitialCreatedAt[id]=ts;
      }
    });
  });
  try{persist();}catch(e){}
  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');if(web)web.textContent=VER;
})();
