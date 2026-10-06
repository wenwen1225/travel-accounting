// v88：強制修正資金管理 UI 與版本顯示。後端仍搭配 v56。
(()=>{
  const WEB='2026.10.07-v88';
  const EXPECTED='v56';

  function ensureStyle(){
    if(document.getElementById('fundV88Style')) return;
    const s=document.createElement('style');
    s.id='fundV88Style';
    s.textContent=`
      #fundEntryType{display:none!important}
      .fund-v88-wrap{margin:10px 0 12px}
      .fund-v88-title{font-size:12px;font-weight:900;margin-bottom:8px;color:var(--text)}
      .fund-v88-cats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .fund-v88-cat,.fund-v88-sub{border:1px solid var(--line);background:#fff;border-radius:14px;height:44px;font-weight:900}
      .fund-v88-cat[data-cat="income"].active{background:#e8f8ee;border-color:#bce8ca;color:#15803d}
      .fund-v88-cat[data-cat="expense"].active{background:#ffe9ee;border-color:#f7c5d0;color:#c2415a}
      .fund-v88-cat[data-cat="adjust"].active{background:#f1eaff;border-color:#d9c8ff;color:#7c3aed}
      .fund-v88-subs{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}
      .fund-v88-sub{height:38px;padding:0 14px;font-size:12px}
      .fund-v88-sub.active{background:#2f293b;color:#fff;border-color:#2f293b}
      #recordOnlyFundV88.active{background:#8b5cf6!important;color:#fff!important;border-color:#8b5cf6!important}
    `;
    document.head.appendChild(s);
  }

  const groups={
    income:[['儲值','儲值'],['退款','退款'],['其他收入','其他收入']],
    expense:[['支出','手動支出']],
    adjust:[['調整增加','增加'],['調整減少','減少']]
  };
  let active='income';

  function infer(v){
    if(v==='支出') return 'expense';
    if(v==='調整增加'||v==='調整減少') return 'adjust';
    return 'income';
  }

  function setCat(cat, preferred=''){
    const sel=document.getElementById('fundEntryType');
    const wrap=document.getElementById('fundCategoryWrapV88');
    if(!sel||!wrap) return;
    active=groups[cat]?cat:'income';
    const opts=groups[active];
    let value=preferred;
    if(!opts.some(x=>x[0]===value)) value=opts[0][0];
    sel.innerHTML=opts.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
    sel.value=value;
    wrap.querySelectorAll('.fund-v88-cat').forEach(b=>b.classList.toggle('active',b.dataset.cat===active));
    const subs=wrap.querySelector('.fund-v88-subs');
    subs.innerHTML=opts.map(([v,l])=>`<button type="button" class="fund-v88-sub ${v===value?'active':''}" data-value="${v}">${l}</button>`).join('');
    subs.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      sel.value=b.dataset.value;
      subs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));
    });
  }

  function forceFundButtons(){
    ensureStyle();
    const sel=document.getElementById('fundEntryType');
    if(!sel) return;
    let wrap=document.getElementById('fundCategoryWrapV88');
    if(!wrap){
      wrap=document.createElement('div');
      wrap.id='fundCategoryWrapV88';
      wrap.className='fund-v88-wrap';
      wrap.innerHTML=`<div class="fund-v88-title">收入 / 支出 / 調整</div><div class="fund-v88-cats">
        <button type="button" class="fund-v88-cat" data-cat="income">收入</button>
        <button type="button" class="fund-v88-cat" data-cat="expense">支出</button>
        <button type="button" class="fund-v88-cat" data-cat="adjust">調整</button>
      </div><div class="fund-v88-subs"></div>`;
      sel.parentElement?.insertBefore(wrap,sel);
      wrap.querySelectorAll('.fund-v88-cat').forEach(b=>b.onclick=()=>setCat(b.dataset.cat));
    }
    const current=sel.value;
    setCat(infer(current),current);
  }

  function ensureFundFilter(){
    const typeSel=document.getElementById('recordFilterTypeV84');
    if(!typeSel) return;
    if(![...typeSel.options].some(o=>o.value==='資金紀錄')){
      const o=document.createElement('option');o.value='資金紀錄';o.textContent='資金紀錄';typeSel.appendChild(o);
    }
    if(document.getElementById('recordOnlyFundV88')) return;
    const clearBtn=[...document.querySelectorAll('#page-records button')].find(b=>String(b.textContent||'').includes('清除條件'));
    const host=clearBtn?.parentElement || typeSel.closest('.form-group')?.parentElement;
    if(!host) return;
    const btn=document.createElement('button');
    btn.id='recordOnlyFundV88';btn.type='button';btn.className=clearBtn?.className||'secondary';btn.textContent='💰 只看資金';
    btn.onclick=()=>{
      const on=typeSel.value==='資金紀錄';
      if(typeof clearRecordFilters==='function') clearRecordFilters(false);
      typeSel.value=on?'':'資金紀錄';
      btn.classList.toggle('active',!on);
      if(typeof applyRecordFilters==='function') applyRecordFilters();
    };
    if(clearBtn) host.insertBefore(btn,clearBtn); else host.appendChild(btn);
  }

  const oldOpenFund=window.openFundManagerV83;
  window.openFundManagerV83=function(){
    const r=typeof oldOpenFund==='function'?oldOpenFund():undefined;
    requestAnimationFrame(forceFundButtons);
    setTimeout(forceFundButtons,50);
    return r;
  };

  const oldSelectFund=window.selectFundAccountV83;
  window.selectFundAccountV83=function(id){
    const r=typeof oldSelectFund==='function'?oldSelectFund(id):undefined;
    requestAnimationFrame(forceFundButtons);
    return r;
  };

  const oldOpenRecords=window.openRecords;
  window.openRecords=function(){
    const r=typeof oldOpenRecords==='function'?oldOpenRecords():undefined;
    requestAnimationFrame(ensureFundFilter);
    setTimeout(ensureFundFilter,50);
    return r;
  };

  const oldApply=window.applyRecordFilters;
  window.applyRecordFilters=function(){
    const r=typeof oldApply==='function'?oldApply():undefined;
    ensureFundFilter();
    const b=document.getElementById('recordOnlyFundV88');
    const s=document.getElementById('recordFilterTypeV84');
    if(b) b.classList.toggle('active',s?.value==='資金紀錄');
    return r;
  };

  // v83 會把版本文字寫回去；這裡直接覆寫檢查函式。
  window.checkBackendVersion=async function(silent=true){
    const webEl=document.getElementById('webVersionText');
    const scriptEl=document.getElementById('scriptVersionText');
    const statusEl=document.getElementById('versionMatchStatus');
    const btn=document.getElementById('versionCheckBtn');
    if(webEl) webEl.textContent=WEB;
    if(!getApiUrl?.()){
      if(scriptEl) scriptEl.textContent='尚未設定';
      if(statusEl){statusEl.textContent='尚未設定 Apps Script Web App URL';statusEl.className='version-check-status version-check-error';}
      return false;
    }
    if(btn) btn.disabled=true;
    try{
      const data=await postToCloud({action:'getVersion'});
      const v=String(data?.scriptVersion||'');
      const ok=v===EXPECTED;
      if(typeof state!=='undefined'){state.lastScriptVersion=v;state.lastVersionCheckAt=new Date().toISOString();persist();}
      if(scriptEl) scriptEl.textContent=v||'未知版本';
      if(statusEl){statusEl.textContent=ok?'版本一致，可以正常同步':'版本不一致：網站需要 '+EXPECTED+'，目前後端是 '+(v||'未知');statusEl.className='version-check-status '+(ok?'version-check-ok':'version-check-error');}
      if(!ok&&!silent) alert('Apps Script 版本不一致。\n網站需要：'+EXPECTED+'\n目前後端：'+(v||'未知版本'));
      return ok;
    }catch(err){
      if(scriptEl) scriptEl.textContent='檢查失敗';
      if(statusEl){statusEl.textContent='無法讀取 Apps Script 版本：'+(err?.message||err);statusEl.className='version-check-status version-check-error';}
      return false;
    }finally{if(btn) btn.disabled=false;}
  };
  try{checkBackendVersion=window.checkBackendVersion;}catch(e){}
  const setVersion=()=>{const e=document.getElementById('webVersionText');if(e)e.textContent=WEB;};
  setVersion();
  document.addEventListener('click',()=>setTimeout(setVersion,0),true);

  // 如果 overlay / records 是之後才被建立，也自動補上。
  const mo=new MutationObserver(()=>{
    if(document.getElementById('fundEntryType')) forceFundButtons();
    if(document.getElementById('recordFilterTypeV84')) ensureFundFilter();
    setVersion();
  });
  mo.observe(document.body,{childList:true,subtree:true});
})();
