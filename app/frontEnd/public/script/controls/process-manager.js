/**
 * Process Manager — panel controller
 * Renders in data-ctrl-panel="process_mgr"
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="process_mgr"]');
  if (!panel) return;

  var STYLE_ID = 'pm_panel_style';

  var state = {
    busy: false,
    loadedAt: '',
    query: '',
    sortBy: 'rss',
    processes: [],
    filtered: [],
    packages: new Set(),
  };

  // --- Helpers ---
  function shellQuote(value) { return "'" + String(value || '').replace(/'/g, "'\\''") + "'"; }
  function normalizeLine(value) { return String(value || '').replace(/\r/g, '').trim(); }
  function formatTime(value) {
    if (!value) return '--';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '--';
    return date.getHours().toString().padStart(2, '0') + ':' +
      date.getMinutes().toString().padStart(2, '0') + ':' +
      date.getSeconds().toString().padStart(2, '0');
  }
  function formatKib(value) {
    var kib = Number(value) || 0;
    if (!kib) return '-';
    return formatBytes(kib * 1024);
  }
  function inferPackageName(name, packageSet) {
    var raw = String(name || '').trim();
    if (!raw) return '';
    var candidate = raw.split(':')[0].trim();
    if (candidate && packageSet.has(candidate)) return candidate;
    var matches = raw.match(/[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+/g) || [];
    matches.sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < matches.length; i++) {
      var normalized = matches[i].split(':')[0].trim();
      if (packageSet.has(normalized)) return normalized;
    }
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].includes('.')) return matches[i].split(':')[0].trim();
    }
    return '';
  }

  async function run(command, timeout) {
    var res = await runShellWithRoot(command, timeout || 30000);
    return {
      ok: Boolean(res && res.success),
      text: String((res && res.content) || '').trim(),
    };
  }

  // --- Style ---
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '\
      .pm-table-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }\
      .pm-table-scroll::-webkit-scrollbar { height:6px; }\
      .pm-table-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.18); border-radius:999px; }\
      .pm-list-inner { min-width:580px; }\
      .pm-table-head, .pm-row { display:grid; grid-template-columns:54px 54px 68px 56px minmax(0,1fr) 64px; gap:4px; align-items:center; padding:4px 8px; }\
      .pm-table-head { font-size:11px; font-weight:700; opacity:.6; background:rgba(255,255,255,.04); position:sticky; top:0; z-index:1; }\
      .pm-row { border-top:1px solid rgba(255,255,255,.05); min-height:28px; }\
      .pm-row:hover { background:rgba(255,255,255,.035); }\
      .pm-col { font-size:11px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\
      .pm-col[data-kind="main"] { font-weight:700; }\
      .pm-actions { display:flex; justify-content:flex-end; }\
      .pm-actions button { padding:2px 8px; min-height:22px; font-size:11px; cursor:pointer; border-radius:5px; border:1px solid rgba(248,113,113,.3); background:rgba(248,113,113,.1); color:#fca5a5; }\
      .pm-actions button:hover { background:rgba(248,113,113,.2); }\
    ';
    document.head.appendChild(style);
  }

  // --- DOM refs ---
  var searchInput = panel.querySelector('#pm_search');
  var sortSelect = panel.querySelector('#pm_sort');
  var refreshBtn = panel.querySelector('#pm_refresh_btn');
  var listEl = panel.querySelector('#pm_list');

  // --- Busy state ---
  function setBusy(busy) {
    state.busy = busy;
    if (refreshBtn) refreshBtn.disabled = busy;
    if (searchInput) searchInput.disabled = busy;
    if (sortSelect) sortSelect.disabled = busy;
  }

  // --- Filter & sort ---
  function applyFilter() {
    var keyword = normalizeLine(state.query).toLowerCase();
    if (!keyword) {
      state.filtered = state.processes.slice();
    } else {
      state.filtered = state.processes.filter(function (item) {
        return [item.name, item.packageName, item.user, String(item.pid)]
          .some(function (v) { return String(v || '').toLowerCase().includes(keyword); });
      });
    }
    state.filtered.sort(function (a, b) {
      if (state.sortBy === 'cpu') {
        if ((b.cpu || 0) !== (a.cpu || 0)) return (b.cpu || 0) - (a.cpu || 0);
        if ((b.rss || 0) !== (a.rss || 0)) return (b.rss || 0) - (a.rss || 0);
      } else {
        if ((b.rss || 0) !== (a.rss || 0)) return (b.rss || 0) - (a.rss || 0);
        if ((b.cpu || 0) !== (a.cpu || 0)) return (b.cpu || 0) - (a.cpu || 0);
      }
      return String(a.name || '').localeCompare(String(b.name || ''), 'en');
    });
  }

  // --- Data fetchers ---
  async function listPackages() {
    var res = await run("timeout 8s pm list packages 2>/dev/null | awk -F: '{print $2}'", 10000);
    return new Set(
      String(res.text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean)
    );
  }

  async function listProcesses(packageSet) {
    var res = await run("(ps -A 2>/dev/null || ps 2>/dev/null) | awk '\n\
  NR == 1 {\n\
    for (i = 1; i <= NF; i++) {\n\
      if ($i == \"PID\") pid = i;\n\
      else if ($i == \"USER\") user = i;\n\
      else if ($i == \"RSS\") rss = i;\n\
      else if ($i == \"VSZ\" || $i == \"VSS\") vsz = i;\n\
      else if ($i == \"NAME\" || $i == \"CMD\" || $i == \"COMMAND\" || $i == \"ARGS\") name = i;\n\
    }\n\
    next\n\
  }\n\
  {\n\
    if (!pid) next;\n\
    p = $pid;\n\
    if (p !~ /^[0-9]+$/) next;\n\
    u = user ? $user : \"-\";\n\
    r = rss ? $rss : \"0\";\n\
    v = vsz ? $vsz : \"0\";\n\
    if (name) {\n\
      n = $name;\n\
      for (i = name + 1; i <= NF; i++) n = n \" \" $i;\n\
    } else {\n\
      n = $NF;\n\
    }\n\
    gsub(/\\r/, \"\", n);\n\
    if (n != \"\") print p \"\\t\" u \"\\t\" r \"\\t\" v \"\\t\" n;\n\
  }'", 20000);

    return String(res.text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean).map(function (line) {
      var parts = line.split('\t');
      var pid = parts[0], user = parts[1], rss = parts[2], vsz = parts[3];
      var name = parts.slice(4).join('\t').trim();
      var packageName = inferPackageName(name, packageSet);
      return { pid: Number(pid) || 0, user: String(user || '-').trim(), rss: Number(rss) || 0, vsz: Number(vsz) || 0, cpu: 0, name: name, packageName: packageName };
    }).filter(function (item) { return item.pid > 0 && item.name; });
  }

  async function listCpuUsage() {
    var res = await run("(top -b -n 1 2>/dev/null || top -n 1 2>/dev/null || timeout 8s top -n 1 2>/dev/null) | awk '\n\
  {\n\
    if (!headerFound) {\n\
      pid = 0; cpu = 0; splitStateCpu = 0;\n\
      for (i = 1; i <= NF; i++) {\n\
        key = $i; gsub(/[^A-Za-z0-9%]/, \"\", key);\n\
        if (key == \"PID\") pid = i;\n\
        else if (key == \"%CPU\" || key == \"CPU%\" || key == \"CPU\") cpu = i;\n\
        else if (key == \"S%CPU\") { cpu = i; splitStateCpu = 1; }\n\
      }\n\
      if (pid && cpu) { headerFound = 1; pidIndex = pid; cpuIndex = splitStateCpu ? (cpu + 1) : cpu; next; }\n\
    }\n\
    if (!headerFound) next;\n\
    if (NF < pidIndex || NF < cpuIndex) next;\n\
    currentPid = $pidIndex; currentCpu = $cpuIndex;\n\
    gsub(/%/, \"\", currentCpu); gsub(/[^0-9.]/, \"\", currentCpu);\n\
    if (currentPid ~ /^[0-9]+$/ && currentCpu ~ /^[0-9.]+$/) print currentPid \"\\t\" currentCpu;\n\
  }'", 20000);

    var cpuMap = new Map();
    String(res.text || '').split(/\r?\n/).map(normalizeLine).filter(Boolean).forEach(function (line) {
      var parts = line.split('\t');
      var pidNum = Number(parts[0]) || 0;
      var cpuNum = Number(parts[1]) || 0;
      if (pidNum > 0) cpuMap.set(pidNum, cpuNum);
    });
    return cpuMap;
  }

  // --- Render ---
  function renderStats() {
    var packages = new Set(state.processes.map(function (item) { return item.packageName; }).filter(Boolean));
    var setText = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    setText('pm_stat_total', String(state.processes.length));
    setText('pm_stat_visible', String(state.filtered.length));
    setText('pm_stat_apps', String(packages.size));
    setText('pm_stat_time', formatTime(state.loadedAt));
  }

  function renderList() {
    if (!listEl) return;
    if (!state.filtered.length) {
      listEl.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.4;font-size:13px">No matching processes</div>';
      return;
    }
    var html = '<div class="pm-table-scroll"><div class="pm-list-inner">';
    html += '<div class="pm-table-head"><div>PID</div><div>CPU%</div><div>RSS</div><div>USER</div><div>NAME</div><div style="text-align:right">ACTION</div></div>';
    state.filtered.forEach(function (item) {
      html += '<div class="pm-row">';
      html += '<div class="pm-col">' + escapeHtml(String(item.pid)) + '</div>';
      html += '<div class="pm-col">' + escapeHtml((Number(item.cpu) || 0).toFixed(1)) + '</div>';
      html += '<div class="pm-col">' + escapeHtml(formatKib(item.rss)) + '</div>';
      html += '<div class="pm-col">' + escapeHtml(item.user) + '</div>';
      html += '<div class="pm-col" data-kind="main" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.packageName || item.name) + '</div>';
      html += '<div class="pm-actions"><button data-action="kill" data-pid="' + item.pid + '">Kill</button></div>';
      html += '</div>';
    });
    html += '</div></div>';
    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-action="kill"]').forEach(function (button) {
      button.onclick = async function () {
        var pid = Number(button.dataset.pid) || 0;
        var target = state.processes.find(function (item) { return item.pid === pid; });
        if (!target) { showCtrlToast('Process list is stale, refresh first', 'error'); return; }
        await killProcess(target);
      };
    });
  }

  function render() {
    applyFilter();
    renderStats();
    renderList();
  }

  // --- Kill ---
  async function confirmKill(proc) {
    return new Promise(function (resolve) {
      var label = escapeHtml(proc.packageName || proc.name);
      var extra = (proc.packageName && proc.packageName !== proc.name)
        ? '<div style="margin-top:6px;font-size:12px;opacity:.78"><code>' + escapeHtml(proc.name) + '</code></div>' : '';
      var result = createFixedToast('pm_confirm_kill',
        '<div style="pointer-events:all;width:90vw;max-width:520px;">' +
        '<div class="title" style="margin:0">Confirm Kill Process</div>' +
        '<div style="margin-top:10px;font-size:13px;line-height:1.7">' +
        'Will attempt to kill <b>' + label + '</b>, PID <code>' + escapeHtml(String(proc.pid)) + '</code>.<br>' +
        'If a package name is detected, <code>am force-stop</code> will also run.' + extra + '</div>' +
        '<div style="margin-top:12px;text-align:right;display:flex;justify-content:end;gap:10px;">' +
        '<button class="ok">Confirm</button><button class="cancel">Cancel</button></div></div>'
      );
      var done = function (val) { result.close(); resolve(val); };
      result.el.querySelector('.ok').addEventListener('click', function () { done(true); });
      result.el.querySelector('.cancel').addEventListener('click', function () { done(false); });
    });
  }

  async function killProcess(proc) {
    if (!proc || !proc.pid) return;
    if (!await confirmKill(proc)) return;
    setBusy(true);
    var pkg = proc.packageName || '';
    var res = await run(
      'PID=' + shellQuote(String(proc.pid)) + '\n' +
      'PKG=' + shellQuote(pkg) + '\n' +
      'if [ -n "$PKG" ]; then am force-stop "$PKG" >/dev/null 2>&1; fi\n' +
      'kill -15 "$PID" >/dev/null 2>&1\n' +
      'sleep 1\n' +
      'if kill -0 "$PID" >/dev/null 2>&1; then kill -9 "$PID" >/dev/null 2>&1; fi\n' +
      'if kill -0 "$PID" >/dev/null 2>&1; then echo "__KILL_FAILED__"; exit 1; fi\n' +
      'echo "__KILL_OK__"', 15000);
    setBusy(false);
    if (res.ok && res.text.includes('__KILL_OK__')) {
      showCtrlToast('Killed PID ' + proc.pid, 'success');
      await refresh();
      return;
    }
    showCtrlToast('Kill failed: ' + (res.text || 'unknown error'), 'error');
  }

  // --- Refresh ---
  async function refresh(showToast) {
    try {
      setBusy(true);
      var packageSet = await listPackages();
      var results = await Promise.all([listProcesses(packageSet), listCpuUsage()]);
      var processList = results[0], cpuMap = results[1];
      state.packages = packageSet;
      state.processes = processList.map(function (item) {
        return Object.assign({}, item, {
          cpu: cpuMap.get(item.pid) || 0,
          packageName: item.packageName || inferPackageName(item.name, packageSet),
        });
      });
      state.loadedAt = new Date().toISOString();
      render();
      if (showToast) showCtrlToast('Refreshed — ' + state.processes.length + ' processes', 'success');
    } catch (error) {
      console.error(error);
      showCtrlToast('Refresh failed: ' + error, 'error');
    } finally {
      setBusy(false);
    }
  }

  // --- Events ---
  ensureStyle();

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () { refresh(true); });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      state.sortBy = sortSelect.value || 'rss';
      render();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.query = searchInput.value || '';
      render();
    });
  }

  // Auto-refresh when panel is shown
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'process_mgr') {
      refresh(false);
    }
  });
})();
