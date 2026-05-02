/**
 * Band Lock Panel — Lock/unlock LTE & NR bands
 * Chip-based UI for band selection.
 * API: goformId LTE_BAND_LOCK / NR_BAND_LOCK, then REBOOT_DEVICE
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="band_lock"]');
  if (!panel) return;

  // Band definitions
  var BANDS = {
    '4G': [
      { band: '1',  name: 'B1',  freq: '2100 MHz',    mode: 'FDD' },
      { band: '3',  name: 'B3',  freq: '1800 MHz',    mode: 'FDD' },
      { band: '5',  name: 'B5',  freq: '850 MHz',     mode: 'FDD' },
      { band: '8',  name: 'B8',  freq: '900 MHz',     mode: 'FDD' },
      { band: '34', name: 'B34', freq: '2000 MHz',    mode: 'TDD' },
      { band: '38', name: 'B38', freq: '2600 MHz',    mode: 'TDD' },
      { band: '39', name: 'B39', freq: '1900 MHz',    mode: 'TDD' },
      { band: '40', name: 'B40', freq: '2300 MHz',    mode: 'TDD' },
      { band: '41', name: 'B41', freq: '2500 MHz',    mode: 'TDD' }
    ],
    '5G': [
      { band: '1',  name: 'N1',  freq: '2100 MHz',  mode: 'FDD' },
      { band: '5',  name: 'N5',  freq: '850 MHz',   mode: 'FDD' },
      { band: '8',  name: 'N8',  freq: '900 MHz',   mode: 'FDD' },
      { band: '28', name: 'N28', freq: '700 MHz',   mode: 'FDD' },
      { band: '41', name: 'N41', freq: '2500 MHz',  mode: 'TDD' },
      { band: '78', name: 'N78', freq: '3500 MHz',  mode: 'TDD' }
    ]
  };

  var statusEl = document.getElementById('band_lock_status');
  var countEl = document.getElementById('band_lock_count');
  var chipContainer = document.getElementById('band_lock_chips');
  var selectAllBtn = document.getElementById('band_lock_select_all_btn');
  var clearAllBtn = document.getElementById('band_lock_clear_all_btn');
  var lockBtn = document.getElementById('band_lock_apply_btn');
  var unlockBtn = document.getElementById('band_lock_unlock_btn');
  var filterBtns = panel.querySelectorAll('[data-band-filter]');

  var currentFilter = 'all';

  // Build chip grid — always renders ALL chips, uses CSS to filter visibility
  function buildChips() {
    var html = '';
    ['4G', '5G'].forEach(function (type) {
      var hidden = currentFilter !== 'all' && currentFilter !== type;
      html += '<div class="band-group-label"' + (hidden ? ' style="display:none"' : '') + ' data-group="' + type + '">' +
        (type === '4G' ? '4G LTE' : '5G NR') + '</div>';
      html += '<div class="band-chip-grid"' + (hidden ? ' style="display:none"' : '') + ' data-group="' + type + '">';
      BANDS[type].forEach(function (b) {
        html += '<div class="band-chip" data-type="' + type + '" data-band="' + b.band + '">' +
          '<span class="band-chip-name">' + b.name + '</span>' +
          '<span class="band-chip-freq">' + b.freq + '</span>' +
          '</div>';
      });
      html += '</div>';
    });
    chipContainer.innerHTML = html;
    bindChipClicks();
    updateCount();
  }

  // Apply filter visibility without rebuilding chips (preserves selection state)
  function applyFilter() {
    ['4G', '5G'].forEach(function (type) {
      var hidden = currentFilter !== 'all' && currentFilter !== type;
      chipContainer.querySelectorAll('[data-group="' + type + '"]').forEach(function (el) {
        el.style.display = hidden ? 'none' : '';
      });
    });
    updateCount();
  }

  function bindChipClicks() {
    var chips = chipContainer.querySelectorAll('.band-chip');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chip.classList.toggle('selected');
        updateCount();
      });
    });
  }

  function updateCount() {
    var total = chipContainer.querySelectorAll('.band-chip').length;
    var selected = chipContainer.querySelectorAll('.band-chip.selected').length;
    countEl.textContent = selected + '/' + total + ' locked';
  }

  // Select / Clear all (only affects visible chips)
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', function () {
      chipContainer.querySelectorAll('.band-chip').forEach(function (c) {
        if (c.offsetParent !== null) c.classList.add('selected');
      });
      updateCount();
    });
  }
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function () {
      chipContainer.querySelectorAll('.band-chip').forEach(function (c) {
        if (c.offsetParent !== null) c.classList.remove('selected');
      });
      updateCount();
    });
  }

  // Filter buttons — toggle visibility without destroying DOM
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.dataset.bandFilter;
      applyFilter();
    });
  });

  // Load current locked bands from device
  async function loadLockedBands() {
    statusEl.textContent = 'Loading...';
    statusEl.style.color = '#94a3b8';
    try {
      var params = new URLSearchParams({ cmd: 'lte_band_lock,nr_band_lock', multi_data: '1' });
      var res = await getData(params);
      if (!res) {
        statusEl.textContent = 'No data';
        statusEl.style.color = '#f87171';
        return;
      }
      // Clear all selections first
      chipContainer.querySelectorAll('.band-chip').forEach(function (c) { c.classList.remove('selected'); });

      if (res['lte_band_lock']) {
        res['lte_band_lock'].split(',').forEach(function (band) {
          var chip = chipContainer.querySelector('.band-chip[data-type="4G"][data-band="' + band.trim() + '"]');
          if (chip) chip.classList.add('selected');
        });
      }
      if (res['nr_band_lock']) {
        res['nr_band_lock'].split(',').forEach(function (band) {
          var chip = chipContainer.querySelector('.band-chip[data-type="5G"][data-band="' + band.trim() + '"]');
          if (chip) chip.classList.add('selected');
        });
      }
      updateCount();
      statusEl.textContent = 'Connected';
      statusEl.style.color = '#34d399';
    } catch (e) {
      statusEl.textContent = 'Error';
      statusEl.style.color = '#f87171';
    }
  }

  // Lock selected bands (always sends BOTH 4G and 5G from all chips in DOM)
  async function applyBandLock() {
    var lteBands = [];
    var nrBands = [];
    chipContainer.querySelectorAll('.band-chip.selected').forEach(function (chip) {
      var type = chip.dataset.type;
      var band = chip.dataset.band;
      if (type === '4G') lteBands.push(band);
      if (type === '5G') nrBands.push(band);
    });

    lockBtn.disabled = true;
    lockBtn.textContent = 'Applying...';
    try {
      var cookie = await login();
      if (!cookie) {
        showCtrlToast('Login failed', 'error');
        return;
      }
      // Send LTE band lock
      var lteRes = await (await postData(cookie, {
        goformId: 'LTE_BAND_LOCK',
        lte_band_lock: lteBands.join(',')
      })).json();

      // Send NR band lock
      var nrRes = await (await postData(cookie, {
        goformId: 'NR_BAND_LOCK',
        nr_band_lock: nrBands.join(',')
      })).json();

      var lteOk = lteRes && lteRes.result === 'success';
      var nrOk = nrRes && nrRes.result === 'success';

      if (lteOk || nrOk) {
        showCtrlToast('Bands locked! Device will restart to apply changes.');
        // Reboot device like the real firmware does after band lock
        try {
          await postData(cookie, { goformId: 'REBOOT_DEVICE' });
        } catch (e) { /* reboot may drop connection */ }
      } else {
        showCtrlToast('Failed to lock bands', 'error');
      }
    } catch (e) {
      showCtrlToast('Error: ' + e.message, 'error');
    } finally {
      lockBtn.disabled = false;
      lockBtn.textContent = 'Apply';
      // Reload after a short delay (device may be rebooting)
      setTimeout(function () { loadLockedBands(); }, 2000);
    }
  }

  // Unlock all bands — select all chips then apply
  async function unlockAllBands() {
    chipContainer.querySelectorAll('.band-chip').forEach(function (c) { c.classList.add('selected'); });
    updateCount();
    await applyBandLock();
  }

  // Bind buttons
  if (lockBtn) lockBtn.addEventListener('click', applyBandLock);
  if (unlockBtn) unlockBtn.addEventListener('click', unlockAllBands);

  // Init on panel show
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'band_lock') {
      buildChips();
      loadLockedBands();
    }
  });

  // Build initial chips
  buildChips();
})();
