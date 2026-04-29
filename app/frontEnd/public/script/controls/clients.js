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
            '<div class="ctrl-device-icon">' + (isWifi ? '\u{1F4F1}' : '\u{1F5A5}\uFE0F') + '</div>' +
            '<div class="ctrl-device-info">' +
              '<div class="ctrl-device-name">' + escapeHtml(name) + '</div>' +
              '<div class="ctrl-device-meta">' + escapeHtml(d.ip_addr || '') + ' \u00B7 ' + escapeHtml(d.mac_addr || '') + '</div>' +
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
            '<div class="ctrl-device-icon">\u{1F4BB}</div>' +
            '<div class="ctrl-device-info">' +
              '<div class="ctrl-device-name">' + escapeHtml(name) + '</div>' +
              '<div class="ctrl-device-meta">' + escapeHtml(mac) + '</div>' +
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
    var res = await getData(new URLSearchParams({ cmd: 'queryDeviceAccessControlList' }));
    var macs = (res && res.BlackMacList || '').split(';').filter(Boolean);
    var names = (res && res.BlackNameList || '').split(';').filter(Boolean);
    macs.push(mac);
    names.push(name);
    await postData(new URLSearchParams({
      goformId: 'setDeviceAccessControlList',
      BlackMacList: macs.join(';'),
      BlackNameList: names.join(';'),
      AclMode: (res && res.AclMode) || '1'
    }));
    showCtrlToast('Blocked');
    loadClientsData();
  };

  window.unblockDevice = async function (mac) {
    var res = await getData(new URLSearchParams({ cmd: 'queryDeviceAccessControlList' }));
    var macs = (res && res.BlackMacList || '').split(';').filter(Boolean);
    var names = (res && res.BlackNameList || '').split(';').filter(Boolean);
    var idx = macs.indexOf(mac);
    if (idx > -1) { macs.splice(idx, 1); names.splice(idx, 1); }
    await postData(new URLSearchParams({
      goformId: 'setDeviceAccessControlList',
      BlackMacList: macs.join(';'),
      BlackNameList: names.join(';'),
      AclMode: (res && res.AclMode) || '1'
    }));
    showCtrlToast('Unblocked');
    loadClientsData();
  };

  // Refresh button
  var refreshBtn = document.getElementById('CTRL_REFRESH_CLIENTS');
  if (refreshBtn) refreshBtn.addEventListener('click', loadClientsData);

  // Listen for panel show event
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'clients') loadClientsData();
  });

  window.loadClientsData = loadClientsData;
})();
