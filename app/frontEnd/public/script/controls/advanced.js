/**
 * Controls Tab — Advanced Features
 * System tools (root shell ops) + Router settings (NAT, UPnP, DMZ, Security,
 * Port Forwarding, FOTA, Device Options)
 */
(function () {
  var loaded = false;

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab !== 'advanced') return;
    loadAdvanced();
  });

  // Also init if panel is already visible (e.g. localStorage restored tab)
  var panel = document.querySelector('[data-ctrl-panel="advanced"]');
  if (panel && panel.style.display !== 'none') {
    setTimeout(loadAdvanced, 0);
  }

  function loadAdvanced() {
    if (loaded) return;
    loaded = true;
    checkStatus();
    initSwitches();
    loadRouterSettings();
    loadPortForwardRules();
    loadFotaSettings();
    loadDeviceOptions();
    bindSystemButtons();
    bindSaveButton();
    bindPortForwardAdd();
  }

  /* --- Status check --- */
  var advEnabled = false;
  var rootButtons = ['ADV_DISABLE_FOTA_BTN', 'ADV_EDIT_BOOT_BTN', 'ADV_DISABLE_CORE_BTN', 'ADV_ENABLE_CORE_BTN', 'ADV_DUMP_BOOT_BTN'];

  async function checkStatus() {
    var indicator = document.getElementById('ADV_INDICATOR');
    var toggle = document.getElementById('ADV_ROOT_TOGGLE');
    var logBox = document.getElementById('ADV_LOG_BOX');
    var result = document.getElementById('ADV_RESULT');
    if (!indicator || !toggle) return;
    try {
      var res = await checkAdvancedFunc();
      advEnabled = !!res;
      indicator.className = 'ctrl-adv-indicator' + (advEnabled ? ' enabled' : '');
      toggle.className = 'ctrl-adv-toggle-btn' + (advEnabled ? ' on' : '');
    } catch (e) {
      advEnabled = false;
      indicator.className = 'ctrl-adv-indicator';
      toggle.className = 'ctrl-adv-toggle-btn';
    }
    // Enable/disable root-dependent buttons
    rootButtons.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = !advEnabled;
    });
    // Show log box with status if no active log content
    if (logBox && result && !result.innerHTML) {
      logBox.style.display = '';
      result.innerHTML = '<span class="ctrl-adv-step-text" style="opacity:0.6">' +
        (advEnabled ? '✅ Root access active' : '⏸ Root access not enabled') + '</span>';
    }
  }

  /* --- Toggle switches --- */
  var switches = {};

  function initSwitches() {
    switches.upnp = createToggle('ADV_UPNP_SWITCH');
    switches.dmz = createToggle('ADV_DMZ_SWITCH', function (on) {
      var field = document.getElementById('ADV_DMZ_IP_FIELD');
      if (field) field.style.display = on ? '' : 'none';
    });
    switches.remote = createToggle('ADV_REMOTE_SWITCH');
    switches.wanPing = createToggle('ADV_WANPING_SWITCH');
    switches.fota = createToggle('ADV_FOTA_SWITCH', function (on) {
      var field = document.getElementById('ADV_FOTA_INTERVAL_FIELD');
      if (field) field.style.display = on ? '' : 'none';
    });
    switches.fotaRoam = createToggle('ADV_FOTA_ROAM_SWITCH');
    switches.light = createToggle('ADV_LIGHT_SWITCH');
    switches.perf = createToggle('ADV_PERF_SWITCH');
  }

  function createToggle(containerId, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return { get: function () { return false; }, set: function () {} };
    container.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-toggle off';
    btn.innerHTML = '<span class="ctrl-toggle-knob"></span>';
    var state = false;
    btn.addEventListener('click', function () {
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
        if (onChange) onChange(state);
      }
    };
  }

  /* --- Load router settings (NAT, UPnP, DMZ, Security) --- */
  async function loadRouterSettings() {
    try {
      var data = await getData(new URLSearchParams({
        cmd: 'nat_mode,upnpEnabled,DMZEnable,DMZIPAddress,RemoteManagement,WANPingFilter',
        multi_data: '1'
      }));
      if (!data) return;

      var natSel = document.getElementById('ADV_NAT_MODE');
      if (natSel && data.nat_mode !== undefined) natSel.value = data.nat_mode;
      if (switches.upnp) switches.upnp.set(data.upnpEnabled === '1');
      if (switches.dmz) switches.dmz.set(data.DMZEnable === '1');
      var dmzIp = document.getElementById('ADV_DMZ_IP');
      if (dmzIp && data.DMZIPAddress) dmzIp.value = data.DMZIPAddress;
      if (switches.remote) switches.remote.set(data.RemoteManagement === '1');
      if (switches.wanPing) switches.wanPing.set(data.WANPingFilter === '1');
    } catch (e) {
      console.warn('[Advanced] Failed to load router settings:', e);
    }
  }

  /* --- Port Forwarding --- */
  var pfRules = [];

  async function loadPortForwardRules() {
    try {
      var data = await getData(new URLSearchParams({
        cmd: 'portForwardRules,portForwardRulesCount',
        multi_data: '1'
      }));
      if (!data) return;
      pfRules = parsePortForwardRules(data.portForwardRules || '');
      renderPortForwardTable();
    } catch (e) {
      console.warn('[Advanced] Failed to load port forward rules:', e);
    }
  }

  function parsePortForwardRules(str) {
    if (!str || !str.trim()) return [];
    // ZTE format: "ip,portStart,portEnd,protocol;ip2,portStart2,portEnd2,protocol2"
    return str.split(';').filter(Boolean).map(function (rule) {
      var parts = rule.split(',');
      return { ip: parts[0], portStart: parts[1], portEnd: parts[2], proto: parts[3] || 'TCP' };
    });
  }

  function renderPortForwardTable() {
    var tbody = document.getElementById('ADV_PF_TBODY');
    var empty = document.getElementById('ADV_PF_EMPTY');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (pfRules.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    pfRules.forEach(function (rule, idx) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(rule.ip) + '</td>' +
        '<td>' + escapeHtml(rule.portStart) + '</td>' +
        '<td>' + escapeHtml(rule.portEnd) + '</td>' +
        '<td>' + escapeHtml(rule.proto) + '</td>' +
        '<td><button type="button" class="pf-del-btn" data-idx="' + idx + '">✕</button></td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.pf-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deletePortForwardRule(parseInt(btn.dataset.idx));
      });
    });
  }

  function bindPortForwardAdd() {
    var btn = document.getElementById('ADV_PF_ADD_BTN');
    if (!btn) return;
    btn.addEventListener('click', function () { addPortForwardRule(); });
  }

  async function addPortForwardRule() {
    var ip = document.getElementById('ADV_PF_IP');
    var portStart = document.getElementById('ADV_PF_PORT_START');
    var portEnd = document.getElementById('ADV_PF_PORT_END');
    var proto = document.getElementById('ADV_PF_PROTO');
    if (!ip || !portStart || !proto) return;

    var ipVal = ip.value.trim();
    var startVal = portStart.value.trim();
    var endVal = (portEnd && portEnd.value.trim()) || startVal;

    if (!ipVal || !startVal) {
      createToast('IP and port are required', 'red');
      return;
    }
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipVal)) {
      createToast('Invalid IP address', 'red');
      return;
    }
    var s = parseInt(startVal), e = parseInt(endVal);
    if (s < 1 || s > 65535 || e < 1 || e > 65535 || e < s) {
      createToast('Invalid port range', 'red');
      return;
    }

    try {
      var cookie = await login();
      if (!cookie) { createToast('Please login first', 'red'); return; }
      await postData(cookie, {
        goformId: 'ADD_PORT_FORWARD_RULE',
        portForwardIP: ipVal,
        portForwardPortStart: startVal,
        portForwardPortEnd: endVal,
        portForwardProtocol: proto.value
      });
      ip.value = '';
      portStart.value = '';
      if (portEnd) portEnd.value = '';
      createToast('Rule added', 'green');
      loadPortForwardRules();
    } catch (err) {
      createToast('Failed to add rule: ' + err.message, 'red');
    }
  }

  async function deletePortForwardRule(idx) {
    try {
      var cookie = await login();
      if (!cookie) { createToast('Please login first', 'red'); return; }
      await postData(cookie, {
        goformId: 'DEL_PORT_FORWARD_RULE',
        id: idx.toString()
      });
      createToast('Rule deleted', 'green');
      loadPortForwardRules();
    } catch (err) {
      createToast('Failed to delete rule: ' + err.message, 'red');
    }
  }

  /* --- FOTA / OTA Settings --- */
  async function loadFotaSettings() {
    try {
      var data = await getData(new URLSearchParams({
        cmd: 'UpgMode,UpgIntervalDay,UpgRoamPermission',
        multi_data: '1'
      }));
      if (!data) return;
      if (switches.fota) switches.fota.set(data.UpgMode === '1');
      var interval = document.getElementById('ADV_FOTA_INTERVAL');
      if (interval && data.UpgIntervalDay) interval.value = data.UpgIntervalDay;
      if (switches.fotaRoam) switches.fotaRoam.set(data.UpgRoamPermission === '1');
    } catch (e) {
      console.warn('[Advanced] Failed to load FOTA settings:', e);
    }
  }

  /* --- Device Options (Indicator Light, Performance Mode) --- */
  async function loadDeviceOptions() {
    try {
      var data = await getData(new URLSearchParams({
        cmd: 'indicator_light_switch,performance_mode',
        multi_data: '1'
      }));
      if (!data) return;
      if (switches.light) switches.light.set(data.indicator_light_switch === '1');
      if (switches.perf) switches.perf.set(data.performance_mode === '1');
    } catch (e) {
      console.warn('[Advanced] Failed to load device options:', e);
    }
  }

  /* --- Save all router settings --- */
  function bindSaveButton() {
    var btn = document.getElementById('ADV_SAVE_BTN');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        var cookie = await login();
        if (!cookie) { createToast('Please login first', 'red'); return; }

        // NAT
        var natSel = document.getElementById('ADV_NAT_MODE');
        await postData(cookie, {
          goformId: 'NAT_SETTING',
          nat_mode: natSel ? natSel.value : '0'
        });

        // UPnP
        await postData(cookie, {
          goformId: 'UPNP_SETTING',
          upnpEnabled: switches.upnp.get() ? '1' : '0'
        });

        // DMZ
        var dmzIp = document.getElementById('ADV_DMZ_IP');
        await postData(cookie, {
          goformId: 'DMZ_SETTING',
          DMZEnable: switches.dmz.get() ? '1' : '0',
          DMZIPAddress: dmzIp ? dmzIp.value : ''
        });

        // Security
        await postData(cookie, {
          goformId: 'FW_SYS',
          RemoteManagement: switches.remote.get() ? '1' : '0',
          WANPingFilter: switches.wanPing.get() ? '1' : '0'
        });

        // FOTA
        var interval = document.getElementById('ADV_FOTA_INTERVAL');
        await postData(cookie, {
          goformId: 'SetUpgAutoSetting',
          UpgMode: switches.fota.get() ? '1' : '0',
          UpgIntervalDay: interval ? interval.value : '7',
          UpgRoamPermission: switches.fotaRoam.get() ? '1' : '0'
        });

        // Indicator Light
        await postData(cookie, {
          goformId: 'INDICATOR_LIGHT_SETTING',
          indicator_light_switch: switches.light.get() ? '1' : '0'
        });

        // Performance Mode
        await postData(cookie, {
          goformId: 'PERFORMANCE_MODE_SETTING',
          performance_mode: switches.perf.get() ? '1' : '0'
        });

        createToast('Settings saved', 'green');
      } catch (e) {
        createToast('Save failed: ' + e.message, 'red');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    });
  }

  /* --- System tool buttons --- */
  function bindSystemButtons() {
    // Root access toggle
    var toggle = document.getElementById('ADV_ROOT_TOGGLE');
    if (toggle) toggle.addEventListener('click', function () { handleRootToggle(toggle); });

    bindBtn('ADV_DISABLE_FOTA_BTN', function () { return handleDisableFOTA(); });
    bindBtn('ADV_EDIT_BOOT_BTN', function () { handleEditBootScriptModal(); });
    bindShellBtn();
    bindBtn('ADV_DISABLE_CORE_BTN', function () { return switchCpuCore(false); });
    bindBtn('ADV_ENABLE_CORE_BTN', function () { return switchCpuCore(true); });
    bindBtn('ADV_DUMP_BOOT_BTN', function () { return getBoot(); });
  }

  /* --- Root Access Toggle Handler --- */
  async function handleRootToggle(toggle) {
    var indicator = document.getElementById('ADV_INDICATOR');
    var result = document.getElementById('ADV_RESULT');
    var logBox = document.getElementById('ADV_LOG_BOX');
    if (!indicator || !result) return;
    toggle.disabled = true;
    result.innerHTML = '';
    if (logBox) logBox.open = true;

    if (!advEnabled) {
      // Enable flow
      indicator.className = 'ctrl-adv-indicator pending';
      var steps = [
        { label: 'Enabling Samba service...', fn: enableSamba },
        { label: 'Installing advanced tools...', fn: installAdvanced },
        { label: 'Verifying configuration...', fn: verifyAdvanced }
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
      // Disable flow
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
    toggle.disabled = false;
  }

  async function enableSamba() {
    var cookie = await login();
    if (!cookie) throw new Error('Login required');
    await postData(cookie, { goformId: 'SAMBA_SETTING', samba_switch: '1' });
    return 'Samba enabled';
  }

  async function installAdvanced() {
    var resp = await fetch(KANO_baseURL + '/smbPath?enable=1', {
      headers: common_headers || {}
    });
    var data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data.result || 'Installed';
  }

  async function verifyAdvanced() {
    var res = await checkAdvancedFunc();
    if (!res) throw new Error('Verification failed — advanced not detected');
    return 'Verified: root shell active';
  }

  async function uninstallAdvanced() {
    var resp = await fetch(KANO_baseURL + '/smbPath?enable=0', {
      headers: common_headers || {}
    });
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

  /* --- Step rendering helpers --- */
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

  function bindShellBtn() {
    var runBtn = document.getElementById('ADV_SHELL_BTN');
    var loadBtn = document.getElementById('ADV_SHELL_LOAD_BTN');
    var saveBtn = document.getElementById('ADV_SHELL_SAVE_BTN');
    var editor = document.getElementById('ADV_SHELL_EDITOR');
    var logBox = document.getElementById('ADV_SHELL_LOG');
    var result = document.getElementById('ADV_SHELL_RESULT');

    function showOutput(html) {
      if (result) result.innerHTML = html;
      if (logBox) logBox.open = true;
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

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
})();
