/**
 * Connected Devices — Load client list, block/unblock devices
 * Listens for 'ctrl-panel-show' event with tab='clients'.
 */
(function () {
  var userIp = '';
  var HOSTNAME_STORAGE_KEY = 'hotbox_hostname_overrides';

  function getHostnameOverrides() {
    try { return JSON.parse(localStorage.getItem(HOSTNAME_STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveHostnameOverride(mac, name) {
    var overrides = getHostnameOverrides();
    overrides[mac] = name;
    localStorage.setItem(HOSTNAME_STORAGE_KEY, JSON.stringify(overrides));
  }

  // Check if WPS is active on any chip
  async function isWpsActive() {
    try {
      var wps = await getData(new URLSearchParams({ cmd: 'queryWpsStatus' }));
      if (wps && Array.isArray(wps.ResponseList)) {
        return wps.ResponseList.some(function (c) { return c.WpsStatus === '1'; });
      }
    } catch (e) {}
    return false;
  }

  // Fetch WiFi station info (signal, link speed) from hostapd
  async function fetchWifiStations() {
    try {
      var _base = (typeof HOTBOX_baseURL !== 'undefined') ? HOTBOX_baseURL : '/api';
      var r = await fetch(_base + '/wifi_stations');
      var j = await r.json();
      if (j && Array.isArray(j.stations)) return j.stations;
    } catch (e) {}
    return [];
  }

  function signalToLabel(rssi) {
    if (rssi >= -50) return { text: 'Excellent', cls: 'sig-excellent' };
    if (rssi >= -60) return { text: 'Good', cls: 'sig-good' };
    if (rssi >= -70) return { text: 'Fair', cls: 'sig-fair' };
    return { text: 'Weak', cls: 'sig-weak' };
  }

  async function loadClientsData() {
    var connList = document.getElementById('CTRL_CONN_LIST');
    var blackList = document.getElementById('CTRL_BLACK_LIST');
    if (!connList) return;
    try {
      var [res, wifiStations] = await Promise.all([
        getData(new URLSearchParams({
          cmd: 'station_list,lan_station_list,queryDeviceAccessControlList,user_ip_addr,hostNameList',
          multi_data: '1'
        })),
        fetchWifiStations()
      ]);
      if (!res) return;

      // Build station lookup by MAC
      var stationMap = {};
      wifiStations.forEach(function (s) { if (s.mac) stationMap[s.mac.toLowerCase()] = s; });

      userIp = res.user_ip_addr || '';

      // Build hostname lookup from firmware's hostNameList
      var firmwareNames = {};
      if (Array.isArray(res.devices)) {
        res.devices.forEach(function (d) {
          if (d.mac && d.hostname && d.hostname !== '--') firmwareNames[d.mac] = d.hostname;
        });
      }

      // Merge WiFi + LAN clients
      var wifiClients = Array.isArray(res.station_list) ? res.station_list : [];
      var lanClients = Array.isArray(res.lan_station_list) ? res.lan_station_list : [];
      var allClients = wifiClients.concat(lanClients);

      // Parse blacklist
      var blackMacs = (res.BlackMacList || '').split(';').filter(Boolean);
      var blackNames = (res.BlackNameList || '').split(';').filter(Boolean);

      // Render connected devices
      var countEl = document.getElementById('clientsCount');
      if (countEl) countEl.textContent = '(' + allClients.length + ')';

      if (allClients.length === 0) {
        connList.innerHTML = '<div class="ctrl-device-empty">No devices connected</div>';
      } else {
        var overrides = getHostnameOverrides();
        connList.innerHTML = allClients.map(function (d) {
          var name = overrides[d.mac_addr] || firmwareNames[d.mac_addr] || (d.hostname && d.hostname !== '--' ? d.hostname : '') || 'Unknown';
          var isWifi = wifiClients.includes(d);
          var deviceIcon = isWifi
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
          var connIcon = isWifi
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
          var badge = isWifi
            ? '<span class="ctrl-device-badge wifi">' + connIcon + ' WiFi</span>'
            : '<span class="ctrl-device-badge cable">' + connIcon + ' Cable</span>';
          // WiFi station info (signal + link speed)
          var staInfo = '';
          if (isWifi && d.mac_addr) {
            var sta = stationMap[d.mac_addr.toLowerCase()];
            if (sta) {
              var parts = [];
              if (sta.signal != null) {
                var sig = signalToLabel(sta.signal);
                parts.push('<span class="ctrl-sta-signal ' + sig.cls + '">' + sta.signal + ' dBm (' + sig.text + ')</span>');
              }
              if (sta.tx_bitrate != null || sta.rx_bitrate != null) {
                var tx = sta.tx_bitrate != null ? sta.tx_bitrate + '' : '—';
                var rx = sta.rx_bitrate != null ? sta.rx_bitrate + '' : '—';
                parts.push('<span class="ctrl-sta-speed">↓' + rx + ' / ↑' + tx + ' Mbps</span>');
              }
              if (parts.length) staInfo = '<div class="ctrl-device-sta">' + parts.join('') + '</div>';
            }
          }
          return '<div class="ctrl-device-item">' +
            '<div class="ctrl-device-icon">' + deviceIcon + '</div>' +
            '<div class="ctrl-device-info">' +
              '<div class="ctrl-device-name" onclick="ctrlEditHostName(\'' + escapeHtml(d.mac_addr) + '\',this)" title="Tap to rename">' + escapeHtml(name) + ' ' + badge + '</div>' +
              '<div class="ctrl-device-meta">' +
                '<span class="ctrl-device-ip">' + escapeHtml(d.ip_addr || '') + '</span>' +
                '<span class="ctrl-device-mac">' + escapeHtml(d.mac_addr || '') + '</span>' +
              '</div>' +
              staInfo +
            '</div>' +
            '<div class="ctrl-device-actions">' +
              '<button class="ctrl-device-btn danger" onclick="blockDevice(\'' + escapeHtml(d.mac_addr) + '\',\'' + escapeHtml(name) + '\',\'' + escapeHtml(d.ip_addr || '') + '\')">Block</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      // Render blacklist
      var blCountEl = document.getElementById('blacklistCount');
      if (blCountEl) blCountEl.textContent = '(' + blackMacs.length + ')';

      if (blackMacs.length === 0) {
        if (blackList) blackList.innerHTML = '<div class="ctrl-device-empty">No blocked devices</div>';
      } else if (blackList) {
        blackList.innerHTML = blackMacs.map(function (mac, i) {
          var name = blackNames[i] || mac;
          return '<div class="ctrl-device-item">' +
            '<div class="ctrl-device-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg></div>' +
            '<div class="ctrl-device-info">' +
              '<div class="ctrl-device-name">' + escapeHtml(name) + '</div>' +
              '<div class="ctrl-device-meta">' +
                '<span class="ctrl-device-mac">' + escapeHtml(mac) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="ctrl-device-actions">' +
              '<button class="ctrl-device-btn" onclick="unblockDevice(\'' + escapeHtml(mac) + '\')">Unblock</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    } catch (err) { /* silent */ }
  }

  // Block/Unblock device actions (global for onclick handlers)
  window.blockDevice = async function (mac, name, ip) {
    if (ip && userIp && ip === userIp) return showCtrlToast('Cannot block your own device', 'error');
    if (await isWpsActive()) return showCtrlToast('Cannot modify blacklist while WPS is active', 'error');
    try {
      var cookie = await login();
      if (!cookie) return showCtrlToast('Login failed', 'error');
      var res = await getData(new URLSearchParams({ cmd: 'queryDeviceAccessControlList' }));
      var macs = (res && res.BlackMacList || '').split(';').filter(Boolean);
      var names = (res && res.BlackNameList || '').split(';').filter(Boolean);
      if (macs.indexOf(mac) !== -1) return; // already blocked
      if (macs.length >= 32) return showCtrlToast('Blacklist is full (max 32)', 'error');
      macs.push(mac);
      names.push(name || '');
      await postData(cookie, {
        goformId: 'setDeviceAccessControlList',
        AclMode: '2',
        BlackMacList: macs.join(';') + ';',
        BlackNameList: names.join(';') + ';',
        WhiteMacList: (res && res.WhiteMacList) || '',
        WhiteNameList: (res && res.WhiteNameList) || ''
      });
      showCtrlToast('Blocked');
      loadClientsData();
    } catch (err) { showCtrlToast('Block failed', 'error'); }
  };

  window.unblockDevice = async function (mac) {
    if (await isWpsActive()) return showCtrlToast('Cannot modify blacklist while WPS is active', 'error');
    try {
      var cookie = await login();
      if (!cookie) return showCtrlToast('Login failed', 'error');
      var res = await getData(new URLSearchParams({ cmd: 'queryDeviceAccessControlList' }));
      var macs = (res && res.BlackMacList || '').split(';').filter(Boolean);
      var names = (res && res.BlackNameList || '').split(';').filter(Boolean);
      var idx = macs.indexOf(mac);
      if (idx > -1) { macs.splice(idx, 1); names.splice(idx, 1); }
      await postData(cookie, {
        goformId: 'setDeviceAccessControlList',
        AclMode: '2',
        BlackMacList: macs.length ? macs.join(';') + ';' : '',
        BlackNameList: names.length ? names.join(';') + ';' : '',
        WhiteMacList: (res && res.WhiteMacList) || '',
        WhiteNameList: (res && res.WhiteNameList) || ''
      });
      showCtrlToast('Unblocked');
      loadClientsData();
    } catch (err) { showCtrlToast('Unblock failed', 'error'); }
  };

  // Inline hostname editing — name transforms into input in-place
  window.ctrlEditHostName = function (mac, el) {
    if (el.querySelector('input')) return; // already editing
    var current = el.childNodes[0].textContent.trim();
    if (current === 'Unknown') current = '';
    var badge = el.querySelector('.ctrl-device-badge');
    var badgeHTML = badge ? badge.outerHTML : '';
    el.innerHTML = '<input type="text" class="ctrl-hostname-input" value="' + escapeHtml(current) + '" maxlength="32" placeholder="Enter name">' + badgeHTML;
    var input = el.querySelector('input');
    input.focus();
    input.select();

    function save() {
      var newName = input.value.trim();
      if (!newName || newName === current) {
        el.innerHTML = escapeHtml(current || 'Unknown') + ' ' + badgeHTML;
        return;
      }
      el.innerHTML = escapeHtml(newName) + ' ' + badgeHTML;
      saveHostnameOverride(mac, newName);
      login().then(function (cookie) {
        if (!cookie) return;
        postData(cookie, { goformId: 'EDIT_HOSTNAME', mac: mac, hostname: newName }).then(function () {
          showCtrlToast('Renamed');
          loadClientsData();
        });
      });
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { el.innerHTML = escapeHtml(current || 'Unknown') + ' ' + badgeHTML; }
    });
  };

  // Manual block — inline expandable form
  window.showManualBlockForm = function () {
    var form = document.getElementById('CTRL_ADD_BLACK_FORM');
    var btn = document.getElementById('CTRL_ADD_BLACK_BTN');
    if (form) {
      form.classList.add('open');
      setTimeout(function () {
        var macInput = document.getElementById('CTRL_ADD_BLACK_MAC');
        if (macInput) { macInput.value = ''; macInput.focus(); }
        var nameInput = document.getElementById('CTRL_ADD_BLACK_NAME');
        if (nameInput) nameInput.value = '';
      }, 150);
    }
    if (btn) btn.style.display = 'none';
    setTimeout(function () { document.addEventListener('click', _closeBlockFormOutside); }, 50);
  };

  function _closeBlockFormOutside(e) {
    var form = document.getElementById('CTRL_ADD_BLACK_FORM');
    var btn = document.getElementById('CTRL_ADD_BLACK_BTN');
    if (form && !form.contains(e.target) && e.target !== btn) {
      var mac = document.getElementById('CTRL_ADD_BLACK_MAC');
      var name = document.getElementById('CTRL_ADD_BLACK_NAME');
      var hasValues = (mac && mac.value.trim()) || (name && name.value.trim());
      if (!hasValues) hideManualBlockForm();
    }
  }

  window.hideManualBlockForm = function () {
    var form = document.getElementById('CTRL_ADD_BLACK_FORM');
    var btn = document.getElementById('CTRL_ADD_BLACK_BTN');
    if (form) form.classList.remove('open');
    if (btn) btn.style.display = '';
    document.removeEventListener('click', _closeBlockFormOutside);
  };

  window.confirmManualBlock = async function () {
    var macInput = document.getElementById('CTRL_ADD_BLACK_MAC');
    var nameInput = document.getElementById('CTRL_ADD_BLACK_NAME');
    var mac = (macInput ? macInput.value : '').trim().toUpperCase();
    var name = (nameInput ? nameInput.value : '').trim();
    if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
      return showCtrlToast('Invalid MAC format (AA:BB:CC:DD:EE:FF)', 'error');
    }
    if (await isWpsActive()) return showCtrlToast('Cannot modify blacklist while WPS is active', 'error');
    hideManualBlockForm();
    await window.blockDevice(mac, name || '', '');
  };

  // Refresh button
  var refreshBtn = document.getElementById('CTRL_REFRESH_CLIENTS');
  if (refreshBtn) refreshBtn.addEventListener('click', function () {
    showCtrlToast('Refreshing...');
    loadClientsData();
  });

  // Listen for panel show event
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'clients') loadClientsData();
  });

  window.loadClientsData = loadClientsData;
})();
