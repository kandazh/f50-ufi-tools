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

  // Find matching neighbor for a locked cell
  function findNeighborMatch(pci, earfcn) {
    for (var i = 0; i < lastNeighborData.length; i++) {
      if (lastNeighborData[i].pci == pci && lastNeighborData[i].earfcn == earfcn) return lastNeighborData[i];
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
      var bandName = match ? match.band : (c.rat == '12' ? 'B?' : 'N?');
      var rsrpTd = match ? hotbox_parseSignalBar(match.rsrp) : '—';
      var sinrTd = match ? hotbox_parseSignalBar(match.sinr, -10, 30, 13, 0) : '—';
      var rsrqTd = match ? hotbox_parseSignalBar(match.rsrq, -20, -3, -9, -12) : '—';
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
      var label = cells.length > 1 ? (i === 0 ? 'PCC' : 'SCC' + i) : '';
      var bandTd = (label ? '<span style="font-size:10px;opacity:0.5;margin-right:4px">' + label + '</span>' : '') + c.band;
      return '<tr style="cursor:pointer" data-pci="' + c.pci + '" data-earfcn="' + c.fcn + '" data-band="' + c.band + '">' +
        '<td>' + bandTd + '</td>' +
        '<td>' + c.fcn + '</td>' +
        '<td>' + c.pci + '</td>' +
        '<td>' + hotbox_parseSignalBar(c.rsrp) + '</td>' +
        '<td>' + hotbox_parseSignalBar(c.sinr, -10, 30, 13, 0) + '</td>' +
        '<td>' + hotbox_parseSignalBar(c.rsrq, -20, -3, -9, -12) + '</td>' +
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
      return '<tr style="cursor:pointer" data-pci="' + c.pci + '" data-earfcn="' + c.earfcn + '" data-band="' + (c.band || '') + '">' +
        '<td>' + (c.band || '?') + '</td>' +
        '<td>' + c.earfcn + '</td>' +
        '<td>' + c.pci + '</td>' +
        '<td>' + hotbox_parseSignalBar(c.rsrp) + '</td>' +
        '<td>' + hotbox_parseSignalBar(c.sinr, -10, 30, 13, 0) + '</td>' +
        '<td>' + hotbox_parseSignalBar(c.rsrq, -20, -3, -9, -12) + '</td>' +
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
      var isNR = /^n/i.test(band);
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
  async function loadCellData(lockedOnly) {
    try {
      // neighbor + locked (same as original firmware Network tab)
      var params = new URLSearchParams({ cmd: 'neighbor_cell_info,locked_cell_info' });
      var res = await getData(params);
      if (!res) return;

      if (!lockedOnly && res.neighbor_cell_info) {
        lastNeighborData = res.neighbor_cell_info;
        renderNeighborCells(res.neighbor_cell_info);
        if (neighborCountEl) neighborCountEl.textContent = res.neighbor_cell_info.length || '0';
      }
      if (res.locked_cell_info) {
        renderLockedCells(res.locked_cell_info);
        if (countEl) countEl.textContent = res.locked_cell_info.length || '0';
      }
    } catch (e) { /* ignore */ }

    // Current cell from standard status fields (separate request)
    if (!lockedOnly) {
      try {
        var cellParams = new URLSearchParams({
          cmd: 'Lte_pci,Lte_fcn,Lte_bands,lte_rsrp,Lte_snr,lte_rsrq,Nr_pci,Nr_fcn,Nr_bands,Z5g_rsrp,Nr_snr,nr_rsrq',
          multi_data: '1'
        });
        var cellRes = await getData(cellParams);
        if (cellRes) {
          var cells = [];
          // 4G cell
          if (cellRes.Lte_pci && cellRes.Lte_fcn) {
            cells.push({
              band: 'B' + (cellRes.Lte_bands || '?'),
              fcn: cellRes.Lte_fcn,
              pci: cellRes.Lte_pci,
              rsrp: cellRes.lte_rsrp || '',
              sinr: cellRes.Lte_snr || '',
              rsrq: cellRes.lte_rsrq || ''
            });
          }
          // 5G cell
          if (cellRes.Nr_pci && cellRes.Nr_fcn) {
            cells.push({
              band: 'N' + (cellRes.Nr_bands || '?'),
              fcn: cellRes.Nr_fcn,
              pci: cellRes.Nr_pci,
              rsrp: cellRes.Z5g_rsrp || '',
              sinr: cellRes.Nr_snr || '',
              rsrq: cellRes.nr_rsrq || ''
            });
          }
          renderCurrentCell(cells);
        }
      } catch (e) { /* ignore */ }
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
