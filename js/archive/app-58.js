// v128：任意幣別換匯。依賴後端 v61.3；舊 TWD ↔ 旅行主幣別仍可相容。
(()=>{
  const VER='2026.10.13-v128-multi-currency-exchange';
  const CURRENCIES=['TWD','KRW','JPY','USD','EUR','CNY','HKD','SGD','THB','MYR','GBP','AUD','CAD'];
  let sourceCurrency='TWD';
  let targetCurrency='KRW';
  let backendMultiCurrencyOk=null;

  function tripCurrency(){ return String(currentTrip?.currency || 'KRW').toUpperCase(); }
  function amount(id){ return Number(rawNumber(document.getElementById(id)?.value || '')) || 0; }
  function rateValue(){ return Number(document.getElementById('exchangeRate')?.value || 0) || 0; }
  function fmtRate(v){
    const n=Number(v);
    if(!Number.isFinite(n)||n<=0)return '';
    return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
  }
  function symbol(code){ try{return currencySymbol(code);}catch(e){return code;} }
  function options(selected){
    return CURRENCIES.map(c=>`<option value="${c}" ${c===selected?'selected':''}>${c}</option>`).join('');
  }

  function forceForwardBase(){
    if(typeof window.setExchangeDirectionSafe==='function'){
      try{ window.setExchangeDirectionSafe('twdToForeign'); }catch(e){}
    }
  }

  function ensureUi(){
    const box=document.getElementById('exchangeDirectionBox');
    const sourceInput=document.getElementById('exchangeTwd');
    const targetInput=document.getElementById('exchangeForeign');
    if(!box || !sourceInput || !targetInput) return false;

    if(box.dataset.multiCurrency!=='1'){
      box.dataset.multiCurrency='1';
      box.innerHTML=`
        <label>換匯幣別</label>
        <div class="exchange-multi-grid">
          <div>
            <span class="tiny">來源幣別</span>
            <select id="exchangeSourceCurrency"></select>
          </div>
          <button id="exchangeSwapCurrency" type="button" class="secondary exchange-swap-btn">⇄</button>
          <div>
            <span class="tiny">目標幣別</span>
            <select id="exchangeTargetCurrency"></select>
          </div>
        </div>
        <div id="exchangeDirectionHint" class="tiny exchange-direction-hint">可記錄 TWD、KRW、JPY、USD 等任意幣別換匯。</div>`;

      const style=document.createElement('style');
      style.id='exchangeMultiCurrencyStyle';
      style.textContent=`
        .exchange-multi-grid{display:grid;grid-template-columns:1fr 54px 1fr;gap:8px;align-items:end}
        .exchange-multi-grid .tiny{display:block;margin-bottom:5px}
        .exchange-swap-btn{height:44px;margin:0;padding:0;font-size:20px;font-weight:800}
      `;
      if(!document.getElementById(style.id)) document.head.appendChild(style);

      document.getElementById('exchangeSwapCurrency')?.addEventListener('click',()=>{
        const s=sourceCurrency;
        sourceCurrency=targetCurrency;
        targetCurrency=s;
        const a=sourceInput.value;
        sourceInput.value=targetInput.value;
        targetInput.value=a;
        refreshUi();
        refreshRateFromAmounts();
      });

      document.getElementById('exchangeSourceCurrency')?.addEventListener('change',e=>{
        sourceCurrency=String(e.target.value||'TWD').toUpperCase();
        if(sourceCurrency===targetCurrency){
          targetCurrency=sourceCurrency==='TWD'?tripCurrency():'TWD';
        }
        refreshUi();
      });
      document.getElementById('exchangeTargetCurrency')?.addEventListener('change',e=>{
        targetCurrency=String(e.target.value||tripCurrency()).toUpperCase();
        if(targetCurrency===sourceCurrency){
          sourceCurrency=targetCurrency==='TWD'?tripCurrency():'TWD';
        }
        refreshUi();
      });

      if(sourceInput.dataset.multiCurrencyBound!=='1'){
        sourceInput.dataset.multiCurrencyBound='1';
        sourceInput.addEventListener('input',refreshRateFromAmounts);
      }
      if(targetInput.dataset.multiCurrencyBound!=='1'){
        targetInput.dataset.multiCurrencyBound='1';
        targetInput.addEventListener('input',refreshRateFromAmounts);
      }
      const rate=document.getElementById('exchangeRate');
      if(rate && rate.dataset.multiCurrencyBound!=='1'){
        rate.dataset.multiCurrencyBound='1';
        rate.addEventListener('input',calculateTargetFromRate);
      }
    }
    return true;
  }

  function refreshUi(){
    if(!ensureUi())return;
    const s=document.getElementById('exchangeSourceCurrency');
    const t=document.getElementById('exchangeTargetCurrency');
    if(s){s.innerHTML=options(sourceCurrency);s.value=sourceCurrency;}
    if(t){t.innerHTML=options(targetCurrency);t.value=targetCurrency;}

    const sourceGroup=document.getElementById('exchangeTwdGroupSafe') || document.getElementById('exchangeTwd')?.closest('.form-group');
    const targetGroup=document.getElementById('exchangeForeignGroupSafe') || document.getElementById('exchangeForeign')?.closest('.form-group');
    const sourceLabel=sourceGroup?.querySelector('label');
    const targetLabel=targetGroup?.querySelector('label');
    if(sourceLabel)sourceLabel.textContent=`來源金額 ${sourceCurrency}`;
    if(targetLabel)targetLabel.textContent=`目標金額 ${targetCurrency}`;

    const targetSymbol=document.getElementById('exchangeForeignSymbol');
    if(targetSymbol)targetSymbol.textContent=symbol(targetCurrency);
    const sourceWrap=document.getElementById('exchangeTwd')?.closest('.money-wrap');
    const sourcePrefix=sourceWrap?.querySelector('.money-prefix');
    if(sourcePrefix)sourcePrefix.textContent=symbol(sourceCurrency);

    const rateLabel=document.getElementById('exchangeRate')?.closest('.form-group')?.querySelector('label');
    if(rateLabel)rateLabel.textContent=`匯率（1 ${sourceCurrency} = ? ${targetCurrency}）`;
    const subtitle=document.getElementById('addSubtitle');
    if(subtitle && !document.getElementById('exchangeForm')?.classList.contains('hidden')){
      subtitle.textContent=`${currentTrip?.name||''} · ${sourceCurrency} → ${targetCurrency}`;
    }
  }

  function refreshRateFromAmounts(){
    const source=amount('exchangeTwd');
    const target=amount('exchangeForeign');
    const rate=document.getElementById('exchangeRate');
    if(rate && source>0 && target>0) rate.value=fmtRate(target/source);
  }

  function calculateTargetFromRate(){
    const source=amount('exchangeTwd');
    const rate=rateValue();
    const target=document.getElementById('exchangeForeign');
    if(!target || source<=0 || rate<=0)return;
    let value=source*rate;
    if(['KRW','JPY','TWD'].includes(targetCurrency)) value=Math.round(value);
    else value=Number(value.toFixed(2));
    target.value=formatNumberString(String(value));
  }

  async function backendSupportsMultiCurrency(){
    if(backendMultiCurrencyOk!==null) return backendMultiCurrencyOk;
    if(!getApiUrl()) return false;
    try{
      const v=await postToCloud({action:'getVersion'});
      backendMultiCurrencyOk=String(v?.backendBuildVersion||'').includes('v61.3');
      return backendMultiCurrencyOk;
    }catch(e){
      return false;
    }
  }

  function isLegacyPair(){
    const trip=tripCurrency();
    return (sourceCurrency==='TWD'&&targetCurrency===trip) ||
           (sourceCurrency===trip&&targetCurrency==='TWD');
  }

  function compatibilityValues(sourceAmount,targetAmount){
    const trip=tripCurrency();
    let twd=0;
    if(sourceCurrency==='TWD')twd=sourceAmount;
    else if(targetCurrency==='TWD')twd=targetAmount;

    let foreign=0;
    if(targetCurrency===trip)foreign+=targetAmount;
    if(sourceCurrency===trip)foreign-=sourceAmount;
    return {twd,foreign};
  }

  function duplicateExists(item,excludeId){
    return (currentTrip?.exchange||[]).some(x=>{
      if(!x || x.id===excludeId)return false;
      if(normalizeTripDateValue(x.date)!==normalizeTripDateValue(item.date))return false;
      const xs=String(x.sourceCurrency||'TWD').toUpperCase();
      const xt=String(x.targetCurrency||tripCurrency()).toUpperCase();
      const xsa=Number(x.sourceAmount ?? x.twd ?? 0);
      const xta=Number(x.targetAmount ?? Math.abs(x.foreign||0));
      return xs===item.sourceCurrency && xt===item.targetCurrency && xsa===item.sourceAmount && xta===item.targetAmount;
    });
  }

  window.saveExchange=async function(){
    if(isCurrentTripArchived()) return archiveReadOnlyAlert();
    const date=document.getElementById('exchangeDate')?.value||'';
    const sourceAmount=amount('exchangeTwd');
    const targetAmount=amount('exchangeForeign');
    if(!date){alert('請填日期');return;}
    if(sourceCurrency===targetCurrency){alert('來源幣別與目標幣別不能相同');return;}
    if(sourceAmount<=0 || targetAmount<=0){alert('請填來源金額與目標金額');return;}

    if(!isLegacyPair()){
      const ok=await backendSupportsMultiCurrency();
      if(!ok){
        alert('任意幣別換匯需要後端 v61.3。請先更新 Apps Script 後端，再儲存這筆資料。');
        return;
      }
    }

    const compat=compatibilityValues(sourceAmount,targetAmount);
    const item={
      id:editingExchangeId || ('x_'+Date.now()),
      type:'換匯',
      date,
      twd:compat.twd,
      foreign:compat.foreign,
      rate:targetAmount/sourceAmount,
      sourceCurrency,
      sourceAmount,
      targetCurrency,
      targetAmount,
      place:document.getElementById('exchangePlace')?.value.trim()||'',
      note:document.getElementById('exchangeNote')?.value.trim()||''
    };
    item.updatedAt=new Date().toISOString();

    if(duplicateExists(item,editingExchangeId||'')){
      if(!confirm(`可能有重複換匯：\n${sourceCurrency} ${sourceAmount.toLocaleString()} → ${targetCurrency} ${targetAmount.toLocaleString()}\n仍要儲存嗎？`))return;
    }

    if(editingExchangeId){
      const id=editingExchangeId;
      const idx=(currentTrip.exchange||[]).findIndex(x=>x.id===id);
      if(idx===-1)return;
      const previous=currentTrip.exchange[idx];
      item.cloudFingerprint=previous?.cloudFingerprint||'';
      currentTrip.exchange[idx]=item;
      persist();
      let cloudOk=true;
      if(getApiUrl())cloudOk=await syncRecord('updateExchange',currentTrip,'exchange',item);
      else{item.syncStatus='local';persist();}
      editingExchangeId=null;
      showCloudResultModal(cloudOk,cloudOk?'換匯紀錄已更新至 Google Sheets。':'本機已更新，但 Google Sheets 尚未同步成功。');
    }else{
      const saved=await confirmSaved('exchange',item,'addExchange');
      if(saved){
        document.getElementById('exchangeTwd').value='';
        document.getElementById('exchangeForeign').value='';
        document.getElementById('exchangeRate').value='';
      }
    }
  };

  function prepareNew(){
    forceForwardBase();
    sourceCurrency='TWD';
    targetCurrency=tripCurrency();
    refreshUi();
  }

  function inferLegacy(item){
    const trip=tripCurrency();
    const twd=Number(item?.twd||0);
    const foreign=Math.abs(Number(item?.foreign||0));
    const rate=Number(item?.rate||0);
    const f=twd>0?foreign/twd:0;
    const r=foreign>0?twd/foreign:0;
    const reverse=rate>0 && Math.abs(rate-r)<Math.abs(rate-f);
    return reverse
      ? {sourceCurrency:trip,sourceAmount:foreign,targetCurrency:'TWD',targetAmount:twd}
      : {sourceCurrency:'TWD',sourceAmount:twd,targetCurrency:trip,targetAmount:foreign};
  }

  function prepareEdit(id){
    forceForwardBase();
    const item=(currentTrip?.exchange||[]).find(x=>x.id===id);
    if(!item)return;
    const m=(item.sourceCurrency && item.targetCurrency)
      ? {
          sourceCurrency:String(item.sourceCurrency).toUpperCase(),
          sourceAmount:Number(item.sourceAmount||0),
          targetCurrency:String(item.targetCurrency).toUpperCase(),
          targetAmount:Number(item.targetAmount||0)
        }
      : inferLegacy(item);
    sourceCurrency=m.sourceCurrency;
    targetCurrency=m.targetCurrency;
    document.getElementById('exchangeTwd').value=formatNumberString(String(m.sourceAmount||''));
    document.getElementById('exchangeForeign').value=formatNumberString(String(m.targetAmount||''));
    document.getElementById('exchangeRate').value=m.sourceAmount>0?fmtRate(m.targetAmount/m.sourceAmount):'';
    refreshUi();
  }

  document.addEventListener('click',event=>{
    const el=event.target?.closest?.('[onclick]');
    const code=String(el?.getAttribute?.('onclick')||'');
    if(code.includes("openAdd('exchange')")||code.includes('openAdd("exchange")')){
      setTimeout(prepareNew,20);
      return;
    }
    const match=code.match(/editExchange\(['\"]([^'\"]+)['\"]\)/);
    if(match)setTimeout(()=>prepareEdit(match[1]),20);
  });

  setTimeout(()=>{forceForwardBase();ensureUi();refreshUi();},0);

  const oldRenderSettings=window.renderSettings;
  if(typeof oldRenderSettings==='function'){
    window.renderSettings=function(){
      const result=oldRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web)web.textContent=VER;
      return result;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
