/**
 * Data Management Panel
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="data_mgmt"]');
  if (!panel) return;

  var totalEl = document.getElementById('dm_total_used');
  var dlEl = document.getElementById('dm_downloaded');
  var ulEl = document.getElementById('dm_uploaded');
  var timeEl = document.getElementById('dm_conn_time');
  var limitSizeInput = document.getElementById('dm_limit_size');
  var alertInput = document.getElementById('dm_alert_percent');
  var clearDateInput = document.getElementById('dm_clear_date');

  var limitSwitch, autoClearSwitch;

  function formatBytes(bytes) {
    bytes = Number(bytes);
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function formatTime(seconds) {
    seconds = Number(seconds);
    var d = Math.floor(seconds / 86400);
    var h = Math.floor((seconds % 86400) / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm';
  }

  async function loadData() {
    try {
      var res = await getDataUsage();
      if (!res) return;

      // Use Android NetworkStatsManager data from baseDeviceInfo (accurate, persists across reboots)
      var deviceInfo = await getBaseDeviceInfo();
      var dl, ul;
      if (deviceInfo && deviceInfo.monthly_download != null) {
        dl = Number(deviceInfo.monthly_download || 0);
        ul = Number(deviceInfo.monthly_upload || 0);
      } else {
        // Fallback to ZTE goform counters (can reset on reboot)
        dl = Number(res.monthly_tx_bytes || 0);
        ul = Number(res.monthly_rx_bytes || 0);
      }

      totalEl.textContent = formatBytes(dl + ul);
      dlEl.textContent = formatBytes(dl);
      ulEl.textContent = formatBytes(ul);
      timeEl.textContent = formatTime(res.monthly_time || 0);

      // Fill settings
      var limitOn = res.data_volume_limit_switch === '1' || res.flux_data_volume_limit_switch === '1';
      if (limitSwitch) limitSwitch.set(limitOn);

      var sizeStr = res.data_volume_limit_size || res.flux_data_volume_limit_size || '';
      if (sizeStr.includes('_')) {
        var parts = sizeStr.split('_');
        limitSizeInput.value = parts[0];
      } else if (sizeStr) {
        limitSizeInput.value = Math.round(Number(sizeStr) / 1024);
      }

      alertInput.value = res.data_volume_alert_percent || '90';

      var autoClear = res.wan_auto_clear_flow_data_switch === '1';
      if (autoClearSwitch) autoClearSwitch.set(autoClear);

      clearDateInput.value = res.traffic_clear_date || '1';
    } catch (e) { /* silent */ }
  }

  // Create toggles after DOM
  setTimeout(function () {
    limitSwitch = createCtrlToggle('DM_LIMIT_SWITCH');
    autoClearSwitch = createCtrlToggle('DM_AUTO_CLEAR_SWITCH');
  }, 0);

  // Save settings via goform
  bindCtrlSave('dm_save_btn', async function () {
    var limitSize = limitSizeInput.value + '_1024';
    await postData({
      goformId: 'DATA_LIMIT_SETTING',
      data_volume_limit_switch: limitSwitch && limitSwitch.get() ? '1' : '0',
      data_volume_limit_size: limitSize,
      data_volume_alert_percent: alertInput.value || '90',
      wan_auto_clear_flow_data_switch: autoClearSwitch && autoClearSwitch.get() ? '1' : '0',
      traffic_clear_date: clearDateInput.value || '1'
    });
  }, { needsLogin: false });

  // Reset counter
  bindCtrlSave('dm_reset_btn', async function () {
    await postData({ goformId: 'CLEAR_DATA_COUNTER' });
    loadData();
  }, { needsLogin: false, successMsg: 'Counter reset', errorMsg: 'Failed to reset' });

  // Load on panel show
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'data_mgmt') loadData();
  });
})();
