/**
 * Clean All Panel — Remove all files/folders created by the app
 */
(function () {
  var panel = document.querySelector('[data-ctrl-panel="clean_all"]');
  if (!panel) return;

  var btn = document.getElementById('clean_all_btn');
  var logEl = document.getElementById('clean_all_log');
  var busy = false;

  function log(msg) {
    logEl.textContent += msg + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearLog() { logEl.textContent = ''; }

  async function checkRoot() {
    try {
      var res = await runShellWithRoot('whoami');
      return res.success && res.content.includes('root');
    } catch (e) { return false; }
  }

  async function cleanAll() {
    if (busy) return;
    if (!confirm('This will remove ALL files created by the app (root access, AdGuard, swap, scripts, logs). This cannot be undone. Continue?')) return;
    busy = true;
    clearLog();
    try {
      if (!(await checkRoot())) {
        showCtrlToast('Root access required for full cleanup', 'error');
        return;
      }

      // 1. Stop AdGuard
      log('[1/9] Stopping AdGuard Home...');
      await runShellWithRoot('/data/agh/action.sh stop 2>/dev/null');

      // 2. Remove swap
      log('[2/9] Removing virtual memory swap...');
      await runShellWithRoot('swapoff /data/swapfile 2>/dev/null; rm -f /data/swapfile /data/swap_setup.log');

      // 3. Remove AdGuard
      log('[3/9] Removing AdGuard Home...');
      await runShellWithRoot('rm -rf /data/agh /data/agh_update_tmp /data/AdGuardHome_linux_arm64.tar.gz');

      // 4. Remove boot/schedule/quick scripts
      log('[4/9] Removing scripts...');
      await runShellWithRoot([
        'rm -f /sdcard/ufi_tools_boot.sh',
        'rm -f /sdcard/ufi_tools_schedule.sh',
        'rm -f /sdcard/quick_shell.sh',
        'rm -f /sdcard/hotbox_swap.sh',
        'rm -f /sdcard/unlock_samba.sh',
      ].join('; '));

      // 5. Remove logs
      log('[5/9] Removing logs...');
      await runShellWithRoot('rm -f /sdcard/smb_log.log /sdcard/ufi_tools_update.log');

      // 6. Remove OTA files
      log('[6/9] Removing OTA update files...');
      await runShellWithRoot('rm -f /sdcard/ufi_tools_latest.apk /sdcard/ufi_tools_update.sh');

      // 7. Remove temp/mount dirs and flags
      log('[7/9] Removing temp files & mount dirs...');
      await runShellWithRoot([
        'rm -f /data/local/tmp/boot_once.flag',
        'rm -rf /data/local/tmp/hotbox_mc',
        'rm -f /data/local/tmp/speedtest_ul',
        'rm -rf /data/SAMBA_SHARE',
        'rm -f /cache/unlock_samba.sh',
      ].join('; '));

      // 8. Remove samba config (disables root hook)
      log('[8/9] Removing samba hook config...');
      await runShellWithRoot('chattr -i /data/samba/etc/smb.conf 2>/dev/null; rm -f /data/samba/etc/smb.conf 2>/dev/null');

      // 9. Kill socat/ttyd (must be last since all commands above use the root shell socket)
      log('[9/9] Stopping root shell & terminal...');
      // Use background kill with delay so the response can be sent before socat dies
      await runShellWithRoot('pkill -f ttyd 2>/dev/null; (sleep 1; pkill -f "socat.*hotbox_root_shell") &');

      log('');
      log('=== All files cleaned ===');
      log('Reboot the device to complete.');
      showCtrlToast('All files cleaned! Reboot to complete.');
    } catch (e) {
      log('ERROR: ' + e.message);
      showCtrlToast('Cleanup failed: ' + e.message, 'error');
    } finally { busy = false; }
  }

  btn.addEventListener('click', cleanAll);
})();
