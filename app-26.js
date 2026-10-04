// v79：全部紀錄增加「只看換匯」快速篩選。
// 僅調整全部紀錄篩選 UI，不修改儲存、同步、退稅或統計流程。
const EXCHANGE_ONLY_FILTER_PATCH_VERSION='2026.10.04-v79';
let v79ExchangeOnly=false;

function v79AllTripRecords(){
  if(!currentTrip) return [];
  return [
    ...(currentTrip.expenses||[]),
    ...(currentTrip.pretrip||[]),
    ...(currentTrip.exchange||[])
  ].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
}

function v79ApplyExchangeOnlyButton(){
  const btn=document.getElementById('exchangeOnlyFilterBtn');
  if(!btn) return;
  btn.textContent=v79ExchangeOnly ? '✓ 只看換匯' : '$ 只看換匯';
  btn.classList.toggle('active',v79ExchangeOnly);
  btn.setAttribute('aria-pressed',v79ExchangeOnly?'true':'false');
}

function v79EnsureExchangeOnlyButton(){
  const footer=document.querySelector('#recordsFilterCard .records-filter-footer');
  if(!footer || document.getElementById('exchangeOnlyFilterBtn')) return;

  const clearBtn=footer.querySelector('button');
  const btn=document.createElement('button');
  btn.id='exchangeOnlyFilterBtn';
  btn.type='button';
  btn.className='pill exchange-only-filter-btn';
  btn.onclick=toggleExchangeOnlyFilter;
  if(clearBtn) footer.insertBefore(btn,clearBtn);
  else footer.appendChild(btn);
  v79ApplyExchangeOnlyButton();
}

function toggleExchangeOnlyFilter(){
  if(!currentTrip) return;
  v79ExchangeOnly=!v79ExchangeOnly;
  allRecordSource=v79ExchangeOnly
    ? (currentTrip.exchange||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    : v79AllTripRecords();

  setupRecordFilters();
  applyRecordFilters();
  v79EnsureExchangeOnlyButton();
  v79ApplyExchangeOnlyButton();

  const subtitle=document.getElementById('recordsSubtitle');
  if(subtitle){
    subtitle.textContent=v79ExchangeOnly
      ? currentTrip.name+' · 僅顯示換匯紀錄'
      : currentTrip.name+' · 點任一紀錄可修改或刪除';
  }
}

if(typeof openRecords==='function'){
  const v79BaseOpenRecords=openRecords;
  openRecords=function(){
    v79ExchangeOnly=false;
    const result=v79BaseOpenRecords.apply(this,arguments);
    setTimeout(()=>{
      v79EnsureExchangeOnlyButton();
      v79ApplyExchangeOnlyButton();
    },0);
    return result;
  };
}

if(typeof clearRecordFilters==='function'){
  const v79BaseClearRecordFilters=clearRecordFilters;
  clearRecordFilters=function(refresh=true){
    const result=v79BaseClearRecordFilters.apply(this,arguments);
    // 清除一般條件時不強制關閉「只看換匯」，讓它可以獨立使用。
    setTimeout(v79ApplyExchangeOnlyButton,0);
    return result;
  };
}

(()=>{
  if(document.getElementById('v79ExchangeOnlyStyle')) return;
  const style=document.createElement('style');
  style.id='v79ExchangeOnlyStyle';
  style.textContent=`
    #recordsFilterCard .records-filter-footer{
      display:flex!important;
      align-items:center!important;
      gap:8px!important;
      flex-wrap:wrap!important;
    }
    #recordsFilterCard .records-filter-footer #recordFilterCount{
      margin-right:auto!important;
    }
    .exchange-only-filter-btn.active{
      background:#efe7ff!important;
      color:#6f52c8!important;
      box-shadow:inset 0 0 0 1px #d8c9fb!important;
    }
  `;
  document.head.appendChild(style);
})();

v79EnsureExchangeOnlyButton();
function v79ApplyVersion(){
  const el=document.getElementById('webVersionText');
  if(el) el.textContent=EXCHANGE_ONLY_FILTER_PATCH_VERSION;
}
v79ApplyVersion();
setTimeout(v79ApplyVersion,0);
