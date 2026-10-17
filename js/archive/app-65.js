// v137：旅行統計新增支出分析第一版。
// 只新增前端分析 UI；保留既有旅行統計內容與 Sheet 統計，不修改後端與同步。
(()=>{
  const VER='2026.10.13-v137-trip-expense-analysis';
  let period='all';
  let dimension='category';

  const COLORS=['#7c5ce7','#8fd3cc','#ffd866','#f58bb6','#f47b57','#4f8edc','#5fc48d','#a98bd4','#f4a261','#9aa6b2'];
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
  const twd=v=>typeof fmtMoney==='function'?fmtMoney(n(v),'TWD'):`NT$${n(v).toLocaleString('en-US',{maximumFractionDigits:2})}`;

  function ensureStyles(){
    if(document.getElementById('statsAnalysisV137Style')) return;
    const s=document.createElement('style');
    s.id='statsAnalysisV137Style';
    s.textContent=`
      .stats-analysis-v137{margin:18px 0 22px}
      .stats-analysis-card{padding:16px}
      .stats-analysis-period,.stats-analysis-dimension{display:grid;gap:6px;background:#f3f1f7;padding:5px;border-radius:14px}
      .stats-analysis-period{grid-template-columns:repeat(3,1fr)}
      .stats-analysis-dimension{grid-template-columns:repeat(3,1fr);margin-top:14px}
      .stats-analysis-period button,.stats-analysis-dimension button{border:0;background:transparent;border-radius:11px;padding:10px 6px;font-weight:900;color:var(--muted);font-size:13px}
      .stats-analysis-period button.active,.stats-analysis-dimension button.active{background:#fff;color:var(--text);box-shadow:0 2px 8px rgba(50,35,80,.08)}
      .stats-analysis-total{padding:18px 4px 12px}
      .stats-analysis-total span{display:block;color:var(--muted);font-size:12px;font-weight:800}
      .stats-analysis-total strong{display:block;font-size:31px;line-height:1.15;margin-top:4px;letter-spacing:-.5px}
      .stats-analysis-total small{display:block;color:var(--muted);margin-top:7px;font-size:12px}
      .stats-analysis-split{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:2px 0 12px}
      .stats-analysis-split>div{border:1px solid var(--line);border-radius:14px;padding:11px 12px;background:#faf9fd}
      .stats-analysis-split span{display:block;color:var(--muted);font-size:11px;font-weight:800}.stats-analysis-split strong{display:block;margin-top:4px;font-size:15px}
      .stats-donut-wrap{display:flex;justify-content:center;padding:18px 0 16px}
      .stats-donut{width:190px;height:190px;border-radius:50%;position:relative;background:#ece8f3;flex:0 0 auto}
      .stats-donut::after{content:'';position:absolute;inset:42px;border-radius:50%;background:#fff}
      .stats-analysis-list{display:flex;flex-direction:column;gap:2px;margin-top:2px}
      .stats-analysis-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 2px;border-bottom:1px solid var(--line)}
      .stats-analysis-row:last-child{border-bottom:0}
      .stats-analysis-name{display:flex;align-items:center;min-width:0;gap:9px}.stats-analysis-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}.stats-analysis-name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stats-analysis-name small{color:var(--muted);margin-left:5px;font-weight:700}
      .stats-analysis-amount{text-align:right;font-weight:900;white-space:nowrap}
      .stats-analysis-empty{text-align:center;color:var(--muted);padding:28px 8px}
      .stats-analysis-note{font-size:11px;color:var(--muted);background:#f7f5fb;border-radius:10px;padding:9px 10px;margin-top:10px;line-height:1.5}
      @media(max-width:480px){.stats-analysis-total strong{font-size:27px}.stats-donut{width:170px;height:170px}.stats-donut::after{inset:38px}.stats-analysis-split{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(s);
  }

  function ensurePanel(){
    const page=document.getElementById('page-stats');
    if(!page) return null;
    let sec=document.getElementById('statsExpenseAnalysisV137');
    if(sec) return sec;
    ensureStyles();
    sec=document.createElement('div');
    sec.id='statsExpenseAnalysisV137';
    sec.className='section stats-analysis-v137';
    sec.innerHTML=`
      <div class="section-title">支出分析 <small>不含換匯本金</small></div>
      <div class="card stats-analysis-card">
        <div class="stats-analysis-period">
          <button id="statsPeriodBeforeV137" type="button" onclick="setStatsExpensePeriodV137('before')">旅途前</button>
          <button id="statsPeriodDuringV137" type="button" onclick="setStatsExpensePeriodV137('during')">旅途中</button>
          <button id="statsPeriodAllV137" class="active" type="button" onclick="setStatsExpensePeriodV137('all')">全部</button>
        </div>
        <div class="stats-analysis-total">
          <span id="statsAnalysisTotalLabelV137">總花費</span>
          <strong id="statsAnalysisTotalV137">NT$0</strong>
          <small id="statsAnalysisMetaV137"></small>
        </div>
        <div class="stats-analysis-split">
          <div><span>旅途前</span><strong id="statsAnalysisBeforeV137">NT$0</strong></div>
          <div><span>旅途中</span><strong id="statsAnalysisDuringV137">NT$0</strong></div>
        </div>
        <div class="stats-analysis-note">換匯只代表資金轉換，不列入旅行花費；待補台幣的紀錄會先以 NT$0 計入筆數，補上台幣後會自動更新。</div>
        <div class="stats-analysis-dimension">
          <button id="statsDimCategoryV137" class="active" type="button" onclick="setStatsExpenseDimensionV137('category')">類別</button>
          <button id="statsDimPaymentV137" type="button" onclick="setStatsExpenseDimensionV137('payment')">付款方式</button>
          <button id="statsDimDateV137" type="button" onclick="setStatsExpenseDimensionV137('date')">日期</button>
        </div>
        <div id="statsAnalysisDonutWrapV137" class="stats-donut-wrap"><div id="statsAnalysisDonutV137" class="stats-donut"></div></div>
        <div id="statsAnalysisListV137" class="stats-analysis-list"></div>
      </div>`;

    const sync=document.querySelector('#page-stats .stats-sheet-sync');
    if(sync) sync.insertAdjacentElement('beforebegin',sec);
    else {
      const hero=document.querySelector('#page-stats .stats-hero');
      hero?.insertAdjacentElement('afterend',sec);
    }
    return sec;
  }

  function paymentLabel(item){
    if(item?.pay==='信用卡') return item.card&&item.card!=='無' ? `信用卡 · ${item.card}` : '信用卡';
    if(item?.pay==='交通卡') return '交通卡';
    if(item?.pay==='Wowpass') return 'WOWPASS';
    if(item?.pay==='Toss') return 'TOSS';
    if(item?.pay==='現金') return '現金';
    if(item?.pay==='電子支付') return '電子支付';
    if(item?.pay==='轉帳') return '轉帳';
    return item?.pay||'其他';
  }

  function baseRows(){
    if(!currentTrip) return {before:[],during:[]};
    const before=(currentTrip.pretrip||[]).map(item=>({kind:'pretrip',item}));
    const during=(currentTrip.expenses||[]).map(item=>({kind:'expense',item}));
    return {before,during};
  }

  function selectedRows(){
    const r=baseRows();
    if(period==='before') return r.before;
    if(period==='during') return r.during;
    return [...r.before,...r.during];
  }

  function categoryLabel(row){
    if(row.kind==='pretrip') return row.item.category || '先前費用';
    return row.item.category || '未分類';
  }
  function dateLabel(row){
    const d=typeof normalizeTripDateValue==='function'?normalizeTripDateValue(row.item.date):String(row.item.date||'');
    if(!d) return '未填日期';
    return typeof dateWithWeekday==='function'?dateWithWeekday(d):d;
  }

  function groupRows(rows){
    const map=new Map();
    rows.forEach(row=>{
      const key=dimension==='payment'?paymentLabel(row.item):dimension==='date'?dateLabel(row):categoryLabel(row);
      if(!map.has(key)) map.set(key,{label:key,twd:0,count:0});
      const g=map.get(key);g.twd+=n(row.item.twd);g.count++;
    });
    return [...map.values()].sort((a,b)=>b.twd-a.twd||b.count-a.count||a.label.localeCompare(b.label,'zh-Hant'));
  }

  function donutGradient(groups,total){
    if(!(total>0)||!groups.length) return '#ece8f3';
    let cursor=0;
    const parts=[];
    groups.forEach((g,i)=>{
      const share=Math.max(0,g.twd)/total*100;
      const start=cursor;cursor+=share;
      parts.push(`${COLORS[i%COLORS.length]} ${start.toFixed(3)}% ${cursor.toFixed(3)}%`);
    });
    if(cursor<100) parts.push(`#ece8f3 ${cursor.toFixed(3)}% 100%`);
    return `conic-gradient(${parts.join(',')})`;
  }

  function render(){
    if(!currentTrip) return;
    ensurePanel();
    const sets=baseRows();
    const rows=selectedRows();
    const beforeTotal=sets.before.reduce((s,r)=>s+n(r.item.twd),0);
    const duringTotal=sets.during.reduce((s,r)=>s+n(r.item.twd),0);
    const total=rows.reduce((s,r)=>s+n(r.item.twd),0);
    const pending=rows.filter(r=>r.item.twd===null||r.item.twd===''||n(r.item.twd)===0).length;
    const avg=rows.length?total/rows.length:0;

    const labels={before:'旅途前花費',during:'旅途中花費',all:'總花費'};
    const totalLabel=document.getElementById('statsAnalysisTotalLabelV137');if(totalLabel)totalLabel.textContent=labels[period];
    const totalEl=document.getElementById('statsAnalysisTotalV137');if(totalEl)totalEl.textContent=twd(total);
    const meta=document.getElementById('statsAnalysisMetaV137');if(meta)meta.textContent=`共 ${rows.length} 筆 · 平均每筆 ${twd(avg)}${pending?` · 待補台幣 ${pending} 筆`:''}`;
    const before=document.getElementById('statsAnalysisBeforeV137');if(before)before.textContent=twd(beforeTotal);
    const during=document.getElementById('statsAnalysisDuringV137');if(during)during.textContent=twd(duringTotal);

    ['before','during','all'].forEach(v=>document.getElementById(`statsPeriod${v[0].toUpperCase()+v.slice(1)}V137`)?.classList.toggle('active',period===v));
    ['category','payment','date'].forEach(v=>document.getElementById(`statsDim${v[0].toUpperCase()+v.slice(1)}V137`)?.classList.toggle('active',dimension===v));

    const groups=groupRows(rows);
    const positiveTotal=groups.reduce((s,g)=>s+Math.max(0,g.twd),0);
    const donut=document.getElementById('statsAnalysisDonutV137');if(donut)donut.style.background=donutGradient(groups,positiveTotal);
    const wrap=document.getElementById('statsAnalysisDonutWrapV137');if(wrap)wrap.classList.toggle('hidden',!(positiveTotal>0));
    const list=document.getElementById('statsAnalysisListV137');
    if(list){
      if(!groups.length){
        list.innerHTML='<div class="stats-analysis-empty">目前沒有這個區間的支出資料</div>';
      }else{
        list.innerHTML=groups.map((g,i)=>{
          const pct=positiveTotal>0?Math.round(Math.max(0,g.twd)/positiveTotal*100):0;
          return `<div class="stats-analysis-row"><div class="stats-analysis-name"><span class="stats-analysis-dot" style="background:${COLORS[i%COLORS.length]}"></span><div><strong>${esc(g.label)}</strong><small>${pct}% · ${g.count} 筆</small></div></div><div class="stats-analysis-amount">${twd(g.twd)}</div></div>`;
        }).join('');
      }
    }
  }

  window.setStatsExpensePeriodV137=function(v){period=['before','during','all'].includes(v)?v:'all';render();};
  window.setStatsExpenseDimensionV137=function(v){dimension=['category','payment','date'].includes(v)?v:'category';render();};

  const baseOpenTripStats=window.openTripStats;
  if(typeof baseOpenTripStats==='function'){
    window.openTripStats=function(){
      const r=baseOpenTripStats.apply(this,arguments);
      setTimeout(render,0);
      return r;
    };
  }

  const baseRenderStats=window.renderTripStats;
  if(typeof baseRenderStats==='function'){
    window.renderTripStats=function(){
      const r=baseRenderStats.apply(this,arguments);
      setTimeout(render,0);
      return r;
    };
  }

  const baseRenderSettings=window.renderSettings;
  if(typeof baseRenderSettings==='function'){
    window.renderSettings=function(){const r=baseRenderSettings.apply(this,arguments);const web=document.getElementById('webVersionText');if(web)web.textContent=VER;return r;};
  }
  try{window.WEB_VERSION=VER;}catch(e){}
})();
