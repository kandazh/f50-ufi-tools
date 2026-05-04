/**
 * Controls Tab – Advanced (Router Settings)
 * NAT, UPnP, DMZ, Security, Port Forwarding, FOTA, Device Options
 */
(function () {
  var lanLoaded = false;
  var advLoaded = false;

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'firewall') loadLanSections();
    if (e.detail.tab === 'advanced' || e.detail.tab === 'network_tools') loadAdvanced();
  });

  var panel = document.querySelector('[data-ctrl-panel="advanced"]');
  if (panel && panel.style.display !== 'none') {
    setTimeout(loadAdvanced, 0);
  }

  function loadLanSections() {
    if (lanLoaded) return;
    lanLoaded = true;
    initLanSwitches();
    loadRouterSettings();
    loadPortForwardRules();
    bindPortForwardAdd();
    bindLanNetSave();
  }

  function loadAdvanced() {
    if (advLoaded) return;
    advLoaded = true;
    initAdvSwitches();
    loadFotaSettings();
    loadQuickSwitches();
    bindAdvancedSaveButton();
    bindNetworkToolsSaveButton();
  }

  /* --- Toggle switches --- */
  var switches = {};

  function initLanSwitches() {
    switches.upnp = createToggle('ADV_UPNP_SWITCH');
    switches.dmz = createToggle('ADV_DMZ_SWITCH', function (on) {
      var field = document.getElementById('ADV_DMZ_IP_FIELD');
      if (field) field.style.display = on ? '' : 'none';
    });
    switches.remote = createToggle('ADV_REMOTE_SWITCH');
    switches.wanPing = createToggle('ADV_WANPING_SWITCH');
  }

  function initAdvSwitches() {
    switches.fota = createToggle('ADV_FOTA_SWITCH', function (on) {
      var field = document.getElementById('ADV_FOTA_INTERVAL_FIELD');
      if (field) field.style.display = on ? '' : 'none';
    });
    switches.fotaRoam = createToggle('ADV_FOTA_ROAM_SWITCH');
    switches.zteUpdate = createToggle('ADV_ZTE_UPDATE_SWITCH');
    switches.roam = createToggle('ADV_ROAM_SWITCH');
    switches.samba = createToggle('ADV_SAMBA_SWITCH');
    switches.light = createToggle('ADV_LIGHT_SWITCH');
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

  /* --- Load router settings --- */
  async function loadRouterSettings() {
    try {
      var data = await getData(new URLSearchParams({
        cmd: 'nat_mode,upnpEnabled,DMZEnable,DMZIPAddress,RemoteManagement,WANPingFilter,lan_ipaddr',
        multi_data: '1'
      }));
      if (!data) return;
      var natSel = document.getElementById('ADV_NAT_MODE');
      if (natSel && data.nat_mode !== undefined) natSel.value = data.nat_mode;
      if (switches.upnp) switches.upnp.set(data.upnpEnabled === '1');
      if (switches.dmz) switches.dmz.set(data.DMZEnable === '1');
      var dmzWrap = document.getElementById('ADV_DMZ_IP_WRAP');
      if (dmzWrap && data.DMZIPAddress) setIpInput(dmzWrap.parentElement, 'dmzIp', data.DMZIPAddress);
      if (switches.remote) switches.remote.set(data.RemoteManagement === '1');
      if (switches.wanPing) switches.wanPing.set(data.WANPingFilter === '1');
      // Pre-fill port forward IP with gateway subnet
      if (data.lan_ipaddr) {
        var octets = data.lan_ipaddr.split('.');
        var pfSegs = document.querySelectorAll('#ADV_PF_IP_WRAP .ctrl-ip-seg');
        if (pfSegs.length === 4 && octets.length === 4) {
          pfSegs[0].value = octets[0];
          pfSegs[1].value = octets[1];
          pfSegs[2].value = octets[2];
          pfSegs[3].value = '';
          pfSegs[3].focus && pfSegs[3].placeholder == 'x' && (pfSegs[3].placeholder = '');
        }
      }
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
        '<td><button type="button" class="ctrl-device-btn danger pf-del-btn" data-idx="' + idx + '">Delete</button></td>';
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
    var ipHidden = document.querySelector('#ADV_PF_IP_WRAP input[type="hidden"]');
    var portStart = document.getElementById('ADV_PF_PORT_START');
    var portEnd = document.getElementById('ADV_PF_PORT_END');
    var proto = document.getElementById('ADV_PF_PROTO');
    if (!ipHidden || !portStart || !proto) return;
    var ipVal = (ipHidden.value || '').trim();
    var startVal = portStart.value.trim();
    var endVal = (portEnd && portEnd.value.trim()) || startVal;
    if (!ipVal || !startVal) { createToast('IP and port are required', 'red'); return; }
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipVal)) { createToast('Invalid IP address', 'red'); return; }
    var s = parseInt(startVal), e = parseInt(endVal);
    if (s < 1 || s > 65535 || e < 1 || e > 65535 || e < s) { createToast('Invalid port range', 'red'); return; }
    try {
      var cookie = await login();
      if (!cookie) { createToast('Please login first', 'red'); return; }
      await postData(cookie, { goformId: 'ADD_PORT_FORWARD_RULE', portForwardIP: ipVal, portForwardPortStart: startVal, portForwardPortEnd: endVal, portForwardProtocol: proto.value });
      var pfSegs = document.querySelectorAll('#ADV_PF_IP_WRAP .ctrl-ip-seg');
      if (pfSegs.length === 4) pfSegs[3].value = '';
      ipHidden.value = '';
      portStart.value = ''; if (portEnd) portEnd.value = '';
      createToast('Rule added', 'green');
      loadPortForwardRules();
    } catch (err) { createToast('Failed to add rule: ' + err.message, 'red'); }
  }

  async function deletePortForwardRule(idx) {
    try {
      var cookie = await login();
      if (!cookie) { createToast('Please login first', 'red'); return; }
      await postData(cookie, { goformId: 'DEL_PORT_FORWARD_RULE', id: idx.toString() });
      createToast('Rule deleted', 'green');
      loadPortForwardRules();
    } catch (err) { createToast('Failed to delete rule: ' + err.message, 'red'); }
  }

  /* --- FOTA Settings --- */
  async function loadFotaSettings() {
    try {
      var data = await getData(new URLSearchParams({ cmd: 'UpgMode,UpgIntervalDay,UpgRoamPermission,zte_update_enabled', multi_data: '1' }));
      if (!data) return;
      if (switches.fota) switches.fota.set(data.UpgMode === '1');
      var interval = document.getElementById('ADV_FOTA_INTERVAL');
      if (interval && data.UpgIntervalDay) interval.value = data.UpgIntervalDay;
      if (switches.fotaRoam) switches.fotaRoam.set(data.UpgRoamPermission === '1');
      if (switches.zteUpdate) switches.zteUpdate.set(data.zte_update_enabled === '1');
    } catch (e) { console.warn('[Advanced] Failed to load FOTA settings:', e); }
  }

  /* --- Quick Switches --- */
  async function loadQuickSwitches() {
    try {
      var data = await getData(new URLSearchParams({
        cmd: 'roam_setting_option,dial_roam_setting_option,samba_switch,indicator_light_switch',
        multi_data: '1'
      }));
      if (!data) return;
      var roamEnabled = data.dial_roam_setting_option === 'on' || data.roam_setting_option === 'on';
      if (switches.roam) switches.roam.set(roamEnabled);
      if (switches.samba) switches.samba.set(data.samba_switch === '1');
      if (switches.light) switches.light.set(data.indicator_light_switch === '1');
    } catch (e) { console.warn('[Advanced] Failed to load quick switches:', e); }
  }

  /* --- Save all --- */
  function bindAdvancedSaveButton() {
    bindCtrlSave('ADV_SAVE_BTN', async function (cookie) {
      var interval = document.getElementById('ADV_FOTA_INTERVAL');
      await postData(cookie, { goformId: 'SetUpgAutoSetting', UpgMode: switches.fota.get() ? '1' : '0', UpgIntervalDay: interval ? interval.value : '7', UpgRoamPermission: switches.fotaRoam.get() ? '1' : '0', zte_update_enabled: switches.zteUpdate.get() ? '1' : '0' });
      await postData(cookie, { goformId: 'INDICATOR_LIGHT_SETTING', indicator_light_switch: switches.light.get() ? '1' : '0' });
    });
  }

  function bindNetworkToolsSaveButton() {
    bindCtrlSave('NETWORK_TOOLS_SAVE_BTN', async function (cookie) {
      var roamValue = switches.roam.get() ? 'on' : 'off';
      await postData(cookie, {
        goformId: 'SET_CONNECTION_MODE',
        ConnectionMode: 'auto_dial',
        roam_setting_option: roamValue,
        dial_roam_setting_option: roamValue
      });
      await postData(cookie, { goformId: 'SAMBA_SETTING', samba_switch: switches.samba.get() ? '1' : '0' });
    });
  }

  function bindLanNetSave() {
    bindCtrlSave('LAN_NET_SAVE_BTN', async function (cookie) {
      var natSel = document.getElementById('ADV_NAT_MODE');
      await postData(cookie, { goformId: 'NAT_SETTING', nat_mode: natSel ? natSel.value : '0' });
      await postData(cookie, { goformId: 'UPNP_SETTING', upnpEnabled: switches.upnp.get() ? '1' : '0' });
      var dmzHidden = document.querySelector('#ADV_DMZ_IP_WRAP input[type="hidden"]');
      await postData(cookie, { goformId: 'DMZ_SETTING', DMZEnable: switches.dmz.get() ? '1' : '0', DMZIPAddress: dmzHidden ? dmzHidden.value : '' });
      await postData(cookie, { goformId: 'FW_SYS', RemoteManagement: switches.remote.get() ? '1' : '0', WANPingFilter: switches.wanPing.get() ? '1' : '0' });
    });
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
})();
