MODPATH="/data/agh"

. $MODPATH/agh/settings.conf
. $MODPATH/agh/scripts/base.sh

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
  "$BIN_DIR/AdGuardHome" --no-check-update >>"$AGH_DIR/bin.log" 2>&1 &
  adg_pid=$!

  # wait briefly for AdGuardHome to initialize
  sleep 2

  # check if AdGuardHome started successfully
  if kill -0 "$adg_pid" 2>/dev/null; then
    echo "$adg_pid" >"$PID_FILE"
    # check if iptables is enabled
    if [ "$enable_iptables" = true ]; then
      $SCRIPT_DIR/iptables.sh enable
      log "started PID: $adg_pid iptables: enabled"
    else
      log "started PID: $adg_pid iptables: disabled"
    fi
  else
    log "Error occurred, check logs for details"
    sh $MODPATH/agh/scripts/debug.sh
    exit 1
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
