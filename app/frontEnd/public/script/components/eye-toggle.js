/**
 * Eye Toggle (Password Visibility) Component
 * Auto-initializes all .ctrl-eye-btn elements.
 *
 * Expects the button to be a sibling/neighbor of a password input,
 * identified by data-eye-target attribute or the nearest input[type="password"].
 *
 * Usage (HTML):
 *   <input type="password" id="myPass">
 *   <button type="button" class="ctrl-eye-btn" data-eye-target="myPass">
 *     <svg class="eye-open">...</svg>
 *     <svg class="eye-closed" style="display:none">...</svg>
 *   </button>
 */
(function initEyeToggles() {
  document.querySelectorAll('.ctrl-eye-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = this.dataset.eyeTarget;
      var input = targetId
        ? document.getElementById(targetId)
        : this.closest('.ctrl-field, div')?.querySelector('input[type="password"], input[type="text"]');
      if (!input) return;

      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';

      var eyeOpen = this.querySelector('.eye-open');
      var eyeClosed = this.querySelector('.eye-closed');
      if (eyeOpen) eyeOpen.style.display = show ? 'none' : 'block';
      if (eyeClosed) eyeClosed.style.display = show ? 'block' : 'none';
    });
  });
})();
