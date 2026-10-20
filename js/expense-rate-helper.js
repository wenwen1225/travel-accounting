// Optional exchange-rate calculator for transport card and local/cash payments.
// Works only on the expense form; existing amount fields remain the source of truth.
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const number=value=>{const n=Number(String(value||'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
  const eligible=new Set(['交通卡','現金','Wowpass','Toss','電子支付']);
  let lastEdited='foreign';
  function selectedPay(){
    const active=$('paySeg')?.querySelector('button.active,[aria-pressed="true"]');
    if(active)return active.dataset.pay||'';
    return typeof selectedPayMethod!=='undefined'?String(selectedPayMethod):'';
  }
  function sync(){
    const box=$('expenseRateHelper');
    if(!box)return;
    const pay=selectedPay();
    const visible=eligible.has(pay)&&$('expenseForm')&&!$('expenseForm').classList.contains('hidden');
    box.style.display=visible?'':'none';
    if(!visible)return;
    const rate=$('expenseRateHelperInput');
    const foreign=$('expenseForeign');
    const twd=$('expenseTwd');
    if(!rate||!foreign||!twd)return;
    const a=number(foreign.value),b=number(twd.value);
    if(a>0&&b>0&&document.activeElement!==rate){
      const inferred=a/b;
      if(Number.isFinite(inferred)&&inferred>0)rate.value=Number(inferred.toFixed(6));
    }
  }
  function applyRate(){
    const rate=number($('expenseRateHelperInput')?.value);
    if(!(rate>0))return;
    const foreign=$('expenseForeign'),twd=$('expenseTwd');
    if(!foreign||!twd)return;
    if(lastEdited==='twd'&&number(twd.value)>0){
      foreign.value=String(Number((number(twd.value)*rate).toFixed(2)));
      foreign.dispatchEvent(new Event('input',{bubbles:true}));
    }else if(number(foreign.value)>0){
      twd.value=String(Math.round(number(foreign.value)/rate));
      twd.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }
  function install(){
    if(!$('expenseForeign')||!$('expenseTwd')||$('expenseRateHelper'))return;
    const wrap=document.createElement('div');
    wrap.id='expenseRateHelper';wrap.className='form-group';
    wrap.style.cssText='display:none;padding:12px;margin:5px 0 12px;background:#f7f2ff;border:1px solid #e9dff8;border-radius:13px';
    wrap.innerHTML='<label for="expenseRateHelperInput">匯率換算（外幣 ÷ 台幣，例如 1 TWD = 5 JPY）</label><div class="row" style="align-items:center;gap:8px"><input id="expenseRateHelperInput" type="number" min="0" step="any" inputmode="decimal" placeholder="輸入匯率" style="min-width:0;flex:1"/><button id="expenseRateHelperApply" type="button" class="secondary" style="flex:0 0 auto;padding:10px 12px">換算</button></div><div class="tiny" style="margin-top:6px">可先輸入外幣或台幣，再輸入匯率換算另一欄；儲存的仍是原本兩個金額。</div>';
    const anchor=$('expenseForeign').closest('.row');
    if(!anchor)return;
    anchor.insertAdjacentElement('afterend',wrap);
    $('expenseRateHelperApply').addEventListener('click',applyRate);
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
