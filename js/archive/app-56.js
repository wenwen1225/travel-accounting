// v126：換匯方向安全版。沿用 v61 原資料結構與同步；不覆寫 openAdd / editExchange / saveExchange。
(()=>{
  const VER='2026.10.13-v126-exchange-direction-safe';
  let direction='twdToForeign';

  function tripCode(){ return String(currentTrip?.currency || 'KRW'); }
  function num(id){ return Number(rawNumber(document.getElementById(id)?.value || '')) || 0; }
  function fmtRate(v){
    const n=Number(v);
    if(!Number.isFinite(n) || n<=0) return '';
    return n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
  }

  function ensureUi(){
    const form=document.getElementById('exchangeForm');
    const date=document.getElementById('exchangeDate');
    const twd=document.getElementById('exchangeTwd');
    const foreign=document.getElementById('exchangeForeign');
    if(!form || !date || !twd || !foreign) return false;

    if(!document.getElementById('exchangeDirectionBox')){
      const box=document.createElement('div');
      box.id='exchangeDirectionBox';
      box.className='exchange-direction-box';
      box.innerHTML=`
        <label>換匯方向</label>
        <div class="exchange-direction-grid">
          <button id="exchangeDirForward" type="button" class="secondary" onclick="setExchangeDirectionSafe('twdToForeign')"></button>
          <button id="exchangeDirReverse" type="button" class="secondary" onclick="setExchangeDirectionSafe('foreignToTwd')"></button>
        </div>
        <div id="exchangeDirectionHint" class="tiny exchange-direction-hint"></div>`;
      date.closest('.form-group')?.insertAdjacentElement('afterend',box);
    }

    const row=twd.closest('.row');
    const twdGroup=twd.closest('.form-group');
    const foreignGroup=foreign.closest('.form-group');
    if(row && twdGroup && foreignGroup){
      row.id='exchangeAmountRowSafe';
      twdGroup.id='exchangeTwdGroupSafe';
      foreignGroup.id='exchangeForeignGroupSafe';
    }

    if(!document.getElementById('exchangeDirectionSafeStyle')){
      const style=document.createElement('style');
      style.id='exchangeDirectionSafeStyle';
      style.textContent=`
        .exchange-direction-box{margin:2px 0 16px;padding:13px;border:1px solid rgba(124,92,231,.18);border-radius:15px;background:rgba(124,92,231,.05)}
        .exchange-direction-box>label{display:block;font-weight:800;margin-bottom:8px}
        .exchange-direction-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .exchange-direction-grid .secondary{padding:11px 8px;font-size:12px;margin:0}
        .exchange-direction-grid .secondary.active{background:#7c5ce7!important;border-color:#7c5ce7!important;color:#fff!important}
        .exchange-direction-hint{margin-top:8px;color:#6f52c8;font-weight:700;line-height:1.45}
      `;
      document.head.appendChild(style);
    }

    if(twd.dataset.exchangeSafeBound!=='1'){
      twd.dataset.exchangeSafeBound='1';
      twd.addEventListener('input',refreshRateFromAmounts);
    }
    if(foreign.dataset.exchangeSafeBound!=='1'){
      foreign.dataset.exchangeSafeBound='1';
      foreign.addEventListener('input',refreshRateFromAmounts);
    }
    const rate=document.getElementById('exchangeRate');
    if(rate && rate.dataset.exchangeSafeBound!=='1'){
      rate.dataset.exchangeSafeBound='1';
      rate.addEventListener('input',calculateTargetFromRate);
    }
    return true;
  }

  function sourceTarget(){
    const code=tripCode();
    return direction==='foreignToTwd'
      ? {from:code,to:'TWD',sourceId:'exchangeForeign',targetId:'exchangeTwd'}
      : {from:'TWD',to:code,sourceId:'exchangeTwd',targetId:'exchangeForeign'};
  }

  function refreshUi(){
    if(!ensureUi()) return;
    const code=tripCode();
    const forward=document.getElementById('exchangeDirForward');
    const reverse=document.getElementById('exchangeDirReverse');
    if(forward){
      forward.textContent=`TWD → ${code}`;
      forward.classList.toggle('active',direction==='twdToForeign');
    }
    if(reverse){
      reverse.textContent=`${code} → TWD`;
      reverse.classList.toggle('active',direction==='foreignToTwd');
    }

    const row=document.getElementById('exchangeAmountRowSafe');
    const twdGroup=document.getElementById('exchangeTwdGroupSafe');
    const foreignGroup=document.getElementById('exchangeForeignGroupSafe');
    if(row && twdGroup && foreignGroup){
      if(direction==='foreignToTwd'){
        row.appendChild(foreignGroup);
        row.appendChild(twdGroup);
      }else{
        row.appendChild(twdGroup);
        row.appendChild(foreignGroup);
      }
    }

    const twdLabel=twdGroup?.querySelector('label');
    const foreignLabel=foreignGroup?.querySelector('label');
    if(direction==='foreignToTwd'){
      if(foreignLabel) foreignLabel.textContent=`來源金額 ${code}`;
      if(twdLabel) twdLabel.textContent='目標金額 TWD';
    }else{
      if(twdLabel) twdLabel.textContent='來源金額 TWD';
      if(foreignLabel) foreignLabel.textContent=`目標金額 ${code}`;
    }

    const rateLabel=document.getElementById('exchangeRate')?.closest('.form-group')?.querySelector('label');
    const st=sourceTarget();
    if(rateLabel) rateLabel.textContent=`匯率（1 ${st.from} = ? ${st.to}）`;
    const hint=document.getElementById('exchangeDirectionHint');
    if(hint) hint.textContent=`輸入來源金額＋匯率可自動算目標金額；或直接填兩邊金額自動反推匯率。`;
    const subtitle=document.getElementById('addSubtitle');
    if(subtitle && !document.getElementById('exchangeForm')?.classList.contains('hidden')){
      subtitle.textContent=`${currentTrip?.name || ''} · ${st.from} → ${st.to}`;
    }
  }

  window.setExchangeDirectionSafe=function(next){
    if(next!=='twdToForeign' && next!=='foreignToTwd') return;
    direction=next;
    refreshUi();
    refreshRateFromAmounts();
  };

  function refreshRateFromAmounts(){
    const st=sourceTarget();
    const source=num(st.sourceId);
    const target=num(st.targetId);
    const rate=document.getElementById('exchangeRate');
    if(rate && source>0 && target>0) rate.value=fmtRate(target/source);
  }

  function calculateTargetFromRate(){
    const st=sourceTarget();
    const source=num(st.sourceId);
    const rate=Number(document.getElementById('exchangeRate')?.value || 0);
    const target=document.getElementById(st.targetId);
    if(!target || !(source>0) || !(rate>0)) return;
    const value=source*rate;
    const rounded=(st.to==='KRW' || st.to==='JPY' || st.to==='TWD') ? Math.round(value) : Number(value.toFixed(2));
    target.value=formatNumberString(String(rounded));
  }

  function inferDirectionForItem(item){
    if(!item) return 'twdToForeign';
    const twd=Number(item.twd||0);
    const foreign=Number(item.foreign||0);
    const rate=Number(item.rate||0);
    if(!(twd>0) || !(foreign>0) || !(rate>0)) return 'twdToForeign';
    const forward=foreign/twd;
    const reverse=twd/foreign;
    const forwardDiff=Math.abs(rate-forward)/Math.max(Math.abs(forward),1e-9);
    const reverseDiff=Math.abs(rate-reverse)/Math.max(Math.abs(reverse),1e-9);
    return reverseDiff+1e-6<forwardDiff ? 'foreignToTwd' : 'twdToForeign';
  }

  function prepareNew(){
    direction='twdToForeign';
    refreshUi();
  }

  function prepareEdit(id){
    const item=(currentTrip?.exchange||[]).find(x=>x.id===id);
    direction=inferDirectionForItem(item);
    refreshUi();
    refreshRateFromAmounts();
  }

  document.addEventListener('click',event=>{
    const el=event.target?.closest?.('[onclick]');
    const code=String(el?.getAttribute?.('onclick') || '');
    if(code.includes("openAdd('exchange')") || code.includes('openAdd("exchange")')){
      setTimeout(prepareNew,0);
      return;
    }
    const match=code.match(/editExchange\(['\"]([^'\"]+)['\"]\)/);
    if(match){
      const id=match[1];
      setTimeout(()=>prepareEdit(id),0);
    }
  });

  ensureUi();

  const oldRenderSettings=window.renderSettings;
  if(typeof oldRenderSettings==='function'){
    window.renderSettings=function(){
      const result=oldRenderSettings.apply(this,arguments);
      const web=document.getElementById('webVersionText');
      if(web) web.textContent=VER;
      return result;
    };
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
