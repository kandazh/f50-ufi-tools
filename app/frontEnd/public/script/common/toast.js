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
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:8px;background:' + bg + ';color:#fff;font-size:13px;font-weight:600;z-index:9999;pointer-events:none;animation:fadeout 1.5s ease forwards';
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 1600);
}
