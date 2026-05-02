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
  var nameInput = document.getElementById('plugin_name_input');

  async function loadCurrent() {
    try {
      var res = await fetch(HOTBOX_baseURL + '/get_custom_head', { headers: common_headers });
      var data = await res.json();
      codeArea.value = data.text || '';
    } catch (e) {
      codeArea.value = '';
    }
  }

  async function getSavedCode() {
    try {
      var res = await fetch(HOTBOX_baseURL + '/get_custom_head', { headers: common_headers });
      var data = await res.json();
      return data.text || '';
    } catch (e) { return ''; }
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
      // Add marker so we can identify this plugin later
      var block = '// [Plugin: ' + name + ']\n' + code + '\n// [/Plugin: ' + name + ']';
      var current = codeArea.value.trim();
      codeArea.value = current + (current ? '\n\n' : '') + block;
      nameInput.value = '';
      showCtrlToast(name + ' loaded into editor — click Save & Apply to activate', 'success');
    } catch (e) {
      showCtrlToast('Failed to download: ' + e.message, 'error');
    }
  }

  // --- Installed Plugins list ---
  var PLUGIN_MARKER_RE = /\/\/ \[Plugin: (.+?)\]\n([\s\S]*?)\/\/ \[\/Plugin: \1\]/g;

  function parsePlugins(code) {
    var plugins = [];
    if (!code || !code.trim()) return plugins;
    var m;
    PLUGIN_MARKER_RE.lastIndex = 0;
    // Collect marked plugins and track what's covered
    var remaining = code;
    while ((m = PLUGIN_MARKER_RE.exec(code)) !== null) {
      plugins.push({ name: m[1], code: m[0], marked: true });
      remaining = remaining.replace(m[0], '');
    }
    // Any leftover non-empty code is "Custom Code"
    if (remaining.trim()) {
      plugins.unshift({ name: 'Custom Code', code: remaining.trim(), marked: false });
    }
    return plugins;
  }

  var pluginListEl = document.getElementById('plugin_installed_list');

  // Toggle for Installed Plugins section
  var installedHeader = document.getElementById('plugin_installed_header');
  if (installedHeader && pluginListEl) {
    installedHeader.addEventListener('click', function () {
      var arrow = installedHeader.querySelector('.plugin-group-arrow');
      if (pluginListEl.style.display === 'none') {
        pluginListEl.style.display = '';
        if (arrow) arrow.style.transform = '';
      } else {
        pluginListEl.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(-90deg)';
      }
    });
  }

  function renderInstalledPlugins(code) {
    if (!pluginListEl) return;
    var plugins = parsePlugins(code || '');
    if (!plugins.length) {
      pluginListEl.innerHTML = '<div class="sched-empty">No plugins installed</div>';
      return;
    }
    pluginListEl.innerHTML = plugins.map(function (p) {
      return '<div class="plugin-store-item">' +
        '<div class="plugin-store-info">' +
          '<span class="plugin-store-name">' + escapeHtml(p.name) + '</span>' +
        '</div>' +
        '<button class="plugin-remove-btn" data-plugin-name="' + escapeHtml(p.name) + '" data-marked="' + (p.marked ? '1' : '0') + '" style="background:rgba(248,113,113,0.15);border-color:rgba(248,113,113,0.3);color:#fca5a5;padding:4px 12px;border-radius:6px;border:1px solid;cursor:pointer;font-size:12px">Remove</button>' +
      '</div>';
    }).join('');

    pluginListEl.querySelectorAll('.plugin-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { removePlugin(btn.dataset.pluginName, btn.dataset.marked === '1'); });
    });
  }

  async function removePlugin(name, isMarked) {
    if (isMarked) {
      var pattern = new RegExp('\\n?\\n?\\/\\/ \\[Plugin: ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\n[\\s\\S]*?\\/\\/ \\[\\/Plugin: ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'g');
      codeArea.value = codeArea.value.replace(pattern, '').trim();
    } else {
      // Remove everything that's NOT inside markers (custom code)
      var marked = [];
      var m;
      PLUGIN_MARKER_RE.lastIndex = 0;
      while ((m = PLUGIN_MARKER_RE.exec(codeArea.value)) !== null) {
        marked.push(m[0]);
      }
      codeArea.value = marked.join('\n\n').trim();
    }
    try {
      applyPlugin(codeArea.value);
    } catch (e) { /* ignore apply errors during remove */ }
    await savePlugin();
    renderInstalledPlugins(codeArea.value);
    showCtrlToast(name + ' removed', 'success');
  }

  function applyPlugin(code) {
    var container = document.getElementById('plugin_actions_container');
    if (container) container.innerHTML = '';
    if (!code || !code.trim()) return;

    var plugins = parsePlugins(code);
    var errors = [];

    plugins.forEach(function (p) {
      // Snapshot current children count
      var before = container.children.length;

      try {
        var raw = p.marked ? p.code.replace(/^\/\/ \[Plugin: .+?\]\n/, '').replace(/\n\/\/ \[\/Plugin: .+?\]$/, '') : p.code;
        var cleaned = raw.replace(/^(?:\/\/)?\s*<script[^>]*>\s*/i, '').replace(/(?:\/\/)?\s*<\/script>\s*$/i, '');
        var fn = new Function(cleaned);
        fn();
      } catch (e) {
        errors.push(p.name + ': ' + e.message);
      }

      // Wrap any new elements added by this plugin into a collapsible group box
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

        // Move newly added elements into the group
        while (container.children.length > before) {
          btnWrap.appendChild(container.children[before]);
        }
        group.appendChild(btnWrap);
        container.appendChild(group);

        // Toggle collapse on click
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

  bindCtrlSave('plugin_save_btn', async function () {
    var code = codeArea.value.trim();
    if (!code) throw new Error('No code to save');
    var pluginName = (nameInput.value || '').trim();
    var saved = await getSavedCode();

    if (!pluginName) {
      // Auto-generate name: Custom 1, Custom 2, etc.
      var n = 1;
      while (saved.indexOf('// [Plugin: Custom ' + n + ']') !== -1) n++;
      pluginName = 'Custom ' + n;
    }

    // Wrap with markers if not already wrapped with this name
    var escName = pluginName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!code.match(new RegExp('^// \\[Plugin: ' + escName + '\\]'))) {
      code = '// [Plugin: ' + pluginName + ']\n' + code + '\n// [/Plugin: ' + pluginName + ']';
    }

    // Remove old version of same plugin if exists, then append
    saved = saved.replace(new RegExp('\\n?\\n?\\/\\/ \\[Plugin: ' + escName + '\\]\\n[\\s\\S]*?\\/\\/ \\[\\/Plugin: ' + escName + '\\]', 'g'), '').trim();
    codeArea.value = saved + (saved ? '\n\n' : '') + code;

    applyPlugin(codeArea.value);
    await savePlugin();
    nameInput.value = '';
    renderInstalledPlugins(codeArea.value);
  }, { needsLogin: false, successMsg: 'Saved & Applied' });
  loadBtn.addEventListener('click', async function () {
    await loadCurrent();
    renderInstalledPlugins(codeArea.value);
  });
  clearBtn.addEventListener('click', function () {
    codeArea.value = '';
    nameInput.value = '';
  });

  document.addEventListener('ctrl-panel-show', async function (e) {
    if (e.detail && e.detail.tab === 'plugin') {
      await loadCurrent();
      renderInstalledPlugins(codeArea.value);
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
        renderInstalledPlugins(data.text);
      }
    } catch (e) {}
  })();

  // --- Live Translation (Google Translate, plugin panel only) ---
  (function () {
    var translateEl = document.getElementById('plugin_translate_el');
    var pluginPanel = document.getElementById('plugin_panel');
    if (!translateEl || !pluginPanel) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Translate to English';
    btn.style.cssText = 'padding:4px 10px;font-size:11px;border-radius:4px;background:rgba(14,165,233,0.15);border:1px solid rgba(56,189,248,0.3);color:#93c5fd;cursor:pointer;outline:none;white-space:nowrap;font-weight:500;overflow:visible;line-height:normal;-webkit-text-fill-color:#93c5fd';
    translateEl.appendChild(btn);

    var translated = false;
    var originals = null;

    function collectTextNodes(el) {
      var nodes = [];
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (node.parentElement && (node.parentElement.tagName === 'TEXTAREA' || node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE' || node.parentElement.tagName === 'SELECT' || node.parentElement.tagName === 'OPTION' || node.parentElement.tagName === 'INPUT')) return NodeFilter.FILTER_REJECT;
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      while (walker.nextNode()) nodes.push(walker.currentNode);
      return nodes;
    }

    function saveOriginals() {
      var nodes = collectTextNodes(pluginPanel);
      originals = nodes.map(function (n) { return { node: n, text: n.textContent }; });
    }

    function restoreOriginals() {
      if (!originals) return;
      originals.forEach(function (o) { o.node.textContent = o.text; });
      originals = null;
    }

    async function translateToEnglish() {
      saveOriginals();
      var nodes = collectTextNodes(pluginPanel);
      var texts = nodes.map(function (n) { return n.textContent.trim(); }).filter(Boolean);
      if (!texts.length) return;

      btn.textContent = 'Translating...';
      btn.disabled = true;
      try {
        var res = await fetch(HOTBOX_baseURL + '/translate', {
          method: 'POST',
          headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ texts: texts, sl: 'zh-CN', tl: 'en' })
        });
        if (!res.ok) throw new Error('Server returned ' + res.status);
        var text = await res.text();
        if (!text || !text.trim()) throw new Error('Empty response');
        var data = JSON.parse(text);
        var result = Array.isArray(data) ? data : [];
        nodes.forEach(function (n, i) {
          if (i < result.length) {
            var t = Array.isArray(result[i]) ? result[i][0] : result[i];
            if (t) n.textContent = t;
          }
        });
        translated = true;
        btn.textContent = 'Show Original';
      } catch (e) {
        showCtrlToast('Translation failed: ' + e.message, 'error');
        btn.textContent = 'Translate to English';
      }
      btn.disabled = false;
    }

    btn.addEventListener('click', function () {
      if (translated) {
        restoreOriginals();
        translated = false;
        btn.textContent = 'Translate to English';
      } else {
        translateToEnglish();
      }
    });
  })();
})();
