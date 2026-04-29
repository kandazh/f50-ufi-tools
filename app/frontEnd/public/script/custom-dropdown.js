/**
 * Custom Dropdown - replaces native <select> with styled dropdown
 * Usage: Add class="ctrl-select" to any <select> inside .ctrl-field
 * The script auto-wraps them on DOMContentLoaded
 */
(function() {
  'use strict';

  const ARROW_SVG = '<svg class="ctrl-dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  var justOpened = false;

  function createDropdown(select) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ctrl-dropdown';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ctrl-dropdown-trigger';

    const valueSpan = document.createElement('span');
    valueSpan.className = 'ctrl-dropdown-value';
    trigger.appendChild(valueSpan);
    trigger.insertAdjacentHTML('beforeend', ARROW_SVG);

    const menu = document.createElement('div');
    menu.className = 'ctrl-dropdown-menu';

    function buildOptions() {
      menu.innerHTML = '';
      Array.from(select.options).forEach(function(opt) {
        const item = document.createElement('div');
        item.className = 'ctrl-dropdown-option';
        item.dataset.value = opt.value;
        item.textContent = opt.textContent;
        if (opt.selected) item.classList.add('active');
        menu.appendChild(item);
      });
      updateValue();
    }

    function updateValue() {
      var sel = select.options[select.selectedIndex];
      valueSpan.textContent = sel ? sel.textContent : '';
      menu.querySelectorAll('.ctrl-dropdown-option').forEach(function(o) {
        o.classList.toggle('active', o.dataset.value === select.value);
      });
    }

    function openMenu() {
      closeAll();
      menu.classList.add('show');
      trigger.classList.add('open');
      justOpened = true;
      setTimeout(function() { justOpened = false; }, 10);
    }

    function closeMenu() {
      menu.classList.remove('show');
      trigger.classList.remove('open');
    }

    trigger.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (menu.classList.contains('show')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    menu.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var opt = e.target.closest('.ctrl-dropdown-option');
      if (!opt) return;
      select.value = opt.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      updateValue();
      closeMenu();
    });

    // Prevent label from interfering
    wrapper.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });

    // Insert into DOM
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    wrapper.appendChild(select);

    buildOptions();

    // Observe select for programmatic changes
    var observer = new MutationObserver(buildOptions);
    observer.observe(select, { childList: true, subtree: true, attributes: true });

    // Watch for value changes via JS
    var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    var originalSet = desc.set;
    Object.defineProperty(select, 'value', {
      get: desc.get,
      set: function(v) {
        originalSet.call(this, v);
        updateValue();
      }
    });

    select._ctrlDropdown = { buildOptions: buildOptions, updateValue: updateValue };
  }

  function closeAll() {
    document.querySelectorAll('.ctrl-dropdown-menu.show').forEach(function(m) {
      m.classList.remove('show');
      m.parentElement.querySelector('.ctrl-dropdown-trigger').classList.remove('open');
    });
  }

  // Close on outside click
  document.addEventListener('mousedown', function(e) {
    if (justOpened) return;
    if (!e.target.closest('.ctrl-dropdown')) closeAll();
  });

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeAll();
  });

  // Auto-init
  function init() {
    document.querySelectorAll('select.ctrl-select').forEach(function(sel) {
      if (sel.closest('.ctrl-dropdown')) return;
      createDropdown(sel);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.initCtrlDropdowns = init;
})();
