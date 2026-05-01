/**
 * AdGuard Home Panel — Install, manage, and update AdGuard Home DNS blocker
 * Scripts are fetched from app assets and deployed directly (no zip required).
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="adguard"]');
  if (!panel) return;

  var SH_FILE = '/data/agh/boot.sh';
  var BOOT_SH_FILE = '/sdcard/ufi_tools_boot.sh';
  var AGH_GITHUB_API = 'https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest';
  var AGH_DOWNLOAD_NAME = 'AdGuardHome_linux_arm64.tar.gz';
  var AGH_DOWNLOAD_PATH = '/data/' + AGH_DOWNLOAD_NAME;

  // Script assets base path (served by the app/dev-server)
  var AGH_ASSETS = '/shell/agh';

  var serviceEl = document.getElementById('agh_service_status');
  var versionEl = document.getElementById('agh_version');
  var logEl = document.getElementById('agh_log');

  var installBtn = document.getElementById('agh_install_btn');
  var restartBtn = document.getElementById('agh_restart_btn');
  var stopBtn = document.getElementById('agh_stop_btn');
  var uninstallBtn = document.getElementById('agh_uninstall_btn');
  var openBtn = document.getElementById('agh_open_btn');
  var exportBtn = document.getElementById('agh_export_btn');
  var viewlogBtn = document.getElementById('agh_viewlog_btn');
  var downloadBtn = document.getElementById('agh_download_btn');
  var updateBtn = document.getElementById('agh_update_btn');

  var busy = false;

  // Fetch a script file from app assets
  async function fetchAsset(path) {
    var res = await fetch(AGH_ASSETS + '/' + path);
    if (!res.ok) throw new Error('Failed to fetch ' + path);
    return await res.text();
  }

  // Upload script content to device path
  async function deployFile(content, filename, destPath) {
    var file = new File([content], filename, { type: 'text/plain' });
    var ok = await saveConfig(file, destPath);
    if (ok) {
      await runShellWithRoot('chmod 755 ' + destPath);
    }
    return ok;
  }

  function log(msg) {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() { logEl.textContent = ''; }

  function setService(text, color) {
    serviceEl.textContent = text;
    serviceEl.style.color = color || '';
  }

  async function checkRoot() {
    try {
      var res = await runShellWithRoot('whoami');
      return res.success && res.content.includes('root');
    } catch (e) { return false; }
  }

  async function getInstalledVersion() {
    try {
      var res = await runShellWithRoot('/data/agh/agh/bin/AdGuardHome --version 2>/dev/null');
      if (res.success && res.content) {
        var match = res.content.match(/v[\d.]+/);
        return match ? match[0] : null;
      }
    } catch (e) {}
    return null;
  }

  async function getLatestRelease() {
    try {
      var res = await runShellWithRoot(
        '/data/data/com.hotbox.f50_app/files/curl -s -L "' + AGH_GITHUB_API + '"',
        30000
      );
      if (res.success && res.content) {
        var data = JSON.parse(res.content);
        var tag = data.tag_name;
        var asset = data.assets && data.assets.find(function (a) { return a.name === AGH_DOWNLOAD_NAME; });
        if (tag && asset) return { version: tag, downloadUrl: asset.browser_download_url };
      }
    } catch (e) {}
    return null;
  }

  async function refreshStatus() {
    var version = await getInstalledVersion();
    if (version) {
      versionEl.textContent = version;
      var pidRes = await runShellWithRoot('cat /data/agh/agh/bin/agh.pid 2>/dev/null && kill -0 $(cat /data/agh/agh/bin/agh.pid) 2>/dev/null && echo RUNNING');
      if (pidRes.success && pidRes.content.includes('RUNNING')) {
        setService('Running', '#34d399');
      } else {
        setService('Stopped', '#fbbf24');
      }
    } else {
      versionEl.textContent = '--';
      setService('Not Installed', '#94a3b8');
    }
  }

  async function install() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) {
        showCtrlToast('Advanced features not enabled', 'error');
        return;
      }

      var res = await runShellWithRoot("awk '{print}' " + BOOT_SH_FILE);
      if (res.content && res.content.includes('agh/boot.sh')) {
        showCtrlToast('AdGuard is already installed', 'error');
        return;
      }

      log('[1/8] Cleaning up old files...');
      await runShellWithRoot('rm -rf /data/agh');

      log('[2/8] Creating directory structure...');
      var mkRes = await runShellWithRoot('mkdir -p /data/agh/agh/bin /data/agh/agh/scripts');
      if (!mkRes.success) { log('ERROR: Failed to create directories'); showCtrlToast('Failed to create directories', 'error'); return; }

      log('[3/8] Fetching scripts from app...');
      var scripts = [
        { asset: 'settings.conf', path: '/data/agh/agh/settings.conf' },
        { asset: 'scripts/base.sh', path: '/data/agh/agh/scripts/base.sh' },
        { asset: 'scripts/tool.sh', path: '/data/agh/agh/scripts/tool.sh' },
        { asset: 'scripts/iptables.sh', path: '/data/agh/agh/scripts/iptables.sh' },
        { asset: 'scripts/debug.sh', path: '/data/agh/agh/scripts/debug.sh' },
        { asset: 'action.sh', path: '/data/agh/action.sh' },
        { asset: 'boot.sh', path: '/data/agh/boot.sh' },
        { asset: 'uninstall.sh', path: '/data/agh/uninstall.sh' },
        { asset: 'AdGuardHome.yaml', path: '/data/agh/agh/bin/AdGuardHome.yaml' },
      ];

      log('[4/8] Deploying scripts to device...');
      for (var i = 0; i < scripts.length; i++) {
        var s = scripts[i];
        log('  → ' + s.asset);
        var content = await fetchAsset(s.asset);
        var ok = await deployFile(content, s.asset.split('/').pop(), s.path);
        if (!ok) { log('ERROR: Failed to deploy ' + s.asset); showCtrlToast('Failed to deploy ' + s.asset, 'error'); return; }
      }

      log('[5/8] Fetching latest release info...');
      var release = await getLatestRelease();
      if (!release) { log('ERROR: Failed to fetch release info. Check internet connection.'); showCtrlToast('Failed to fetch release info', 'error'); return; }

      log('[6/8] Downloading AdGuard Home ' + release.version + '...');
      var dlRes = await runShellWithRoot(
        '/data/data/com.hotbox.f50_app/files/curl -L "' + release.downloadUrl + '" -o "' + AGH_DOWNLOAD_PATH + '"',
        300000
      );
      if (!dlRes.success) { log('ERROR: Download failed'); showCtrlToast('Download failed', 'error'); return; }

      log('[7/8] Extracting & installing binary...');
      await runShellWithRoot('rm -rf /data/agh_update_tmp');
      var extRes = await runShellWithRoot('mkdir -p /data/agh_update_tmp && tar -xzf "' + AGH_DOWNLOAD_PATH + '" -C /data/agh_update_tmp', 60000);
      if (!extRes.success) { log('ERROR: Extraction failed'); showCtrlToast('Extraction failed', 'error'); return; }
      await runShellWithRoot('cp -f /data/agh_update_tmp/AdGuardHome/AdGuardHome /data/agh/agh/bin/AdGuardHome');
      await runShellWithRoot('chmod 755 /data/agh/agh/bin/AdGuardHome');
      await runShellWithRoot('rm -rf /data/agh_update_tmp "' + AGH_DOWNLOAD_PATH + '"');

      log('[8/8] Registering boot script & starting...');
      await runShellWithRoot("grep -qxF 'sh /data/agh/boot.sh &' " + BOOT_SH_FILE + " || echo 'sh /data/agh/boot.sh &' >> " + BOOT_SH_FILE);
      await runShellWithRoot('sh ' + SH_FILE + ' &');

      log('=== Installation complete ===');
      log('Address: http://192.168.0.1:3000');
      log('Default user: root');
      showCtrlToast('AdGuard Home installed!');
      refreshStatus();
    } catch (e) {
      log('ERROR: ' + e.message);
      showCtrlToast('Installation failed: ' + e.message, 'error');
    } finally { busy = false; }
  }

  async function restart() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) { showCtrlToast('Advanced features not enabled', 'error'); return; }
      log('Stopping AdGuard Home...');
      await runShellWithRoot('/data/agh/action.sh stop');
      log('Waiting...');
      await runShellWithRoot('sleep 2');
      log('Starting AdGuard Home...');
      var res = await runShellWithRoot('/data/agh/action.sh toggle');
      log(res.content || 'Started');
      showCtrlToast('Restarted');
      refreshStatus();
    } finally { busy = false; }
  }

  async function stop() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) { showCtrlToast('Advanced features not enabled', 'error'); return; }
      log('Stopping AdGuard Home...');
      var res = await runShellWithRoot('/data/agh/action.sh stop');
      log(res.content || 'Stopped');
      setService('Stopped', '#fbbf24');
      showCtrlToast('Stopped');
    } finally { busy = false; }
  }

  async function uninstall() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) { showCtrlToast('Advanced features not enabled', 'error'); return; }
      log('Removing boot entry...');
      await runShellWithRoot("sed -i '/agh.*boot.sh/d' " + BOOT_SH_FILE);
      log('Stopping service...');
      var res = await runShellWithRoot('/data/agh/action.sh stop');
      log(res.content || '');
      log('Removing files...');
      await runShellWithRoot('/data/agh/uninstall.sh');
      log('=== Uninstall complete ===');
      showCtrlToast('AdGuard Home uninstalled');
      refreshStatus();
    } finally { busy = false; }
  }

  async function exportConfig() {
    if (busy) return;
    busy = true;
    try {
      var res = await runShellWithRoot("timeout 2s awk '{print}' /data/agh/agh/bin/AdGuardHome.yaml");
      if (!res.success) { showCtrlToast('Failed to export config', 'error'); return; }
      var blob = new Blob([res.content], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'AdGuardHome.yaml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showCtrlToast('Config exported');
    } finally { busy = false; }
  }

  async function downloadLatest() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) { showCtrlToast('Advanced features not enabled', 'error'); return; }

      log('Fetching latest release info...');
      var release = await getLatestRelease();
      if (!release) { log('Failed to fetch release info'); showCtrlToast('Could not fetch release', 'error'); return; }

      log('Downloading AdGuard Home ' + release.version + '...');
      var dlRes = await runShellWithRoot(
        '/data/data/com.hotbox.f50_app/files/curl -L "' + release.downloadUrl + '" -o "' + AGH_DOWNLOAD_PATH + '"',
        300000
      );
      if (!dlRes.success) { log('Download failed'); showCtrlToast('Download failed', 'error'); return; }

      log('Extracting...');
      await runShellWithRoot('rm -rf /data/agh_update_tmp');
      var extRes = await runShellWithRoot('mkdir -p /data/agh_update_tmp && tar -xzf "' + AGH_DOWNLOAD_PATH + '" -C /data/agh_update_tmp', 60000);
      if (!extRes.success) { log('Extraction failed'); showCtrlToast('Extraction failed', 'error'); return; }

      log('Installing new binary...');
      await runShellWithRoot('/data/agh/action.sh stop 2>/dev/null');
      await runShellWithRoot('cp -f /data/agh_update_tmp/AdGuardHome/AdGuardHome /data/agh/agh/bin/AdGuardHome');
      await runShellWithRoot('chmod 755 /data/agh/agh/bin/AdGuardHome');
      await runShellWithRoot('rm -rf /data/agh_update_tmp "' + AGH_DOWNLOAD_PATH + '"');
      await runShellWithRoot('sh ' + SH_FILE + ' &');

      log('=== Updated to ' + release.version + ' ===');
      showCtrlToast('AdGuard Home updated to ' + release.version);
      refreshStatus();
    } finally { busy = false; }
  }

  async function checkForUpdate() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) { showCtrlToast('Advanced features not enabled', 'error'); return; }
      log('Checking for updates...');
      var installed = await getInstalledVersion();
      var release = await getLatestRelease();

      if (!release) { log('Failed to fetch release info'); showCtrlToast('Could not check updates', 'error'); return; }

      if (!installed) {
        log('Not installed. Latest: ' + release.version);
        showCtrlToast('Not installed. Use Install button.');
        return;
      }

      if (installed === release.version) {
        log('Already up to date: ' + installed);
        showCtrlToast('Up to date! (' + installed + ')');
        return;
      }

      log('Update available: ' + installed + ' → ' + release.version);
      log('Downloading...');
      var dlRes = await runShellWithRoot(
        '/data/data/com.hotbox.f50_app/files/curl -L "' + release.downloadUrl + '" -o "' + AGH_DOWNLOAD_PATH + '"',
        300000
      );
      if (!dlRes.success) { log('Download failed'); showCtrlToast('Download failed', 'error'); return; }

      log('Extracting...');
      await runShellWithRoot('rm -rf /data/agh_update_tmp');
      var extRes = await runShellWithRoot('mkdir -p /data/agh_update_tmp && tar -xzf "' + AGH_DOWNLOAD_PATH + '" -C /data/agh_update_tmp', 60000);
      if (!extRes.success) { log('Extraction failed'); showCtrlToast('Extraction failed', 'error'); return; }

      log('Installing new binary...');
      await runShellWithRoot('/data/agh/action.sh stop 2>/dev/null');
      await runShellWithRoot('cp -f /data/agh_update_tmp/AdGuardHome/AdGuardHome /data/agh/agh/bin/AdGuardHome');
      await runShellWithRoot('chmod 755 /data/agh/agh/bin/AdGuardHome');
      await runShellWithRoot('rm -rf /data/agh_update_tmp "' + AGH_DOWNLOAD_PATH + '"');
      await runShellWithRoot('sh ' + SH_FILE + ' &');

      log('=== Updated to ' + release.version + ' ===');
      showCtrlToast('Updated to ' + release.version);
      refreshStatus();
    } finally { busy = false; }
  }

  async function viewLogs() {
    if (busy) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) { showCtrlToast('Advanced features not enabled', 'error'); return; }
      log('--- history.log (last 50 lines) ---');
      var r1 = await runShellWithRoot('tail -n 50 /data/agh/history.log 2>/dev/null || echo "(no history log)"');
      log(r1.content || '(empty)');
      log('');
      log('--- bin.log (last 30 lines) ---');
      var r2 = await runShellWithRoot('tail -n 30 /data/agh/agh/bin.log 2>/dev/null || echo "(no bin log)"');
      log(r2.content || '(empty)');
      log('');
      log('--- boot.log ---');
      var r3 = await runShellWithRoot('cat /data/agh/boot.log 2>/dev/null || echo "(no boot log)"');
      log(r3.content || '(empty)');
    } finally { busy = false; }
  }

  // Button bindings
  installBtn.addEventListener('click', install);
  restartBtn.addEventListener('click', restart);
  stopBtn.addEventListener('click', stop);
  uninstallBtn.addEventListener('click', uninstall);
  exportBtn.addEventListener('click', exportConfig);
  viewlogBtn.addEventListener('click', viewLogs);
  downloadBtn.addEventListener('click', downloadLatest);
  updateBtn.addEventListener('click', checkForUpdate);
  openBtn.addEventListener('click', function () {
    window.open(location.protocol + '//' + location.hostname + ':3000', '_blank');
  });

  // Refresh status when panel shown
  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail && e.detail.tab === 'adguard') refreshStatus();
  });

  // Initial check
  refreshStatus();
})();
