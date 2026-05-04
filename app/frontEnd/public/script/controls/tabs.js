/**
 * Controls Layout Switcher — Scoped navigation controller
 * Manages per-page ctrl panel switching and dispatches 'ctrl-panel-show' events.
 */
(function () {
  function dispatchPanelEvent(name, scope) {
    if (!name) return;
    document.dispatchEvent(new CustomEvent('ctrl-panel-show', { detail: { tab: name, scope: scope } }));
  }

  function initCtrlLayout(layout) {
    var scope = layout.dataset.ctrlScope || 'default';
    var key = 'ufi_ctrl_tab_' + scope;
    var navButtons = Array.from(layout.querySelectorAll('.ctrl-nav-btn'));
    var panels = Array.from(layout.querySelectorAll('.ctrl-panel'));
    var empty = layout.querySelector('.ctrl-empty');
    var defaultTab = layout.dataset.ctrlDefaultTab || (navButtons[0] ? navButtons[0].dataset.ctrlTab : '');
    var activeTab = null;

    function switchCtrlTab(name, options) {
      var shouldSave = !options || options.save !== false;
      var shouldDispatch = !options || options.dispatch !== false;

      navButtons.forEach(function (button) {
        button.classList.toggle('active', button.dataset.ctrlTab === name);
      });

      panels.forEach(function (panel) {
        if (panel.dataset.ctrlPanel === name) {
          panel.style.display = (name === 'quick_shell' || name === 'ttyd') ? 'flex' : '';
        } else {
          panel.style.display = 'none';
        }
      });

      if (empty) empty.style.display = name ? 'none' : '';

      activeTab = name || null;
      layout.dataset.activeCtrlTab = activeTab || '';
      if (shouldSave) {
        try { localStorage.setItem(key, activeTab || ''); } catch (e) {}
      }
      if (shouldDispatch) {
        dispatchPanelEvent(activeTab, scope);
      }
    }

    navButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchCtrlTab(btn.dataset.ctrlTab);
      });
    });

    try {
      var saved = localStorage.getItem(key) || defaultTab;
      var isValid = navButtons.some(function (button) { return button.dataset.ctrlTab === saved; });
      switchCtrlTab(isValid ? saved : defaultTab, { save: false, dispatch: false });
    } catch (e) {
      switchCtrlTab(defaultTab, { save: false, dispatch: false });
    }
  }

  window.dispatchCtrlLayoutActivePanels = function (root) {
    var container = root || document;
    container.querySelectorAll('.ctrl-layout').forEach(function (layout) {
      var activeTab = layout.dataset.activeCtrlTab;
      if (activeTab) {
        dispatchPanelEvent(activeTab, layout.dataset.ctrlScope || 'default');
      }
    });
  };

  document.querySelectorAll('.ctrl-layout').forEach(initCtrlLayout);

  window.addEventListener('load', function () {
    document.querySelectorAll('.tab-panel').forEach(function (panel) {
      if (panel.style.display !== 'none') {
        window.dispatchCtrlLayoutActivePanels(panel);
      }
    });
  });
})();
