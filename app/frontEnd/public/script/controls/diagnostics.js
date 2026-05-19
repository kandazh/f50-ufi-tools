/**
 * Network Diagnostics Panel — ping, traceroute, nslookup, curl
 * Uses POST /api/diagnostics
 */
(function () {
  var running = false;

  var toolEl = document.getElementById('DIAG_TOOL');
  var targetEl = document.getElementById('DIAG_TARGET');
  var outputEl = document.getElementById('DIAG_OUTPUT');
  var runBtn = document.getElementById('DIAG_RUN_BTN');
  var clearBtn = document.getElementById('DIAG_CLEAR_BTN');

  // Option fields
  var countWrap = document.getElementById('DIAG_OPT_COUNT_WRAP');
  var timeoutWrap = document.getElementById('DIAG_OPT_TIMEOUT_WRAP');
  var maxhopsWrap = document.getElementById('DIAG_OPT_MAXHOPS_WRAP');
  var dnsWrap = document.getElementById('DIAG_OPT_DNS_WRAP');

  if (!toolEl || !targetEl || !outputEl || !runBtn) return;

  // Show/hide relevant options based on tool selection
  toolEl.addEventListener('change', updateOptions);
  updateOptions();

  function updateOptions() {
    var tool = toolEl.value;
    var isPing = tool === 'ping' || tool === 'ping6';
    var isTrace = tool === 'traceroute' || tool === 'traceroute6';
    var isDns = tool === 'nslookup';
    var isCurl = tool === 'curl';

    countWrap.style.display = isPing ? '' : 'none';
    timeoutWrap.style.display = (isPing || isTrace || isCurl) ? '' : 'none';
    maxhopsWrap.style.display = isTrace ? '' : 'none';
    dnsWrap.style.display = isDns ? '' : 'none';

    // Update placeholder
    if (isCurl) {
      targetEl.placeholder = 'https://example.com';
    } else {
      targetEl.placeholder = '1.1.1.1 or google.com';
    }
  }

  runBtn.addEventListener('click', runDiagnostic);
  clearBtn.addEventListener('click', function () {
    outputEl.textContent = '';
  });

  // Allow Enter key to run
  targetEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !running) runDiagnostic();
  });

  async function runDiagnostic() {
    if (running) return;
    var tool = toolEl.value;
    var target = targetEl.value.trim();
    if (!target) {
      outputEl.textContent = 'Error: Enter a target hostname, IP, or URL';
      return;
    }

    running = true;
    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    outputEl.textContent = '⏳ Running ' + tool + ' → ' + target + '...\n';

    var options = {};
    if (tool === 'ping' || tool === 'ping6') {
      options.count = parseInt(document.getElementById('DIAG_OPT_COUNT').value) || 4;
      options.timeout = parseInt(document.getElementById('DIAG_OPT_TIMEOUT').value) || 5;
    } else if (tool === 'traceroute' || tool === 'traceroute6') {
      options.max_hops = parseInt(document.getElementById('DIAG_OPT_MAXHOPS').value) || 15;
      options.timeout = parseInt(document.getElementById('DIAG_OPT_TIMEOUT').value) || 3;
    } else if (tool === 'nslookup') {
      var dns = document.getElementById('DIAG_OPT_DNS').value.trim();
      if (dns) options.server = dns;
    } else if (tool === 'curl') {
      options.timeout = parseInt(document.getElementById('DIAG_OPT_TIMEOUT').value) || 10;
    }

    try {
      var timeoutMs = (tool.indexOf('traceroute') >= 0) ? 65000 : 30000;
      var res = await fetchWithTimeout(HOTBOX_baseURL + '/diagnostics', {
        method: 'POST',
        headers: common_headers,
        body: JSON.stringify({ tool: tool, target: target, options: options })
      }, timeoutMs);

      var data = await res.json();
      if (data.error) {
        outputEl.textContent = '❌ Error: ' + data.error;
      } else {
        outputEl.textContent = data.output || '(no output)';
      }
    } catch (e) {
      outputEl.textContent = '❌ Request failed: ' + (e.message || e);
    } finally {
      running = false;
      runBtn.disabled = false;
      runBtn.textContent = 'Run';
    }
  }
})();
