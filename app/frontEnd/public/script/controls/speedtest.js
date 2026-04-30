/**
 * Speed Test — Download speed measurement via chunked data from the device.
 * Also handles the mode toggle between Local and Cellular.
 */
(function () {
  // Mode toggle logic
  var modeButtons = document.querySelectorAll('.speedtest-mode-btn');
  var localPanel = document.getElementById('speedtest_local_panel');
  var cellularPanel = document.getElementById('speedtest_cellular_panel');

  modeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.dataset.mode;
      modeButtons.forEach(function (b) { b.classList.toggle('active', b === btn); });
      if (localPanel) localPanel.style.display = mode === 'local' ? '' : 'none';
      if (cellularPanel) cellularPanel.style.display = mode === 'cellular' ? '' : 'none';
    });
  });

  // Local speed test
  var startBtn = document.getElementById('speedtest_start_btn');
  var speedEl = document.getElementById('speedtest_speed');
  var statusEl = document.getElementById('speedtest_status');
  var gaugeFill = document.getElementById('speedtest_gauge_fill');
  var resultsEl = document.getElementById('speedtest_results');
  var downloadEl = document.getElementById('speedtest_download');
  var uploadEl = document.getElementById('speedtest_upload');
  var pingEl = document.getElementById('speedtest_ping');
  var ckSizeSelect = document.getElementById('speedtest_cksize');

  if (!startBtn) return;

  var running = false;
  var ARC_LENGTH = 251.2; // total arc length of the gauge path

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
    // Update unit label
    var unitEl = document.getElementById('speedtest_speed');
    if (unitEl && unitEl.nextElementSibling) {
      unitEl.nextElementSibling.textContent = MBps >= 1 ? 'MB/s' : 'KB/s';
    }
    // Gauge: assume max 12.5 MB/s (100 Mbps) for full scale
    setGauge(MBps / 12.5);
  }

  function reset() {
    setSpeed(0);
    setStatus('Ready to test');
    setGauge(0);
    if (resultsEl) resultsEl.style.display = 'none';
  }

  // Measure ping (latency)
  function measurePing() {
    return new Promise(function (resolve) {
      var start = performance.now();
      fetch(KANO_baseURL + '/speedtest?ckSize=0&cors=1&_t=' + Date.now(), {
        headers: common_headers,
        cache: 'no-store'
      }).then(function () {
        var latency = performance.now() - start;
        resolve(Math.round(latency));
      }).catch(function () {
        resolve(-1);
      });
    });
  }

  // Download test
  function measureDownload(ckSize) {
    return new Promise(function (resolve) {
      setStatus('Testing download...');
      var startTime = performance.now();
      var url = KANO_baseURL + '/speedtest?ckSize=' + ckSize + '&cors=1&_t=' + Date.now();

      fetch(url, { headers: common_headers, cache: 'no-store' }).then(function (res) {
        if (!res.ok) { resolve(-1); return; }
        var reader = res.body.getReader();
        var loaded = 0;

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              var elapsed = (performance.now() - startTime) / 1000;
              var MBps = loaded / (elapsed * 1048576);
              setSpeed(MBps);
              resolve(MBps);
              return;
            }
            loaded += result.value.length;
            var elapsed = (performance.now() - startTime) / 1000;
            if (elapsed > 0) {
              setSpeed(loaded / (elapsed * 1048576));
            }
            return pump();
          });
        }
        return pump();
      }).catch(function () { resolve(-1); });
    });
  }

  // Upload test
  function measureUpload(sizeMB) {
    return new Promise(function (resolve) {
      setStatus('Testing upload...');
      var data = new ArrayBuffer(sizeMB * 1024 * 1024);
      var blob = new Blob([data]);
      var startTime = performance.now();

      fetch(KANO_baseURL + '/speedtest_upload?_t=' + Date.now(), {
        method: 'POST',
        headers: common_headers,
        body: blob
      }).then(function (res) {
        var elapsed = (performance.now() - startTime) / 1000;
        var totalBytes = sizeMB * 1024 * 1024;
        var MBps = totalBytes / (elapsed * 1048576);
        resolve(res.ok ? MBps : -1);
      }).catch(function () {
        resolve(-1);
      });
    });
  }

  async function runTest() {
    if (running) return;
    running = true;
    startBtn.disabled = true;
    startBtn.textContent = '⏳ TESTING...';
    if (resultsEl) resultsEl.style.display = 'none';

    var ckSize = ckSizeSelect ? parseInt(ckSizeSelect.value, 10) : 16;

    // Ping
    setStatus('Measuring latency...');
    setGauge(0);
    var ping = await measurePing();

    // Download
    var download = await measureDownload(ckSize);

    // Upload (use 2MB for upload test)
    var upload = await measureUpload(2);

    // Show results
    setStatus('Test complete');
    if (resultsEl) resultsEl.style.display = '';
    if (downloadEl) downloadEl.textContent = download > 0 ? formatSpeed(download) : 'Error';
    if (uploadEl) uploadEl.textContent = upload > 0 ? formatSpeed(upload) : 'Error';
    if (pingEl) pingEl.textContent = ping >= 0 ? ping + ' ms' : 'Error';

    // Set gauge to final download speed
    setSpeed(download > 0 ? download : 0);

    running = false;
    startBtn.disabled = false;
    startBtn.textContent = '▶ START';
  }

  startBtn.addEventListener('click', runTest);
})();
