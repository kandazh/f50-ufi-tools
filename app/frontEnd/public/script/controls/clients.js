/**
 * Connected Devices — Load client list, block/unblock devices
 * Listens for 'ctrl-panel-show' event with tab='clients'.
 */
(function () {
  async function loadClientsData() {
    var connList = document.getElementById('CTRL_CONN_LIST');
    var blackList = document.getElementById('CTRL_BLACK_LIST');
    if (!connList) return;
    try {
      var res = await getData(new URLSearchParams({
        cmd: 'station_list,lan_station_list,queryDeviceAccessControlList',
        multi_data: '1'
      }));
      if (!res) return;

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
        connList.innerHTML = allClients.map(function (d) {
          var name = d.hostname || 'Unknown';
          var isWifi = wifiClients.includes(d);
          return '<div class="ctrl-device-item">' +
            '<div class="ctrl-device-icon">' + (isWifi ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>') + '</div>' +
            '<div class="ctrl-device-info">' +
              '<div class="ctrl-device-name">' + escapeHtml(name) + '</div>' +
              '<div class="ctrl-device-meta">' +
                '<span class="ctrl-device-ip">' + escapeHtml(d.ip_addr || '') + '</span>' +
                '<span class="ctrl-device-mac">' + escapeHtml(d.mac_addr || '') + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="ctrl-device-actions">' +
              '<button class="ctrl-device-btn danger" onclick="blockDevice(\'' + escapeHtml(d.mac_addr) + '\',\'' + escapeHtml(name) + '\')">Block</button>' +
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
  window.blockDevice = async function (mac, name) {
    try {
      var cookie = await login();
      if (!cookie) return showCtrlToast('Login failed', 'error');
      var res = await getData(new URLSearchParams({ cmd: 'queryDeviceAccessControlList' }));
      var macs = (res && res.BlackMacList || '').split(';').filter(Boolean);
      var names = (res && res.BlackNameList || '').split(';').filter(Boolean);
      macs.push(mac);
      names.push(name);
      await postData(cookie, {
        goformId: 'setDeviceAccessControlList',
        BlackMacList: macs.join(';'),
        BlackNameList: names.join(';'),
        AclMode: (res && res.AclMode) || '1'
      });
      showCtrlToast('Blocked');
      loadClientsData();
    } catch (err) { showCtrlToast('Block failed', 'error'); }
  };

  window.unblockDevice = async function (mac) {
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
        BlackMacList: macs.join(';'),
        BlackNameList: names.join(';'),
        AclMode: (res && res.AclMode) || '1'
      });
      showCtrlToast('Unblocked');
      loadClientsData();
    } catch (err) { showCtrlToast('Unblock failed', 'error'); }
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
