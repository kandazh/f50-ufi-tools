/**
 * Cellular Speed Test — Measures actual cellular network speed from the device
 * by running curl commands on the device via root_shell API.
 */
(function () {
  var startBtn = document.getElementById('cell_speedtest_start_btn');
  var speedEl = document.getElementById('cell_speedtest_speed');
  var unitEl = document.getElementById('cell_speedtest_unit');
  var statusEl = document.getElementById('cell_speedtest_status');
  var needleEl = document.getElementById('cell_speedtest_needle');
  var arcBg = document.getElementById('cell_speedtest_arc_bg');
  var arcFill = document.getElementById('cell_speedtest_arc_fill');
  var resultsEl = document.getElementById('cell_speedtest_results');
  var downloadEl = document.getElementById('cell_speedtest_download');
  var uploadEl = document.getElementById('cell_speedtest_upload');
  var latencyEl = document.getElementById('cell_speedtest_latency');
  var pingCard = document.getElementById('cell_speedtest_ping_card');
  var downloadCard = document.getElementById('cell_speedtest_download_card');
  var uploadCard = document.getElementById('cell_speedtest_upload_card');
  var logEl = document.getElementById('cell_speedtest_log');
  var serverSelect = document.getElementById('cell_speedtest_server');
  var gaugeArea = document.getElementById('cell_gauge_area');

  if (!startBtn) return;

  // Gauge geometry — same as local speedtest
  var CX = 150, CY = 150, R = 115;
  var START_ANGLE = 225;
  var END_ANGLE = -45;
  var SWEEP = 270;
  var SCALE_VALUES = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

  function degToRad(d) { return d * Math.PI / 180; }
  function polarToXY(angle, radius) {
    var rad = degToRad(angle);
    return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
  }
  function mbpsToAngle(mbps) {
    if (mbps <= 0) return START_ANGLE;
    var fraction = Math.log10(mbps + 1) / Math.log10(1001);
    return START_ANGLE - fraction * SWEEP;
  }
  function arcPath(startAng, endAng, radius) {
    var s = polarToXY(startAng, radius);
    var e = polarToXY(endAng, radius);
    var sweep = startAng - endAng;
    var largeArc = sweep > 180 ? 1 : 0;
    return 'M' + s.x.toFixed(1) + ',' + s.y.toFixed(1) +
           ' A' + radius + ',' + radius + ' 0 ' + largeArc + ' 1 ' +
           e.x.toFixed(1) + ',' + e.y.toFixed(1);
  }
  function initGauge() {
    if (arcBg) arcBg.setAttribute('d', arcPath(START_ANGLE, END_ANGLE, R));
    if (arcFill) arcFill.setAttribute('d', 'M0,0');
    var labelsG = document.querySelector('.cell-scale-labels');
    if (labelsG) {
      labelsG.innerHTML = '';
      SCALE_VALUES.forEach(function(val) {
        var angle = mbpsToAngle(val);
        var pos = polarToXY(angle, R + 22);
        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x.toFixed(1));
        text.setAttribute('y', pos.y.toFixed(1));
        text.setAttribute('dy', '0.35em');
        text.textContent = val;
        labelsG.appendChild(text);
      });
    }
    setNeedle(0);
  }
  function setNeedle(mbps) {
    if (!needleEl) return;
    var angle = mbpsToAngle(mbps);
    var svgAngle = 90 - angle;
    needleEl.style.transform = 'rotate(' + svgAngle + 'deg)';
  }
  function setArcFill(mbps) {
    if (!arcFill) return;
    if (mbps <= 0) { arcFill.setAttribute('d', 'M0,0'); return; }
    arcFill.setAttribute('d', arcPath(START_ANGLE, mbpsToAngle(mbps), R));
  }

  function animateGaugeDown(fromMbps, duration) {
    return new Promise(function(resolve) {
      var start = performance.now();
      var dur = duration || 800;
      function step(now) {
        var t = Math.min((now - start) / dur, 1);
        var ease = 1 - Math.pow(1 - t, 3);
        var val = fromMbps * (1 - ease);
        setNeedle(val);
        setArcFill(val);
        if (speedEl) speedEl.textContent = val >= 0.01 ? formatSpeed(val / 8) : '0.00';
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          setNeedle(0);
          setArcFill(0);
          if (speedEl) speedEl.textContent = '0.00';
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  if (gaugeArea) gaugeArea.classList.add('idle');
  initGauge();

  var running = false;

  function formatSpeed(MBps) {
    if (MBps >= 1) return MBps.toFixed(2) + ' MB/s';
    return (MBps * 1024).toFixed(0) + ' KB/s';
  }

  function formatMbps(mbps) {
    if (mbps >= 100) return mbps.toFixed(0);
    if (mbps >= 10) return mbps.toFixed(1);
    return mbps.toFixed(2);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setSpeed(MBps) {
    var mbps = MBps * 8;
    if (speedEl) speedEl.textContent = formatMbps(mbps);
    if (unitEl) unitEl.textContent = 'Mbps';
    setNeedle(mbps);
    setArcFill(mbps);
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

  function shellExec(command, timeout) {
    return fetch(KANO_baseURL + '/root_shell', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, common_headers),
      body: JSON.stringify({ command: command, timeout: timeout || 60000 })
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

  // Measure download speed via curl — loops for ~6 seconds
  function measureDownload(url) {
    setStatus('Testing download speed...');
    addLog('curl download (10s loop): ' + url.split('/').pop());
    // Loop downloads for DURATION seconds, sum total bytes and elapsed time
    var cmd = 'DURATION=10; TOTAL=0; T1=$(date +%s%N); END=$(( $(date +%s) + DURATION )); ' +
      'while [ $(date +%s) -lt $END ]; do ' +
        'curl -sL -o /data/local/tmp/speedtest_dl "' + url + '" && ' +
        'SZ=$(wc -c < /data/local/tmp/speedtest_dl) && TOTAL=$((TOTAL + SZ)); ' +
      'done; ' +
      'T2=$(date +%s%N); MS=$(( (T2 - T1) / 1000000 )); echo "$TOTAL $MS"; rm -f /data/local/tmp/speedtest_dl';
    return shellExec(cmd, 90000).then(function (res) {
      var output = (res.output || res.result || '').trim();
      addLog('Result: ' + output);
      // Get the last line (in case curl outputs something)
      var lines = output.split('\n');
      var lastLine = lines[lines.length - 1].trim();
      var parts = lastLine.split(/\s+/);
      if (parts.length >= 2) {
        var bytes = parseFloat(parts[0]);
        var ms = parseFloat(parts[1]);
        if (ms > 0 && bytes > 0) {
          var MBps = bytes / (ms / 1000) / 1048576;
          return { MBps: MBps, bytes: bytes, time: ms / 1000 };
        }
      }
      return { MBps: -1, bytes: 0, time: 0 };
    }).catch(function () { return { MBps: -1, bytes: 0, time: 0 }; });
  }

  // Measure upload speed via curl POST — loops for ~10 seconds
  function measureUpload() {
    setStatus('Testing upload speed...');
    addLog('curl upload test (10s loop)...');
    // Create a 2MB file, then loop uploads for DURATION seconds
    var cmd = 'dd if=/dev/urandom of=/data/local/tmp/speedtest_ul bs=1024 count=2048 2>/dev/null; ' +
      'DURATION=10; TOTAL=0; T1=$(date +%s%N); END=$(( $(date +%s) + DURATION )); ' +
      'while [ $(date +%s) -lt $END ]; do ' +
        'curl -sL -o /dev/null -X POST --data-binary @/data/local/tmp/speedtest_ul "http://speed.cloudflare.com/__up" && ' +
        'TOTAL=$((TOTAL + 2097152)); ' +
      'done; ' +
      'T2=$(date +%s%N); MS=$(( (T2 - T1) / 1000000 )); echo "$TOTAL $MS"; rm -f /data/local/tmp/speedtest_ul';
    return shellExec(cmd, 90000).then(function (res) {
      var output = (res.output || res.result || '').trim();
      addLog('Result: ' + output);
      var lines = output.split('\n');
      var lastLine = lines[lines.length - 1].trim();
      var parts = lastLine.split(/\s+/);
      if (parts.length >= 2) {
        var bytes = parseFloat(parts[0]);
        var ms = parseFloat(parts[1]);
        if (ms > 0 && bytes > 0) {
          return bytes / (ms / 1000) / 1048576;
        }
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
    startBtn.classList.add('hidden');
    if (gaugeArea) gaugeArea.classList.remove('idle');
    clearLog();
    setNeedle(0);
    setArcFill(0);

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
    setStatus('PING');
    if (pingCard) pingCard.classList.add('active');
    var latency = await measureLatency();
    if (latency > 0) {
      addLog('Latency: ' + latency.toFixed(1) + ' ms');
      if (latencyEl) latencyEl.textContent = latency.toFixed(0) + ' ms';
    }

    // Download
    setStatus('DOWNLOAD');
    if (pingCard) pingCard.classList.remove('active');
    if (downloadCard) downloadCard.classList.add('active');
    var dlResult = await measureDownload(url);
    if (dlResult.MBps > 0) {
      setSpeed(dlResult.MBps);
      addLog('Download: ' + formatSpeed(dlResult.MBps));
      if (downloadEl) downloadEl.textContent = formatSpeed(dlResult.MBps);
    } else {
      if (downloadEl) downloadEl.textContent = 'Error';
    }

    // Upload
    var lastDlMbps = dlResult.MBps > 0 ? dlResult.MBps * 8 : 0;
    await animateGaugeDown(lastDlMbps, 800);
    await new Promise(function(r) { setTimeout(r, 2000); });
    setStatus('UPLOAD');
    if (downloadCard) downloadCard.classList.remove('active');
    if (uploadCard) uploadCard.classList.add('active');
    var upload = await measureUpload();
    if (upload > 0) {
      setSpeed(upload);
      addLog('Upload: ' + formatSpeed(upload));
      if (uploadEl) uploadEl.textContent = formatSpeed(upload);
    } else {
      if (uploadEl) uploadEl.textContent = 'Error';
    }

    // Show results
    setStatus('');
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.add('active'); });

    var finalMbps = dlResult.MBps > 0 ? dlResult.MBps * 8 : 0;
    setNeedle(finalMbps);
    setArcFill(finalMbps);
    if (speedEl) speedEl.textContent = '';
    if (unitEl) unitEl.textContent = '';

    running = false;
    startBtn.classList.remove('hidden');
    startBtn.textContent = 'GO';
  }

  startBtn.addEventListener('click', runTest);
})();
