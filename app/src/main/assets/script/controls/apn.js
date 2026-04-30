/**
 * APN Settings — Data loading, form submission, and profile management
 * Listens for 'ctrl-panel-show' event with tab='apn'.
 */
(function () {
  var apnProfiles = [];
  var apnCurrentIndex = 0;

  async function loadAPNData() {
    var form = document.getElementById('APNCtrlForm');
    if (!form) return;
    try {
      var cmds = ['apn_mode', 'apn_Current_index', 'apn_num_preset'];
      for (var i = 0; i < 20; i++) cmds.push('APN_config' + i);
      var res = await getData(new URLSearchParams({ cmd: cmds.join(','), multi_data: '1' }));
      if (!res) return;

      apnProfiles = [];
      for (var i = 0; i < 20; i++) {
        var cfg = res['APN_config' + i];
        if (!cfg || cfg === '$') continue;
        var parts = cfg.split('($)');
        if (!parts[0] && !parts[1]) continue;
        apnProfiles.push({
          index: i,
          profile_name: parts[0] || '',
          apn: (parts[1] && parts[1] !== 'null') ? parts[1] : '',
          auth: parts[4] || 'none',
          username: parts[5] || '',
          password: parts[6] || '',
          pdp: parts[7] || 'IP'
        });
      }

      apnCurrentIndex = parseInt(res.apn_Current_index);
      if (isNaN(apnCurrentIndex)) {
        // Fallback: match by profile_name or wan_apn from device response
        var curName = res.profile_name || res.m_profile_name || '';
        var curApn = res.wan_apn || '';
        var matched = apnProfiles.find(function (p) {
          return (curName && p.profile_name === curName) || (curApn && p.apn === curApn);
        });
        apnCurrentIndex = matched ? matched.index : 0;
      }

      // Populate mode
      var modeEl = document.getElementById('APN_MODE_CTRL');
      if (modeEl) modeEl.value = res.apn_mode || 'manual';

      // Populate profile selector
      var profileEl = document.getElementById('APN_PROFILE_CTRL');
      if (profileEl) {
        profileEl.innerHTML = '';
        apnProfiles.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.index;
          opt.textContent = p.profile_name || ('Profile ' + p.index);
          if (p.index === apnCurrentIndex) opt.selected = true;
          profileEl.appendChild(opt);
        });
        profileEl.addEventListener('change', function () { fillAPNDetails(parseInt(profileEl.value)); });
      }

      // Fill details for current profile
      fillAPNDetails(apnCurrentIndex);

      // Toggle details visibility based on mode
      toggleAPNMode(res.apn_mode || 'manual');
      if (modeEl) modeEl.addEventListener('change', function () { toggleAPNMode(modeEl.value); });

      if (window.initCtrlDropdowns) window.initCtrlDropdowns();
    } catch (err) { /* silent */ }
  }

  function fillAPNDetails(idx) {
    var p = apnProfiles.find(function (x) { return x.index === idx; });
    if (!p) return;
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = val; };
    set('APN_NAME_CTRL', p.profile_name);
    set('APN_APN_CTRL', p.apn);
    set('APN_USER_CTRL', p.username);
    set('APN_PASS_CTRL', p.password);
    set('APN_AUTH_CTRL', p.auth);
    set('APN_PDP_CTRL', p.pdp);
  }

  function toggleAPNMode(mode) {
    var details = document.getElementById('apnCtrlDetails');
    var delBtn = document.getElementById('APN_DELETE_BTN');
    if (details) details.style.display = mode === 'auto' ? 'none' : '';
    if (delBtn) delBtn.style.display = mode === 'auto' ? 'none' : '';
  }

  // APN form submit
  var apnForm = document.getElementById('APNCtrlForm');
  if (apnForm) {
    apnForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      try {
        var cookie = await login();
        if (!cookie) return showCtrlToast('Login failed', 'error');
        var form = e.target;
        var mode = form.querySelector('[name="apn_mode"]');
        mode = mode ? mode.value : 'manual';
        var profileEl = document.getElementById('APN_PROFILE_CTRL');
        var idx = profileEl ? profileEl.value : '0';

        if (mode === 'auto') {
          await (await postData(cookie, { goformId: 'APN_PROC_EX', apn_mode: 'auto' })).json();
        } else {
          var pdpType = (form.querySelector('[name="pdp_method"]') || {}).value || 'IP';
          var profileName = (form.querySelector('[name="profile_name"]') || {}).value || '';
          var apnVal = (form.querySelector('[name="apn"]') || {}).value || '';
          var authVal = (form.querySelector('[name="auth_method"]') || {}).value || 'none';
          var userVal = (form.querySelector('[name="username"]') || {}).value || '';
          var passVal = (form.querySelector('[name="password"]') || {}).value || '';

          if (!profileName.trim()) return showCtrlToast('Profile Name is required', 'error');
          if (!apnVal.trim()) return showCtrlToast('APN is required', 'error');
          var data = {
            goformId: 'APN_PROC_EX',
            apn_action: 'save',
            apn_mode: 'manual',
            profile_name: profileName,
            wan_dial: '*99#',
            apn_select: 'manual',
            pdp_type: pdpType,
            pdp_select: 'auto',
            pdp_addr: '',
            index: idx
          };
          // Send fields based on PDP type (matches native firmware expectations)
          if (pdpType === 'IP') {
            data.wan_apn = apnVal;
            data.ppp_auth_mode = authVal;
            data.ppp_username = userVal;
            data.ppp_passwd = passVal;
            data.dns_mode = 'auto';
            data.prefer_dns_manual = '';
            data.standby_dns_manual = '';
          } else if (pdpType === 'IPv6') {
            data.ipv6_wan_apn = apnVal;
            data.ipv6_ppp_auth_mode = authVal;
            data.ipv6_ppp_username = userVal;
            data.ipv6_ppp_passwd = passVal;
            data.ipv6_dns_mode = 'auto';
            data.ipv6_prefer_dns_manual = '';
            data.ipv6_standby_dns_manual = '';
          } else {
            // IPv4v6: send both sets
            data.wan_apn = apnVal;
            data.ppp_auth_mode = authVal;
            data.ppp_username = userVal;
            data.ppp_passwd = passVal;
            data.dns_mode = 'auto';
            data.prefer_dns_manual = '';
            data.standby_dns_manual = '';
            data.ipv6_wan_apn = apnVal;
            data.ipv6_ppp_auth_mode = authVal;
            data.ipv6_ppp_username = userVal;
            data.ipv6_ppp_passwd = passVal;
            data.ipv6_dns_mode = 'auto';
            data.ipv6_prefer_dns_manual = '';
            data.ipv6_standby_dns_manual = '';
          }
          await (await postData(cookie, data)).json();
          // Set as default profile
          await (await postData(cookie, {
            goformId: 'APN_PROC_EX',
            apn_mode: 'manual',
            apn_action: 'set_default',
            set_default_flag: '1',
            pdp_type: pdpType,
            index: idx
          })).json();
        }
        showCtrlToast('Saved');
        loadAPNData();
      } catch (err) { showCtrlToast('Save failed', 'error'); }
    });
  }

  // APN delete
  var delBtn = document.getElementById('APN_DELETE_BTN');
  if (delBtn) {
    delBtn.addEventListener('click', async function () {
      try {
        var cookie = await login();
        if (!cookie) return showCtrlToast('Login failed', 'error');
        var profileEl = document.getElementById('APN_PROFILE_CTRL');
        if (!profileEl) return;
        var idx = profileEl.value;
        await (await postData(cookie, {
          goformId: 'APN_PROC_EX',
          apn_mode: 'manual',
          apn_action: 'delete',
          index: idx
        })).json();
        showCtrlToast('Deleted');
        loadAPNData();
      } catch (err) { showCtrlToast('Delete failed', 'error'); }
    });
  }

  // APN new profile
  var newBtn = document.getElementById('APN_NEW_BTN');
  if (newBtn) {
    newBtn.addEventListener('click', function () {
      // Find next free index
      var nextIdx = 0;
      for (var i = 0; i < 20; i++) {
        var taken = apnProfiles.some(function (p) { return p.index === i; });
        if (!taken) { nextIdx = i; break; }
      }
      // Clear form fields for new entry
      var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = val; };
      set('APN_NAME_CTRL', '');
      set('APN_APN_CTRL', '');
      set('APN_USER_CTRL', '');
      set('APN_PASS_CTRL', '');
      set('APN_AUTH_CTRL', 'none');
      set('APN_PDP_CTRL', 'IP');
      // Add temp option to profile selector
      var profileEl = document.getElementById('APN_PROFILE_CTRL');
      if (profileEl) {
        var opt = document.createElement('option');
        opt.value = nextIdx;
        opt.textContent = 'New Profile';
        opt.selected = true;
        profileEl.appendChild(opt);
        profileEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Ensure manual mode & details visible
      var modeEl = document.getElementById('APN_MODE_CTRL');
      if (modeEl) { modeEl.value = 'manual'; modeEl.dispatchEvent(new Event('change', { bubbles: true })); }
      toggleAPNMode('manual');
      // Focus name field
      var nameEl = document.getElementById('APN_NAME_CTRL');
      if (nameEl) nameEl.focus();
      showCtrlToast('Fill in details and click Save');
    });
  }

  // Listen for panel show event
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'apn') loadAPNData();
  });

  window.loadAPNData = loadAPNData;
})();
