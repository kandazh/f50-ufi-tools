/**
 * Virtual Memory Panel — Create/remove swap file on device
 * Optimized from ZTE_f50_plugin_increase_swap_memory.groovy
 */
(function () {
  var SWAP_FILE = '/data/swapfile';
  var SH_FILE = '/sdcard/kano_swap.sh';
  var LOG_FILE = '/data/swap_setup.log';
  var BOOT_SH = '/sdcard/ufi_tools_boot.sh';
  var SWAP_SIZE_MB = 1536; // 1.5 GB

  var toggleWrap = document.getElementById('SWAP_TOGGLE_SWITCH');
  var statusEl = document.getElementById('swap_status');
  var sizeEl = document.getElementById('swap_size');
  var logEl = document.getElementById('swap_log');

  if (!toggleWrap) return;

  var busy = false;

  var swapToggle = createCtrlToggle(toggleWrap, onToggle);

  async function onToggle(enabled) {
    if (busy) { swapToggle.set(!enabled); return; }
    if (enabled) {
      install();
    } else {
      uninstall();
    }
  }

  var SCRIPT = [
    '#!/system/bin/sh',
    'SWAP_FILE="' + SWAP_FILE + '"',
    'SWAP_SIZE_MB=' + SWAP_SIZE_MB,
    'LOG_FILE="' + LOG_FILE + '"',
    '',
    'log() { echo "$@" >> "$LOG_FILE"; }',
    'rm -f "$LOG_FILE"',
    'log "=== Starting swap file setup ==="',
    'log "[1/5] Creating ${SWAP_SIZE_MB}MB swap file..."',
    'dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$SWAP_SIZE_MB >>"$LOG_FILE" 2>&1',
    'if [ $? -ne 0 ]; then log "Failed to create swap file"; exit 1; fi',
    'log "[2/5] Setting permissions..."',
    'chmod 600 "$SWAP_FILE" >>"$LOG_FILE" 2>&1',
    'log "[3/5] Formatting as swap..."',
    'mkswap "$SWAP_FILE" >>"$LOG_FILE" 2>&1',
    'if [ $? -ne 0 ]; then log "mkswap failed"; exit 1; fi',
    'log "[4/5] Enabling swap..."',
    'swapon "$SWAP_FILE" >>"$LOG_FILE" 2>&1',
    'if [ $? -ne 0 ]; then log "swapon failed"; exit 1; fi',
    'log "[5/5] Current swap status:"',
    'cat /proc/swaps >> "$LOG_FILE"',
    'free -h >> "$LOG_FILE"',
    'log "=== Swap setup completed ==="'
  ].join('\n');

  function setLog(text) {
    logEl.textContent = text || '';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setBusy(state) {
    busy = state;
  }

  async function checkRoot() {
    try {
      var res = await runShellWithRoot('whoami');
      return res.success && res.content.includes('root');
    } catch (e) { return false; }
  }

  var dotEl = document.getElementById('swap_status_dot');

  function setStatus(text, color, dotClass) {
    dotEl.className = 'ctrl-adv-indicator' + (dotClass ? ' ' + dotClass : '');
    statusEl.style.color = color;
    statusEl.textContent = text;
  }

  async function checkSwapStatus() {
    try {
      var res = await runShellWithRoot('cat /proc/swaps');
      if (res.success && res.content.includes(SWAP_FILE)) {
        setStatus('Active', '#4ade80', 'enabled');
        swapToggle.set(true);
        // Parse size
        var lines = res.content.trim().split('\n');
        for (var i = 1; i < lines.length; i++) {
          if (lines[i].includes(SWAP_FILE)) {
            var parts = lines[i].split(/\s+/);
            var kb = parseInt(parts[2]) || 0;
            sizeEl.textContent = (kb / 1024).toFixed(0) + ' MB';
            return;
          }
        }
        sizeEl.textContent = SWAP_SIZE_MB + ' MB';
      } else {
        setStatus('Inactive', '#94a3b8', '');
        swapToggle.set(false);
        sizeEl.textContent = '--';
      }
    } catch (e) {
      setStatus('Unknown', '#fbbf24', 'pending');
      sizeEl.textContent = '--';
    }
  }

  async function uploadScript() {
    var file = new File([SCRIPT], 'kano_swap.sh', { type: 'text/plain' });
    var form = new FormData();
    form.append('file', file);

    var res = await (await fetch(KANO_baseURL + '/upload_img', {
      method: 'POST',
      headers: common_headers,
      body: form
    })).json();

    if (!res.url) return false;

    var tmp = '/data/data/com.minikano.f50_sms/files' + res.url;
    var mv = await runShellWithRoot('mv ' + tmp + ' ' + SH_FILE);
    return mv.success;
  }

  async function install() {
    if (busy) return;
    setBusy(true);
    setLog('Checking root access...');

    if (!(await checkRoot())) {
      setLog('ERROR: Root access not available. Enable it first.');
      showCtrlToast('Root access required', 'error');
      swapToggle.set(false);
      setBusy(false);
      return;
    }

    setLog('Uploading swap script...');
    if (!(await uploadScript())) {
      setLog('ERROR: Failed to upload script to device.');
      showCtrlToast('Upload failed', 'error');
      swapToggle.set(false);
      setBusy(false);
      return;
    }

    // Add to boot script for persistence
    await runShellWithRoot(
      "grep -qxF 'swapon " + SWAP_FILE + " &' " + BOOT_SH +
      " || echo 'swapon " + SWAP_FILE + " &' >> " + BOOT_SH
    );

    // Run the script
    setLog('Running swap setup (this takes a few minutes)...\n');
    await runShellWithRoot('sh ' + SH_FILE + ' &');

    // Poll log file
    var elapsed = 0;
    var maxWait = 600; // 10 min max
    var poll = setInterval(async function () {
      try {
        var res = await runShellWithRoot('cat ' + LOG_FILE + ' 2>/dev/null');
        if (res.success && res.content) {
          setLog(res.content);
        }
        if (res.content && res.content.includes('setup completed')) {
          clearInterval(poll);
          showCtrlToast('Virtual memory enabled & set to auto-start');
          setBusy(false);
          checkSwapStatus();
        }
      } catch (e) { /* ignore */ }

      elapsed++;
      if (elapsed >= maxWait) {
        clearInterval(poll);
        setLog(logEl.textContent + '\n\nTimeout — check device manually.');
        showCtrlToast('Timed out', 'error');
        setBusy(false);
      }
    }, 1000);
  }

  async function uninstall() {
    if (busy) return;
    setBusy(true);
    setLog('Disabling swap...');

    if (!(await checkRoot())) {
      setLog('ERROR: Root access not available.');
      showCtrlToast('Root access required', 'error');
      swapToggle.set(true);
      setBusy(false);
      return;
    }

    await runShellWithRoot("sed -i '/swapon/d' " + BOOT_SH);
    await runShellWithRoot('swapoff ' + SWAP_FILE);
    await runShellWithRoot('rm -f ' + SWAP_FILE);
    await runShellWithRoot('rm -f ' + SH_FILE);

    setLog('Virtual memory disabled and files removed.');
    showCtrlToast('Virtual memory disabled');
    setBusy(false);
    checkSwapStatus();
  }

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'swap_memory') checkSwapStatus();
  });
})();
