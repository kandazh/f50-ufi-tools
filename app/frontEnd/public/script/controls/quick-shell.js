/**
 * Controls Tab — Quick Shell
 * Edit and execute /sdcard/quick_shell.sh via ADB Engineer Mode
 */
(function () {
  var loaded = false;

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab !== 'quick_shell') return;
    loadQuickShell();
  });

  var panel = document.querySelector('[data-ctrl-panel="quick_shell"]');
  if (panel && panel.style.display !== 'none') {
    setTimeout(loadQuickShell, 0);
  }

  function loadQuickShell() {
    if (loaded) return;
    loaded = true;
    bindButtons();
    bindMaximize();
  }

  function bindMaximize() {
    var btn = document.getElementById('ADV_SHELL_MAXIMIZE_BTN');
    var panel = document.querySelector('[data-ctrl-panel="quick_shell"]');
    var editorWrap = document.getElementById('ADV_SHELL_EDITOR_WRAP');
    var editor = document.getElementById('ADV_SHELL_EDITOR');
    var logBox = document.getElementById('ADV_SHELL_LOG');
    var infoCard = panel ? panel.querySelector('.ctrl-adv-info-card') : null;
    var actionsBar = btn ? btn.parentElement : null;
    if (!btn || !panel || !editorWrap || !editor) return;

    var maximized = false;
    var overlay = null;

    function doRestore() {
      maximized = false;
      if (overlay) {
        editorWrap.appendChild(editor);
        editor.style.cssText = 'flex:1;min-height:200px;resize:none;';
        if (logBox) {
          editorWrap.parentElement.insertBefore(logBox, editorWrap.nextSibling);
          logBox.style.cssText = '';
          var resultDiv = document.getElementById('ADV_SHELL_RESULT');
          if (resultDiv) resultDiv.style.cssText = '';
        }
        document.body.removeChild(overlay);
        overlay = null;
      }
      if (infoCard) infoCard.style.display = '';
      if (actionsBar) actionsBar.style.display = 'flex';
      btn.textContent = '⛶';
      btn.title = 'Maximize editor';
      btn.style.marginLeft = 'auto';
    }

    btn.addEventListener('click', function () {
      if (!maximized) {
        maximized = true;
        // Create fullscreen overlay on body to bypass parent transforms/overflow
        overlay = document.createElement('div');
        overlay.id = 'qs-maximize-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,0.98);display:flex;flex-direction:column;padding:0;';

        // Clone actions bar into overlay
        var topBar = document.createElement('div');
        topBar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px 16px;background:rgba(15,15,30,0.95);border-bottom:1px solid rgba(56,189,248,0.15);';
        topBar.innerHTML = '<button type="button" class="ctrl-adv-btn ctrl-adv-btn-sm" id="QS_OV_LOAD">Load from device</button>' +
          '<button type="button" class="ctrl-adv-btn ctrl-adv-btn-sm" id="QS_OV_SAVE">Save to device</button>' +
          '<button type="button" class="ctrl-adv-btn ctrl-adv-btn-sm ctrl-adv-btn-primary" id="QS_OV_RUN">Save & Run</button>' +
          '<button type="button" class="ctrl-adv-btn" id="QS_OV_RESTORE" style="margin-left:auto;font-size:24px;width:36px;height:36px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1" title="Restore editor">⊗</button>';
        overlay.appendChild(topBar);

        // Move textarea into overlay
        overlay.appendChild(editor);
        editor.style.cssText = 'flex:2;width:100%;resize:none;padding:14px 16px;border:none;border-radius:0;background:rgba(2,6,23,1);color:#e2e8f0;font-family:var(--font-mono, monospace);font-size:13px;line-height:1.6;outline:none;min-height:0;';

        // Move output into overlay with drag splitter
        if (logBox) {
          // Create drag handle between editor and output
          var splitter = document.createElement('div');
          splitter.style.cssText = 'height:6px;cursor:row-resize;background:rgba(56,189,248,0.15);flex-shrink:0;transition:background 0.2s;';
          splitter.addEventListener('mouseenter', function () { splitter.style.background = 'rgba(56,189,248,0.4)'; });
          splitter.addEventListener('mouseleave', function () { if (!dragging) splitter.style.background = 'rgba(56,189,248,0.15)'; });

          var dragging = false;
          splitter.addEventListener('mousedown', function (e) {
            e.preventDefault();
            dragging = true;
            splitter.style.background = 'rgba(56,189,248,0.5)';
            var startY = e.clientY;
            var startH = logBox.offsetHeight;
            function onMove(ev) {
              var diff = startY - ev.clientY;
              var newH = Math.max(80, Math.min(window.innerHeight * 0.7, startH + diff));
              logBox.style.flex = 'none';
              logBox.style.height = newH + 'px';
            }
            function onUp() {
              dragging = false;
              splitter.style.background = 'rgba(56,189,248,0.15)';
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });

          overlay.appendChild(splitter);
          overlay.appendChild(logBox);
          logBox.style.cssText = 'flex:1;min-height:80px;overflow:hidden;padding:10px 16px;background:rgba(10,10,20,0.95);display:flex;flex-direction:column;';
          // Make the result div fill the logBox
          var resultDiv = logBox.querySelector('#ADV_SHELL_RESULT');
          if (resultDiv) resultDiv.style.cssText = 'flex:1;min-height:0;overflow-y:auto;background:var(--input-bg, #0d0d1a);border:1px solid var(--border-color, #333);border-radius:6px;padding:8px 10px;font-family:monospace;font-size:11px;white-space:pre-wrap;color:var(--text-muted, #aaa);';
        }

        document.body.appendChild(overlay);

        // Proxy overlay buttons to real ones
        document.getElementById('QS_OV_LOAD').addEventListener('click', function () {
          document.getElementById('ADV_SHELL_LOAD_BTN').click();
        });
        document.getElementById('QS_OV_SAVE').addEventListener('click', function () {
          document.getElementById('ADV_SHELL_SAVE_BTN').click();
        });
        document.getElementById('QS_OV_RUN').addEventListener('click', function () {
          document.getElementById('ADV_SHELL_BTN').click();
        });
        document.getElementById('QS_OV_RESTORE').addEventListener('click', function () {
          doRestore();
        });

        if (infoCard) infoCard.style.display = 'none';
        if (actionsBar) actionsBar.style.display = 'none';
        btn.textContent = '⊗';
        btn.title = 'Restore editor';
      } else {
        doRestore();
      }
    });
  }

  function bindButtons() {
    var runBtn = document.getElementById('ADV_SHELL_BTN');
    var loadBtn = document.getElementById('ADV_SHELL_LOAD_BTN');
    var saveBtn = document.getElementById('ADV_SHELL_SAVE_BTN');
    var editor = document.getElementById('ADV_SHELL_EDITOR');
    var logBox = document.getElementById('ADV_SHELL_LOG');
    var result = document.getElementById('ADV_SHELL_RESULT');

    function showOutput(html) {
      if (result) result.innerHTML = html;
    }

    function setButtonsDisabled(disabled) {
      [runBtn, loadBtn, saveBtn].forEach(function (b) {
        if (b) { b.disabled = disabled; b.style.opacity = disabled ? '0.5' : ''; }
      });
    }

    async function saveScript() {
      var content = editor ? editor.value : '';
      if (!content.trim()) {
        showOutput('<span style="color:#fbbf24">⚠ Script is empty</span>');
        return false;
      }
      var file = new File([content], 'quick_shell.sh', { type: 'text/plain' });
      var saved = await saveConfig(file, '/sdcard/quick_shell.sh');
      if (!saved) {
        showOutput('<span style="color:#f87171">Failed to save script to device</span>');
        return false;
      }
      return true;
    }

    // Load current script from device
    if (loadBtn) loadBtn.addEventListener('click', async function () {
      setButtonsDisabled(true);
      showOutput('<span style="opacity:0.6">⏳ Loading script...</span>');
      try {
        var res = await runShellWithRoot('timeout 5s cat /sdcard/quick_shell.sh');
        if (res.success && res.content) {
          if (editor) editor.value = res.content;
          showOutput('<span style="color:#4ade80">✓ Script loaded from device</span>');
        } else {
          if (editor) editor.value = '#!/system/bin/sh\n# quick_shell.sh not found on device\nsync\n';
          showOutput('<span style="color:#fbbf24">⚠ No script found at /sdcard/quick_shell.sh</span>');
        }
      } catch (e) {
        showOutput('<span style="color:#f87171">' + escapeHtml(e.message || 'Failed to load') + '</span>');
      } finally {
        setButtonsDisabled(false);
      }
    });

    // Save only
    if (saveBtn) saveBtn.addEventListener('click', async function () {
      setButtonsDisabled(true);
      showOutput('<span style="opacity:0.6">⏳ Saving script...</span>');
      try {
        var ok = await saveScript();
        if (ok) showOutput('<span style="color:#4ade80">✓ Script saved to /sdcard/quick_shell.sh</span>');
      } catch (e) {
        showOutput('<span style="color:#f87171">' + escapeHtml(e.message || 'Save failed') + '</span>');
      } finally {
        setButtonsDisabled(false);
      }
    });

    // Save & Run
    if (runBtn) runBtn.addEventListener('click', async function () {
      setButtonsDisabled(true);
      showOutput('<span style="opacity:0.6">⏳ Saving script...</span>');
      try {
        var ok = await saveScript();
        if (!ok) { setButtonsDisabled(false); return; }
        showOutput('<span style="opacity:0.6">⏳ Running quick_shell.sh...</span>');
        var adbOk = await adbKeepAlive();
        if (!adbOk) {
          showOutput('<span style="color:#f87171">ADB not connected. Please initialize ADB first.</span>');
          setButtonsDisabled(false);
          return;
        }
        var resp = await fetch(KANO_baseURL + '/quick_shell', { headers: common_headers || {} });
        var data = await resp.json();
        if (data && data.error) {
          showOutput('<span style="color:#f87171">' + escapeHtml(data.error) + '</span>');
        } else if (data && data.result) {
          showOutput('<pre>' + escapeHtml(data.result) + '</pre>');
        } else {
          showOutput('<span style="color:#f87171">No response from device</span>');
        }
      } catch (e) {
        showOutput('<span style="color:#f87171">' + escapeHtml(e.message || 'Error') + '</span>');
      } finally {
        setButtonsDisabled(false);
      }
    });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
