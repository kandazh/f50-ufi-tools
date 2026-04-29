/**
 * Stepper Component
 * Auto-initializes all .ctrl-stepper-btn elements.
 * Supports data-step attribute for increment/decrement value.
 * Respects min/max attributes on the associated input.
 *
 * Usage (HTML):
 *   <div class="ctrl-stepper">
 *     <button type="button" class="ctrl-stepper-btn" data-step="-1" aria-label="Decrease">−</button>
 *     <input class="ctrl-input ctrl-stepper-input" type="number" min="1" max="32" value="10">
 *     <button type="button" class="ctrl-stepper-btn" data-step="1" aria-label="Increase">+</button>
 *   </div>
 */
(function initSteppers() {
  document.querySelectorAll('.ctrl-stepper-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = this.closest('.ctrl-stepper').querySelector('input');
      if (!input) return;
      var step = parseInt(this.dataset.step) || 1;
      var val = parseInt(input.value) || 0;
      var min = input.hasAttribute('min') ? parseInt(input.min) : -Infinity;
      var max = input.hasAttribute('max') ? parseInt(input.max) : Infinity;
      val += step;
      if (val < min) val = min;
      if (val > max) val = max;
      input.value = val;
    });
  });
})();
