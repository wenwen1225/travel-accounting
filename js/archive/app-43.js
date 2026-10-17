// v111：快速補台幣加入雙向匯率換算；僅調整待補台幣 UI/前端計算，不碰同步與後端流程。
(()=>{
  const VER='2026.10.09-v111';
  let quickRateMode='';

  function quickCurrentMode(){
    return quickRateMode || (typeof rateModeCurrent==='function' ? rateModeCurrent() : (currentTrip?.currency==='KRW' ? 'twdToForeign' : 'foreignToTwd'));
  }

  function quickRateValue(foreign,twd,mode){
    const f=Number(foreign), t=Number(twd);
    if(!(f>0) || !(t>0)) return 0;
    if(typeof impliedRate==='function') return impliedRate(f,t,mode);
    return mode==='foreignToTwd' ? t/f : f/t;
  }

  function quickRateFormat(value){
    if(typeof rateFmt==='function') return rateFmt(value);
    const n=Number(value);
    if(!Number.isFinite(n) || n<=0) return '';
    return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
  }

  function refreshQuickRateUi(){
    const item=pendingTwdQuickItems?.[pendingTwdQuickIndex];
    if(!item || !currentTrip) return;
    const mode=quickCurrentMode();
    const code=currentTrip.currency || '';
    const direct=document.getElementById('pendingTwdQuickRateDirectBtn');
    const inverse=document.getElementById('pendingTwdQuickRateInverseBtn');
    const hint=document.getElementById('pendingTwdQuickRateHint');
    const rateInput=document.getElementById('pendingTwdQuickRateInput');
    const twdInput=document.getElementById('pendingTwdQuickInput');
    const foreign=Number(item.foreign||0);
    const twd=Number(rawNumber(twdInput?.value||''));

    if(direct){
      direct.textContent=`1 ${code} = ? TWD`;
      direct.classList.toggle('active',mode==='foreignToTwd');
    }
    if(inverse){
      inverse.textContent=`1 TWD = ? ${code}`;
      inverse.classList.toggle('active',mode==='twdToForeign');
    }
    if(hint){
      let text=mode==='foreignToTwd'
        ? `輸入匯率：${code} × 匯率 = TWD`
        : `輸入匯率：${code} ÷ 匯率 = TWD`;
      if(foreign>0 && twd>0){
        const r=quickRateValue(foreign,twd,mode);
        text += mode==='foreignToTwd'
          ? `｜目前推算 1 ${code} ≈ NT$${quickRateFormat(r)}`
          : `｜目前推算 NT$1 ≈ ${quickRateFormat(r)} ${code}`;
      }
      hint.textContent=text;
    }
    if(rateInput) rateInput.placeholder='輸入匯率，或填台幣後自動反推';
  }

  window.setPendingTwdQuickRateMode=function(mode){
    if(mode!=='foreignToTwd' && mode!=='twdToForeign') return;
    quickRateMode=mode;
    if(currentTrip){
      currentTrip.cashRateMode=mode;
      persist();
    }
    const item=pendingTwdQuickItems?.[pendingTwdQuickIndex];
    const twdInput=document.getElementById('pendingTwdQuickInput');
    const rateInput=document.getElementById('pendingTwdQuickRateInput');
    const foreign=Number(item?.foreign||0);
    const twd=Number(rawNumber(twdInput?.value||''));
    if(rateInput && foreign>0 && twd>0){
      rateInput.value=quickRateFormat(quickRateValue(foreign,twd,mode));
    }
    refreshQuickRateUi();
  };

  function calculateQuickTwdFromRate(){
    const item=pendingTwdQuickItems?.[pendingTwdQuickIndex];
    const rateInput=document.getElementById('pendingTwdQuickRateInput');
    const twdInput=document.getElementById('pendingTwdQuickInput');
    if(!item || !rateInput || !twdInput) return;
    const foreign=Number(item.foreign||0);
    const rate=Number(rawNumber(rateInput.value||''));
    if(!(foreign>0) || !(rate>0)){
      refreshQuickRateUi();
      return;
    }
    const value=quickCurrentMode()==='foreignToTwd' ? foreign*rate : foreign/rate;
    twdInput.value=formatNumberString(String(Math.round(value)));
    refreshQuickRateUi();
  }

  function deriveQuickRateFromTwd(){
    const item=pendingTwdQuickItems?.[pendingTwdQuickIndex];
    const rateInput=document.getElementById('pendingTwdQuickRateInput');
    const twdInput=document.getElementById('pendingTwdQuickInput');
    if(!item || !rateInput || !twdInput) return;
    const foreign=Number(item.foreign||0);
    const twd=Number(rawNumber(twdInput.value||''));
    if(!(foreign>0) || !(twd>0)){
      rateInput.value='';
      refreshQuickRateUi();
      return;
    }
    rateInput.value=quickRateFormat(quickRateValue(foreign,twd,quickCurrentMode()));
    refreshQuickRateUi();
  }

  function bindQuickRateInputs(){
    const rateInput=document.getElementById('pendingTwdQuickRateInput');
    const twdInput=document.getElementById('pendingTwdQuickInput');
    if(!rateInput || !twdInput) return;
    if(!rateInput.dataset.v111Bound){
      rateInput.dataset.v111Bound='1';
      rateInput.addEventListener('input',calculateQuickTwdFromRate);
    }
    if(!twdInput.dataset.v111Bound){
      twdInput.dataset.v111Bound='1';
      twdInput.addEventListener('input',deriveQuickRateFromTwd);
    }
    refreshQuickRateUi();
  }

  if(typeof window.pendingTwdQuickCard==='function'){
    window.pendingTwdQuickCard=pendingTwdQuickCard=function(item){
      const foreignText=currencySymbol(currentTrip.currency)+Number(item.foreign||0).toLocaleString('en-US');
      const shared=isSharedExpensePay(item.pay);
      const who=shared ? '共同支出' : (item.person||'');
      const payInfo=[who,item.pay||'',item.card||''].filter(Boolean).join(' · ');
      const code=currentTrip.currency||'';
      const mode=quickCurrentMode();

      return `
        <div class="pending-twd-item">
          <div class="pending-twd-item-date">${dateWithWeekday(item.date)}</div>
          <div class="pending-twd-item-head">
            <div>
              <strong>${item.name || '未命名商品'}</strong>
              <span>${payInfo}</span>
              ${item.place ? `<span>${item.place}</span>` : ''}
            </div>
            <div class="pending-twd-foreign">${foreignText}</div>
          </div>

          <div class="pending-twd-input-wrap pending-twd-rate-wrap">
            <label>換算匯率 <span class="tiny">（輸入匯率或台幣皆可）</span></label>
            <div class="pending-twd-rate-mode-grid">
              <button id="pendingTwdQuickRateDirectBtn" type="button" class="secondary ${mode==='foreignToTwd'?'active':''}" onclick="setPendingTwdQuickRateMode('foreignToTwd')">1 ${code} = ? TWD</button>
              <button id="pendingTwdQuickRateInverseBtn" type="button" class="secondary ${mode==='twdToForeign'?'active':''}" onclick="setPendingTwdQuickRateMode('twdToForeign')">1 TWD = ? ${code}</button>
            </div>
            <input id="pendingTwdQuickRateInput" type="text" inputmode="decimal" autocomplete="off" placeholder="輸入匯率，或填台幣後自動反推" />
            <div id="pendingTwdQuickRateHint" class="tiny pending-twd-rate-hint"></div>
          </div>

          <div class="pending-twd-input-wrap">
            <label for="pendingTwdQuickInput">補上台幣金額</label>
            <div class="money-wrap">
              <span class="money-prefix">NT$</span>
              <input id="pendingTwdQuickInput" type="text" inputmode="decimal" placeholder="輸入台幣，或由匯率自動計算" autocomplete="off" onkeydown="if(event.key==='Enter'){savePendingTwdAndNext()}" />
            </div>
          </div>

          <button id="pendingTwdQuickSaveBtn" class="primary" type="button" onclick="savePendingTwdAndNext()">儲存並下一筆</button>
          <button class="secondary" type="button" style="margin-top:8px" onclick="editExpense('${item.id}')">開啟完整紀錄</button>
        </div>`;
    };
  }

  const baseRenderPending=window.renderPendingTwdQuick;
  if(typeof baseRenderPending==='function'){
    window.renderPendingTwdQuick=renderPendingTwdQuick=function(){
      quickRateMode=typeof rateModeCurrent==='function' ? rateModeCurrent() : quickRateMode;
      const result=baseRenderPending.apply(this,arguments);
      setTimeout(bindQuickRateInputs,0);
      return result;
    };
  }

  if(!document.getElementById('v111PendingRateStyle')){
    const style=document.createElement('style');
    style.id='v111PendingRateStyle';
    style.textContent=`
      .pending-twd-rate-wrap{margin-top:18px}
      .pending-twd-rate-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0}
      .pending-twd-rate-mode-grid .secondary{padding:11px 8px;font-size:12px}
      .pending-twd-rate-mode-grid .secondary.active{background:#7c5ce7!important;border-color:#7c5ce7!important;color:#fff!important;box-shadow:0 5px 14px rgba(124,92,231,.22)!important}
      .pending-twd-rate-mode-grid .secondary.active::after{content:' ✓';font-weight:900}
      .pending-twd-rate-hint{margin-top:6px;line-height:1.45;color:#6f52c8;font-weight:700}
    `;
    document.head.appendChild(style);
  }

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
})();
