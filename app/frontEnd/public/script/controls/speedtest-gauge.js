/**
 * Shared Speed Test Gauge — Common gauge, formatting, and animation logic
 * used by both local (speedtest.js) and cellular (cell-speedtest.js) tests.
 */
var SpeedGauge = (function () {
  // Gauge geometry — arc from 225° to -45° (270° sweep)
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

  function formatMbps(mbps) {
    if (mbps >= 100) return mbps.toFixed(0);
    if (mbps >= 10) return mbps.toFixed(1);
    return mbps.toFixed(2);
  }

  function formatSpeed(MBps) {
    var mbps = MBps * 8;
    if (mbps >= 100) return mbps.toFixed(0) + ' Mbps';
    if (mbps >= 10) return mbps.toFixed(1) + ' Mbps';
    if (mbps >= 1) return mbps.toFixed(2) + ' Mbps';
    return (mbps * 1000).toFixed(0) + ' Kbps';
  }

  function toMbps(MBps) { return MBps * 8; }

  /**
   * Create a gauge controller for given DOM elements.
   * @param {Object} els - { needleEl, arcBg, arcFill, speedEl, unitEl, gaugeArea, scaleLabelsSelector }
   */
  function create(els) {
    var needleEl = els.needleEl;
    var arcBg = els.arcBg;
    var arcFill = els.arcFill;
    var speedEl = els.speedEl;
    var unitEl = els.unitEl;
    var gaugeArea = els.gaugeArea;
    var scaleLabelsSelector = els.scaleLabelsSelector;

    // Smooth animation state
    var _gaugeTarget = 0;
    var _gaugeCurrent = 0;
    var _gaugeAnimId = null;

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

    function initGauge() {
      if (arcBg) arcBg.setAttribute('d', arcPath(START_ANGLE, END_ANGLE, R));
      if (arcFill) arcFill.setAttribute('d', 'M0,0');
      var labelsG = scaleLabelsSelector ? document.querySelector(scaleLabelsSelector) : null;
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

    function setSpeed(MBps) {
      var mbps = MBps * 8;
      if (speedEl) speedEl.textContent = formatMbps(mbps);
      if (unitEl) unitEl.textContent = 'Mbps';
      setNeedle(mbps);
      setArcFill(mbps);
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
          if (speedEl) speedEl.textContent = val >= 0.01 ? formatMbps(val) : '0.00';
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

    function startGaugeAnimation() {
      if (_gaugeAnimId) return;
      function tick() {
        _gaugeCurrent += (_gaugeTarget - _gaugeCurrent) * 0.12;
        var jitter = _gaugeCurrent > 0.5 ? (Math.random() - 0.5) * _gaugeCurrent * 0.04 : 0;
        var display = Math.max(0, _gaugeCurrent + jitter);
        var mbps = display * 8;
        setNeedle(mbps);
        setArcFill(mbps);
        if (speedEl) speedEl.textContent = mbps >= 0.01 ? formatMbps(mbps) : '0.00';
        if (unitEl) unitEl.textContent = 'Mbps';
        _gaugeAnimId = requestAnimationFrame(tick);
      }
      _gaugeAnimId = requestAnimationFrame(tick);
    }

    function stopGaugeAnimation() {
      if (_gaugeAnimId) {
        cancelAnimationFrame(_gaugeAnimId);
        _gaugeAnimId = null;
      }
    }

    function setSpeedSmooth(MBps) {
      _gaugeTarget = MBps;
    }

    function resetSmooth() {
      _gaugeTarget = 0;
      _gaugeCurrent = 0;
    }

    function reset() {
      stopGaugeAnimation();
      _gaugeTarget = 0;
      _gaugeCurrent = 0;
      setNeedle(0);
      setArcFill(0);
      if (speedEl) speedEl.textContent = '0.00';
      if (unitEl) unitEl.textContent = 'Mbps';
      if (gaugeArea) gaugeArea.classList.add('idle');
    }

    function activate() {
      if (gaugeArea) gaugeArea.classList.remove('idle');
      setNeedle(0);
      setArcFill(0);
    }

    // Initialize
    if (gaugeArea) gaugeArea.classList.add('idle');
    initGauge();

    return {
      initGauge: initGauge,
      setNeedle: setNeedle,
      setArcFill: setArcFill,
      setSpeed: setSpeed,
      setSpeedSmooth: setSpeedSmooth,
      resetSmooth: resetSmooth,
      animateGaugeDown: animateGaugeDown,
      startGaugeAnimation: startGaugeAnimation,
      stopGaugeAnimation: stopGaugeAnimation,
      reset: reset,
      activate: activate
    };
  }

  return {
    create: create,
    formatMbps: formatMbps,
    formatSpeed: formatSpeed,
    toMbps: toMbps
  };
})();
