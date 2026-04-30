/**
 * Toast Notification Component
 * Shows a brief feedback message at the bottom of the screen.
 *
 * Usage:
 *   showCtrlToast('Saved')
 *   showCtrlToast('Error', 'error')
 */
function showCtrlToast(msg, type) {
  var bg = type === 'error' ? 'rgba(239,68,68,0.9)' : 'rgba(34,197,94,0.9)';
  var el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 24px;border-radius:8px;background:' + bg + ';color:#fff;font-size:13px;font-weight:600;z-index:9999;pointer-events:none;opacity:1;transition:opacity 0.4s ease';
  document.body.appendChild(el);
  setTimeout(function () { el.style.opacity = '0'; }, 2200);
  setTimeout(function () { el.remove(); }, 2600);
}
