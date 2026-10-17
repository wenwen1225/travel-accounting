// v135：修正資料健檢「確認沒問題」在 v117 重複判斷更新後失效的問題。
// 只處理資料健檢確認狀態；不修改同步、記帳、退稅、換匯或後端。
(()=>{
  const VER='2026.10.13-v135-health-ack-stable';
  const dupKeyByItem=new WeakMap();
  const anomalyKeyByItem=new WeakMap();
  const oldToNewKey=new Map();

  function stableData(type,item){
    return {
      id:String(item?.id||''),type:String(type||''),date:String(item?.date||''),name:String(item?.name||''),
      qty:Number(item?.qty||0),twd:item?.twd===null||item?.twd===''?null:Number(item?.twd||0),
      foreign:Number(item?.foreign||0),place:String(item?.place||''),category:String(item?.category||''),
      person:String(item?.person||''),pay:String(item?.pay||''),card:String(item?.card||''),
      website:String(item?.website||''),note:String(item?.note||''),rate:Number(item?.rate||0),
      fromCurrency:String(item?.fromCurrency||''),fromAmount:Number(item?.fromAmount||0),
      toCurrency:String(item?.toCurrency||''),toAmount:Number(item?.toAmount||0),
      sourceCurrency:String(item?.sourceCurrency||''),sourceAmount:Number(item?.sourceAmount||0),
      targetCurrency:String(item?.targetCurrency||''),targetAmount:Number(item?.targetAmount||0)
    };
  }

  function hashText(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }
  function keyForLarge(type,item){
    return `v135:large:${type}:${hashText(JSON.stringify(stableData(type,item)))}`;
  }
  function keyForDuplicate(group){
    const rows=(group?.items||[])
      .map(item=>stableData(group.type,item))
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    return `v135:duplicate:${group?.type||''}:${hashText(JSON.stringify(rows))}`;
  }

  function ackList(){
    if(!currentTrip) return [];
    if(!Array.isArray(currentTrip.healthAcknowledgements)) currentTrip.healthAcknowledgements=[];
    return currentTrip.healthAcknowledgements;
  }
  function isAck(key){
    return !!key && ackList().some(x=>String(x?.key||x)===String(key));
  }
  function saveAck(key,title){
    if(!currentTrip||!key) return;
    const list=ackList();
    if(!list.some(x=>String(x?.key||x)===String(key))){
      list.push({key,title:title||'已確認',confirmedAt:new Date().toISOString()});
    }
    if(list.length>250) currentTrip.healthAcknowledgements=list.slice(-250);
    persist();
  }

  const baseDuplicateGroups=typeof healthDuplicateGroups==='function' ? healthDuplicateGroups : null;
  if(baseDuplicateGroups){
    healthDuplicateGroups=function(){
      const groups=baseDuplicateGroups.apply(this,arguments)||[];
      return groups.filter(group=>{
        const key=keyForDuplicate(group);
        (group?.items||[]).forEach(item=>{ if(item&&typeof item==='object') dupKeyByItem.set(item,key); });
        return !isAck(key);
      });
    };
  }

  const baseAnomalies=typeof healthAnomalousAmountIssues==='function' ? healthAnomalousAmountIssues : null;
  if(baseAnomalies){
    healthAnomalousAmountIssues=function(){
      const issues=baseAnomalies.apply(this,arguments)||[];
      return issues.filter(({type,item})=>{
        const key=keyForLarge(type,item);
        if(item&&typeof item==='object') anomalyKeyByItem.set(item,key);
        return !isAck(key);
      });
    };
  }

  const baseIssueCard=typeof healthIssueCard==='function' ? healthIssueCard : null;
  if(baseIssueCard){
    healthIssueCard=function(title,detail,type,item,badge='需確認'){
      const html=baseIssueCard.apply(this,arguments);
      if((title!=='疑似重複紀錄'&&title!=='疑似異常大額')||!item) return html;

      const newKey=title==='疑似重複紀錄' ? dupKeyByItem.get(item) : anomalyKeyByItem.get(item);
      if(!newKey) return html;

      const match=String(html||'').match(/confirmHealthIssueV116\('([^']+)'/);
      if(match?.[1]){
        try{ oldToNewKey.set(decodeURIComponent(match[1]),newKey); }catch(e){}
      }
      return html;
    };
  }

  // 沿用既有「✓ 確認沒問題」按鈕，只補上新的穩定確認 key。
  window.confirmHealthIssueV116=function(encodedKey,title){
    let oldKey='';
    try{ oldKey=decodeURIComponent(String(encodedKey||'')); }catch(e){ oldKey=String(encodedKey||''); }
    const newKey=oldToNewKey.get(oldKey)||'';
    if(oldKey) saveAck(oldKey,title);
    if(newKey) saveAck(newKey,title);
    if(typeof renderTripHealthCheck==='function') renderTripHealthCheck();
    if(typeof showQuickSaveToast==='function') showQuickSaveToast('已確認，這筆提醒不會再出現');
  };

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){
      const r=baseRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return r;
    };
  }

  try{window.WEB_VERSION=VER;}catch(e){}
  const web=document.getElementById('webVersionText');
  if(web) web.textContent=VER;

  try{ if(currentTrip&&typeof renderTripHealthCheck==='function') renderTripHealthCheck(); }catch(e){}
})();
