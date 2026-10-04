// v74：退稅待處理改為橘色系，避免與「待同步」黃色狀態混淆。
// 僅覆蓋退稅 UI 顏色，不修改任何資料、同步或記帳流程。
const TAX_REFUND_COLOR_PATCH_VERSION='2026.10.04-v74';

(()=>{
  if(document.getElementById('taxRefundV74ColorStyle')) return;
  const style=document.createElement('style');
  style.id='taxRefundV74ColorStyle';
  style.textContent=`
    .tax-refund-machine-box{
      background:#fff0e6!important;
      border-color:#f2b98e!important;
    }
    .tax-refund-machine-box .tiny{
      color:#a54f12!important;
    }
    .tax-refund-badge.machine{
      background:#fff0e6!important;
      color:#c75a00!important;
    }
    .tax-refund-badge.machine-place{
      background:#fff7f1!important;
      color:#a64c0d!important;
      border-color:#efc3a3!important;
    }
    .tax-refund-alert-card{
      background:#fff0e6!important;
      border-color:#f2b98e!important;
    }
    .tax-refund-alert-copy span,
    .tax-refund-preview-item span,
    .tax-refund-preview-more{
      color:#a54f12!important;
    }
  `;
  document.head.appendChild(style);

  const applyVersion=()=>{
    const el=document.getElementById('webVersionText');
    if(el) el.textContent=TAX_REFUND_COLOR_PATCH_VERSION;
  };
  applyVersion();
  setTimeout(applyVersion,0);
})();