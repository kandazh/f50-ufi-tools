/**
 * Plugin Panel
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="plugin"]');
  if (!panel) return;

  // Accordion behavior — only one section open at a time
  (function () {
    var items = panel.querySelectorAll('.sched-accordion-item');
    items.forEach(function (item) {
      var header = item.querySelector('.sched-accordion-header');
      var body = item.querySelector('.sched-accordion-body');
      if (!header || !body) return;

      header.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        items.forEach(function (i) {
          if (!i.classList.contains('open')) return;
          var b = i.querySelector('.sched-accordion-body');
          b.style.height = b.scrollHeight + 'px';
          void b.offsetHeight;
          b.style.height = '0';
          i.classList.remove('open');
        });
        if (!isOpen) {
          item.classList.add('open');
          body.style.height = '0';
          void body.offsetHeight;
          body.style.height = body.scrollHeight + 'px';
          body.addEventListener('transitionend', function handler() {
            body.style.height = '';
            body.removeEventListener('transitionend', handler);
          });
        }
      });
    });
  })();

  var codeArea = document.getElementById('plugin_code');
  var loadBtn = document.getElementById('plugin_load_btn');
  var clearBtn = document.getElementById('plugin_clear_btn');
  var storeList = document.getElementById('plugin_store_list');

  async function loadCurrent() {
    try {
      var res = await fetch(HOTBOX_baseURL + '/get_custom_head', { headers: common_headers });
      var data = await res.json();
      codeArea.value = data.text || '';
    } catch (e) {
      codeArea.value = '';
    }
  }

  async function savePlugin() {
    var code = codeArea.value;
    var res = await fetch(HOTBOX_baseURL + '/set_custom_head', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text: code })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') {
      throw new Error((data && data.error) || 'Failed');
    }
  }

  async function loadStore() {
    try {
      var res = await fetch(HOTBOX_baseURL + '/plugins_store', { headers: common_headers });
      var data = await res.json();

      if (data.error) {
        storeList.innerHTML = '<div class="sched-empty">Store unavailable</div>';
        return;
      }

      var baseUrl = data.download_url || '';
      var content = data.res && data.res.data && data.res.data.content;

      if (!content || !content.length) {
        storeList.innerHTML = '<div class="sched-empty">No plugins available</div>';
        return;
      }

      storeList.innerHTML = content.map(function (item) {
        var name = item.name || 'unknown';
        var size = item.size ? (item.size / 1024).toFixed(1) + ' KB' : '';
        var dlUrl = baseUrl + '/' + encodeURIComponent(name);
        return '<div class="plugin-store-item">' +
          '<div class="plugin-store-info">' +
            '<span class="plugin-store-name">' + escapeHtml(name) + '</span>' +
            '<span class="plugin-store-size">' + size + '</span>' +
          '</div>' +
          '<button class="plugin-store-install-btn" data-url="' + escapeHtml(dlUrl) + '" data-name="' + escapeHtml(name) + '">Install</button>' +
        '</div>';
      }).join('');

      storeList.querySelectorAll('.plugin-store-install-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { installPlugin(btn.dataset.url, btn.dataset.name); });
      });
    } catch (e) {
      storeList.innerHTML = '<div class="sched-empty">Failed to load store</div>';
    }
  }

  async function installPlugin(url, name) {
    try {
      var res = await fetch(url);
      var code = await res.text();
      // Append to existing code
      var current = codeArea.value;
      codeArea.value = current + (current ? '\n\n' : '') + '// Plugin: ' + name + '\n' + code;
      showCtrlToast(name + ' loaded into editor', 'success');
    } catch (e) {
      showCtrlToast('Failed to download: ' + e.message, 'error');
    }
  }

  function applyPlugin(code) {
    var container = document.getElementById('plugin_actions_container');
    if (container) container.innerHTML = '';
    if (!code || !code.trim()) return;
    try {
      var cleaned = code.replace(/^\/\/\s*<script>\s*/i, '').replace(/\/\/\s*<\/script>\s*$/i, '');
      var fn = new Function(cleaned);
      fn();
    } catch (e) {
      showCtrlToast('Plugin error: ' + e.message, 'error');
    }
  }

  bindCtrlSave('plugin_save_btn', async function () {
    await savePlugin();
    applyPlugin(codeArea.value);
  }, { needsLogin: false, successMsg: 'Saved & Applied' });
  loadBtn.addEventListener('click', loadCurrent);
  clearBtn.addEventListener('click', function () {
    codeArea.value = '';
    var container = document.getElementById('plugin_actions_container');
    if (container) container.innerHTML = '';
    savePlugin();
  });

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'plugin') {
      loadCurrent();
      loadStore();
    }
  });

  // Auto-load and apply saved plugin on init (simulates prod behavior)
  (async function () {
    try {
      var res = await fetch(HOTBOX_baseURL + '/get_custom_head', { headers: common_headers });
      var data = await res.json();
      if (data.text && data.text.trim()) {
        applyPlugin(data.text);
      }
    } catch (e) {}
  })();
})();
