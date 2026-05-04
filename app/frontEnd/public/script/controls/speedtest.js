/**
 * Speed Test � Local speed test with circular gauge.
 * Also handles the mode toggle between Local and Cellular.
 * Uses SpeedGauge shared module for gauge logic.
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
      if (mode === 'local') setTimeout(function() { gauge.initGauge(); }, 0);
    });
  });

  // Local speed test elements
  var goBtn = document.getElementById('speedtest_start_btn');
  var speedEl = document.getElementById('speedtest_speed');
  var unitEl = document.getElementById('speedtest_unit');
  var phaseEl = document.getElementById('speedtest_phase');
  var phaseIcon = document.getElementById('speedtest_phase_icon');
  var resultsEl = document.getElementById('speedtest_results');
  var downloadEl = document.getElementById('speedtest_download');
  var uploadEl = document.getElementById('speedtest_upload');
  var pingEl = document.getElementById('speedtest_ping');
  var pingCard = document.getElementById('speedtest_ping_card');
  var downloadCard = document.getElementById('speedtest_download_card');
  var uploadCard = document.getElementById('speedtest_upload_card');
  var ckSizeSelect = document.getElementById('speedtest_cksize');

  if (!goBtn) return;

  // Create gauge instance using shared module
  var gauge = SpeedGauge.create({
    needleEl: document.getElementById('speedtest_needle'),
    arcBg: document.getElementById('speedtest_arc_bg'),
    arcFill: document.getElementById('speedtest_arc_fill'),
    speedEl: speedEl,
    unitEl: unitEl,
    gaugeArea: document.querySelector('.speedtest-gauge-area'),
    scaleLabelsSelector: '#speedtest_local_panel .speedtest-scale-labels'
  });

  var running = false;
  var TEST_DURATION_MS = 8000;

  var formatMbps = SpeedGauge.formatMbps;
  var toMbps = SpeedGauge.toMbps;

  function setPhase(text, icon) {
    if (phaseEl) phaseEl.textContent = text;
    if (phaseIcon) phaseIcon.textContent = icon || '';
  }

  // Ping measurement (average of 3)
  function measurePing() {
    return new Promise(function (resolve) {
      var pings = [];
      var count = 0;
      function doPing() {
        var start = performance.now();
        fetch(HOTBOX_baseURL + '/speedtest?ckSize=0&cors=1&_t=' + Date.now(), { cache: 'no-store' })
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

  // Download test � continuous fetch for TEST_DURATION_MS
  function measureDownload(ckSize, onProgress) {
    return new Promise(function (resolve) {
      var totalLoaded = 0;
      var startTime = performance.now();
      var done = false;
      var controller = new AbortController();
      var activeReaders = [];

      function cleanup() {
        try { controller.abort(); } catch (e) {}
        activeReaders = [];
      }

      function finish(result) {
        if (done) return;
        done = true;
        cleanup();
        resolve(result);
      }

      function runOne() {
        if (done) return;
        return fetch(HOTBOX_baseURL + '/speedtest?ckSize=' + ckSize + '&cors=1&_t=' + Date.now(), { cache: 'no-store', signal: controller.signal })
          .then(function (res) {
            if (done) return;
            if (!res.ok) { finish(-1); return; }
            var reader = res.body.getReader();
            activeReaders.push(reader);
            function pump() {
              return reader.read().then(function (result) {
                if (done) return;
                if (result.done) {
                  var idx = activeReaders.indexOf(reader);
                  if (idx >= 0) activeReaders.splice(idx, 1);
                  if ((performance.now() - startTime) < TEST_DURATION_MS) { runOne(); }
                  else {
                    var elapsed = Math.max((performance.now() - startTime) / 1000, 0.001);
                    finish(totalLoaded / (elapsed * 1048576));
                  }
                  return;
                }
                totalLoaded += result.value.length;
                var elapsed = (performance.now() - startTime) / 1000;
                if (elapsed > 0) { onProgress(totalLoaded / (elapsed * 1048576)); }
                if ((performance.now() - startTime) >= TEST_DURATION_MS) {
                  finish(totalLoaded / (Math.max(elapsed, 0.001) * 1048576));
                  return;
                }
                return pump();
              }).catch(function (err) {
                if (done || (err && err.name === 'AbortError')) return;
                finish(-1);
              });
            }
            return pump();
          })
          .catch(function (err) {
            if (done || (err && err.name === 'AbortError')) return;
            finish(-1);
          });
      }

      runOne();
    });
  }

  // Upload test � continuous POST for TEST_DURATION_MS
  function measureUpload(sizeMB, onProgress) {
    return new Promise(function (resolve) {
      var totalUploaded = 0;
      var startTime = performance.now();
      var done = false;
      var controller = new AbortController();
      var chunkBytes = sizeMB * 1024 * 1024;
      var payloadBlob = new Blob([new Uint8Array(chunkBytes)]);

      function finish(result) {
        if (done) return;
        done = true;
        try { controller.abort(); } catch (e) {}
        resolve(result);
      }

      function runOne() {
        if (done) return;
        fetch(HOTBOX_baseURL + '/speedtest_upload?_t=' + Date.now(), {
          method: 'POST',
          body: payloadBlob,
          signal: controller.signal,
          cache: 'no-store'
        })
          .then(function (res) {
            if (done) return;
            if (!res.ok) throw new Error('Upload test failed');
            return res.json().then(function (payload) {
              if (done) return;
              var uploadedBytes = Number(payload && payload.bytes);
              if (!Number.isFinite(uploadedBytes) || uploadedBytes <= 0) uploadedBytes = chunkBytes;
              totalUploaded += uploadedBytes;
              var elapsed = (performance.now() - startTime) / 1000;
              if (elapsed > 0) onProgress(totalUploaded / (elapsed * 1048576));
              if ((performance.now() - startTime) >= TEST_DURATION_MS) { finish(totalUploaded / (elapsed * 1048576)); }
              else { runOne(); }
            }).catch(function () {
              if (done) return;
              throw new Error('Upload test failed');
            });
          })
          .catch(function (err) {
            if (done || (err && err.name === 'AbortError')) return;
            finish(-1);
          });
      }

      runOne();
    });
  }

  async function runTest() {
    if (running) return;
    running = true;

    var ckSize = ckSizeSelect ? parseInt(ckSizeSelect.value, 10) : 16;

    // Hide GO button, show gauge
    goBtn.classList.add('hidden');
    gauge.activate();

    // Reset result cards
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.remove('active'); });
    if (pingEl) pingEl.textContent = '--';
    if (downloadEl) downloadEl.textContent = '--';
    if (uploadEl) uploadEl.textContent = '--';

    // --- Phase 1: Ping ---
    setPhase('PING', '');
    if (speedEl) speedEl.textContent = '...';
    if (unitEl) unitEl.textContent = '';
    if (pingCard) pingCard.classList.add('active');

    var ping = await measurePing();
    if (pingEl) pingEl.textContent = ping >= 0 ? ping + ' ms' : '--';
    if (speedEl) speedEl.textContent = ping >= 0 ? ping : '--';
    if (unitEl) unitEl.textContent = 'ms';

    await new Promise(function(r) { setTimeout(r, 1500); });

    // --- Phase 2: Download ---
    setPhase('DOWNLOAD', '\u2B07');
    gauge.setSpeed(0);
    if (pingCard) pingCard.classList.remove('active');
    if (downloadCard) downloadCard.classList.add('active');
    if (downloadEl) downloadEl.textContent = '...';

    var download = await measureDownload(ckSize, function(MBps) {
      gauge.setSpeed(MBps);
      if (downloadEl) downloadEl.textContent = formatMbps(toMbps(MBps)) + ' Mbps';
    });

    var dlMbps = download > 0 ? toMbps(download) : -1;
    if (downloadEl) downloadEl.textContent = dlMbps > 0 ? formatMbps(dlMbps) + ' Mbps' : 'Error';
    if (downloadCard) downloadCard.classList.add('active');

    // --- Animate gauge down & pause ---
    await gauge.animateGaugeDown(dlMbps > 0 ? dlMbps : 0, 800);
    await new Promise(function(r) { setTimeout(r, 2000); });

    // --- Phase 3: Upload ---
    setPhase('UPLOAD', '\u2B06');
    gauge.setSpeed(0);
    if (downloadCard) downloadCard.classList.remove('active');
    if (uploadCard) uploadCard.classList.add('active');
    if (uploadEl) uploadEl.textContent = '...';

    var upload = await measureUpload(4, function(MBps) {
      gauge.setSpeed(MBps);
      if (uploadEl) uploadEl.textContent = formatMbps(toMbps(MBps)) + ' Mbps';
    });

    var ulMbps = upload > 0 ? toMbps(upload) : -1;
    if (uploadEl) uploadEl.textContent = ulMbps > 0 ? formatMbps(ulMbps) + ' Mbps' : 'Error';

    // --- Animate gauge down after upload ---
    await gauge.animateGaugeDown(ulMbps > 0 ? ulMbps : 0, 800);

    // --- Done ---
    setPhase('');
    gauge.reset();

    // Highlight all results
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.add('active'); });

    running = false;
    goBtn.classList.remove('hidden');
    goBtn.textContent = 'GO';
  }

  goBtn.addEventListener('click', runTest);
})();
