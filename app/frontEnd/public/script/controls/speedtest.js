/**
 * Speed Test — Speedtest.com-style local speed test with circular gauge.
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

  // Local speed test elements
  var goBtn = document.getElementById('speedtest_start_btn');
  var speedEl = document.getElementById('speedtest_speed');
  var unitEl = document.getElementById('speedtest_unit');
  var phaseEl = document.getElementById('speedtest_phase');
  var gaugeFill = document.getElementById('speedtest_gauge_fill');
  var resultsEl = document.getElementById('speedtest_results');
  var downloadEl = document.getElementById('speedtest_download');
  var uploadEl = document.getElementById('speedtest_upload');
  var pingEl = document.getElementById('speedtest_ping');
  var pingCard = document.getElementById('speedtest_ping_card');
  var downloadCard = document.getElementById('speedtest_download_card');
  var uploadCard = document.getElementById('speedtest_upload_card');
  var ckSizeSelect = document.getElementById('speedtest_cksize');
  var gaugeArea = document.querySelector('.speedtest-gauge-area');

  if (!goBtn) return;

  // Start in idle state
  if (gaugeArea) gaugeArea.classList.add('idle');

  var running = false;
  var ARC_LENGTH = 388.77; // 3/4 of circumference (2*PI*110 * 0.75)
  var TEST_DURATION_MS = 8000;

  // Convert MB/s to Mbps for display
  function toMbps(MBps) { return MBps * 8; }

  function formatMbps(mbps) {
    if (mbps >= 100) return mbps.toFixed(0);
    if (mbps >= 10) return mbps.toFixed(1);
    return mbps.toFixed(2);
  }

  function setGauge(fraction) {
    if (!gaugeFill) return;
    var offset = ARC_LENGTH * (1 - Math.min(Math.max(fraction, 0), 1));
    gaugeFill.setAttribute('stroke-dashoffset', offset.toFixed(1));
  }

  function setSpeed(MBps) {
    var mbps = toMbps(MBps);
    if (speedEl) speedEl.textContent = formatMbps(mbps);
    if (unitEl) unitEl.textContent = 'Mbps';
    // Logarithmic gauge scale: 0-1000 Mbps mapped logarithmically
    var fraction = mbps > 0 ? Math.log10(mbps + 1) / Math.log10(1001) : 0;
    setGauge(fraction);
  }

  function setPhase(text) {
    if (phaseEl) phaseEl.textContent = text;
  }

  function showGoBtnIdle() {
    goBtn.classList.remove('hidden');
    goBtn.textContent = 'GO';
    if (speedEl) speedEl.textContent = '';
    if (unitEl) unitEl.textContent = '';
    setPhase('');
    setGauge(0);
  }

  // Ping measurement (average of 3)
  function measurePing() {
    return new Promise(function (resolve) {
      var pings = [];
      var count = 0;
      function doPing() {
        var start = performance.now();
        fetch(KANO_baseURL + '/speedtest?ckSize=0&cors=1&_t=' + Date.now(), { cache: 'no-store' })
          .then(function () {
            pings.push(performance.now() - start);
            count++;
            if (count < 3) { doPing(); }
            else {
              pings.sort(function(a,b){return a-b;});
              resolve(Math.round(pings[1])); // median
            }
          })
          .catch(function () { resolve(-1); });
      }
      doPing();
    });
  }

  // Download test — continuous fetch for TEST_DURATION_MS
  function measureDownload(ckSize, onProgress) {
    return new Promise(function (resolve) {
      var totalLoaded = 0;
      var startTime = performance.now();
      var done = false;

      function runOne() {
        if (done) return;
        fetch(KANO_baseURL + '/speedtest?ckSize=' + ckSize + '&cors=1&_t=' + Date.now(), { cache: 'no-store' })
          .then(function (res) {
            if (!res.ok) { if (!done) { done = true; resolve(-1); } return; }
            var reader = res.body.getReader();
            function pump() {
              return reader.read().then(function (result) {
                if (done) return;
                if (result.done) {
                  if ((performance.now() - startTime) < TEST_DURATION_MS) { runOne(); }
                  else { finish(); }
                  return;
                }
                totalLoaded += result.value.length;
                var elapsed = (performance.now() - startTime) / 1000;
                if (elapsed > 0) { onProgress(totalLoaded / (elapsed * 1048576)); }
                if ((performance.now() - startTime) >= TEST_DURATION_MS) { reader.cancel(); finish(); return; }
                return pump();
              });
            }
            pump();
          })
          .catch(function () { if (!done) { done = true; resolve(-1); } });
      }

      function finish() {
        if (done) return;
        done = true;
        var elapsed = (performance.now() - startTime) / 1000;
        resolve(totalLoaded / (elapsed * 1048576));
      }

      runOne();
    });
  }

  // Upload test — continuous POST for TEST_DURATION_MS
  function measureUpload(sizeMB, onProgress) {
    return new Promise(function (resolve) {
      var totalUploaded = 0;
      var startTime = performance.now();
      var done = false;
      var data = new ArrayBuffer(sizeMB * 1024 * 1024);
      var chunkBytes = sizeMB * 1024 * 1024;

      function runOne() {
        if (done) return;
        fetch(KANO_baseURL + '/speedtest_upload?_t=' + Date.now(), { method: 'POST', body: new Blob([data]) })
          .then(function (res) {
            if (done) return;
            if (!res.ok) { done = true; resolve(-1); return; }
            totalUploaded += chunkBytes;
            var elapsed = (performance.now() - startTime) / 1000;
            onProgress(totalUploaded / (elapsed * 1048576));
            if ((performance.now() - startTime) >= TEST_DURATION_MS) { done = true; resolve(totalUploaded / (elapsed * 1048576)); }
            else { runOne(); }
          })
          .catch(function () { if (!done) { done = true; resolve(-1); } });
      }

      // 3 parallel streams
      runOne(); runOne(); runOne();
    });
  }

  async function runTest() {
    if (running) return;
    running = true;

    var ckSize = ckSizeSelect ? parseInt(ckSizeSelect.value, 10) : 16;

    // Hide GO button, show gauge
    goBtn.classList.add('hidden');
    if (gaugeArea) gaugeArea.classList.remove('idle');
    if (resultsEl) resultsEl.style.display = '';
    setGauge(0);

    // Reset result cards
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.remove('active'); });
    if (pingEl) pingEl.textContent = '—';
    if (downloadEl) downloadEl.textContent = '—';
    if (uploadEl) uploadEl.textContent = '—';

    // --- Phase 1: Ping ---
    setPhase('PING');
    if (speedEl) speedEl.textContent = '...';
    if (unitEl) unitEl.textContent = '';
    if (pingCard) pingCard.classList.add('active');

    var ping = await measurePing();
    if (pingEl) pingEl.textContent = ping >= 0 ? ping : '—';
    if (speedEl) speedEl.textContent = ping >= 0 ? ping : '—';
    if (unitEl) unitEl.textContent = 'ms';

    await new Promise(function(r) { setTimeout(r, 1500); });

    // --- Phase 2: Download ---
    setPhase('DOWNLOAD');
    setSpeed(0);
    if (pingCard) pingCard.classList.remove('active');
    if (downloadCard) downloadCard.classList.add('active');
    if (downloadEl) downloadEl.textContent = '...';

    var download = await measureDownload(ckSize, function(MBps) {
      setSpeed(MBps);
      if (downloadEl) downloadEl.textContent = formatMbps(toMbps(MBps));
    });

    var dlMbps = download > 0 ? toMbps(download) : -1;
    if (downloadEl) downloadEl.textContent = dlMbps > 0 ? formatMbps(dlMbps) : 'Error';
    if (downloadCard) downloadCard.classList.add('active');

    // --- Pause & reset gauge ---
    await new Promise(function(r) { setTimeout(r, 2000); });
    setGauge(0);
    if (speedEl) speedEl.textContent = '0.00';

    // --- Phase 3: Upload ---
    setPhase('UPLOAD');
    setSpeed(0);
    if (downloadCard) downloadCard.classList.remove('active');
    if (uploadCard) uploadCard.classList.add('active');
    if (uploadEl) uploadEl.textContent = '...';

    var upload = await measureUpload(4, function(MBps) {
      setSpeed(MBps);
      if (uploadEl) uploadEl.textContent = formatMbps(toMbps(MBps));
    });

    var ulMbps = upload > 0 ? toMbps(upload) : -1;
    if (uploadEl) uploadEl.textContent = ulMbps > 0 ? formatMbps(ulMbps) : 'Error';

    // --- Done ---
    setPhase('');
    if (speedEl) speedEl.textContent = '';
    if (unitEl) unitEl.textContent = '';
    setGauge(dlMbps > 0 ? Math.log10(dlMbps + 1) / Math.log10(1001) : 0);

    // Highlight all results
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.add('active'); });

    running = false;
    goBtn.classList.remove('hidden');
    goBtn.textContent = 'AGAIN';
  }

  goBtn.addEventListener('click', runTest);
})();
