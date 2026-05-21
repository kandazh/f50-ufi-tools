MODPATH="/data/agh"

# Validate config files exist before sourcing
if [ ! -f "$MODPATH/agh/settings.conf" ]; then
  echo "ERROR: settings.conf not found at $MODPATH/agh/settings.conf" >&2
  exit 1
fi

if [ ! -f "$MODPATH/agh/scripts/base.sh" ]; then
  echo "ERROR: base.sh not found at $MODPATH/agh/scripts/base.sh" >&2
  exit 1
fi

. $MODPATH/agh/settings.conf || { echo "ERROR: failed to source settings.conf" >&2; exit 1; }
. $MODPATH/agh/scripts/base.sh || { echo "ERROR: failed to source base.sh" >&2; exit 1; }

# Validate critical variables were set
if [ -z "$BIN_DIR" ] || [ -z "$AGH_DIR" ] || [ -z "$PID_FILE" ]; then
  echo "ERROR: critical variables not set after sourcing config" >&2
  exit 1
fi

start_adguardhome() {
  # check if AdGuardHome is already running
  if [ -f "$PID_FILE" ]; then
    adg_pid=$(cat "$PID_FILE")
    # Validate PID is numeric to avoid stale/corrupt PID files
    if echo "$adg_pid" | grep -qE '^[0-9]+$' && kill -0 "$adg_pid" 2>/dev/null; then
      # Verify it's actually AdGuardHome, not a recycled PID
      if grep -q "AdGuardHome" "/proc/$adg_pid/cmdline" 2>/dev/null; then
        log "AdGuardHome is already running (PID: $adg_pid)"
        exit 0
      else
        log "Stale PID $adg_pid (different process), removing PID file"
        rm -f "$PID_FILE"
      fi
    else
      log "Stale PID file found, removing"
      rm -f "$PID_FILE"
    fi
  fi

  # Ensure default routes exist (ZTE firmware may drop them)
  if ! ip route show default 2>/dev/null | grep -q "default"; then
    local wan_iface
    wan_iface=$(ip link show 2>/dev/null | awk -F: '/sipa_eth[0-9]+.*UP/{gsub(/ /,"",$2); print $2; exit}')
    local clat_iface
    clat_iface=$(ip link show 2>/dev/null | awk -F: '/v4-sipa_eth[0-9]+.*UP/{gsub(/ /,"",$2); print $2; exit}')
    if [ -n "$clat_iface" ]; then
      ip route add default dev "$clat_iface" 2>/dev/null
      log "Restored IPv4 default route via $clat_iface"
    fi
    if [ -n "$wan_iface" ]; then
      ip -6 route add default dev "$wan_iface" 2>/dev/null
      log "Restored IPv6 default route via $wan_iface"
    fi
  elif ! ip -6 route show default 2>/dev/null | grep -q "default"; then
    local wan_iface
    wan_iface=$(ip link show 2>/dev/null | awk -F: '/sipa_eth[0-9]+.*UP/{gsub(/ /,"",$2); print $2; exit}')
    if [ -n "$wan_iface" ]; then
      ip -6 route add default dev "$wan_iface" 2>/dev/null
      log "Restored IPv6 default route via $wan_iface"
    fi
  fi

  # Check if binary exists
  if [ ! -f "$BIN_DIR/AdGuardHome" ]; then
    log "AdGuardHome binary not found at $BIN_DIR/AdGuardHome"
    exit 1
  fi

  # to fix https://github.com/AdguardTeam/AdGuardHome/issues/7002
  export SSL_CERT_DIR="/system/etc/security/cacerts/"
  # set timezone
  export TZ="$timezone"
  # run binary
  "$BIN_DIR/AdGuardHome" -w "$BIN_DIR" -c "$BIN_DIR/AdGuardHome.yaml" --no-check-update >>"$AGH_DIR/bin.log" 2>&1 &
  adg_pid=$!

  # wait briefly for AdGuardHome to initialize (increase from 2 to 4 seconds for stability)
  sleep 4

  # check if AdGuardHome started successfully
  if ! kill -0 "$adg_pid" 2>/dev/null; then
    log "ERROR: AdGuardHome process died immediately after start"
    log "Binary output:"
    tail -20 "$AGH_DIR/bin.log" >> "$MODPATH/history.log" 2>&1
    exit 1
  fi

  # Process is alive - write PID file
  echo "$adg_pid" >"$PID_FILE"
  log "AdGuardHome process started (PID: $adg_pid)"
  
  # check if iptables is enabled
  if [ "$enable_iptables" = true ]; then
    if $SCRIPT_DIR/iptables.sh enable; then
      log "started PID: $adg_pid iptables: enabled"
      exit 0
    else
      log "ERROR: Failed to enable iptables, stopping AdGuardHome"
      
      # Remove PID file BEFORE killing process to avoid watchdog race
      rm -f "$PID_FILE"
      
      # Disable iptables if it's partial
      $SCRIPT_DIR/iptables.sh disable >/dev/null 2>&1
      
      # Kill the process gracefully first
      kill "$adg_pid" 2>/dev/null
      
      # Wait for graceful shutdown
      i=0
      while [ $i -lt 5 ] && kill -0 "$adg_pid" 2>/dev/null; do
        sleep 1
        i=$((i + 1))
      done
      
      # Force kill if still running
      if kill -0 "$adg_pid" 2>/dev/null; then
        log "Force killing AdGuardHome"
        kill -9 "$adg_pid" 2>/dev/null
      fi
      
      exit 1
    fi
  else
    log "started PID: $adg_pid iptables: disabled"
    exit 0
  fi
}

stop_adguardhome() {
  if [ -f "$PID_FILE" ]; then
    adg_pid=$(cat "$PID_FILE")
    log "Stopping AdGuardHome PID: $adg_pid"
    kill "$adg_pid" 2>/dev/null
    # Give AGH up to 5 seconds to shut down gracefully
    i=0
    while [ $i -lt 5 ] && kill -0 "$adg_pid" 2>/dev/null; do
      sleep 1
      i=$((i + 1))
    done
    # Force kill if still running
    if kill -0 "$adg_pid" 2>/dev/null; then
      log "AGH did not stop gracefully, force killing"
      kill -9 "$adg_pid" 2>/dev/null
    fi
    rm -f "$PID_FILE"
  else
    log "Force killing AdGuardHome"
    pkill -f "AdGuardHome" || pkill -9 -f "AdGuardHome"
  fi
  log "AdGuardHome stopped"
  $SCRIPT_DIR/iptables.sh disable
  log "Iptables disabled"
}

toggle_adguardhome() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    stop_adguardhome
  else
    start_adguardhome
  fi
}

case "$1" in
start)
  start_adguardhome
  ;;
stop)
  stop_adguardhome
  ;;
toggle)
  toggle_adguardhome
  ;;
*)
  echo "Usage: $0 {start|stop|toggle}"
  exit 1
  ;;
esac
