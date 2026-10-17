// v81：旅程建立後可設定「外幣現金錢包」。
// 搭配 Apps Script v54：初始現金 + 換匯 - 現金消費 ± 調整 = 目前餘額。
(()=>{
  const CASH_WALLET_WEB_VERSION='2026.10.06-v81';
  const CASH_WALLET_EXPECTED_BACKEND='v54';

  function cashWalletNumber(value){
    const n=Number(String(value??'').replace(/,/g,''));
    return Number.isFinite(n)?n:0;
  }

  function cashWalletData(trip=currentTrip){
    const raw=trip?.cashWallet || {};
    return {
      initial:cashWalletNumber(raw.initial),
      adjustments:Array.isArray(raw.adjustments)?raw.adjustments.map(item=>({
        id:String(item?.id||''),
        date:String(item?.date||''),
        amount:cashWalletNumber(item?.amount),
        note:String(item?.note||'')
      })).filter(item=>item.id && item.amount!==0):[]
    };
  }

  function cashWalletCalc(trip=currentTrip){
    const wallet=cashWalletData(trip);
    const exchange=(trip?.exchange||[]).reduce((sum,item)=>sum+cashWalletNumber(item.foreign),0);
    const cashSpend=(trip?.expenses||[])
      .filter(item=>String(item.pay||'')==='現金')
      .reduce((sum,item)=>sum+cashWalletNumber(item.foreign),0);
    const adjustment=wallet.adjustments.reduce((sum,item)=>sum+cashWalletNumber(item.amount),0);
    return {
      ...wallet,
      exchange,
      cashSpend,
      adjustment,
      balance:wallet.initial+exchange-cashSpend+adjustment
    };
  }

  function walletMoney(value){
    if(!currentTrip) return Number(value||0).toLocaleString('en-US');
    return currencySymbol(currentTrip.currency)+Number(value||0).toLocaleString('en-US');
  }

  function cashWalletToday(){
    if(typeof localTodayYmd==='function') return localTodayYmd();
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function ensureCashWalletStyles(){
    if(document.getElementById('cashWalletV81Styles')) return;
    const style=document.createElement('style');
    style.id='cashWalletV81Styles';
    style.textContent=`
      .cash-wallet-card{padding:18px;overflow:hidden;position:relative}
      .cash-wallet-card:before{content:"";position:absolute;width:120px;height:120px;border-radius:999px;background:#f2ebff;right:-42px;top:-54px;pointer-events:none}
      .cash-wallet-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:relative}
      .cash-wallet-label{font-size:12px;color:var(--muted);font-weight:700;margin-bottom:4px}
      .cash-wallet-balance{font-size:28px;font-weight:900;letter-spacing:-.6px;line-height:1.1}
      .cash-wallet-status{font-size:12px;color:var(--muted);margin-top:5px}
      .cash-wallet-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
      .cash-wallet-mini{background:#faf8ff;border:1px solid var(--line);border-radius:14px;padding:10px 11px}
      .cash-wallet-mini span{display:block;font-size:11px;color:var(--muted);margin-bottom:3px}
      .cash-wallet-mini strong{font-size:13px}
      .cash-wallet-actions{display:flex;gap:8px;margin-top:14px}
      .cash-wallet-actions button{flex:1}
      .cash-wallet-dialog{text-align:left;max-width:420px}
      .cash-wallet-dialog h2,.cash-wallet-dialog>p{text-align:center}
      .cash-wallet-dialog .form-group{margin-top:12px;margin-bottom:0}
      .cash-wallet-dialog .cash-wallet-help{font-size:11px;color:var(--muted);line-height:1.5;margin-top:5px}
      .cash-wallet-adjust-list{max-height:150px;overflow:auto;margin-top:12px;border-top:1px solid var(--line)}
      .cash-wallet-adjust-row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}
      .cash-wallet-adjust-row div:first-child{min-width:0}
      .cash-wallet-adjust-row span{display:block;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
      .cash-wallet-adjust-remove{border:none;background:transparent;color:var(--danger);font-weight:800;padding:4px 6px}
      .cash-wallet-negative{color:var(--danger)}
      @media(max-width:380px){.cash-wallet-breakdown{grid-template-columns:1fr}.cash-wallet-balance{font-size:25px}}
    `;
    document.head.appendChild(style);
  }

  function ensureCashWalletSection(){
    ensureCashWalletStyles();
    if(document.getElementById('cashWalletSection')) return;
    const hero=document.querySelector('#page-trip .hero');
    if(!hero) return;
    const section=document.createElement('div');
    section.id='cashWalletSection';
    section.className='section';
    section.innerHTML=`
      <div class="section-title">外幣現金 <small>只計手上現金</small></div>
      <div class="card cash-wallet-card">
        <div class="cash-wallet-top">
          <div>
            <div class="cash-wallet-label">目前剩餘現金</div>
            <div id="cashWalletBalance" class="cash-wallet-balance">—</div>
            <div id="cashWalletStatus" class="cash-wallet-status"></div>
          </div>
          <div style="font-size:30px;position:relative">💰</div>
        </div>
        <div class="cash-wallet-breakdown">
          <div class="cash-wallet-mini"><span>初始現金</span><strong id="cashWalletInitial">—</strong></div>
          <div class="cash-wallet-mini"><span>換匯增加</span><strong id="cashWalletExchange">—</strong></div>
          <div class="cash-wallet-mini"><span>現金消費</span><strong id="cashWalletSpend">—</strong></div>
          <div class="cash-wallet-mini"><span>其他調整</span><strong id="cashWalletAdjust">—</strong></div>
        </div>
        <div class="cash-wallet-actions">
          <button id="cashWalletManageBtn" class="primary" type="button" onclick="openCashWalletV81()">設定現金</button>
        </div>
      </div>
    `;
    hero.insertAdjacentElement('afterend',section);
  }

  function ensureCashWalletOverlay(){
    if(document.getElementById('cashWalletOverlay')) return;
    const overlay=document.createElement('div');
    overlay.id='cashWalletOverlay';
    overlay.className='save-overlay hidden';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML=`
      <div class="save-dialog cash-wallet-dialog">
        <div class="save-symbol">💰</div>
        <h2>外幣現金</h2>
        <p id="cashWalletDialogSubtitle">設定這趟旅行手上的外幣現金。</p>
        <div class="form-group">
          <label>初始現金</label>
          <div class="money-wrap"><span id="cashWalletInitialSymbol" class="money-prefix"></span><input id="cashWalletInitialInput" type="text" inputmode="decimal" placeholder="例如：300000" /></div>
          <div class="cash-wallet-help">可以在旅程建立後再補填；修改這個數字會重新計算目前餘額。</div>
        </div>
        <div class="form-group">
          <label>新增現金調整 <span class="tiny">（選填）</span></label>
          <div class="money-wrap"><span id="cashWalletAdjustSymbol" class="money-prefix"></span><input id="cashWalletAdjustInput" type="text" inputmode="decimal" placeholder="增加填正數，減少填負數" /></div>
        </div>
        <div class="row">
          <div class="form-group"><label>調整日期</label><input id="cashWalletAdjustDate" type="date" /></div>
          <div class="form-group"><label>備註</label><input id="cashWalletAdjustNote" placeholder="例如：盤點補差額" /></div>
        </div>
        <div id="cashWalletAdjustList" class="cash-wallet-adjust-list"></div>
        <button id="cashWalletSaveBtn" class="primary" style="margin-top:14px" type="button" onclick="saveCashWalletV81()">儲存現金設定</button>
        <button class="secondary" style="margin-top:9px" type="button" onclick="closeCashWalletV81()">取消</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function renderCashWalletAdjustments(){
    const box=document.getElementById('cashWalletAdjustList');
    if(!box) return;
    const wallet=cashWalletData();
    if(!wallet.adjustments.length){
      box.innerHTML='';
      return;
    }
    box.innerHTML=wallet.adjustments.slice().reverse().map(a=>`
      <div class="cash-wallet-adjust-row">
        <div><strong>${a.amount>0?'+':''}${walletMoney(a.amount)}</strong><span>${a.date||'未填日期'}${a.note?' · '+a.note:''}</span></div>
        <button class="cash-wallet-adjust-remove" type="button" onclick="removeCashWalletAdjustmentV81('${String(a.id).replace(/'/g,"\\'")}')">刪除</button>
      </div>
    `).join('');
  }

  function renderCashWalletV81(){
    ensureCashWalletSection();
    if(!currentTrip) return;
    const calc=cashWalletCalc();
    const configured=calc.initial!==0 || calc.adjustments.length>0;
    const balanceEl=document.getElementById('cashWalletBalance');
    const statusEl=document.getElementById('cashWalletStatus');
    if(balanceEl){
      balanceEl.textContent=walletMoney(calc.balance);
      balanceEl.classList.toggle('cash-wallet-negative',calc.balance<0);
    }
    if(statusEl){
      statusEl.textContent=configured
        ? '換匯與現金消費會自動更新這個餘額'
        : '尚未設定初始現金；可以現在補上';
    }
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=walletMoney(value);};
    set('cashWalletInitial',calc.initial);
    set('cashWalletExchange',calc.exchange);
    set('cashWalletSpend',calc.cashSpend);
    set('cashWalletAdjust',calc.adjustment);
    const btn=document.getElementById('cashWalletManageBtn');
    if(btn){
      btn.textContent=configured?'調整現金':'＋ 設定初始現金';
      btn.disabled=!!currentTrip.archived;
    }
  }

  window.openCashWalletV81=function(){
    if(!currentTrip) return;
    if(currentTrip.archived){
      if(typeof archiveReadOnlyAlert==='function') archiveReadOnlyAlert();
      return;
    }
    ensureCashWalletOverlay();
    const wallet=cashWalletData();
    const sym=currencySymbol(currentTrip.currency);
    document.getElementById('cashWalletInitialInput').value=wallet.initial?String(wallet.initial):'';
    document.getElementById('cashWalletAdjustInput').value='';
    document.getElementById('cashWalletAdjustDate').value=cashWalletToday();
    document.getElementById('cashWalletAdjustNote').value='';
    document.getElementById('cashWalletInitialSymbol').textContent=sym;
    document.getElementById('cashWalletAdjustSymbol').textContent=sym;
    document.getElementById('cashWalletDialogSubtitle').textContent=`${currentTrip.name} · ${currentTrip.currency}`;
    renderCashWalletAdjustments();
    document.getElementById('cashWalletOverlay').classList.remove('hidden');
  };

  window.closeCashWalletV81=function(){
    document.getElementById('cashWalletOverlay')?.classList.add('hidden');
  };

  window.removeCashWalletAdjustmentV81=function(id){
    if(!currentTrip) return;
    const wallet=cashWalletData();
    currentTrip.cashWallet={
      initial:wallet.initial,
      adjustments:wallet.adjustments.filter(item=>String(item.id)!==String(id))
    };
    persist();
    renderCashWalletAdjustments();
  };

  window.saveCashWalletV81=async function(){
    if(!currentTrip) return;
    if(currentTrip.archived){
      if(typeof archiveReadOnlyAlert==='function') archiveReadOnlyAlert();
      return;
    }

    const initialRaw=document.getElementById('cashWalletInitialInput')?.value||'';
    const initial=cashWalletNumber(initialRaw);
    if(initialRaw.trim() && initial<0){
      alert('初始現金不能是負數');
      return;
    }

    const wallet=cashWalletData();
    const adjustments=wallet.adjustments.slice();
    const adjustRaw=document.getElementById('cashWalletAdjustInput')?.value||'';
    const adjust=cashWalletNumber(adjustRaw);
    if(adjustRaw.trim() && adjust===0){
      alert('現金調整請輸入非 0 的金額');
      return;
    }
    if(adjust!==0){
      adjustments.push({
        id:'cash_adj_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        date:document.getElementById('cashWalletAdjustDate')?.value||cashWalletToday(),
        amount:adjust,
        note:(document.getElementById('cashWalletAdjustNote')?.value||'').trim()
      });
    }

    const next={initial,adjustments};
    currentTrip.cashWallet=next;
    persist();
    renderCashWalletV81();

    const btn=document.getElementById('cashWalletSaveBtn');
    if(btn){btn.disabled=true;btn.textContent='儲存中…';}

    try{
      if(!getApiUrl()) throw new Error('尚未設定 Google Apps Script Web App URL');
      const ready=await ensureTripSpreadsheetReady(currentTrip);
      if(!ready || !currentTrip.spreadsheetId) throw new Error('Google Sheet 尚未建立完成，請稍後再試');

      const result=await postToCloud({
        action:'saveCashWallet',
        clientTripId:currentTrip.id,
        spreadsheetId:currentTrip.spreadsheetId,
        tripName:currentTrip.name,
        initial,
        adjustments
      });

      if(result?.cashWallet) currentTrip.cashWallet=result.cashWallet;
      currentTrip.cloudStatus='synced';
      currentTrip.lastSyncError='';
      if(typeof markSyncSuccess==='function') markSyncSuccess();
      persist();
      renderCashWalletV81();
      closeCashWalletV81();
      alert('外幣現金已儲存，Google Sheet 的「現金紀錄」也已更新。');
    }catch(err){
      currentTrip.cloudStatus='pending';
      currentTrip.lastSyncError=String(err?.message||err);
      persist();
      alert('現金設定已保留在這台裝置，但雲端尚未更新：\n'+currentTrip.lastSyncError);
    }finally{
      if(btn){btn.disabled=false;btn.textContent='儲存現金設定';}
    }
  };

  if(typeof openTrip==='function'){
    const baseOpenTripV81=openTrip;
    openTrip=function(id){
      const result=baseOpenTripV81(id);
      ensureCashWalletSection();
      renderCashWalletV81();
      return result;
    };
  }

  if(typeof checkBackendVersion==='function'){
    checkBackendVersion=async function(silent=true){
      const webEl=document.getElementById('webVersionText');
      const scriptEl=document.getElementById('scriptVersionText');
      const statusEl=document.getElementById('versionMatchStatus');
      const btn=document.getElementById('versionCheckBtn');
      if(webEl) webEl.textContent=CASH_WALLET_WEB_VERSION;
      if(!getApiUrl()){
        if(scriptEl) scriptEl.textContent='尚未設定';
        if(statusEl){statusEl.textContent='尚未設定 Apps Script Web App URL';statusEl.className='version-check-status version-check-error';}
        return false;
      }
      if(btn) btn.disabled=true;
      try{
        const data=await postToCloud({action:'getVersion'});
        const version=String(data.scriptVersion||'');
        const matched=version===CASH_WALLET_EXPECTED_BACKEND;
        state.lastScriptVersion=version;
        state.lastVersionCheckAt=new Date().toISOString();
        persist();
        if(scriptEl) scriptEl.textContent=version||'未知版本';
        if(statusEl){
          statusEl.textContent=matched?'版本一致，可以正常同步':'版本不一致：網站需要 '+CASH_WALLET_EXPECTED_BACKEND+'，目前後端是 '+(version||'未知');
          statusEl.className='version-check-status '+(matched?'version-check-ok':'version-check-error');
        }
        if(!matched&&!silent) alert('Apps Script 版本不一致。\n網站需要：'+CASH_WALLET_EXPECTED_BACKEND+'\n目前後端：'+(version||'未知版本')+'\n\n請部署 v54 Apps Script。');
        return matched;
      }catch(err){
        if(scriptEl) scriptEl.textContent='檢查失敗';
        if(statusEl){statusEl.textContent='無法讀取 Apps Script 版本：'+(err?.message||err);statusEl.className='version-check-status version-check-error';}
        if(!silent) alert('版本檢查失敗：'+(err?.message||err));
        return false;
      }finally{
        if(btn) btn.disabled=false;
      }
    };
  }

  const versionEl=document.getElementById('webVersionText');
  if(versionEl) versionEl.textContent=CASH_WALLET_WEB_VERSION;
  ensureCashWalletStyles();
  ensureCashWalletOverlay();
  if(currentTrip){ensureCashWalletSection();renderCashWalletV81();}
})();