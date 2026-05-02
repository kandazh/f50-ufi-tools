/**
 * Cellular Speed Test — Measures actual cellular network speed from the device
 * by running curl commands on the device via root_shell API.
 * Uses SpeedGauge shared module for gauge logic.
 */
(function () {
  var startBtn = document.getElementById('cell_speedtest_start_btn');
  var speedEl = document.getElementById('cell_speedtest_speed');
  var unitEl = document.getElementById('cell_speedtest_unit');
  var statusEl = document.getElementById('cell_speedtest_status');
  var resultsEl = document.getElementById('cell_speedtest_results');
  var downloadEl = document.getElementById('cell_speedtest_download');
  var uploadEl = document.getElementById('cell_speedtest_upload');
  var latencyEl = document.getElementById('cell_speedtest_latency');
  var pingCard = document.getElementById('cell_speedtest_ping_card');
  var downloadCard = document.getElementById('cell_speedtest_download_card');
  var uploadCard = document.getElementById('cell_speedtest_upload_card');
  var logEl = document.getElementById('cell_speedtest_log');
  var serverSelect = document.getElementById('cell_speedtest_server');

  if (!startBtn) return;

  // Create gauge instance using shared module
  var gauge = SpeedGauge.create({
    needleEl: document.getElementById('cell_speedtest_needle'),
    arcBg: document.getElementById('cell_speedtest_arc_bg'),
    arcFill: document.getElementById('cell_speedtest_arc_fill'),
    speedEl: speedEl,
    unitEl: unitEl,
    gaugeArea: document.getElementById('cell_gauge_area'),
    scaleLabelsSelector: '.cell-scale-labels'
  });

  var running = false;
  var formatSpeed = SpeedGauge.formatSpeed;
  var formatMbps = SpeedGauge.formatMbps;
  var phaseIcon = document.getElementById('cell_speedtest_phase_icon');

  function setStatus(text, icon) {
    if (statusEl) statusEl.textContent = text;
    if (phaseIcon) phaseIcon.textContent = icon || '';
  }

  function addLog(msg) {
    if (!logEl) return;
    logEl.style.display = '';
    var line = document.createElement('div');
    line.textContent = '> ' + msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() {
    if (logEl) {
      logEl.innerHTML = '';
      logEl.style.display = 'none';
    }
  }

  // Path to bundled curl binary in app files
  var CURL_BIN = '/data/data/com.hotbox.f50_app/files/curl';

  function shellExec(command, timeout) {
    return fetch(HOTBOX_baseURL + '/user_shell', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, common_headers),
      body: JSON.stringify({ command: command, timeout: timeout || 60000 })
    }).then(function (r) {
      if (!r.ok) throw new Error('shell returned ' + r.status);
      return r.json();
    }).then(function (data) {
      // Normalize: user_shell returns {"result":{"done":true,"content":"..."}}
      var content = '';
      if (data.result && typeof data.result === 'object') {
        content = data.result.content || '';
      } else {
        content = data.output || data.result || '';
      }
      return { output: content, result: content };
    });
  }

  // Measure latency via ping
  function measureLatency() {
    setStatus('Measuring latency...');
    addLog('ping -c 3 8.8.8.8');
    return shellExec('ping -c 3 -W 3 8.8.8.8').then(function (res) {
      var output = res.output || res.result || '';
      addLog(output.trim().split('\n').pop());
      // Parse avg from "rtt min/avg/max/mdev = x/y/z/w ms"
      var match = output.match(/[\d.]+\/([\d.]+)\//);
      if (match) return parseFloat(match[1]);
      // Try "time=Xms" from individual pings
      var timeMatch = output.match(/time=([\d.]+)/);
      if (timeMatch) return parseFloat(timeMatch[1]);
      return -1;
    }).catch(function () { return -1; });
  }

  // Measure download speed via curl — multiple rounds with gauge updates
  // Uses curl's built-in -w stats (no date +%s%N which fails on many Android shells)
  function measureDownload(url) {
    addLog('curl download test: ' + url.split('/').pop());
    var ROUNDS = 8;
    var ROUND_MAX_TIME = 2; // max-time per curl request in seconds
    var totalBytes = 0;
    var totalTimeSec = 0;

    function runRound() {
      // Use -o /dev/null (no disk write) and -w to get stats directly from curl
      var cmd = CURL_BIN + ' -sL -o /dev/null --max-time ' + ROUND_MAX_TIME +
        ' -w "%{size_download} %{time_total}" "' + url + '"';
      return shellExec(cmd, 15000).then(function (res) {
        var output = (res.output || res.result || '').trim();
        var lines = output.split('\n');
        var lastLine = lines[lines.length - 1].trim();
        var parts = lastLine.split(/\s+/);
        if (parts.length >= 2) {
          var bytes = parseFloat(parts[0]);
          var secs = parseFloat(parts[1]);
          if (secs > 0 && bytes > 0) return { bytes: bytes, secs: secs };
        }
        return null;
      }).catch(function () { return null; });
    }

    return (async function () {
      for (var i = 0; i < ROUNDS; i++) {
        var r = await runRound();
        if (r) {
          totalBytes += r.bytes;
          totalTimeSec += r.secs;
          var MBps = totalBytes / totalTimeSec / 1048576;
          gauge.setSpeedSmooth(MBps);
          addLog('Round ' + (i + 1) + '/' + ROUNDS + ': ' + formatSpeed(MBps) + ' (' + (r.bytes / 1048576).toFixed(1) + ' MB in ' + r.secs.toFixed(1) + 's)');
        } else {
          addLog('Round ' + (i + 1) + '/' + ROUNDS + ': failed');
        }
      }
      if (totalTimeSec > 0 && totalBytes > 0) {
        var MBps = totalBytes / totalTimeSec / 1048576;
        addLog('Download total: ' + formatSpeed(MBps) + ' (' + (totalBytes / 1048576).toFixed(1) + ' MB in ' + totalTimeSec.toFixed(1) + 's)');
        return { MBps: MBps, bytes: totalBytes, time: totalTimeSec };
      }
      return { MBps: -1, bytes: 0, time: 0 };
    })();
  }

  // Measure upload speed via curl POST — multiple rounds with gauge updates
  // Uses curl's built-in -w stats (no date +%s%N which fails on many Android shells)
  function measureUpload() {
    addLog('curl upload test...');
    var ROUNDS = 8;
    var ROUND_MAX_TIME = 3;
    var totalBytes = 0;
    var totalTimeSec = 0;

    // Create upload file once
    var setupCmd = 'dd if=/dev/urandom of=/data/local/tmp/speedtest_ul bs=1024 count=2048 2>/dev/null; echo ok';

    function runRound() {
      // Use -w to get upload stats directly from curl
      var cmd = CURL_BIN + ' -sL -o /dev/null -X POST --data-binary @/data/local/tmp/speedtest_ul' +
        ' --max-time ' + ROUND_MAX_TIME +
        ' -w "%{size_upload} %{time_total}" "http://speed.cloudflare.com/__up"';
      return shellExec(cmd, 15000).then(function (res) {
        var output = (res.output || res.result || '').trim();
        var lines = output.split('\n');
        var lastLine = lines[lines.length - 1].trim();
        var parts = lastLine.split(/\s+/);
        if (parts.length >= 2) {
          var bytes = parseFloat(parts[0]);
          var secs = parseFloat(parts[1]);
          if (secs > 0 && bytes > 0) return { bytes: bytes, secs: secs };
        }
        return null;
      }).catch(function () { return null; });
    }

    return (async function () {
      await shellExec(setupCmd, 10000);
      for (var i = 0; i < ROUNDS; i++) {
        var r = await runRound();
        if (r) {
          totalBytes += r.bytes;
          totalTimeSec += r.secs;
          var MBps = totalBytes / totalTimeSec / 1048576;
          gauge.setSpeedSmooth(MBps);
          addLog('Round ' + (i + 1) + '/' + ROUNDS + ': ' + formatSpeed(MBps) + ' (' + (r.bytes / 1048576).toFixed(1) + ' MB in ' + r.secs.toFixed(1) + 's)');
        } else {
          addLog('Round ' + (i + 1) + '/' + ROUNDS + ': failed');
        }
      }
      await shellExec('rm -f /data/local/tmp/speedtest_ul', 5000);
      if (totalTimeSec > 0 && totalBytes > 0) {
        var MBps = totalBytes / totalTimeSec / 1048576;
        addLog('Upload total: ' + formatSpeed(MBps) + ' (' + (totalBytes / 1048576).toFixed(1) + ' MB in ' + totalTimeSec.toFixed(1) + 's)');
        return MBps;
      }
      return -1;
    })();
  }

  // Server list for auto-detection (ping each, pick lowest latency)
  var serverCandidates = [
    { name: 'Cloudflare', url: 'http://speed.cloudflare.com/__down?bytes=25000000', ping_host: 'speed.cloudflare.com' },
    { name: 'Singapore', url: 'http://lg-sin.fdcservers.net/100MBtest.bin', ping_host: 'lg-sin.fdcservers.net' },
    { name: 'Tokyo', url: 'http://speedtest.tokyo2.linode.com/100MB-tokyo2.bin', ping_host: 'speedtest.tokyo2.linode.com' },
    { name: 'London', url: 'http://ipv4.download.thinkbroadband.com/50MB.zip', ping_host: 'ipv4.download.thinkbroadband.com' },
    { name: 'Frankfurt', url: 'http://speedtest.frankfurt.linode.com/100MB-frankfurt.bin', ping_host: 'speedtest.frankfurt.linode.com' },
    { name: 'New York', url: 'http://speedtest.newark.linode.com/100MB-newark.bin', ping_host: 'speedtest.newark.linode.com' },
    { name: 'California', url: 'http://speedtest.fremont.linode.com/100MB-fremont.bin', ping_host: 'speedtest.fremont.linode.com' }
  ];

  var serverStatusEl = document.getElementById('cell_speedtest_server_status');

  // Auto-detect best server by pinging all at once
  async function findBestServer() {
    setStatus('Finding best server...');
    addLog('Pinging servers to find nearest...');

    // Build a single shell command that pings all servers and outputs "host ms" lines
    var hosts = serverCandidates.map(function (s) { return s.ping_host; });
    var cmd = hosts.map(function (h) {
      return 'R=$(' + CURL_BIN + ' -so /dev/null -w "%{time_total}" --connect-timeout 3 -m 3 http://' + h + '/ 2>/dev/null) && echo "' + h + ' $R" || echo "' + h + ' fail"';
    }).join('; ');

    try {
      var res = await shellExec(cmd, 30000);
      var output = (res.output || res.result || '');
      var lines = output.trim().split('\n');
      var best = null;
      var bestLatency = Infinity;

      for (var i = 0; i < lines.length; i++) {
        var parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 2 && parts[1] !== 'fail') {
          var host = parts[0];
          var sec = parseFloat(parts[1]);
          if (isNaN(sec)) continue;
          var ms = sec * 1000;
          // Find matching server
          var srv = null;
          for (var j = 0; j < serverCandidates.length; j++) {
            if (serverCandidates[j].ping_host === host) { srv = serverCandidates[j]; break; }
          }
          if (srv) {
            addLog('  ' + srv.name + ': ' + ms.toFixed(0) + ' ms');
            if (ms < bestLatency) { bestLatency = ms; best = srv; }
          }
        } else {
          var host2 = parts[0];
          var srv2 = null;
          for (var j = 0; j < serverCandidates.length; j++) {
            if (serverCandidates[j].ping_host === host2) { srv2 = serverCandidates[j]; break; }
          }
          if (srv2) addLog('  ' + srv2.name + ': timeout');
        }
      }

      if (best) {
        addLog('✓ Best server: ' + best.name + ' (' + bestLatency.toFixed(0) + ' ms)');
        if (serverStatusEl) serverStatusEl.textContent = '✓ ' + best.name + ' (' + bestLatency.toFixed(0) + 'ms)';
        return best.url;
      }
    } catch (e) {
      addLog('⚠ Server detection failed: ' + e.message);
    }
    // Fallback
    addLog('⚠ Using default (Cloudflare)');
    return 'http://speed.cloudflare.com/__down?bytes=25000000';
  }

  async function runTest() {
    if (running) return;
    running = true;
    startBtn.classList.add('hidden');
    gauge.activate();
    clearLog();

    // Reset result cards
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.remove('active'); });
    if (latencyEl) latencyEl.textContent = '--';
    if (downloadEl) downloadEl.textContent = '--';
    if (uploadEl) uploadEl.textContent = '--';

    var selectedValue = serverSelect ? serverSelect.value : 'auto';
    var url;

    if (selectedValue === 'auto') {
      url = await findBestServer();
    } else {
      url = selectedValue;
      if (serverStatusEl) serverStatusEl.textContent = '';
    }

    // Latency
    setStatus('PING', '');
    if (pingCard) pingCard.classList.add('active');
    var latency = await measureLatency();
    if (latency > 0) {
      addLog('Latency: ' + latency.toFixed(1) + ' ms');
      if (latencyEl) latencyEl.textContent = latency.toFixed(0) + ' ms';
    }

    // Download — start smooth gauge animation
    setStatus('DOWNLOAD', '⬇');
    if (pingCard) pingCard.classList.remove('active');
    if (downloadCard) downloadCard.classList.add('active');
    gauge.resetSmooth();
    gauge.startGaugeAnimation();
    var dlResult = await measureDownload(url);
    gauge.stopGaugeAnimation();
    if (dlResult.MBps > 0) {
      addLog('Download: ' + formatSpeed(dlResult.MBps));
      if (downloadEl) downloadEl.textContent = formatSpeed(dlResult.MBps);
    } else {
      if (downloadEl) downloadEl.textContent = 'Error';
    }

    // Upload — animate gauge down, pause, then start upload
    var lastDlMbps = dlResult.MBps > 0 ? dlResult.MBps * 8 : 0;
    await gauge.animateGaugeDown(lastDlMbps, 800);
    await new Promise(function(r) { setTimeout(r, 1500); });
    setStatus('UPLOAD', '⬆');
    if (downloadCard) downloadCard.classList.remove('active');
    if (uploadCard) uploadCard.classList.add('active');
    gauge.resetSmooth();
    gauge.startGaugeAnimation();
    var upload = await measureUpload();
    gauge.stopGaugeAnimation();
    if (upload > 0) {
      addLog('Upload: ' + formatSpeed(upload));
      if (uploadEl) uploadEl.textContent = formatSpeed(upload);
    } else {
      if (uploadEl) uploadEl.textContent = 'Error';
    }

    // Animate gauge down from last upload speed
    var lastUlMbps = upload > 0 ? upload * 8 : 0;
    await gauge.animateGaugeDown(lastUlMbps, 800);

    setStatus('');
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.add('active'); });

    gauge.reset();

    running = false;
    startBtn.classList.remove('hidden');
    startBtn.textContent = 'GO';
  }

  startBtn.addEventListener('click', runTest);
})();
