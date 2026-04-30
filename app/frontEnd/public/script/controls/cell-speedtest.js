/**
 * Cellular Speed Test — Measures actual cellular network speed from the device
 * by running curl commands on the device via root_shell API.
 */
(function () {
  var startBtn = document.getElementById('cell_speedtest_start_btn');
  var speedEl = document.getElementById('cell_speedtest_speed');
  var statusEl = document.getElementById('cell_speedtest_status');
  var gaugeFill = document.getElementById('cell_speedtest_gauge_fill');
  var resultsEl = document.getElementById('cell_speedtest_results');
  var downloadEl = document.getElementById('cell_speedtest_download');
  var uploadEl = document.getElementById('cell_speedtest_upload');
  var latencyEl = document.getElementById('cell_speedtest_latency');
  var logEl = document.getElementById('cell_speedtest_log');
  var serverSelect = document.getElementById('cell_speedtest_server');

  if (!startBtn) return;

  var running = false;
  var ARC_LENGTH = 251.2;

  function formatSpeed(MBps) {
    if (MBps >= 1) return MBps.toFixed(2) + ' MB/s';
    return (MBps * 1024).toFixed(0) + ' KB/s';
  }

  function setGauge(fraction) {
    if (!gaugeFill) return;
    var offset = ARC_LENGTH * (1 - Math.min(fraction, 1));
    gaugeFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setSpeed(MBps) {
    if (speedEl) {
      if (MBps >= 1) {
        speedEl.textContent = MBps.toFixed(2);
      } else {
        speedEl.textContent = (MBps * 1024).toFixed(0);
      }
    }
    var unitEl = document.getElementById('cell_speedtest_speed');
    if (unitEl && unitEl.nextElementSibling) {
      unitEl.nextElementSibling.textContent = MBps >= 1 ? 'MB/s' : 'KB/s';
    }
    setGauge(MBps / 12.5);
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

  function shellExec(command) {
    return fetch(KANO_baseURL + '/root_shell', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, common_headers),
      body: JSON.stringify({ command: command })
    }).then(function (r) { return r.json(); });
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

  // Measure download speed via curl
  function measureDownload(url) {
    setStatus('Testing download speed...');
    addLog('curl download: ' + url.split('/').pop());
    // curl with write-out to get speed
    var cmd = 'curl -s -o /dev/null -w "%{speed_download} %{size_download} %{time_total}" "' + url + '"';
    return shellExec(cmd).then(function (res) {
      var output = (res.output || res.result || '').trim();
      addLog('Result: ' + output);
      var parts = output.split(/\s+/);
      if (parts.length >= 3) {
        var speedBytes = parseFloat(parts[0]); // bytes/sec
        var totalBytes = parseFloat(parts[1]);
        var timeSec = parseFloat(parts[2]);
        var MBps = speedBytes / 1048576;
        return { MBps: MBps, bytes: totalBytes, time: timeSec };
      }
      return { MBps: -1, bytes: 0, time: 0 };
    }).catch(function () { return { MBps: -1, bytes: 0, time: 0 }; });
  }

  // Measure upload speed via curl POST
  function measureUpload() {
    setStatus('Testing upload speed...');
    addLog('curl upload test (1MB)...');
    // Generate 1MB of data and upload to a speed test endpoint
    var cmd = 'dd if=/dev/zero bs=1024 count=1024 2>/dev/null | curl -s -o /dev/null -w "%{speed_upload} %{size_upload} %{time_total}" -X POST -d @- "http://speed.cloudflare.com/__up"';
    return shellExec(cmd).then(function (res) {
      var output = (res.output || res.result || '').trim();
      addLog('Result: ' + output);
      var parts = output.split(/\s+/);
      if (parts.length >= 3) {
        var speedBytes = parseFloat(parts[0]);
        var MBps = speedBytes / 1048576;
        return MBps;
      }
      return -1;
    }).catch(function () { return -1; });
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

  // Auto-detect best server by pinging each
  async function findBestServer() {
    setStatus('Finding best server...');
    addLog('Pinging servers to find nearest...');
    var best = null;
    var bestLatency = Infinity;

    for (var i = 0; i < serverCandidates.length; i++) {
      var srv = serverCandidates[i];
      addLog('  ping ' + srv.name + '...');
      try {
        var res = await shellExec('ping -c 1 -W 3 ' + srv.ping_host);
        var output = (res.output || res.result || '');
        var match = output.match(/time[=<](\d+\.?\d*)/);
        if (match) {
          var ms = parseFloat(match[1]);
          addLog('    ' + srv.name + ': ' + ms.toFixed(0) + ' ms');
          if (ms < bestLatency) {
            bestLatency = ms;
            best = srv;
          }
        } else {
          addLog('    ' + srv.name + ': timeout');
        }
      } catch (e) {
        addLog('    ' + srv.name + ': error');
      }
    }

    if (best) {
      addLog('✓ Best server: ' + best.name + ' (' + bestLatency.toFixed(0) + ' ms)');
      if (serverStatusEl) serverStatusEl.textContent = '✓ ' + best.name + ' (' + bestLatency.toFixed(0) + 'ms)';
      return best.url;
    }
    // Fallback
    addLog('⚠ Using default (Cloudflare)');
    return 'http://speed.cloudflare.com/__down?bytes=25000000';
  }

  async function runTest() {
    if (running) return;
    running = true;
    startBtn.disabled = true;
    startBtn.textContent = '⏳ TESTING...';
    if (resultsEl) resultsEl.style.display = 'none';
    clearLog();
    setSpeed(0);

    var selectedValue = serverSelect ? serverSelect.value : 'auto';
    var url;

    if (selectedValue === 'auto') {
      url = await findBestServer();
    } else {
      url = selectedValue;
      if (serverStatusEl) serverStatusEl.textContent = '';
    }

    // Latency
    var latency = await measureLatency();
    if (latency > 0) {
      addLog('Latency: ' + latency.toFixed(1) + ' ms');
    }

    // Download
    var dlResult = await measureDownload(url);
    if (dlResult.MBps > 0) {
      setSpeed(dlResult.MBps);
      addLog('Download: ' + formatSpeed(dlResult.MBps));
    }

    // Upload
    var upload = await measureUpload();
    if (upload > 0) {
      addLog('Upload: ' + formatSpeed(upload));
    }

    // Show results
    setStatus('Test complete');
    if (resultsEl) resultsEl.style.display = '';
    if (downloadEl) downloadEl.textContent = dlResult.MBps > 0 ? formatSpeed(dlResult.MBps) : 'Error';
    if (uploadEl) uploadEl.textContent = upload > 0 ? formatSpeed(upload) : 'Error';
    if (latencyEl) latencyEl.textContent = latency > 0 ? latency.toFixed(1) + ' ms' : 'Error';

    setSpeed(dlResult.MBps > 0 ? dlResult.MBps : 0);

    running = false;
    startBtn.disabled = false;
    startBtn.textContent = '▶ START';
  }

  startBtn.addEventListener('click', runTest);
})();
