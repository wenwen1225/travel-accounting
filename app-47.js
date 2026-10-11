// v115：機台退稅完成後保留原本退稅公司／機台名稱。
// 修正 v73 的 syncRecord 在「機台退稅完成✅」同步時會把 refundMachine 清空的相容問題。
// 不修改 Apps Script 後端與既有 Sheet 結構。
(()=>{
  const VER='2026.10.11-v115';
  const COMPLETED='機台退稅完成✅';

  if(typeof syncRecord==='function'){
    const baseSyncRecordV115=syncRecord;
    syncRecord=async function(action,trip,type,item){
      const preserveMachine = type==='expenses' && item?.refundStatus===COMPLETED;
      let previousSnapshot=null;
      let canUseSnapshot=false;

      if(preserveMachine){
        try{
          if(typeof taxRefundSaveSnapshot!=='undefined'){
            previousSnapshot=taxRefundSaveSnapshot;
            taxRefundSaveSnapshot={status:COMPLETED,machine:String(item?.refundMachine||'')};
            canUseSnapshot=true;
          }
        }catch(e){}
      }

      try{
        return await baseSyncRecordV115.apply(this,arguments);
      }finally{
        if(canUseSnapshot){
          try{ taxRefundSaveSnapshot=previousSnapshot; }catch(e){}
        }
      }
    };
  }

  if(typeof taxRefundApplyToItem==='function'){
    const baseApplyToItemV115=taxRefundApplyToItem;
    taxRefundApplyToItem=function(item,snapshot){
      const oldMachine=String(item?.refundMachine||'');
      const result=baseApplyToItemV115.apply(this,arguments);
      if(result?.refundStatus===COMPLETED && !result.refundMachine){
        result.refundMachine=String(snapshot?.machine||oldMachine||'');
      }
      return result;
    };
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web) web.textContent=VER;
  }

  const baseRenderSettingsV115=window.renderSettings;
  if(typeof baseRenderSettingsV115==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV115.apply(this,arguments);
      applyVersion();
      return r;
    };
  }

  applyVersion();
})();

// v116：資料健檢加入「確認沒問題」。
// 已確認的疑似重複／異常大額會從健檢清單消失；若資料內容改變，會重新出現。
(()=>{
  const VER='2026.10.11-v116-health-ack';
  const duplicateKeyCache=new WeakMap();

  function stableRecordData(type,item){
    return {
      id:String(item?.id||''),type:String(type||''),date:String(item?.date||''),name:String(item?.name||''),
      qty:Number(item?.qty||0),twd:item?.twd===null||item?.twd===''?null:Number(item?.twd||0),
      foreign:Number(item?.foreign||0),place:String(item?.place||''),category:String(item?.category||''),
      person:String(item?.person||''),pay:String(item?.pay||''),card:String(item?.card||''),
      website:String(item?.website||''),note:String(item?.note||''),rate:Number(item?.rate||0),
      fromCurrency:String(item?.fromCurrency||''),fromAmount:Number(item?.fromAmount||0),
      toCurrency:String(item?.toCurrency||''),toAmount:Number(item?.toAmount||0)
    };
  }

  function hashText(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function makeKey(kind,type,payload){return `${kind}:${type}:${hashText(JSON.stringify(payload))}`;}
  function anomalyKey(type,item){return makeKey('large',type,stableRecordData(type,item));}
  function duplicateKey(group){
    const rows=(group?.items||[]).map(item=>stableRecordData(group.type,item)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    return makeKey('duplicate',group?.type||'',rows);
  }
  function ackList(){
    if(!currentTrip)return [];
    if(!Array.isArray(currentTrip.healthAcknowledgements))currentTrip.healthAcknowledgements=[];
    return currentTrip.healthAcknowledgements;
  }
  function isAck(key){return !!key&&ackList().some(x=>String(x?.key||x)===String(key));}
  function saveAck(key,title){
    if(!currentTrip||!key)return;
    const list=ackList();
    if(!list.some(x=>String(x?.key||x)===String(key))){list.push({key,title:title||'已確認',confirmedAt:new Date().toISOString()});}
    if(list.length>200)currentTrip.healthAcknowledgements=list.slice(-200);
    persist();
  }

  const baseDuplicateGroups=typeof healthDuplicateGroups==='function'?healthDuplicateGroups:null;
  if(baseDuplicateGroups){
    healthDuplicateGroups=function(){
      const groups=baseDuplicateGroups.apply(this,arguments)||[];
      return groups.filter(group=>{
        const key=duplicateKey(group);
        const first=group?.items?.[0];
        if(first)duplicateKeyCache.set(first,key);
        return !isAck(key);
      });
    };
  }

  const baseAnomalies=typeof healthAnomalousAmountIssues==='function'?healthAnomalousAmountIssues:null;
  if(baseAnomalies){
    healthAnomalousAmountIssues=function(){
      const issues=baseAnomalies.apply(this,arguments)||[];
      return issues.filter(({type,item})=>!isAck(anomalyKey(type,item)));
    };
  }

  const baseIssueCard=typeof healthIssueCard==='function'?healthIssueCard:null;
  if(baseIssueCard){
    healthIssueCard=function(title,detail,type,item,badge='需確認'){
      let html=baseIssueCard.apply(this,arguments);
      const confirmable=title==='疑似重複紀錄'||title==='疑似異常大額';
      if(!confirmable||!item?.id)return html;

      const key=title==='疑似重複紀錄'
        ? (duplicateKeyCache.get(item)||makeKey('duplicate-fallback',type,{item:stableRecordData(type,item),detail}))
        : anomalyKey(type,item);
      const encoded=encodeURIComponent(key);
      const label=title==='疑似重複紀錄'?'疑似重複紀錄':'疑似異常大額';
      const button=`<button class="secondary health-confirm-btn" type="button" onclick="confirmHealthIssueV116('${encoded}','${label}')">✓ 確認沒問題</button>`;
      return html.replace(/\n\s*<\/div>\s*$/,`\n      ${button}\n    </div>`);
    };
  }

  window.confirmHealthIssueV116=function(encodedKey,title){
    const key=decodeURIComponent(String(encodedKey||''));
    if(!key||!currentTrip)return;
    saveAck(key,title);
    if(typeof renderTripHealthCheck==='function')renderTripHealthCheck();
    if(typeof showQuickSaveToast==='function')showQuickSaveToast('已確認，這筆提醒不會再出現');
  };

  if(!document.getElementById('healthAckV116Styles')){
    const s=document.createElement('style');
    s.id='healthAckV116Styles';
    s.textContent='.health-confirm-btn{margin-top:10px;border-color:#d9cff7!important;background:#f8f5ff!important;color:#6f55cf!important;font-weight:900!important}.health-confirm-btn:active{transform:scale(.99)}';
    document.head.appendChild(s);
  }

  function applyVersion(){
    try{window.WEB_VERSION=VER;}catch(e){}
    const web=document.getElementById('webVersionText');
    if(web)web.textContent=VER;
  }
  const baseRenderSettingsV116=window.renderSettings;
  if(typeof baseRenderSettingsV116==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettingsV116.apply(this,arguments);
      applyVersion();
      return r;
    };
  }

  applyVersion();
})();
