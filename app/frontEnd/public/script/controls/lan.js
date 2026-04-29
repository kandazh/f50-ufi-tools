/**
 * LAN Settings — Data loading and form submission
 * Listens for 'ctrl-panel-show' event with tab='lan'.
 */
(function () {
  function loadLANData() {
    var form = document.getElementById('LANManagementForm');
    if (!form) return;
    getData(new URLSearchParams({
      cmd: 'lan_ipaddr,lan_netmask,mac_address,dhcpEnabled,dhcpStart,dhcpEnd,dhcpLease_hour,mtu,tcp_mss'
    })).then(function (res) {
      if (!res) return;
      var lan_ipaddr = res.lan_ipaddr;
      var lan_netmask = res.lan_netmask;
      var dhcpEnabled = res.dhcpEnabled;
      var dhcpStart = res.dhcpStart;
      var dhcpEnd = res.dhcpEnd;
      var dhcpLease_hour = res.dhcpLease_hour;

      setIpInput(form, 'lanIp', lan_ipaddr || '');
      setIpInput(form, 'lanNetmask', lan_netmask || '');
      setIpInput(form, 'dhcpStart', dhcpStart || '');
      setIpInput(form, 'dhcpEnd', dhcpEnd || '');
      form.querySelector('input[name="dhcpLease"]').value = (dhcpLease_hour || '').replace('h', '');
      form.querySelector('input[name="lanDhcpType"]').value = dhcpEnabled == '1' ? 'SERVER' : 'DISABLE';

      var collapseDhcp = document.getElementById('collapse_dhcp');
      if (collapseDhcp) {
        if (collapseDhcp.dataset.name === 'open' && dhcpEnabled !== '1') {
          collapseDhcp.dataset.name = 'close';
        } else if (collapseDhcp.dataset.name === 'close' && dhcpEnabled === '1') {
          collapseDhcp.dataset.name = 'open';
        }
      }
    }).catch(function () { /* silent */ });
  }

  // Form submit handler
  var lanForm = document.getElementById('LANManagementForm');
  if (lanForm) {
    lanForm.removeAttribute('onsubmit');
    lanForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        var cookie = await login();
        if (!cookie) return showCtrlToast('Login failed', 'error');
        var formData = new FormData(e.target);
        var data = {
          goformId: 'DHCP_SETTING',
          lanIp: '192.168.0.1',
          lanNetmask: '255.255.255.0',
          lanDhcpType: 'DISABLE',
          dhcpStart: '',
          dhcpEnd: '',
          dhcpLease: '',
          dhcp_reboot_flag: '1',
          mac_ip_reset: '0'
        };
        var lanDhcpType = formData.get('lanDhcpType') === 'SERVER';
        data.lanDhcpType = lanDhcpType ? 'SERVER' : 'DISABLE';
        data.mac_ip_reset = lanDhcpType ? '1' : '0';
        for (var [key, value] of formData.entries()) {
          var val = value.trim();
          switch (key) {
            case 'lanIp': val && (data[key] = val); break;
            case 'lanNetmask': val && (data[key] = val); break;
            case 'dhcpStart': if (lanDhcpType && val) data[key] = val; break;
            case 'dhcpEnd': if (lanDhcpType && val) data[key] = val; break;
            case 'dhcpLease': if (lanDhcpType && val) data[key] = val; break;
          }
        }
        await (await postData(cookie, data)).json();
        showCtrlToast('Saved');
        loadLANData();
      } catch (err) { showCtrlToast('Error', 'error'); }
    });
  }

  // Listen for panel show event
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'lan') loadLANData();
  });

  // Expose for external use
  window.loadLANData = loadLANData;
})();
