/**
 * LAN Settings — Data loading and form submission
 * Listens for 'ctrl-panel-show' event with tab='lan'.
 */
(function () {
  var dhcpToggle = null;

  function initDhcpToggle() {
    if (dhcpToggle) return;
    var container = document.getElementById('collapse_dhcp_switch');
    if (!container) return;
    container.innerHTML = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctrl-toggle off';
    btn.innerHTML = '<span class="ctrl-toggle-knob"></span>';
    var state = false;
    var hiddenInput = document.getElementById('enableDHCP');
    var collapseEl = document.getElementById('collapse_dhcp');
    btn.addEventListener('click', function () {
      state = !state;
      btn.className = 'ctrl-toggle ' + (state ? 'on' : 'off');
      if (hiddenInput) hiddenInput.value = state ? 'SERVER' : 'DISABLE';
      if (collapseEl) collapseEl.style.display = state ? '' : 'none';
    });
    container.appendChild(btn);
    dhcpToggle = {
      get: function () { return state; },
      set: function (v) {
        state = !!v;
        btn.className = 'ctrl-toggle ' + (state ? 'on' : 'off');
        if (hiddenInput) hiddenInput.value = state ? 'SERVER' : 'DISABLE';
        if (collapseEl) collapseEl.style.display = state ? '' : 'none';
      }
    };
  }

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

      // MAC Address (read-only display)
      var macEl = document.getElementById('LAN_MAC_ADDR');
      if (macEl) macEl.textContent = res.mac_address || '--';

      // MTU / MSS
      var mtuInput = form.querySelector('input[name="mtu"]');
      var mssInput = form.querySelector('input[name="tcp_mss"]');
      if (mtuInput) mtuInput.value = res.mtu || '';
      if (mssInput) mssInput.value = res.tcp_mss || '';

      // DHCP toggle — suppress animation on initial load
      var collapseEl = document.getElementById('collapse_dhcp');
      if (collapseEl) collapseEl.style.transition = 'none';
      initDhcpToggle();
      if (dhcpToggle) dhcpToggle.set(dhcpEnabled === '1');
      // Restore transition after ResizeObserver has a chance to fire
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (collapseEl) collapseEl.style.transition = '';
        });
      });
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

        var lanIp = (formData.get('lanIp') || '').trim();
        var lanNetmask = (formData.get('lanNetmask') || '').trim();
        var lanDhcpType = formData.get('lanDhcpType') === 'SERVER';
        var dhcpStart = (formData.get('dhcpStart') || '').trim();
        var dhcpEnd = (formData.get('dhcpEnd') || '').trim();
        var dhcpLease = (formData.get('dhcpLease') || '').trim();
        var mtuVal = (formData.get('mtu') || '').trim();
        var mssVal = (formData.get('tcp_mss') || '').trim();

        // Validate IP format
        var ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (lanIp && !ipRegex.test(lanIp)) return showCtrlToast('Invalid gateway IP', 'error');
        if (lanNetmask && !ipRegex.test(lanNetmask)) return showCtrlToast('Invalid subnet mask', 'error');

        // Validate DHCP fields
        if (lanDhcpType) {
          if (!dhcpStart || !ipRegex.test(dhcpStart)) return showCtrlToast('Invalid DHCP start IP', 'error');
          if (!dhcpEnd || !ipRegex.test(dhcpEnd)) return showCtrlToast('Invalid DHCP end IP', 'error');
          // Start must be <= End (last octet)
          var startOctet = parseInt(dhcpStart.split('.')[3], 10);
          var endOctet = parseInt(dhcpEnd.split('.')[3], 10);
          if (startOctet >= endOctet) return showCtrlToast('DHCP start must be less than end', 'error');
          // Lease: 1–65535
          var leaseNum = parseInt(dhcpLease, 10);
          if (!dhcpLease || isNaN(leaseNum) || leaseNum < 1 || leaseNum > 65535) return showCtrlToast('Lease time must be 1–65535', 'error');
        }

        // Validate MTU: 1300–1500
        if (mtuVal) {
          var mtuNum = parseInt(mtuVal, 10);
          if (isNaN(mtuNum) || mtuNum < 1300 || mtuNum > 1500) return showCtrlToast('MTU must be 1300–1500', 'error');
        }
        // Validate MSS: 1260–1460
        if (mssVal) {
          var mssNum = parseInt(mssVal, 10);
          if (isNaN(mssNum) || mssNum < 1260 || mssNum > 1460) return showCtrlToast('MSS must be 1260–1460', 'error');
        }
        // MTU - MSS must be >= 40
        if (mtuVal && mssVal) {
          if (parseInt(mtuVal, 10) - parseInt(mssVal, 10) < 40) return showCtrlToast('MTU minus MSS must be at least 40', 'error');
        }

        // Save DHCP settings
        var data = {
          goformId: 'DHCP_SETTING',
          lanIp: lanIp || '192.168.0.1',
          lanNetmask: lanNetmask || '255.255.255.0',
          lanDhcpType: lanDhcpType ? 'SERVER' : 'DISABLE',
          dhcpStart: lanDhcpType ? dhcpStart : '',
          dhcpEnd: lanDhcpType ? dhcpEnd : '',
          dhcpLease: lanDhcpType ? dhcpLease : '',
          dhcp_reboot_flag: '1',
          mac_ip_reset: lanDhcpType ? '1' : '0'
        };
        await (await postData(cookie, data)).json();

        // Save MTU/MSS separately if provided
        if (mtuVal || mssVal) {
          var mtuData = { goformId: 'SET_DEVICE_MTU' };
          if (mtuVal) mtuData.mtu = mtuVal;
          if (mssVal) mtuData.tcp_mss = mssVal;
          await (await postData(cookie, mtuData)).json();
        }

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
