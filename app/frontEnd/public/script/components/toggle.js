/**
 * Declarative Toggle Component
 * Auto-initializes all [data-toggle] containers using createSwitch() from utils.js.
 *
 * Attributes:
 *   data-toggle="hiddenInputName"  — name of the hidden input to sync
 *   data-toggle-on="0"             — value when ON (default: "1")
 *   data-toggle-off="1"            — value when OFF (default: "0")
 *   data-toggle-default="on"       — initial state: "on" or "off" (default: "on")
 *   data-toggle-class="className"  — optional CSS class for the switch
 *
 * Usage (HTML):
 *   <div data-toggle="ApBroadcastDisabled" data-toggle-on="0" data-toggle-off="1" data-toggle-default="on"></div>
 *   <input type="hidden" name="ApBroadcastDisabled" value="0">
 *
 * JS API:
 *   initToggle(container)  — manually init a single toggle
 *   The container gets a .toggleUpdate(bool) method after init for programmatic control.
 */
function initToggle(container) {
  if (!container || container._toggleInit) return;
  container._toggleInit = true;

  var name = container.dataset.toggle;
  var onVal = container.dataset.toggleOn || '1';
  var offVal = container.dataset.toggleOff || '0';
  var defaultOn = container.dataset.toggleDefault !== 'off';
  var className = container.dataset.toggleClass || name || '';

  // Find the hidden input (sibling or within same form)
  var form = container.closest('form') || container.parentElement;
  var hidden = form ? form.querySelector('input[name="' + name + '"]') : null;

  var sw = createSwitch({
    value: defaultOn,
    className: className,
    onChange: function (val) {
      if (hidden) hidden.value = val ? onVal : offVal;
    }
  });

  container.appendChild(sw);
  if (hidden) hidden.value = defaultOn ? onVal : offVal;

  // Expose update method on the container for programmatic control
  container.toggleUpdate = function (isOn) {
    if (sw.update) sw.update(isOn);
    if (hidden) hidden.value = isOn ? onVal : offVal;
  };
}

(function initAllToggles() {
  document.querySelectorAll('[data-toggle]').forEach(initToggle);
})();
