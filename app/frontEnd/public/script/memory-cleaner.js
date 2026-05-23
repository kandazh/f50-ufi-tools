(() => {
  const TITLE = 'Clean Memory';
  const PANEL_ID = 'hotbox_mc_panel';
  const TEXT_ID = 'hotbox_mc_text';
  const BAR_ID = 'hotbox_mc_bar';
  const PCT_ID = 'hotbox_mc_pct';
  const TMP_DIR = '/data/local/tmp/hotbox_mc';
  const PKG_FILE = `${TMP_DIR}/pkgs.txt`;

  let busy = false;
  let progressVisible = false;
  let elPanel = null, elText = null, elBar = null, elPct = null;

  // Whitelist: process names containing these are never killed
  const WHITELIST = [
    'com.hotbox.f50_app', 'easytier', 'mihomo', 'clash',
    'hotbox_at_daemon', 'magisk', 'apatch', 'ksu', 'sukisu', '/data/',
  ];

  // Protected packages: never force-stopped
  const PROTECTED = [
    'android', 'android.ext.services', 'android.process.media',
    'com.android.systemui', 'com.android.launcher',
    'com.google.android.apps.nexuslauncher',
    'com.google.android.inputmethod', 'com.android.inputmethod.latin',
    'com.android.phone', 'com.android.shell', 'com.android.bluetooth',
    'com.android.nfc', 'com.android.providers.telephony',
    'com.android.networkstack', 'com.google.android.networkstack',
    'com.android.tethering', 'com.google.android.tethering',
    'com.android.connectivity.resources',
    'com.google.android.connectivity.resources',
    'com.qualcomm.qti.tetherservice',
    'com.android.server.telecom', 'com.android.telephony',
    'com.android.permissioncontroller', 'com.android.externalstorage',
    'com.android.gallery3d', 'com.android.providers.media.module',
    'com.android.se', 'com.android.smspush', 'com.android.stk',
    'com.sprd.fileexplorer', 'com.sprd.providers.photos',
    'com.sprd.simple.launcher',
  ];

  const KILLABLE_SYSTEM = ['com.android.settings'];

  const esc = (v) => String(v).replace(/'/g, "'\\''");

  // Build shell case-match lines once
  const wlCases = WHITELIST.map(k => `    *${esc(k)}*) return 0 ;;`).join('\n');
  const protCases = PROTECTED.map(k => `    ${esc(k)}) return 0 ;;`).join('\n');
  const killCases = KILLABLE_SYSTEM.map(k => `    ${esc(k)}) return 0 ;;`).join('\n');

  // Phase 1: collect targets + measure before memory (1 HTTP call)
  const COLLECT_SCRIPT = `
TMP="${TMP_DIR}"; PF="${PKG_FILE}"; mkdir -p "$TMP"; : > "$PF"
mem(){ awk '/MemAvailable:/{print $2;exit}' /proc/meminfo 2>/dev/null; }
wl(){ case "$1" in
${wlCases}
  *) return 1;; esac; }
pp(){ [ -n "$1" ] || return 0; case "$1" in
${protCases}
  *) return 1;; esac; }
ks(){ [ -n "$1" ] || return 1; case "$1" in
${killCases}
  *) return 1;; esac; }
su(){ case "$1" in root|shell|system_server|radio|nobody|bluetooth|network_stack|dns_tether|webview_zygote) return 0;; *) return 1;; esac; }
ip(){ case "$1" in *.*) return 0;; *) return 1;; esac; }
au(){ [ -n "$1" ] && ! grep -Fxq "$1" "$2" 2>/dev/null && printf '%s\\n' "$1" >> "$2"; }
rp(){ v="$(sh -c "$1" 2>/dev/null|head -1)"; printf '%s' "\${v%%/*}"; }
TP="$(rp "dumpsys activity top|grep -m1 ' ACTIVITY '|awk '{print \\\\$2}'")"
HP="$(rp "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME|tail -1")"
IP="$(rp "settings get secure default_input_method")"
BK="$(mem)"; [ -n "$BK" ]||BK=0
ps -A -o USER=,NAME= 2>/dev/null|awk 'NF{printf "%s\\\\t%s\\\\n",$1,$2}'|while IFS="$(printf '\\\\t')" read -r u n; do
  [ -n "$n" ]||continue; su "$u"&&continue; wl "$n"&&continue
  p="\${n%%:*}"; ip "$p"||continue
  [ "$p" = "$TP" ]||[ "$p" = "$HP" ]||[ "$p" = "$IP" ]&&continue
  case "$u" in u*_a*|u*_i*|app_*) pp "$p"||au "$p" "$PF";; system) ks "$p"&&au "$p" "$PF";; esac
done
sort -u "$PF" -o "$PF" 2>/dev/null
printf 'COLLECT|%s|%s\\n' "$BK" "$(awk 'NF{c++}END{print c+0}' "$PF" 2>/dev/null)"
`;

  // Phase 2: stop + trim + reclaim + cleanup (1 HTTP call)
  const EXECUTE_SCRIPT = `
PF="${PKG_FILE}"; s=0
if [ -s "$PF" ]; then while IFS= read -r p; do [ -n "$p" ]&&am force-stop "$p" >/dev/null 2>&1&&s=$((s+1)); done < "$PF"; fi
printf 'STOP|%s\\n' "$s"
t=0; cmd activity idle-maintenance >/dev/null 2>&1&&t=1; am kill-all >/dev/null 2>&1&&t=1
printf 'TRIM|%s\\n' "$t"
mem(){ awk '/MemAvailable:/{print $2;exit}' /proc/meminfo 2>/dev/null; }
sync
[ -w /proc/sys/vm/drop_caches ]&&echo 3>/proc/sys/vm/drop_caches
[ -w /proc/sys/vm/compact_memory ]&&echo 1>/proc/sys/vm/compact_memory
for cg in /sys/fs/cgroup/memory /dev/memcg /sys/fs/cgroup; do [ -w "$cg/memory.reclaim" ]&&echo 64M>"$cg/memory.reclaim" 2>/dev/null; done
for z in /sys/block/zram*; do [ -e "$z" ]||continue; [ -w "$z/idle" ]&&echo all>"$z/idle" 2>/dev/null; [ -w "$z/compact" ]&&echo 1>"$z/compact" 2>/dev/null; done
AK="$(mem)"; [ -n "$AK" ]||AK=0
printf 'RECLAIM|%s\\n' "$AK"
rm -rf "${TMP_DIR}"
`;

  const parseLine = (text, tag) => {
    const lines = String(text || '').split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (l.startsWith(tag + '|')) return l;
    }
    return null;
  };

  const runRoot = (cmd, timeout) =>
    runShellWithRoot(cmd, timeout || 15000).then(r => ({
      ok: !!r?.success,
      text: String(r?.content || '').trim(),
    }));

  const fmtMem = (kb) => formatBytes(Math.max(0, Number(kb) || 0) * 1024).replace(/&nbsp;/g, '').trim();

  // --- Progress UI (lazy-created, refs cached) ---
  const initProgressUI = () => {
    if (elPanel) return;
    document.body.insertAdjacentHTML('beforeend', `
<div id="${PANEL_ID}" style="position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:999999;min-width:300px;max-width:92vw;background:rgba(30,30,30,.97);color:#ff8fc7;border:1px solid rgba(255,143,199,.35);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.28);padding:12px 14px;opacity:0;transform:translateX(-50%) translateY(-10px) scale(.98);transition:opacity .22s ease,transform .22s ease;pointer-events:none">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
    <div id="${TEXT_ID}" style="font-size:13px;line-height:1.4;word-break:break-all;flex:1">Preparing...</div>
    <div id="${PCT_ID}" style="font-size:13px;font-weight:800;color:#ffd36f;white-space:nowrap">0%</div>
  </div>
  <div style="width:100%;height:8px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden">
    <div id="${BAR_ID}" style="width:0%;height:100%;background:linear-gradient(90deg,#ff8fc7,#ffd36f);border-radius:999px;transition:width .2s ease"></div>
  </div>
</div>`);
    elPanel = document.getElementById(PANEL_ID);
    elText = document.getElementById(TEXT_ID);
    elBar = document.getElementById(BAR_ID);
    elPct = document.getElementById(PCT_ID);
  };

  const showProgress = (text, pct) => {
    initProgressUI();
    const p = Math.max(0, Math.min(100, pct | 0));
    elPanel.style.opacity = '1';
    elPanel.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    progressVisible = true;
    elText.textContent = text || 'Processing...';
    elPct.textContent = p + '%';
    elBar.style.width = p + '%';
  };

  const hideProgress = () => {
    if (!elPanel || !progressVisible) return;
    elPanel.style.opacity = '0';
    elPanel.style.transform = 'translateX(-50%) translateY(-10px) scale(.98)';
    progressVisible = false;
  };

  const handleClick = async (button) => {
    if (busy) return;
    if (!(await checkAdvancedFunc())) {
      createToast('Please enable advanced features first', 'pink');
      return;
    }
    busy = true;
    button.disabled = true;
    button.textContent = 'Cleaning...';

    try {
      // Phase 1: collect targets (1 call)
      showProgress('Scanning cleanable applications...', 15);
      const c = await runRoot(COLLECT_SCRIPT, 12000);
      const cLine = c.ok && parseLine(c.text, 'COLLECT');
      if (!cLine) throw new Error('Failed to scan cleanup targets');
      const [, beforeRaw, countRaw] = cLine.split('|');
      const beforeKb = Number(beforeRaw) || 0;
      const pkgCount = Number(countRaw) || 0;

      // Phase 2: stop + trim + reclaim + cleanup (1 call)
      showProgress(`Stopping ${pkgCount} apps & reclaiming memory...`, 50);
      const e = await runRoot(EXECUTE_SCRIPT, 20000);
      if (!e.ok) throw new Error('Cleanup execution failed');

      const sLine = parseLine(e.text, 'STOP');
      const rLine = parseLine(e.text, 'RECLAIM');
      const stopped = sLine ? Number(sLine.split('|')[1]) || 0 : 0;
      const afterKb = rLine ? Number(rLine.split('|')[1]) || 0 : 0;
      const freed = Math.max(0, afterKb - beforeKb);

      showProgress('Done!', 100);
      hideProgress();
      createToast(`Freed ${fmtMem(freed)}, processed ${stopped || pkgCount} apps`, 'pink', 5000);
    } catch (err) {
      hideProgress();
      createToast(`Cleanup failed: ${err?.message || err}`, 'red', 5000);
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = TITLE;
    }
  };

  // Insert button
  const button = document.createElement('button');
  button.id = 'CLEAN_MEMORY';
  button.className = 'qt-btn';
  button.textContent = TITLE;
  button.setAttribute('data-i18n', 'clean_memory');
  button.onclick = () => handleClick(button);
  button.style.display = 'none'; // Hide the old button since we're using header version

  const qt = document.getElementById('quickToggles');
  if (qt) qt.appendChild(button);
})();
