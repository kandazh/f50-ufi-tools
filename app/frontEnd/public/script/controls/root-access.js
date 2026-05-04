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

  var rootToggle, coreToggleSw, bigCoreToggleSw, usbDebugToggle, netAdbToggle;

  function initToggles() {
    rootToggle = createToggle('ADV_ROOT_TOGGLE', function () { handleRootToggle(); });
    coreToggleSw = createToggle('ADV_CORE_TOGGLE', function (on) { handleCoreToggle('little', on); });
    bigCoreToggleSw = createToggle('ADV_BIG_CORE_TOGGLE', function (on) { handleCoreToggle('big', on); });
    usbDebugToggle = createToggle('ADV_USB_DEBUG_TOGGLE', function (on) { handleUsbDebugToggle(on); });
    netAdbToggle = createToggle('ADV_NET_ADB_TOGGLE', function (on) { handleNetAdbToggle(on); });
    checkAdbStatus();
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
    if (coreToggleSw) coreToggleSw.enable();
    if (bigCoreToggleSw) bigCoreToggleSw.enable();
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

    // Gate: require USB Debug + Network ADB before enabling root
    if (!advEnabled) {
      try {
        var usbRes = await getData(new URLSearchParams({ cmd: 'usb_port_switch' }));
        var usbOn = usbRes.usb_port_switch === '1';
        var netRes = await (await fetchWithTimeout(HOTBOX_baseURL + '/adb_wifi_setting', {
          method: 'GET', headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' })
        }, 3000)).json();
        var netOn = netRes.enabled === 'true' || netRes.enabled === true;
        if (!usbOn || !netOn) {
          showCtrlToast('Enable USB Debugging and Network ADB first', 'error');
          rootToggle.set(false);
          return;
        }
      } catch (e) {
        showCtrlToast('Could not verify ADB status', 'error');
        rootToggle.set(false);
        return;
      }
    }

    rootToggle.disable();
    result.innerHTML = '';
    if (logBox) logBox.open = true;

    if (!advEnabled) {
      indicator.className = 'ctrl-adv-indicator pending';
      var steps = [
        { label: 'Enabling Samba service...', fn: enableSamba },
        { label: 'Installing advanced tools...', fn: installAdvanced },
        { label: 'Verifying configuration (may take up to 2 min)...', fn: verifyAdvanced }
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
    var resp = await fetch(HOTBOX_baseURL + '/smbPath?enable=1', { headers: common_headers || {} });
    var data = await resp.json();
    if (data.error) throw new Error(translateResponse(data.error));
    return translateResponse(data.result) || 'Installed';
  }

  async function verifyAdvanced() {
    // Samba hook needs time to take effect — retry up to 40 times with 3s delays (~2 min)
    for (var attempt = 1; attempt <= 40; attempt++) {
      var res = await checkAdvancedFunc();
      if (res) return 'Verified: root shell active (attempt ' + attempt + ')';
      if (attempt < 40) {
        await new Promise(function (r) { setTimeout(r, 3000); });
      }
    }
    throw new Error('Verification failed — advanced not detected after 2 minutes. Try rebooting the device.');
  }

  async function uninstallAdvanced() {
    var resp = await fetch(HOTBOX_baseURL + '/smbPath?enable=0', { headers: common_headers || {} });
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
    // Big cores: query via goform (no root needed)
    try {
      var perfData = await getData(new URLSearchParams({ cmd: 'performance_mode' }));
      bigCoresEnabled = perfData.performance_mode === '1';
    } catch (e) {}

    // Little cores: requires root to read sysfs
    if (!advEnabled) {
      littleCoresEnabled = null;
      updateCoreUI();
      var status = [];
      status.push('<span style="opacity:0.6">⏸ CPU1–CPU3 | Requires root to check</span>');
      status.push(bigCoresEnabled ? '✅ CPU4–CPU7 | Online' : '⏸ CPU4–CPU7 | Offline');
      if (coreResult) coreResult.innerHTML = status.join('<br>');
      return;
    }
    try {
      var res1 = await runShellWithRoot('cat /sys/devices/system/cpu/cpu1/online');
      if (res1.success) {
        littleCoresEnabled = res1.content.trim() !== '0';
      }
    } catch (e) {}
    updateCoreUI();
    var status = [];
    status.push(littleCoresEnabled ? '✅ CPU1–CPU3 | Online' : '⏸ CPU1–CPU3 | Offline');
    status.push(bigCoresEnabled ? '✅ CPU4–CPU7 | Online' : '⏸ CPU4–CPU7 | Offline');
    if (coreResult) coreResult.innerHTML = '<span style="opacity:0.6">' + status.join('<br>') + '</span>';
  }

  /* --- System tool buttons --- */
  function bindSystemButtons() {
    bindBtn('ADV_EDIT_BOOT_BTN', function () { handleEditBootScriptModal(); });
    bindBtn('ADV_DUMP_BOOT_BTN', function () { return getBoot(); });
    bindBtn('ADV_UNINSTALL_ROOT_BTN', function () { handleUninstallRoot(); });

    // Get indicator/result elements
    coreIndicator = document.getElementById('ADV_CORE_INDICATOR');
    bigCoreIndicator = document.getElementById('ADV_BIG_CORE_INDICATOR');
    coreResult = document.getElementById('ADV_CORE_RESULT');
    coreLogBox = document.getElementById('ADV_CORE_LOG_BOX');
  }

  async function handleUninstallRoot() {
    var indicator = document.getElementById('ADV_INDICATOR');
    var result = document.getElementById('ADV_RESULT');
    var logBox = document.getElementById('ADV_LOG_BOX');
    if (rootToggle) rootToggle.disable();
    if (indicator) indicator.className = 'ctrl-adv-indicator pending';
    if (result) result.innerHTML = '';
    if (logBox) logBox.open = true;
    appendStep(result, 'Removing advanced configuration...', 'running');
    try {
      var res = await uninstallAdvanced();
      updateLastStep(result, 'ok', res);
    } catch (e) {
      updateLastStep(result, 'fail', e.message || 'Failed');
    }
    appendStep(result, 'Verifying removal...', 'running');
    try {
      var v = await verifyRemoved();
      updateLastStep(result, 'ok', v);
    } catch (e) {
      updateLastStep(result, 'fail', e.message || 'Failed');
    }
    appendStep(result, '🔴 Root access removed. Reboot to apply.', 'done');
    await checkStatus();
    if (checkCoreStatus) checkCoreStatus();
    if (rootToggle) rootToggle.enable();
  }

  async function handleCoreToggle(type, wantEnabled) {
    var isLittle = (type === 'little');

    // Little cores require root
    if (isLittle && !advEnabled) {
      showCtrlToast('Root access required for little core control', 'error');
      if (coreToggleSw) coreToggleSw.set(!wantEnabled);
      return;
    }

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
      if (isLittle) {
        // Little cores: sysfs via root shell
        var cores = ['cpu1', 'cpu2', 'cpu3'];
        var shell = cores.map(function (c) { return 'echo ' + (wantEnabled ? '1' : '0') + ' > /sys/devices/system/cpu/' + c + '/online'; }).join('; ');
        await runShellWithRoot(shell);
        // Verify
        if (coreResult) coreResult.innerHTML = 'Verifying...';
        var verify = await runShellWithRoot('cat /sys/devices/system/cpu/cpu1/online');
        var actualState = verify.success ? verify.content.trim() !== '0' : wantEnabled;
        littleCoresEnabled = actualState;
      } else {
        // Big cores: use PERFORMANCE_MODE_SETTING (no root needed)
        var cookie = await login();
        if (!cookie) { throw new Error('Login failed'); }
        var result = await (await postData(cookie, { goformId: 'PERFORMANCE_MODE_SETTING', performance_mode: wantEnabled ? '1' : '0' })).json();
        if (result.result === '3' || result.result === 'failure') {
          throw new Error('Goform rejected: ' + JSON.stringify(result));
        }
        // Verify via getData
        if (coreResult) coreResult.innerHTML = 'Verifying...';
        var perfData = await getData(new URLSearchParams({ cmd: 'performance_mode' }));
        var actualState = perfData.performance_mode === '1';
        bigCoresEnabled = actualState;
      }
      updateCoreUI();
      var finalState = isLittle ? littleCoresEnabled : bigCoresEnabled;
      if (coreResult) coreResult.innerHTML = finalState ? '✅ ' + label + ' | Online • Verified' : '⏸ ' + label + ' | Offline • Verified';
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

  /* --- ADB Controls --- */
  async function disableRootIfActive() {
    if (!advEnabled) return;
    var indicator = document.getElementById('ADV_INDICATOR');
    var result = document.getElementById('ADV_RESULT');
    var logBox = document.getElementById('ADV_LOG_BOX');
    if (indicator) indicator.className = 'ctrl-adv-indicator pending';
    if (result) result.innerHTML = '';
    if (logBox) logBox.open = true;
    try {
      if (result) appendStep(result, 'ADB dependency lost — disabling root...', 'running');
      await uninstallAdvanced();
      if (result) updateLastStep(result, 'ok', 'Removed');
      if (result) appendStep(result, '🔴 Root access removed (ADB turned off)', 'done');
    } catch (e) {
      if (result) updateLastStep(result, 'fail', e.message || 'Failed');
    }
    await checkStatus();
    if (checkCoreStatus) checkCoreStatus();
    if (rootToggle) rootToggle.set(false);
  }

  async function checkAdbStatus() {
    var usbIndicator = document.getElementById('ADV_USB_DEBUG_INDICATOR');
    var netIndicator = document.getElementById('ADV_NET_ADB_INDICATOR');
    // Fresh query for USB debug state
    try {
      var res = await getData(new URLSearchParams({ cmd: 'usb_port_switch' }));
      var usbOn = res.usb_port_switch === '1';
      if (usbDebugToggle) usbDebugToggle.set(usbOn);
      if (usbIndicator) usbIndicator.className = 'ctrl-adv-indicator' + (usbOn ? ' enabled' : '');
    } catch (e) {
      if (usbDebugToggle) usbDebugToggle.set(false);
      if (usbIndicator) usbIndicator.className = 'ctrl-adv-indicator';
    }
    // Fresh query for Network ADB state
    try {
      var netRes = await (await fetchWithTimeout(HOTBOX_baseURL + '/adb_wifi_setting', {
        method: 'GET', headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' })
      }, 3000)).json();
      var netOn = netRes.enabled === 'true' || netRes.enabled === true;
      if (netAdbToggle) netAdbToggle.set(netOn);
      if (netIndicator) netIndicator.className = 'ctrl-adv-indicator' + (netOn ? ' enabled' : '');
    } catch (e) {
      if (netAdbToggle) netAdbToggle.set(false);
      if (netIndicator) netIndicator.className = 'ctrl-adv-indicator';
    }
  }

  async function handleUsbDebugToggle(on) {
    var indicator = document.getElementById('ADV_USB_DEBUG_INDICATOR');
    var adbResult = document.getElementById('ADV_ADB_RESULT');
    var adbLogBox = document.getElementById('ADV_ADB_LOG_BOX');
    if (usbDebugToggle) usbDebugToggle.disable();
    if (adbResult) adbResult.innerHTML = '';
    if (adbLogBox) adbLogBox.open = true;
    appendStep(adbResult, (on ? 'Enabling' : 'Disabling') + ' USB Debugging...', 'running');
    try {
      var cookie = await login();
      if (!cookie) throw new Error('Login required');
      var result = await (await postData(cookie, { goformId: 'USB_PORT_SETTING', usb_port_switch: on ? '1' : '0' })).json();
      if (result.result === '3' || result.result === 'failure') throw new Error('Device rejected request');
      updateLastStep(adbResult, 'ok', 'Command sent');
      appendStep(adbResult, 'Verifying state...', 'running');
      var verify = await getData(new URLSearchParams({ cmd: 'usb_port_switch' }));
      var actualOn = verify.usb_port_switch === '1';
      if (usbDebugToggle) usbDebugToggle.set(actualOn);
      if (indicator) indicator.className = 'ctrl-adv-indicator' + (actualOn ? ' enabled' : '');
      if (actualOn === on) {
        updateLastStep(adbResult, 'ok', 'Confirmed ' + (actualOn ? 'ON' : 'OFF'));
      } else {
        updateLastStep(adbResult, 'fail', 'State mismatch — device reports ' + (actualOn ? 'ON' : 'OFF'));
        showCtrlToast('USB debug toggle did not take effect', 'error');
      }
      if (!actualOn) {
        // USB off = everything dependent is dead
        appendStep(adbResult, 'USB off — disabling Network ADB...', 'running');
        try {
          await (await fetchWithTimeout(HOTBOX_baseURL + '/adb_wifi_setting', {
            method: 'POST',
            headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({ enabled: false, password: HOTBOX_PASSWORD })
          })).json();
          updateLastStep(adbResult, 'ok', 'Network ADB disabled');
        } catch (e) {
          updateLastStep(adbResult, 'ok', 'Network ADB inactive (adbd stopped)');
        }
        if (netAdbToggle) netAdbToggle.set(false);
        var netInd = document.getElementById('ADV_NET_ADB_INDICATOR');
        if (netInd) netInd.className = 'ctrl-adv-indicator';
        await disableRootIfActive();
      }
    } catch (e) {
      updateLastStep(adbResult, 'fail', e.message || 'Failed');
      try {
        var cur = await getData(new URLSearchParams({ cmd: 'usb_port_switch' }));
        var curOn = cur.usb_port_switch === '1';
        if (usbDebugToggle) usbDebugToggle.set(curOn);
        if (indicator) indicator.className = 'ctrl-adv-indicator' + (curOn ? ' enabled' : '');
      } catch (e2) {
        if (usbDebugToggle) usbDebugToggle.set(!on);
      }
    }
    if (usbDebugToggle) usbDebugToggle.enable();
  }

  async function handleNetAdbToggle(on) {
    var indicator = document.getElementById('ADV_NET_ADB_INDICATOR');
    var adbResult = document.getElementById('ADV_ADB_RESULT');
    var adbLogBox = document.getElementById('ADV_ADB_LOG_BOX');
    if (netAdbToggle) netAdbToggle.disable();
    if (adbResult) adbResult.innerHTML = '';
    if (adbLogBox) adbLogBox.open = true;
    try {
      if (on) {
        appendStep(adbResult, 'Ensuring USB Debugging is enabled...', 'running');
        var cookie = await login();
        if (!cookie) throw new Error('Login required');
        var usbRes = await (await postData(cookie, { goformId: 'USB_PORT_SETTING', usb_port_switch: '1' })).json();
        if (usbRes.result === '3' || usbRes.result === 'failure') throw new Error('Could not enable USB debug');
        var usbVerify = await getData(new URLSearchParams({ cmd: 'usb_port_switch' }));
        var usbActual = usbVerify.usb_port_switch === '1';
        if (usbDebugToggle) usbDebugToggle.set(usbActual);
        var usbInd = document.getElementById('ADV_USB_DEBUG_INDICATOR');
        if (usbInd) usbInd.className = 'ctrl-adv-indicator' + (usbActual ? ' enabled' : '');
        if (!usbActual) throw new Error('USB debug failed to enable');
        updateLastStep(adbResult, 'ok', 'USB Debug confirmed ON');
      }
      appendStep(adbResult, (on ? 'Enabling' : 'Disabling') + ' Network ADB...', 'running');
      await (await fetchWithTimeout(HOTBOX_baseURL + '/adb_wifi_setting', {
        method: 'POST',
        headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enabled: on, password: HOTBOX_PASSWORD })
      })).json();
      updateLastStep(adbResult, 'ok', 'Command sent');
      appendStep(adbResult, 'Polling for confirmation...', 'running');
      var confirmed = false;
      for (var attempt = 0; attempt < 10; attempt++) {
        await new Promise(function (r) { setTimeout(r, 1000); });
        try {
          var check = await (await fetchWithTimeout(HOTBOX_baseURL + '/adb_wifi_setting', {
            method: 'GET', headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' })
          }, 3000)).json();
          var actual = check.enabled === 'true' || check.enabled === true;
          if (actual === on) { confirmed = true; break; }
        } catch (e) {}
      }
      if (confirmed) {
        updateLastStep(adbResult, 'ok', 'Confirmed ' + (on ? 'ON' : 'OFF'));
      } else {
        updateLastStep(adbResult, 'fail', 'Timed out waiting for confirmation');
        showCtrlToast('Network ADB toggle did not confirm', 'error');
      }
      if (netAdbToggle) netAdbToggle.set(confirmed ? on : !on);
      if (indicator) indicator.className = 'ctrl-adv-indicator' + ((confirmed ? on : !on) ? ' enabled' : '');
      var finalState = confirmed ? on : !on;
      if (!finalState) await disableRootIfActive();
    } catch (e) {
      updateLastStep(adbResult, 'fail', e.message || 'Failed');
      try {
        var netCheck = await (await fetchWithTimeout(HOTBOX_baseURL + '/adb_wifi_setting', {
          method: 'GET', headers: Object.assign({}, common_headers, { 'Content-Type': 'application/json' })
        }, 3000)).json();
        var netActual = netCheck.enabled === 'true' || netCheck.enabled === true;
        if (netAdbToggle) netAdbToggle.set(netActual);
        if (indicator) indicator.className = 'ctrl-adv-indicator' + (netActual ? ' enabled' : '');
      } catch (e2) {
        if (netAdbToggle) netAdbToggle.set(!on);
      }
    }
    if (netAdbToggle) netAdbToggle.enable();
  }
})();
