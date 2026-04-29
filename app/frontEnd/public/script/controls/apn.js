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
          apn: parts[1] || '',
          auth: parts[4] || 'none',
          username: parts[5] || '',
          password: parts[6] || '',
          pdp: parts[7] || 'IP'
        });
      }

      apnCurrentIndex = parseInt(res.apn_Current_index) || 0;

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
      var form = e.target;
      var mode = form.querySelector('[name="apn_mode"]');
      mode = mode ? mode.value : 'manual';
      var profileEl = document.getElementById('APN_PROFILE_CTRL');
      var idx = profileEl ? profileEl.value : '0';

      if (mode === 'auto') {
        await postData(new URLSearchParams({ goformId: 'APN_PROC_EX', apn_mode: 'auto' }));
      } else {
        var data = {
          goformId: 'APN_PROC_EX',
          apn_mode: 'manual',
          apn_action: 'save',
          index: idx,
          profile_name: (form.querySelector('[name="profile_name"]') || {}).value || '',
          wan_dial: '*99#',
          apn_wan_dial: '*99#',
          apn_select: 'manual',
          apn_wan_apn: (form.querySelector('[name="apn"]') || {}).value || '',
          apn_ppp_auth_mode: (form.querySelector('[name="auth_method"]') || {}).value || 'none',
          apn_ppp_username: (form.querySelector('[name="username"]') || {}).value || '',
          apn_ppp_passwd: (form.querySelector('[name="password"]') || {}).value || '',
          apn_pdp_type: (form.querySelector('[name="pdp_method"]') || {}).value || 'IP',
          pdp_type: (form.querySelector('[name="pdp_method"]') || {}).value || 'IP',
          pdp_select: 'auto',
          pdp_addr: '',
          dns_mode: 'auto',
          prefer_dns_manual: '',
          standby_dns_manual: ''
        };
        await postData(new URLSearchParams(data));
      }
      showCtrlToast('Saved');
      loadAPNData();
    });
  }

  // APN delete
  var delBtn = document.getElementById('APN_DELETE_BTN');
  if (delBtn) {
    delBtn.addEventListener('click', async function () {
      var profileEl = document.getElementById('APN_PROFILE_CTRL');
      if (!profileEl) return;
      var idx = profileEl.value;
      await postData(new URLSearchParams({
        goformId: 'APN_PROC_EX',
        apn_mode: 'manual',
        apn_action: 'delete',
        index: idx
      }));
      showCtrlToast('Deleted');
      loadAPNData();
    });
  }

  // Listen for panel show event
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'apn') loadAPNData();
  });

  window.loadAPNData = loadAPNData;
})();
