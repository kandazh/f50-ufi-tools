/**
 * Controls Tab Switcher — Core navigation controller
 * Manages the ctrl panel tab switching and dispatches 'ctrl-panel-show' events.
 * Each feature page (lan, wifi, apn, clients) listens for its own event.
 */
(function () {
  var KEY = 'ufi_ctrl_tab';
  var activeTab = null;

  function switchCtrlTab(name) {
    // Toggle nav buttons
    document.querySelectorAll('.ctrl-nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.ctrlTab === name);
    });
    // Toggle panels
    document.querySelectorAll('.ctrl-panel').forEach(function (p) {
      p.style.display = p.dataset.ctrlPanel === name ? '' : 'none';
    });
    // Toggle empty state
    var empty = document.getElementById('ctrlEmpty');
    if (empty) empty.style.display = name ? 'none' : '';

    activeTab = name || null;
    try { localStorage.setItem(KEY, activeTab || ''); } catch (e) {}

    // Fire load event for the panel
    if (name) {
      document.dispatchEvent(new CustomEvent('ctrl-panel-show', { detail: { tab: name } }));
    }
  }

  // Bind nav buttons
  document.querySelectorAll('.ctrl-nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchCtrlTab(btn.dataset.ctrlTab);
    });
  });

  // Restore last tab (default to 'lan') — deferred so page modules register listeners first
  try {
    var saved = localStorage.getItem(KEY) || 'lan';
    // Show panel immediately (visual), but defer the data-load event
    document.querySelectorAll('.ctrl-nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.ctrlTab === saved);
    });
    document.querySelectorAll('.ctrl-panel').forEach(function (p) {
      p.style.display = p.dataset.ctrlPanel === saved ? '' : 'none';
    });
    var empty = document.getElementById('ctrlEmpty');
    if (empty) empty.style.display = 'none';
    activeTab = saved;
    // Fire event after all scripts have loaded
    window.addEventListener('load', function () {
      document.dispatchEvent(new CustomEvent('ctrl-panel-show', { detail: { tab: saved } }));
    });
  } catch (e) {}
})();
