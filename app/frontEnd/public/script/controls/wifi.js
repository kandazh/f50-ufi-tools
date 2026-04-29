/**
 * WiFi Settings — Data loading and form submission
 * Listens for 'ctrl-panel-show' event with tab='wifi'.
 */
(function () {
  async function loadWiFiData() {
    var form = document.getElementById('WIFICtrlForm');
    if (!form) return;
    try {
      var res = await getData(new URLSearchParams({
        cmd: 'queryWiFiModuleSwitch,queryAccessPointInfo'
      }));
      if (!res) return;

      var WiFiModuleSwitch = res.WiFiModuleSwitch;
      var ResponseList = res.ResponseList;
      var switchEl = document.getElementById('WIFI_SWITCH_CTRL');
      var infoEl = document.getElementById('wifiCtrlInfo');
      var securityEl = document.getElementById('wifiCtrlSecurity');

      if (WiFiModuleSwitch !== '1' || !ResponseList || !ResponseList.length) {
        if (switchEl) switchEl.value = '0';
        if (infoEl) infoEl.style.display = 'none';
        if (securityEl) securityEl.style.display = 'none';
        return;
      }

      // Find the active AP
      var ap = ResponseList.find(function (r) { return r.AccessPointSwitchStatus === '1'; });
      if (!ap) return;

      // Set band switch
      if (switchEl) switchEl.value = ap.ChipIndex === '1' ? 'chip2' : 'chip1';

      // Show sections
      if (infoEl) infoEl.style.display = '';
      if (securityEl) securityEl.style.display = '';

      // Populate form fields
      var set = function (name, val) { var el = form.querySelector('[name="' + name + '"]'); if (el) el.value = val; };
      set('AccessPointIndex', ap.AccessPointIndex || '0');
      set('ChipIndex', ap.ChipIndex || '0');
      set('SSID', ap.SSID || '');
      set('ApMaxStationNumber', ap.ApMaxStationNumber || '10');

      // Password (base64 decoded)
      var pwdEl = document.getElementById('WIFI_PASSWORD_CTRL');
      if (pwdEl && ap.Password) {
        try { pwdEl.value = decodeBase64(ap.Password); } catch (_) { pwdEl.value = ''; }
      }

      // Broadcast switch (0 = broadcast ON)
      var broadcastOn = (ap.ApBroadcastDisabled || '').toString() === '0';
      var broadcastContainer = document.getElementById('wifi_broadcast_switch');
      if (broadcastContainer && broadcastContainer.toggleUpdate) broadcastContainer.toggleUpdate(broadcastOn);

      // Auth mode
      var authEl = document.getElementById('WIFI_ENC_MODE_CTRL');
      var showableEl = document.getElementById('WIFI_FORM_SHOWABLE_CTRL');
      if (authEl) {
        authEl.value = ap.AuthMode || 'OPEN';
        if (showableEl) showableEl.style.display = ap.AuthMode === 'OPEN' ? 'none' : '';
      }

      // QR Code
      var qrSection = document.getElementById('wifiCtrlQR');
      var qrImg = document.getElementById('WifiQRCodeImg');
      if (qrImg && ap.QrImageUrl) {
        if (qrSection) qrSection.style.display = '';
        var qrUrl = ap.QrImageUrl.startsWith('http') ? ap.QrImageUrl : ('/api' + ap.QrImageUrl);
        fetch(qrUrl, { headers: common_headers })
          .then(function (res) { return res.blob(); })
          .then(function (blob) {
            var url = URL.createObjectURL(blob);
            qrImg.onload = function () { URL.revokeObjectURL(url); };
            qrImg.src = url;
          })
          .catch(function () { if (qrSection) qrSection.style.display = 'none'; });
      } else {
        if (qrSection) qrSection.style.display = 'none';
      }

      // Re-init custom dropdowns after data load
      if (window.initCtrlDropdowns) window.initCtrlDropdowns();
    } catch (err) { /* silent */ }
  }

  // Form submit handler
  var wifiForm = document.getElementById('WIFICtrlForm');
  if (wifiForm) {
    wifiForm.removeAttribute('onsubmit');
    wifiForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        var cookie = await login();
        if (!cookie) return showCtrlToast('Login failed', 'error');
        var formData = new FormData(e.target);
        var data = {
          goformId: 'setAccessPointInfo',
          SSID: '',
          AuthMode: '',
          EncrypType: '',
          Password: '',
          ApMaxStationNumber: '',
          ApBroadcastDisabled: 1,
          ApIsolate: 0,
          ChipIndex: 0,
          AccessPointIndex: 0
        };
        for (var [key, value] of formData.entries()) {
          var val = value.trim();
          switch (key) {
            case 'SSID': val && (data[key] = val); break;
            case 'AuthMode':
              data.EncrypType = val === 'OPEN' ? 'NONE' : 'CCMP';
              val && (data[key] = val); break;
            case 'ApBroadcastDisabled': data[key] = Number(value) || 0; break;
            case 'Password': val && (data[key] = encodeBase64(val)); break;
            case 'ApIsolate': case 'ApMaxStationNumber': case 'AccessPointIndex': case 'ChipIndex':
              !isNaN(Number(val)) && (data[key] = Number(val)); break;
          }
        }
        if (data.AuthMode === 'OPEN' || data.EncrypType === 'NONE') {
          delete data.Password;
        }
        await (await postData(cookie, data)).json();
        showCtrlToast('Saved');
        loadWiFiData();
      } catch (err) { showCtrlToast('Error', 'error'); }
    });
  }

  // Band switch handler for controls page (no red toast, direct login)
  var bandSelect = document.getElementById('WIFI_SWITCH_CTRL');
  if (bandSelect) {
    bandSelect.addEventListener('change', async function (e) {
      var value = e.target.value.trim();
      if (!value) return;
      bandSelect.disabled = true;
      try {
        var cookie = await login();
        if (!cookie) { bandSelect.disabled = false; return; }
        if (value === '0') {
          await (await postData(cookie, { goformId: 'switchWiFiModule', SwitchOption: 0 })).json();
        } else {
          await (await postData(cookie, { goformId: 'switchWiFiChip', ChipEnum: value, GuestEnable: 0 })).json();
        }
        showCtrlToast('WiFi switching, please reconnect', 'success');
        setTimeout(function () { bandSelect.disabled = false; loadWiFiData(); }, 3000);
      } catch (err) {
        bandSelect.disabled = false;
      }
    });
  }

  // Listen for panel show event
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'wifi') loadWiFiData();
  });

  // Expose for external use
  window.loadWiFiData = loadWiFiData;
})();
