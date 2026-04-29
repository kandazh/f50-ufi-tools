/**
 * Segmented IP Input Component
 * Auto-initializes all .ctrl-ip-input containers.
 * Each container has 4 .ctrl-ip-seg inputs + a hidden input for the combined value.
 *
 * Features:
 *   - Only allows digits (0-9), clamps to 0-255
 *   - Auto-tabs to next segment on 3 digits
 *   - Pressing '.' moves to next segment
 *   - Backspace on empty moves to previous segment
 *   - Paste support: pasting "192.168.0.1" fills all 4 segments
 *
 * Usage (HTML):
 *   <div class="ctrl-ip-input" data-name="fieldName">
 *     <input class="ctrl-ip-seg" type="text" maxlength="3" placeholder="192">
 *     <span class="ctrl-ip-dot">.</span>
 *     <input class="ctrl-ip-seg" type="text" maxlength="3" placeholder="168">
 *     <span class="ctrl-ip-dot">.</span>
 *     <input class="ctrl-ip-seg" type="text" maxlength="3" placeholder="0">
 *     <span class="ctrl-ip-dot">.</span>
 *     <input class="ctrl-ip-seg" type="text" maxlength="3" placeholder="1">
 *     <input type="hidden" name="fieldName">
 *   </div>
 *
 * JS API:
 *   setIpInput(parentEl, dataName, ipString)  — sets value programmatically
 */
(function initIpInputs() {
  document.querySelectorAll('.ctrl-ip-input').forEach(function (container) {
    var segs = container.querySelectorAll('.ctrl-ip-seg');
    var hidden = container.querySelector('input[type="hidden"]');

    function syncHidden() {
      var parts = [];
      segs.forEach(function (s) { parts.push(s.value || ''); });
      if (hidden) hidden.value = parts.join('.');
    }

    segs.forEach(function (seg, i) {
      seg.addEventListener('input', function () {
        this.value = this.value.replace(/[^0-9]/g, '');
        if (this.value !== '' && parseInt(this.value) > 255) this.value = '255';
        if (this.value.length === 3 && i < 3) segs[i + 1].focus();
        syncHidden();
      });

      seg.addEventListener('keydown', function (e) {
        if (e.key === '.' && i < 3) { e.preventDefault(); segs[i + 1].focus(); }
        if (e.key === 'Backspace' && this.value === '' && i > 0) { segs[i - 1].focus(); }
      });

      seg.addEventListener('paste', function (e) {
        var paste = (e.clipboardData || window.clipboardData).getData('text').trim();
        var parts = paste.split('.');
        if (parts.length === 4) {
          e.preventDefault();
          parts.forEach(function (p, idx) {
            var v = parseInt(p);
            segs[idx].value = isNaN(v) ? '' : Math.min(v, 255).toString();
          });
          syncHidden();
        }
      });
    });
  });
})();

/**
 * Set a segmented IP input value programmatically.
 * @param {HTMLElement} parent - Parent element containing the .ctrl-ip-input
 * @param {string} name - The data-name attribute value
 * @param {string} ip - IP string like "192.168.0.1"
 */
function setIpInput(parent, name, ip) {
  var container = parent.querySelector('.ctrl-ip-input[data-name="' + name + '"]');
  if (!container) return;
  var segs = container.querySelectorAll('.ctrl-ip-seg');
  var hidden = container.querySelector('input[type="hidden"]');
  var parts = (ip || '').split('.');
  segs.forEach(function (s, i) { s.value = parts[i] || ''; });
  if (hidden) hidden.value = ip || '';
}
