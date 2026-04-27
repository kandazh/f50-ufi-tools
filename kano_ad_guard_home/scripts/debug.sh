cat > /data/agh/agh/scripts/debug.sh << 'ENDOFFILE'
#!/system/bin/sh
MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
LOG="$AGH_DIR/debug.log"

{
  echo "==== AdGuardHome Debug Log - $(date) ===="
  echo

  echo "== System Information =="
  uname -a
  echo "Android Version: $(getprop ro.build.version.release)"
  echo "Device Model: $(getprop ro.product.model)"
  echo "Device Brand: $(getprop ro.product.brand)"
  echo "Architecture: $(uname -m)"
  echo "Kernel: $(uname -r)"
  echo

  echo "== AdGuardHome Version =="
  if [ -f "$AGH_DIR/bin/AdGuardHome" ]; then
    "$AGH_DIR/bin/AdGuardHome" --version
  else
    echo "AdGuardHome binary not found"
  fi
  echo

  echo "== Root Method =="
  if [ -d "/data/adb/magisk" ]; then
    echo "Magisk"
  elif [ -d "/data/adb/ksu" ]; then
    echo "KernelSU"
  elif [ -d "/data/adb/ap" ]; then
    echo "APatch"
  else
    echo "Unknown"
  fi
  echo

  echo "== BusyBox Version =="
  [ -d "/data/adb/magisk" ] && export PATH="/data/adb/magisk:$PATH"
  [ -d "/data/adb/ksu/bin" ] && export PATH="/data/adb/ksu/bin:$PATH"
  [ -d "/data/adb/ap/bin" ] && export PATH="/data/adb/ap/bin:$PATH"
  if command -v busybox >/dev/null 2>&1; then
    busybox --version
  else
    echo "BusyBox not found"
  fi
  echo

  echo "== AGH Directory Listing =="
  ls -lR "$AGH_DIR"
  echo

  echo "== AGH Bin Log (last 30 lines) =="
  tail -n 30 "$AGH_DIR/bin.log" 2>/dev/null
  echo

  echo "== AGH Settings =="
  cat "$AGH_DIR/settings.conf" 2>/dev/null
  echo

  echo "== AGH PID File =="
  cat "$AGH_DIR/bin/agh.pid" 2>/dev/null
  echo

  echo "== Running Processes (AdGuardHome) =="
  ps -A | grep AdGuardHome
  echo

  echo "== iptables -t nat -L -n -v =="
  iptables -t nat -L -n -v
  echo

  echo "== iptables -t filter INPUT -L -n -v =="
  iptables -t filter -L INPUT -n -v
  echo

  echo "== ip6tables -t filter -L -n -v =="
  ip6tables -t filter -L -n -v
  echo

  echo "== ip6tables -t filter INPUT -L -n -v =="
  ip6tables -t filter -L INPUT -n -v
  echo

  echo "== ip6tables -t nat -L -n -v =="
  ip6tables -t nat -L -n -v 2>&1
  echo

  echo "== Listening Ports (AGH) =="
  netstat -tlnup 2>/dev/null | grep -E "8858|3000" || ss -tlnp 2>/dev/null | grep -E "8858|3000" || echo "netstat/ss not available"
  echo

  echo "== IPv4 Routes =="
  ip route
  echo

  echo "== IPv6 Routes =="
  ip -6 route
  echo

  echo "== Network Interfaces =="
  ip addr
  echo

  echo "== Memory Usage =="
  free -h 2>/dev/null || cat /proc/meminfo | head -5
  echo

  echo "== Disk Usage =="
  df -h "$MODPATH" 2>/dev/null
  echo

  echo "== DNS Resolution Test =="
  nslookup google.com 2>/dev/null || echo "nslookup not available"
  echo

} >"$LOG" 2>&1

echo "Debug information collected in: $LOG"
echo "Please share this file when reporting issues"
ENDOFFILE
chmod +x /data/agh/agh/scripts/debug.sh
