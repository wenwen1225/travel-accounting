// Optional exchange-rate calculator for transport card and local/cash payments.
// Works only on the expense form; existing amount fields remain the source of truth.
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const number=value=>{const n=Number(String(value||'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const eligible=new Set(['交通卡','現金','Wowpass','Toss','電子支付']);
  let lastEdited='foreign';
  function payChoice(){
    const active=$('paySeg')?.querySelector('button.active,[aria-pressed="true"]');
    if(active)return active.dataset.pay||'';
    return typeof selectedPay!=='undefined'?String(selectedPay):'';
  }
  function sync(){
    const box=$('expenseRateHelper');
    if(!box)return;
    const pay=payChoice();
    const visible=eligible.has(pay)&&$('expenseForm')&&!$('expenseForm').classList.contains('hidden');
    box.style.display=visible?'':'none';
    if(!visible)return;
    const rate=$('expenseRateHelperInput');
    const foreign=$('expenseForeign');
    const twd=$('expenseTwd');
    if(!rate||!foreign||!twd)return;
    const a=number(foreign.value),b=number(twd.value);
    if(a>0&&b>0&&document.activeElement!==rate){
      const inferred=$('expenseRateHelperOperator')?.value==='multiply'?b/a:a/b;
      if(Number.isFinite(inferred)&&inferred>0)rate.value=Number(inferred.toFixed(6));
    }
  }
  function applyRate(){
    const rate=number($('expenseRateHelperInput')?.value);
    const multiply=$('expenseRateHelperOperator')?.value==='multiply';
    if(!(rate>0))return;
    const foreign=$('expenseForeign'),twd=$('expenseTwd');
    if(!foreign||!twd)return;
    if(lastEdited==='twd'&&number(twd.value)>0){
      foreign.value=String(Number((multiply?number(twd.value)/rate:number(twd.value)*rate).toFixed(2)));
      foreign.dispatchEvent(new Event('input',{bubbles:true}));
    }else if(number(foreign.value)>0){
      twd.value=String(Math.round(multiply?number(foreign.value)*rate:number(foreign.value)/rate));
      twd.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }
  function install(){
    if(!$('expenseForeign')||!$('expenseTwd')||$('expenseRateHelper'))return;
    const wrap=document.createElement('div');
    wrap.id='expenseRateHelper';wrap.className='form-group';
    wrap.style.cssText='display:none;padding:12px;margin:5px 0 12px;background:#f7f2ff;border:1px solid #e9dff8;border-radius:13px';
    wrap.innerHTML='<label for="expenseRateHelperInput">匯率換算</label><div class="row" style="align-items:center;gap:8px"><select id="expenseRateHelperOperator" aria-label="換算方式" style="flex:0 0 98px;min-width:0"><option value="divide">÷ 除法</option><option value="multiply">× 乘法</option></select><input id="expenseRateHelperInput" type="number" min="0" step="any" inputmode="decimal" placeholder="輸入匯率" style="min-width:0;flex:1"/><button id="expenseRateHelperApply" type="button" class="secondary" style="flex:0 0 auto;padding:10px 12px">換算</button></div><div class="tiny" id="expenseRateHelperHint" style="margin-top:6px">外幣 ÷ 匯率 = 台幣；先輸入外幣或台幣，再按「換算」即可。</div>';

    const anchor=$('expenseForeign').closest('.row');
    if(!anchor)return;
    anchor.insertAdjacentElement('afterend',wrap);
    $('expenseRateHelperApply').addEventListener('click',applyRate);
    $('expenseRateHelperOperator').addEventListener('change',()=>{
      $('expenseRateHelperHint').textContent=$('expenseRateHelperOperator').value==='multiply'?'外幣 × 匯率 = 台幣；從台幣反算外幣時會自動使用除法。':'外幣 ÷ 匯率 = 台幣；從台幣反算外幣時會自動使用乘法。';
      sync();
    });
    $('expenseRateHelperInput').addEventListener('change',applyRate);
    $('expenseForeign').addEventListener('input',()=>{lastEdited='foreign';});
    $('expenseTwd').addEventListener('input',()=>{lastEdited='twd';});
    $('paySeg')?.addEventListener('click',()=>setTimeout(sync,0));
    const previousOpen=window.openAdd;
    window.openAdd=function(){const result=typeof previousOpen==='function'?previousOpen.apply(this,arguments):undefined;lastEdited='foreign';setTimeout(sync,0);return result;};
    const previousEdit=window.editExpense;
    window.editExpense=function(){const result=typeof previousEdit==='function'?previousEdit.apply(this,arguments):undefined;lastEdited='foreign';setTimeout(sync,0);return result;};
    const previousSelect=window.selectPay;
    window.selectPay=function(){const result=typeof previousSelect==='function'?previousSelect.apply(this,arguments):undefined;setTimeout(sync,0);return result;};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);
  else install();
})();
