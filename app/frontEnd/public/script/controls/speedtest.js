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
      if (mode === 'local') setTimeout(initGauge, 0);
    });
  });

  // Local speed test elements
  var goBtn = document.getElementById('speedtest_start_btn');
  var speedEl = document.getElementById('speedtest_speed');
  var unitEl = document.getElementById('speedtest_unit');
  var phaseEl = document.getElementById('speedtest_phase');
  var phaseIcon = document.getElementById('speedtest_phase_icon');
  var needleEl = document.getElementById('speedtest_needle');
  var arcBg = document.getElementById('speedtest_arc_bg');
  var arcFill = document.getElementById('speedtest_arc_fill');
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

  // Gauge geometry — arc from 225° to -45° (270° sweep), like speedtest.com
  var CX = 150, CY = 150, R = 115;
  var START_ANGLE = 225; // degrees, bottom-left
  var END_ANGLE = -45;   // degrees, bottom-right (clockwise)
  var SWEEP = 270;       // total degrees

  // Scale labels (logarithmic like speedtest.com)
  var SCALE_VALUES = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

  function degToRad(d) { return d * Math.PI / 180; }

  function polarToXY(angle, radius) {
    var rad = degToRad(angle);
    return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
  }

  // Map Mbps value to angle (logarithmic)
  function mbpsToAngle(mbps) {
    if (mbps <= 0) return START_ANGLE;
    var fraction = Math.log10(mbps + 1) / Math.log10(1001);
    return START_ANGLE - fraction * SWEEP;
  }

  // Build arc path from startAngle to endAngle
  function arcPath(startAng, endAng, radius) {
    var s = polarToXY(startAng, radius);
    var e = polarToXY(endAng, radius);
    var sweep = startAng - endAng;
    var largeArc = sweep > 180 ? 1 : 0;
    return 'M' + s.x.toFixed(1) + ',' + s.y.toFixed(1) +
           ' A' + radius + ',' + radius + ' 0 ' + largeArc + ' 1 ' +
           e.x.toFixed(1) + ',' + e.y.toFixed(1);
  }

  // Initialize gauge
  function initGauge() {
    // Draw background arc
    if (arcBg) arcBg.setAttribute('d', arcPath(START_ANGLE, END_ANGLE, R));
    // Set fill arc to empty
    if (arcFill) arcFill.setAttribute('d', 'M0,0');
    // Draw scale labels
    var labelsG = document.querySelector('#speedtest_local_panel .speedtest-scale-labels');
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
    // Set needle to 0
    setNeedle(0);
  }

  function setNeedle(mbps) {
    if (!needleEl) return;
    var angle = mbpsToAngle(mbps);
    // Needle is drawn pointing UP (12 o'clock). SVG rotate is clockwise.
    // Math angle to SVG rotation: svgAngle = 90 - mathAngle
    var svgAngle = 90 - angle;
    needleEl.style.transform = 'rotate(' + svgAngle + 'deg)';
  }

  function setArcFill(mbps) {
    if (!arcFill) return;
    var endAngle = mbpsToAngle(mbps);
    if (mbps <= 0) {
      arcFill.setAttribute('d', 'M0,0');
      return;
    }
    arcFill.setAttribute('d', arcPath(START_ANGLE, endAngle, R));
  }

  // Animate gauge smoothly from current value down to 0
  function animateGaugeDown(fromMbps, duration) {
    return new Promise(function(resolve) {
      var start = performance.now();
      var dur = duration || 800;
      function step(now) {
        var t = Math.min((now - start) / dur, 1);
        var ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
        var val = fromMbps * (1 - ease);
        setNeedle(val);
        setArcFill(val);
        if (speedEl) speedEl.textContent = val >= 1 ? formatMbps(val) : '0.00';
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

  // Start in idle state
  if (gaugeArea) gaugeArea.classList.add('idle');
  initGauge();

  var running = false;
  var TEST_DURATION_MS = 8000;

  function toMbps(MBps) { return MBps * 8; }

  function formatMbps(mbps) {
    if (mbps >= 100) return mbps.toFixed(0);
    if (mbps >= 10) return mbps.toFixed(1);
    return mbps.toFixed(2);
  }

  function setSpeed(MBps) {
    var mbps = toMbps(MBps);
    if (speedEl) speedEl.textContent = formatMbps(mbps);
    if (unitEl) unitEl.textContent = 'Mbps';
    setNeedle(mbps);
    setArcFill(mbps);
  }

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

  // Download test — continuous fetch for TEST_DURATION_MS
  function measureDownload(ckSize, onProgress) {
    return new Promise(function (resolve) {
      var totalLoaded = 0;
      var startTime = performance.now();
      var done = false;

      function runOne() {
        if (done) return;
        fetch(HOTBOX_baseURL + '/speedtest?ckSize=' + ckSize + '&cors=1&_t=' + Date.now(), { cache: 'no-store' })
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
        fetch(HOTBOX_baseURL + '/speedtest_upload?_t=' + Date.now(), { method: 'POST', body: new Blob([data]) })
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
    setNeedle(0);
    setArcFill(0);

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
    setPhase('DOWNLOAD', '⬇');
    setSpeed(0);
    if (pingCard) pingCard.classList.remove('active');
    if (downloadCard) downloadCard.classList.add('active');
    if (downloadEl) downloadEl.textContent = '...';

    var download = await measureDownload(ckSize, function(MBps) {
      setSpeed(MBps);
      if (downloadEl) downloadEl.textContent = formatMbps(toMbps(MBps)) + ' Mbps';
    });

    var dlMbps = download > 0 ? toMbps(download) : -1;
    if (downloadEl) downloadEl.textContent = dlMbps > 0 ? formatMbps(dlMbps) + ' Mbps' : 'Error';
    if (downloadCard) downloadCard.classList.add('active');

    // --- Animate gauge down & pause ---
    await animateGaugeDown(dlMbps > 0 ? dlMbps : 0, 800);
    await new Promise(function(r) { setTimeout(r, 2000); });

    // --- Phase 3: Upload ---
    setPhase('UPLOAD', '⬆');
    setSpeed(0);
    if (downloadCard) downloadCard.classList.remove('active');
    if (uploadCard) uploadCard.classList.add('active');
    if (uploadEl) uploadEl.textContent = '...';

    var upload = await measureUpload(4, function(MBps) {
      setSpeed(MBps);
      if (uploadEl) uploadEl.textContent = formatMbps(toMbps(MBps)) + ' Mbps';
    });

    var ulMbps = upload > 0 ? toMbps(upload) : -1;
    if (uploadEl) uploadEl.textContent = ulMbps > 0 ? formatMbps(ulMbps) + ' Mbps' : 'Error';

    // --- Done ---
    setPhase('DOWNLOAD', '⬇');
    var finalMbps = dlMbps > 0 ? dlMbps : 0;
    if (speedEl) speedEl.textContent = formatMbps(finalMbps);
    if (unitEl) unitEl.textContent = 'Mbps';
    setNeedle(finalMbps);
    setArcFill(finalMbps);

    // Highlight all results
    [pingCard, downloadCard, uploadCard].forEach(function(c) { if(c) c.classList.add('active'); });

    running = false;
    goBtn.classList.remove('hidden');
    goBtn.textContent = 'GO';
  }

  goBtn.addEventListener('click', runTest);
})();
