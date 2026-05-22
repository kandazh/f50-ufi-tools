/**
 * Cell Lock — Lock to specific cell tower by PCI & EARFCN
 * Separate panel in Controls sidebar.
 * API: goformId CELL_LOCK / UNLOCK_ALL_CELL
 * Reads: neighbor_cell_info, locked_cell_info
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="cell_lock"]');
  if (!panel) return;

  var lockedListEl = document.getElementById('cell_lock_locked_list');
  var currentCardEl = document.getElementById('cell_lock_current_card');
  var neighborListEl = document.getElementById('cell_lock_neighbor_list');
  var refreshBtn = document.getElementById('cell_lock_refresh_btn');
  var pciInput = document.getElementById('cell_lock_pci');
  var earfcnInput = document.getElementById('cell_lock_earfcn');
  var submitBtn = document.getElementById('cell_lock_submit_btn');
  var unlockAllBtn = document.getElementById('cell_lock_unlock_all_btn');
  var ratBtns = panel.querySelectorAll('.cell-lock-rat-btn');
  var countEl = document.getElementById('cell_lock_count');
  var neighborCountEl = document.getElementById('cell_lock_neighbor_count');

  var selectedRat = '12'; // default 4G
  var refreshTimer = null;
  var isRefreshing = false;
  var panelVisible = false;
  var lastNeighborData = []; // cache for cross-referencing locked cells
  var lastCurrentData = []; // cache current cell rows when modem exposes structured data

  function hasCellValue(value) {
    return value != null && String(value).trim() !== '';
  }

  function normalizeBandLabel(band, rat, channel) {
    if (!hasCellValue(band)) return '?';

    var label = String(band).trim().toUpperCase();
    if (label.indexOf('LTE') === 0) label = 'B' + label.slice(3);
    if (label.indexOf('NR') === 0) label = 'N' + label.slice(2);
    if (/^[BN]/.test(label)) return label;

    var channelNumber = Number(String(channel || '').trim());
    var isNr = rat === '16' || (!Number.isNaN(channelNumber) && channelNumber > 65535);
    return (isNr ? 'N' : 'B') + label;
  }

  function normalizeCell(cell, fallbackRat) {
    if (!cell) return null;
    var channel = hasCellValue(cell.fcn) ? cell.fcn : cell.earfcn;
    return {
      band: normalizeBandLabel(cell.band, cell.rat || fallbackRat, channel),
      fcn: hasCellValue(cell.fcn) ? cell.fcn : channel,
      earfcn: hasCellValue(cell.earfcn) ? cell.earfcn : channel,
      pci: cell.pci,
      rat: cell.rat || fallbackRat || '',
      rsrp: cell.rsrp,
      sinr: cell.sinr,
      rsrq: cell.rsrq
    };
  }

  function distanceToRange(value, min, max) {
    if (value < min) return min - value;
    if (value > max) return value - max;
    return 0;
  }

  function normalizeSignalValue(value, min, max) {
    if (!hasCellValue(value)) return null;
    var candidate = Number(String(value).trim());
    if (!Number.isFinite(candidate)) return null;

    for (var i = 0; i < 4; i++) {
      if (candidate >= min && candidate <= max) return candidate;

      var scaled = candidate / 10;
      if (!Number.isFinite(scaled)) break;
      if (distanceToRange(scaled, min, max) >= distanceToRange(candidate, min, max)) break;
      candidate = scaled;
    }

    return candidate >= min && candidate <= max ? candidate : null;
  }

  function formatSignalValue(value) {
    var rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, '');
  }

  function renderSignalMetric(value, min, max, greenLow, yellowLow) {
    min = typeof min === 'number' ? min : -125;
    max = typeof max === 'number' ? max : -81;
    greenLow = typeof greenLow === 'number' ? greenLow : -90;
    yellowLow = typeof yellowLow === 'number' ? yellowLow : -100;

    var normalizedValue = normalizeSignalValue(value, min, max);
    if (normalizedValue == null) return '—';
    return hotbox_parseSignalBar(formatSignalValue(normalizedValue), min, max, greenLow, yellowLow);
  }

  // RAT toggle
  ratBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      ratBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedRat = btn.dataset.rat;
    });
  });

  var TABLE_HEAD = '<table class="nice-table"><thead><tr>' +
    '<th>Band</th><th>Freq</th><th>PCI</th><th>RSRP</th><th>SINR</th><th>RSRQ</th>' +
    '</tr></thead><tbody>';
  var TABLE_FOOT = '</tbody></table>';

  // Find matching cell for a locked cell (check neighbors + current cell from UFI_DATA)
  function findNeighborMatch(pci, earfcn) {
    for (var i = 0; i < lastNeighborData.length; i++) {
      if (lastNeighborData[i].pci == pci && lastNeighborData[i].earfcn == earfcn) return lastNeighborData[i];
    }
    for (var j = 0; j < lastCurrentData.length; j++) {
      var current = lastCurrentData[j];
      if (current.pci == pci && current.earfcn == earfcn) return current;
    }
    // Fall back to current cell from main status poll
    var d = window.UFI_DATA || {};
    if (d.Lte_pci == pci && d.Lte_fcn == earfcn) {
      return { band: 'B' + (d.Lte_bands || '?'), pci: d.Lte_pci, earfcn: d.Lte_fcn, rsrp: d.lte_rsrp, sinr: d.Lte_snr, rsrq: d.lte_rsrq };
    }
    if (d.Nr_pci == pci && d.Nr_fcn == earfcn) {
      return { band: 'N' + (d.Nr_bands || '?'), pci: d.Nr_pci, earfcn: d.Nr_fcn, rsrp: d.Z5g_rsrp, sinr: d.Nr_snr, rsrq: d.nr_rsrq };
    }
    return null;
  }

  // Build locked cells table
  function renderLockedCells(cells) {
    if (!cells || cells.length === 0) {
      lockedListEl.innerHTML = '<div class="cell-lock-empty">No locked cells</div>';
      return;
    }
    var rows = cells.map(function (c) {
      var match = findNeighborMatch(c.pci, c.earfcn);
      var bandName = match ? normalizeBandLabel(match.band, match.rat, match.fcn || match.earfcn) : (c.rat == '12' ? 'B?' : 'N?');
      var rsrpTd = match ? renderSignalMetric(match.rsrp) : '—';
      var sinrTd = match ? renderSignalMetric(match.sinr, -10, 30, 13, 0) : '—';
      var rsrqTd = match ? renderSignalMetric(match.rsrq, -20, -3, -9, -12) : '—';
      return '<tr style="cursor:pointer" data-pci="' + c.pci + '" data-earfcn="' + c.earfcn + '" data-rat="' + c.rat + '">' +
        '<td>' + bandName + '</td>' +
        '<td>' + c.earfcn + '</td>' +
        '<td>' + c.pci + '</td>' +
        '<td>' + rsrpTd + '</td>' +
        '<td>' + sinrTd + '</td>' +
        '<td>' + rsrqTd + '</td>' +
        '</tr>';
    }).join('');
    lockedListEl.innerHTML = TABLE_HEAD + rows + TABLE_FOOT;
    lockedListEl.querySelectorAll('tr[data-pci]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var rat = tr.dataset.rat;
        var fakeBand = rat == '16' ? 'N' : 'B';
        fillInputs(tr.dataset.pci, tr.dataset.earfcn, fakeBand);
      });
    });
  }

  // Build current cell table (supports CA - multiple cells)
  function renderCurrentCell(data) {
    var cells = Array.isArray(data) ? data : (data && (data.pci || data.fcn) ? [data] : []);
    if (cells.length === 0) {
      currentCardEl.innerHTML = '<div class="cell-lock-empty">No cell connected</div>';
      return;
    }
    var rows = cells.map(function (c, i) {
      var normalized = normalizeCell(c, /^N/i.test(c.band || '') ? '16' : '12');
      var label = cells.length > 1 ? (i === 0 ? 'PCC' : 'SCC' + i) : '';
      var bandTd = (label ? '<span style="font-size:10px;opacity:0.5;margin-right:4px">' + label + '</span>' : '') + normalized.band;
      return '<tr style="cursor:pointer" data-pci="' + normalized.pci + '" data-earfcn="' + normalized.fcn + '" data-band="' + normalized.band + '">' +
        '<td>' + bandTd + '</td>' +
        '<td>' + normalized.fcn + '</td>' +
        '<td>' + normalized.pci + '</td>' +
        '<td>' + renderSignalMetric(normalized.rsrp) + '</td>' +
        '<td>' + renderSignalMetric(normalized.sinr, -10, 30, 13, 0) + '</td>' +
        '<td>' + renderSignalMetric(normalized.rsrq, -20, -3, -9, -12) + '</td>' +
        '</tr>';
    }).join('');
    currentCardEl.innerHTML = TABLE_HEAD + rows + TABLE_FOOT;
    currentCardEl.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        fillInputs(tr.dataset.pci, tr.dataset.earfcn, tr.dataset.band);
      });
    });
  }

  // Build neighbor cells table
  function renderNeighborCells(cells) {
    if (!cells || cells.length === 0) {
      neighborListEl.innerHTML = '<div class="cell-lock-empty">No neighbor cells found</div>';
      return;
    }
    var rows = cells.map(function (c) {
      var normalized = normalizeCell(c);
      return '<tr style="cursor:pointer" data-pci="' + normalized.pci + '" data-earfcn="' + normalized.earfcn + '" data-band="' + normalized.band + '">' +
        '<td>' + normalized.band + '</td>' +
        '<td>' + normalized.earfcn + '</td>' +
        '<td>' + normalized.pci + '</td>' +
        '<td>' + renderSignalMetric(normalized.rsrp) + '</td>' +
        '<td>' + renderSignalMetric(normalized.sinr, -10, 30, 13, 0) + '</td>' +
        '<td>' + renderSignalMetric(normalized.rsrq, -20, -3, -9, -12) + '</td>' +
        '</tr>';
    }).join('');
    neighborListEl.innerHTML = TABLE_HEAD + rows + TABLE_FOOT;
    // Click to fill manual lock form
    neighborListEl.querySelectorAll('tr').forEach(function (tr) {
      if (tr.dataset.pci) {
        tr.addEventListener('click', function () {
          fillInputs(tr.dataset.pci, tr.dataset.earfcn, tr.dataset.band);
        });
      }
    });
  }

  function fillInputs(pci, earfcn, band) {
    if (pciInput) pciInput.value = pci || '';
    if (earfcnInput) earfcnInput.value = earfcn || '';
    // Auto-select RAT based on band (N prefix = 5G NR, otherwise 4G LTE)
    if (band) {
      var normalizedBand = normalizeBandLabel(band, '', earfcn);
      var isNR = /^N/.test(normalizedBand);
      var targetRat = isNR ? '16' : '12';
      if (targetRat !== selectedRat) {
        selectedRat = targetRat;
        ratBtns.forEach(function (b) {
          b.classList.toggle('active', b.dataset.rat === targetRat);
        });
      }
    }
    showCtrlToast('Selected PCI ' + pci + ', EARFCN ' + earfcn + ' (' + (selectedRat === '16' ? '5G' : '4G') + ')');
  }

  // Lock a cell by PCI, EARFCN, RAT
  async function lockCell(pci, earfcn, rat) {
    showCtrlToast('Locking PCI ' + pci + '...');
    try {
      var cookie = await login();
      if (!cookie) { showCtrlToast('Login failed', 'error'); return; }
      var res = await (await postData(cookie, {
        goformId: 'CELL_LOCK',
        pci: pci,
        earfcn: earfcn,
        rat: rat
      })).json();
      if (res && res.result === 'success') {
        showCtrlToast('Locked: PCI ' + pci + ' (' + (rat === '16' ? '5G' : '4G') + ')');
        loadCellData(false);
      } else {
        showCtrlToast('Lock failed', 'error');
      }
    } catch (e) {
      showCtrlToast('Error: ' + e.message, 'error');
    }
  }

  // Fetch cell data
  var _isLoadingCellData = false;
  async function loadCellData(lockedOnly) {
    if (_isLoadingCellData) return;
    _isLoadingCellData = true;
    try {
      // neighbor + locked (same as original firmware Network tab)
      var params = new URLSearchParams({ cmd: 'neighbor_cell_info,locked_cell_info,current_cell_info' });
      var res = await getData(params);
      if (!res) res = {};

      if (!lockedOnly) {
        lastNeighborData = Array.isArray(res.neighbor_cell_info)
          ? res.neighbor_cell_info.map(function (cell) { return normalizeCell(cell); }).filter(Boolean)
          : [];
        renderNeighborCells(lastNeighborData);
        if (neighborCountEl) neighborCountEl.textContent = String(lastNeighborData.length);
      }

      if (!lockedOnly) {
        lastCurrentData = Array.isArray(res.current_cell_info)
          ? res.current_cell_info.map(function (cell) { return normalizeCell(cell); }).filter(Boolean)
          : [];
        if (lastCurrentData.length > 0) {
          renderCurrentCell(lastCurrentData);
        }
      }

      if (res.locked_cell_info) {
        renderLockedCells(res.locked_cell_info);
        if (countEl) countEl.textContent = res.locked_cell_info.length || '0';
      }
      // Current cell from main status poll (UFI_DATA) — ZTE firmware only returns
      // these fields when bundled with the full status batch, not standalone
      if (!lockedOnly) {
        var d = window.UFI_DATA || {};
        if (lastCurrentData.length > 0) {
          renderCurrentCell(lastCurrentData);
        } else {
          var cells = [];
          if (d.Lte_pci && d.Lte_fcn) {
            cells.push({
              band: 'B' + (d.Lte_bands || '?'),
              fcn: d.Lte_fcn,
              earfcn: d.Lte_fcn,
              pci: d.Lte_pci,
              rat: '12',
              rsrp: d.lte_rsrp || '',
              sinr: d.Lte_snr || '',
              rsrq: d.lte_rsrq || ''
            });
          }
          if (d.Nr_pci && d.Nr_fcn) {
            cells.push({
              band: 'N' + (d.Nr_bands || '?'),
              fcn: d.Nr_fcn,
              earfcn: d.Nr_fcn,
              pci: d.Nr_pci,
              rat: '16',
              rsrp: d.Z5g_rsrp || '',
              sinr: d.Nr_snr || '',
              rsrq: d.nr_rsrq || ''
            });
          }
          lastCurrentData = cells.map(function (cell) { return normalizeCell(cell, cell.rat); }).filter(Boolean);
          renderCurrentCell(lastCurrentData);
        }
      }
    } catch (e) { /* ignore */ }
    finally {
      _isLoadingCellData = false;
    }
  }

  // Start/stop auto-refresh
  function startRefresh() {
    stopRefresh();
    isRefreshing = true;
    if (refreshBtn) {
      refreshBtn.textContent = 'Stop Refresh';
      refreshBtn.classList.add('active');
    }
    loadCellData(false);
    refreshTimer = setInterval(function () {
      if (panelVisible) loadCellData(false);
    }, 5000);
  }

  function stopRefresh() {
    isRefreshing = false;
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (refreshBtn) {
      refreshBtn.textContent = 'Start Refresh';
      refreshBtn.classList.remove('active');
    }
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      if (isRefreshing) stopRefresh();
      else startRefresh();
    });
  }

  // Lock cell (manual form)
  if (submitBtn) {
    submitBtn.addEventListener('click', async function () {
      var pci = (pciInput.value || '').trim();
      var earfcn = (earfcnInput.value || '').trim();
      if (!pci || !earfcn) {
        showCtrlToast('Enter PCI and EARFCN', 'error');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Locking...';
      await lockCell(pci, earfcn, selectedRat);
      pciInput.value = '';
      earfcnInput.value = '';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Lock Cell';
    });
  }

  // Unlock all cells
  if (unlockAllBtn) {
    unlockAllBtn.addEventListener('click', async function () {
      unlockAllBtn.disabled = true;
      unlockAllBtn.textContent = 'Unlocking...';
      try {
        var cookie = await login();
        if (!cookie) { showCtrlToast('Login failed', 'error'); return; }
        var res = await (await postData(cookie, {
          goformId: 'UNLOCK_ALL_CELL'
        })).json();
        if (res && res.result === 'success') {
          showCtrlToast('All cells unlocked');
          loadCellData(true);
        } else {
          showCtrlToast('Unlock failed', 'error');
        }
      } catch (e) {
        showCtrlToast('Error: ' + e.message, 'error');
      } finally {
        unlockAllBtn.disabled = false;
        unlockAllBtn.textContent = 'Unlock All Cells';
      }
    });
  }

  // Panel visibility
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'cell_lock') {
      panelVisible = true;
      startRefresh();
    } else {
      panelVisible = false;
      stopRefresh();
    }
  });
})();
