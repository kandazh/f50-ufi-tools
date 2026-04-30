/**
 * Controls Tab — Root Access
 * Toggle root via Samba hook, status indicator, system tool buttons
 */
(function () {
  var loaded = false;

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab !== 'root_access') return;
    loadRootAccess();
  });

  var panel = document.querySelector('[data-ctrl-panel="root_access"]');
  if (panel && panel.style.display !== 'none') {
    setTimeout(loadRootAccess, 0);
  }

  function loadRootAccess() {
    if (loaded) return;
    loaded = true;
    initToggles();
    checkStatus().then(function () { if (checkCoreStatus) checkCoreStatus(); });
    bindSystemButtons();
  }

  /* --- Toggle factory (same pattern as advanced.js) --- */
  function createToggle(containerId, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return { get: function () { return false; }, set: function () {}, disable: function () {}, enable: function () {} };
    container.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-toggle off';
    btn.innerHTML = '<span class="ctrl-toggle-knob"></span>';
    var state = false;
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      state = !state;
      btn.className = 'ctrl-toggle ' + (state ? 'on' : 'off');
      if (onChange) onChange(state);
    });
    container.appendChild(btn);
    return {
      get: function () { return state; },
      set: function (v) {
        state = !!v;
        btn.className = 'ctrl-toggle ' + (state ? 'on' : 'off');
      },
      disable: function () { btn.disabled = true; btn.style.opacity = '0.5'; },
      enable: function () { btn.disabled = false; btn.style.opacity = ''; }
    };
  }

  var rootToggle, coreToggleSw, bigCoreToggleSw;

  function initToggles() {
    rootToggle = createToggle('ADV_ROOT_TOGGLE', function () { handleRootToggle(); });
    coreToggleSw = createToggle('ADV_CORE_TOGGLE', function (on) { handleCoreToggle('little', on); });
    bigCoreToggleSw = createToggle('ADV_BIG_CORE_TOGGLE', function (on) { handleCoreToggle('big', on); });
  }

  /* --- Status check --- */
  var advEnabled = false;
  var rootButtons = ['ADV_EDIT_BOOT_BTN', 'ADV_DUMP_BOOT_BTN'];

  async function checkStatus() {
    var indicator = document.getElementById('ADV_INDICATOR');
    var logBox = document.getElementById('ADV_LOG_BOX');
    var result = document.getElementById('ADV_RESULT');
    if (!indicator) return;
    try {
      var res = await checkAdvancedFunc();
      advEnabled = !!res;
      indicator.className = 'ctrl-adv-indicator' + (advEnabled ? ' enabled' : '');
      if (rootToggle) rootToggle.set(advEnabled);
    } catch (e) {
      advEnabled = false;
      indicator.className = 'ctrl-adv-indicator';
      if (rootToggle) rootToggle.set(false);
    }
    rootButtons.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = !advEnabled;
    });
    if (coreToggleSw) { if (advEnabled) coreToggleSw.enable(); else coreToggleSw.disable(); }
    if (bigCoreToggleSw) { if (advEnabled) bigCoreToggleSw.enable(); else bigCoreToggleSw.disable(); }
    if (logBox && result && !result.innerHTML) {
      logBox.style.display = '';
      result.innerHTML = '<span class="ctrl-adv-step-text" style="opacity:0.6">' +
        (advEnabled ? '✅ Root access active' : '⏸ Root access not enabled') + '</span>';
    }
  }

  /* --- Toggle --- */
  async function handleRootToggle() {
    var indicator = document.getElementById('ADV_INDICATOR');
    var result = document.getElementById('ADV_RESULT');
    var logBox = document.getElementById('ADV_LOG_BOX');
    if (!indicator || !result) return;
    rootToggle.disable();
    result.innerHTML = '';
    if (logBox) logBox.open = true;

    if (!advEnabled) {
      indicator.className = 'ctrl-adv-indicator pending';
      var steps = [
        { label: 'Enabling Samba service...', fn: enableSamba },
        { label: 'Installing advanced tools...', fn: installAdvanced },
        { label: 'Verifying configuration (may take up to 15s)...', fn: verifyAdvanced }
      ];
      var allOk = true;
      for (var i = 0; i < steps.length; i++) {
        appendStep(result, steps[i].label, 'running');
        try {
          var res = await steps[i].fn();
          updateLastStep(result, 'ok', res);
        } catch (e) {
          updateLastStep(result, 'fail', e.message || 'Failed');
          allOk = false;
          break;
        }
      }
      if (allOk) {
        appendStep(result, '✅ Root access enabled', 'done');
      } else {
        indicator.className = 'ctrl-adv-indicator error';
      }
    } else {
      indicator.className = 'ctrl-adv-indicator pending';
      var steps = [
        { label: 'Removing advanced configuration...', fn: uninstallAdvanced },
        { label: 'Verifying removal...', fn: verifyRemoved }
      ];
      var allOk = true;
      for (var i = 0; i < steps.length; i++) {
        appendStep(result, steps[i].label, 'running');
        try {
          var res = await steps[i].fn();
          updateLastStep(result, 'ok', res);
        } catch (e) {
          updateLastStep(result, 'fail', e.message || 'Failed');
          allOk = false;
          break;
        }
      }
      if (allOk) {
        appendStep(result, '🔴 Root access removed. Reboot to apply.', 'done');
      } else {
        indicator.className = 'ctrl-adv-indicator error';
      }
    }
    await checkStatus();
    checkCoreStatus();
    rootToggle.enable();
  }

  async function enableSamba() {
    var cookie = await login();
    if (!cookie) throw new Error('Login required');
    await postData(cookie, { goformId: 'SAMBA_SETTING', samba_switch: '1' });
    return 'Samba enabled';
  }

  // Translate known Chinese server responses
  function translateResponse(text) {
    if (!text) return text;
    var map = {
      'Success — please wait 1-2 minutes to take effect': 'Success — please wait 1-2 minutes to take effect',
      'Execution successful': 'Execution successful',
      'Enabled': 'Enabled',
      'Disabled': 'Disabled',
      'Operation successful': 'Operation successful',
      'Operation failed': 'Operation failed'
    };
    var result = text;
    Object.keys(map).forEach(function (k) { result = result.replace(k, map[k]); });
    // Strip any remaining Chinese with HTML tags
    result = result.replace(/<br>/gi, ' | ');
    return result;
  }

  async function installAdvanced() {
    var resp = await fetch(KANO_baseURL + '/smbPath?enable=1', { headers: common_headers || {} });
    var data = await resp.json();
    if (data.error) throw new Error(translateResponse(data.error));
    return translateResponse(data.result) || 'Installed';
  }

  async function verifyAdvanced() {
    // Samba hook needs time to take effect — retry up to 5 times with 3s delays
    for (var attempt = 1; attempt <= 5; attempt++) {
      var res = await checkAdvancedFunc();
      if (res) return 'Verified: root shell active';
      if (attempt < 5) {
        await new Promise(function (r) { setTimeout(r, 3000); });
      }
    }
    throw new Error('Verification failed — advanced not detected after retries. Try again in 1-2 minutes.');
  }

  async function uninstallAdvanced() {
    var resp = await fetch(KANO_baseURL + '/smbPath?enable=0', { headers: common_headers || {} });
    var data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.result || 'Removed';
  }

  async function verifyRemoved() {
    try {
      var res = await checkAdvancedFunc();
      if (res) return 'Still active (reboot required to fully disable)';
    } catch (e) {}
    return 'Config removed';
  }

  /* --- CPU Core Control --- */
  var coreIndicator, bigCoreIndicator, coreResult, coreLogBox;
  var littleCoresEnabled = null;
  var bigCoresEnabled = null;

  function updateCoreUI() {
    if (coreToggleSw) coreToggleSw.set(!!littleCoresEnabled);
    if (coreIndicator) {
      coreIndicator.classList.remove('enabled', 'pending');
      if (littleCoresEnabled) coreIndicator.classList.add('enabled');
    }
    if (bigCoreToggleSw) bigCoreToggleSw.set(!!bigCoresEnabled);
    if (bigCoreIndicator) {
      bigCoreIndicator.classList.remove('enabled', 'pending');
      if (bigCoresEnabled) bigCoreIndicator.classList.add('enabled');
    }
  }

  async function checkCoreStatus() {
    if (!advEnabled) {
      if (coreResult) coreResult.innerHTML = '<span style="opacity:0.6">⏸ Requires root access</span>';
      updateCoreUI();
      return;
    }
    try {
      var res1 = await runShellWithRoot('cat /sys/devices/system/cpu/cpu1/online');
      if (res1.success) {
        // Only treat as disabled if response is explicitly "0"
        littleCoresEnabled = res1.content.trim() !== '0';
      }
      var res2 = await runShellWithRoot('cat /sys/devices/system/cpu/cpu4/online');
      if (res2.success) {
        bigCoresEnabled = res2.content.trim() !== '0';
      }
      updateCoreUI();
      var status = [];
      status.push(littleCoresEnabled ? '✅ CPU1–CPU3 | Online' : '⏸ CPU1–CPU3 | Offline');
      status.push(bigCoresEnabled ? '✅ CPU4–CPU7 | Online' : '⏸ CPU4–CPU7 | Offline');
      if (coreResult) coreResult.innerHTML = '<span style="opacity:0.6">' + status.join('<br>') + '</span>';
    } catch (e) {}
  }

  /* --- System tool buttons --- */
  function bindSystemButtons() {
    bindBtn('ADV_EDIT_BOOT_BTN', function () { handleEditBootScriptModal(); });
    bindBtn('ADV_DUMP_BOOT_BTN', function () { return getBoot(); });

    // Get indicator/result elements
    coreIndicator = document.getElementById('ADV_CORE_INDICATOR');
    bigCoreIndicator = document.getElementById('ADV_BIG_CORE_INDICATOR');
    coreResult = document.getElementById('ADV_CORE_RESULT');
    coreLogBox = document.getElementById('ADV_CORE_LOG_BOX');
  }

  async function handleCoreToggle(type, wantEnabled) {
    if (!advEnabled) return;
    var isLittle = (type === 'little');
    // Safety: can't disable if the other group is also disabled
    if (!wantEnabled) {
      if (isLittle && bigCoresEnabled === false) {
        if (coreResult) coreResult.innerHTML = '⚠️ Blocked | CPU4–CPU7 are offline • At least one core group must remain active';
        if (coreLogBox) coreLogBox.open = true;
        if (coreToggleSw) coreToggleSw.set(true);
        return;
      }
      if (!isLittle && littleCoresEnabled === false) {
        if (coreResult) coreResult.innerHTML = '⚠️ Blocked | CPU1–CPU3 are offline • At least one core group must remain active';
        if (coreLogBox) coreLogBox.open = true;
        if (bigCoreToggleSw) bigCoreToggleSw.set(true);
        return;
      }
    }
    var toggleSw = isLittle ? coreToggleSw : bigCoreToggleSw;
    var indicator = isLittle ? coreIndicator : bigCoreIndicator;
    if (toggleSw) toggleSw.disable();
    if (indicator) { indicator.classList.remove('enabled'); indicator.classList.add('pending'); }
    var label = isLittle ? 'CPU1–CPU3' : 'CPU4–CPU7';
    if (coreResult) coreResult.innerHTML = wantEnabled ? '⏳ Enabling ' + label + '...' : '⏳ Disabling ' + label + '...';
    if (coreLogBox) coreLogBox.open = true;
    try {
      var cores = isLittle ? ['cpu1', 'cpu2', 'cpu3'] : ['cpu4', 'cpu5', 'cpu6', 'cpu7'];
      var shell = cores.map(function (c) { return 'echo ' + (wantEnabled ? '1' : '0') + ' > /sys/devices/system/cpu/' + c + '/online'; }).join('; ');
      await runShellWithRoot(shell);
      // Verify
      if (coreResult) coreResult.innerHTML = 'Verifying...';
      var verifyCore = isLittle ? 'cpu1' : 'cpu4';
      var verify = await runShellWithRoot('cat /sys/devices/system/cpu/' + verifyCore + '/online');
      var actualState = verify.success ? verify.content.trim() !== '0' : wantEnabled;
      if (isLittle) littleCoresEnabled = actualState;
      else bigCoresEnabled = actualState;
      updateCoreUI();
      if (coreResult) coreResult.innerHTML = actualState ? '✅ ' + label + ' | Online • Verified' : '⏸ ' + label + ' | Offline • Verified';
    } catch (e) {
      if (coreResult) coreResult.innerHTML = 'Error: ' + e.message;
      if (indicator) indicator.classList.remove('pending');
      updateCoreUI();
    }
    if (toggleSw) toggleSw.enable();
  }

  function bindBtn(id, fn) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      var result = document.getElementById('ADV_RESULT');
      var logBox = document.getElementById('ADV_LOG_BOX');
      try {
        var res = await fn();
        if (res && res.content && result) {
          result.innerHTML = '<pre>' + escapeHtml(res.content) + '</pre>';
          if (logBox) logBox.open = true;
        }
        checkStatus();
      } catch (e) {
        if (result) {
          result.innerHTML = '<span style="color:#f87171">' + escapeHtml(e.message || 'Error') + '</span>';
          if (logBox) logBox.open = true;
        }
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  }

  /* --- Helpers --- */
  function appendStep(container, text, state) {
    var div = document.createElement('div');
    div.className = 'ctrl-adv-step';
    var icon = state === 'running' ? '<span class="ctrl-adv-step-icon spinning">⏳</span>'
      : state === 'done' ? ''
      : '<span class="ctrl-adv-step-icon">⏳</span>';
    div.innerHTML = icon + '<span class="ctrl-adv-step-text">' + text + '</span>';
    container.appendChild(div);
  }

  function updateLastStep(container, state, detail) {
    var steps = container.querySelectorAll('.ctrl-adv-step');
    var last = steps[steps.length - 1];
    if (!last) return;
    var icon = last.querySelector('.ctrl-adv-step-icon');
    if (icon) {
      icon.classList.remove('spinning');
      if (state === 'ok') {
        icon.textContent = '✓';
        icon.className = 'ctrl-adv-step-icon ok';
      } else {
        icon.textContent = '✕';
        icon.className = 'ctrl-adv-step-icon fail';
      }
    }
    if (detail) {
      var detailEl = document.createElement('span');
      detailEl.className = 'ctrl-adv-step-detail';
      detailEl.textContent = ' — ' + detail;
      last.appendChild(detailEl);
    }
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
