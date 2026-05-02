/**
 * Plugin Panel — Per-plugin storage model
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
  var nameInput = document.getElementById('plugin_name_input');
  var pluginListEl = document.getElementById('plugin_installed_list');

  // --- API helpers ---
  async function apiGetAllCode() {
    var res = await fetch(HOTBOX_baseURL + '/get_custom_head', { headers: common_headers });
    var data = await res.json();
    return data.text || '';
  }

  async function apiListPlugins() {
    var res = await fetch(HOTBOX_baseURL + '/list_plugins', { headers: common_headers });
    return await res.json(); // returns array of names
  }

  async function apiSavePlugin(name, code) {
    var res = await fetch(HOTBOX_baseURL + '/set_plugin', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: name, text: code })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Save failed');
  }

  async function apiDeletePlugin(name) {
    var res = await fetch(HOTBOX_baseURL + '/delete_plugin', {
      method: 'POST',
      headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: name })
    });
    var data = await res.json();
    if (!data || data.result !== 'success') throw new Error((data && data.error) || 'Delete failed');
  }

  // --- Plugin Store ---
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
        btn.addEventListener('click', function () { installFromStore(btn.dataset.url, btn.dataset.name); });
      });
    } catch (e) {
      storeList.innerHTML = '<div class="sched-empty">Failed to load store</div>';
    }
  }

  async function installFromStore(url, name) {
    try {
      var res = await fetch(url);
      var code = await res.text();
      var pluginCode = '// [Plugin: ' + name + ']\n' + code + '\n// [/Plugin: ' + name + ']';
      await apiSavePlugin(name, pluginCode);
      showCtrlToast(name + ' installed', 'success');
      await reloadAll();
    } catch (e) {
      showCtrlToast('Failed to install: ' + e.message, 'error');
    }
  }

  // --- Installed Plugins list ---
  async function renderInstalledPlugins() {
    if (!pluginListEl) return;
    try {
      var names = await apiListPlugins();
      if (!names || !names.length) {
        pluginListEl.innerHTML = '<div class="sched-empty">No plugins installed</div>';
        return;
      }
      pluginListEl.innerHTML = names.map(function (name) {
        return '<div class="plugin-store-item">' +
          '<div class="plugin-store-info">' +
            '<span class="plugin-store-name">' + escapeHtml(name) + '</span>' +
          '</div>' +
          '<button class="plugin-remove-btn" data-plugin-name="' + escapeHtml(name) + '" style="background:rgba(248,113,113,0.15);border-color:rgba(248,113,113,0.3);color:#fca5a5;padding:4px 12px;border-radius:6px;border:1px solid;cursor:pointer;font-size:12px">Remove</button>' +
        '</div>';
      }).join('');

      pluginListEl.querySelectorAll('.plugin-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { removePlugin(btn.dataset.pluginName); });
      });
    } catch (e) {
      pluginListEl.innerHTML = '<div class="sched-empty">Error loading list</div>';
    }
  }

  async function removePlugin(name) {
    try {
      await apiDeletePlugin(name);
      showCtrlToast(name + ' removed', 'success');
      await reloadAll();
    } catch (e) {
      showCtrlToast('Failed to remove: ' + e.message, 'error');
    }
  }

  // --- Apply plugins ---
  var PLUGIN_MARKER_RE = /\/\/ \[Plugin: (.+?)\]\n([\s\S]*?)\/\/ \[\/Plugin: \1\]/g;

  function parsePlugins(code) {
    var plugins = [];
    if (!code || !code.trim()) return plugins;
    var m;
    PLUGIN_MARKER_RE.lastIndex = 0;
    var remaining = code;
    while ((m = PLUGIN_MARKER_RE.exec(code)) !== null) {
      plugins.push({ name: m[1], code: m[0], marked: true });
      remaining = remaining.replace(m[0], '');
    }
    if (remaining.trim()) {
      plugins.unshift({ name: 'Custom Code', code: remaining.trim(), marked: false });
    }
    return plugins;
  }

  function applyPlugin(code) {
    var container = document.getElementById('plugin_actions_container');
    if (container) container.innerHTML = '';
    if (!code || !code.trim()) return;

    var plugins = parsePlugins(code);
    var errors = [];

    plugins.forEach(function (p) {
      var before = container.children.length;

      try {
        var raw = p.marked ? p.code.replace(/^\/\/ \[Plugin: .+?\]\n/, '').replace(/\n\/\/ \[\/Plugin: .+?\]$/, '') : p.code;
        var cleaned = raw.replace(/^(?:\/\/)?\s*<script[^>]*>\s*/i, '').replace(/(?:\/\/)?\s*<\/script>\s*$/i, '');
        var fn = new Function(cleaned);
        fn();
      } catch (e) {
        errors.push(p.name + ': ' + e.message);
      }

      var after = container.children.length;
      if (after > before) {
        var group = document.createElement('div');
        group.className = 'plugin-action-group';
        group.style.cssText = 'width:100%;border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:10px;background:rgba(255,255,255,0.02);overflow:hidden';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;user-select:none';
        header.innerHTML = '<span style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.4);font-weight:600">' + escapeHtml(p.name) + '</span><span class="plugin-group-arrow" style="font-size:16px;color:rgba(255,255,255,0.35);transition:transform 0.2s">▾</span>';
        group.appendChild(header);

        var btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 12px';

        while (container.children.length > before) {
          btnWrap.appendChild(container.children[before]);
        }
        group.appendChild(btnWrap);
        container.appendChild(group);

        (function (h, w) {
          h.addEventListener('click', function () {
            var arrow = h.querySelector('.plugin-group-arrow');
            if (w.style.display === 'none') {
              w.style.display = 'flex';
              if (arrow) arrow.style.transform = '';
            } else {
              w.style.display = 'none';
              if (arrow) arrow.style.transform = 'rotate(-90deg)';
            }
          });
        })(header, btnWrap);
      }
    });

    if (errors.length) {
      throw new Error('Plugin error: ' + errors.join('; '));
    }
  }

  // --- Reload all plugins from backend ---
  async function reloadAll() {
    try {
      var code = await apiGetAllCode();
      try { applyPlugin(code); } catch (e) {}
      await renderInstalledPlugins();
    } catch (e) {}
  }

  // --- Save & Apply button ---
  bindCtrlSave('plugin_save_btn', async function () {
    var code = codeArea.value.trim();
    if (!code) throw new Error('No code to save');
    var pluginName = (nameInput.value || '').trim();

    // Extract name from markers if already wrapped
    var markerMatch = code.match(/^\/\/ \[Plugin: (.+?)\]/);
    if (markerMatch && !pluginName) {
      pluginName = markerMatch[1];
    }

    if (!pluginName) {
      // Auto-generate name
      var existingNames = [];
      try { existingNames = await apiListPlugins(); } catch (e) {}
      var n = 1;
      while (existingNames.indexOf('Custom ' + n) !== -1) n++;
      pluginName = 'Custom ' + n;
    }

    // Wrap with markers if not already wrapped
    var alreadyWrapped = /^\/\/ \[Plugin: .+?\]\n[\s\S]*\/\/ \[\/Plugin: .+?\]$/.test(code);
    if (!alreadyWrapped) {
      code = '// [Plugin: ' + pluginName + ']\n' + code + '\n// [/Plugin: ' + pluginName + ']';
    }

    await apiSavePlugin(pluginName, code);
    codeArea.value = '';
    nameInput.value = '';
    await reloadAll();
  }, { needsLogin: false, successMsg: 'Saved & Applied' });

  loadBtn.addEventListener('click', async function () {
    try {
      var code = await apiGetAllCode();
      codeArea.value = code;
    } catch (e) {
      codeArea.value = '';
    }
  });

  clearBtn.addEventListener('click', function () {
    codeArea.value = '';
    nameInput.value = '';
  });

  document.addEventListener('ctrl-panel-show', async function (e) {
    if (e.detail && e.detail.tab === 'plugin') {
      await reloadAll();
      loadStore();
    }
  });

  // Auto-load and apply on init
  (async function () {
    try {
      var code = await apiGetAllCode();
      if (code && code.trim()) {
        applyPlugin(code);
        renderInstalledPlugins();
      }
    } catch (e) {}
  })();
})();
