/**
 * TTYD Terminal Panel — Web terminal via TTYD service
 * Checks availability, embeds terminal iframe.
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="ttyd"]');
  if (!panel) return;

  var serviceEl = document.getElementById('ttyd_service_status');
  var portDisplayEl = document.getElementById('ttyd_port_display');
  var iframeContainer = document.getElementById('ttyd_iframe_container');

  var toggleContainer = document.getElementById('ttyd_toggle_switch');
  var newTabCard = document.getElementById('ttyd_newtab_card');

  var ttydUrl = '';
  var ttydToggle = null;

  function getPort() {
    return localStorage.getItem('ttyd_port') || '1146';
  }

  function setDisabledState(msg) {
    serviceEl.textContent = msg || 'Disabled';
    serviceEl.style.color = '#94a3b8';
    ttydUrl = '';
    iframeContainer.innerHTML = '<div style="padding:40px 20px;text-align:center;opacity:0.4;font-size:13px">' + (msg || 'TTYD service is disabled') + '</div>';
    iframeContainer.style.opacity = '0.4';
    newTabCard.style.opacity = '0.4';
    newTabCard.style.pointerEvents = 'none';
  }

  function setEnabledState(url) {
    ttydUrl = url;
    serviceEl.textContent = 'Running';
    serviceEl.style.color = '#34d399';
    serviceEl.dataset.url = url;
    iframeContainer.style.opacity = '';
    iframeContainer.innerHTML = '<iframe src="' + url + '" scrolling="no" style="border:none;width:calc(100% + 20px);height:100%;min-height:400px;opacity:0.85;display:block"></iframe>';
    newTabCard.style.opacity = '';
    newTabCard.style.pointerEvents = '';
  }

  async function checkStatus() {
    var port = getPort();
    portDisplayEl.textContent = port;

    // First check if advanced features are enabled
    var advancedEnabled = true;
    try {
      if (typeof checkAdvancedFunc === 'function') {
        advancedEnabled = await checkAdvancedFunc();
      }
    } catch (e) {
      advancedEnabled = false;
    }

    if (!advancedEnabled) {
      if (ttydToggle) ttydToggle.set(false);
      setDisabledState('Disabled');
      return;
    }

    // Check TTYD service
    try {
      var res = await fetch(HOTBOX_baseURL + '/hasTTYD?port=' + port, {
        method: 'GET',
        headers: common_headers
      });
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      if (data.code !== '200') {
        if (ttydToggle) ttydToggle.set(false);
        setDisabledState('Not running on port ' + port);
        return;
      }
      if (ttydToggle) ttydToggle.set(true);
      setEnabledState('http://' + data.ip);
    } catch (e) {
      if (ttydToggle) ttydToggle.set(false);
      setDisabledState('Could not reach TTYD service');
    }
  }

  // TTYD Toggle
  if (toggleContainer) {
    ttydToggle = createCtrlToggle(toggleContainer, async function (checked) {
      try {
        if (typeof checkAdvancedFunc === 'function' && !(await checkAdvancedFunc())) {
          showCtrlToast('Root access not enabled', 'error');
          ttydToggle.set(false);
          setDisabledState('Disabled');
          return;
        }
        if (typeof togglePort === 'function') {
          await togglePort(getPort(), checked, false, false);
        }
        showCtrlToast('TTYD port ' + (checked ? 'enabled' : 'disabled'));
        if (!checked) {
          setDisabledState('Disabled');
        } else {
          setTimeout(checkStatus, 1000);
        }
      } catch (e) {
        showCtrlToast('Failed: ' + e.message, 'error');
        ttydToggle.set(!checked);
      }
    });
  }

  // Open in new tab
  if (newTabCard) {
    newTabCard.addEventListener('click', function () {
      if (ttydUrl) window.open(ttydUrl, '_blank');
    });
  }

  // Initial check
  checkStatus();
})();
