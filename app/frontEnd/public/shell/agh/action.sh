MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"

start() {
  if $AGH_DIR/scripts/tool.sh start; then
    echo "ADGuard started successfully"
    return 0
  else
    echo "ERROR: ADGuard failed to start"
    return 1
  fi
}

stop() {
  if $AGH_DIR/scripts/tool.sh stop; then
    echo "ADGuard stopped successfully"
    return 0
  else
    echo "ERROR: ADGuard failed to stop properly"
    return 1
  fi
}

toggle() {
  if $AGH_DIR/scripts/tool.sh toggle; then
    echo "ADGuard restarted successfully"
    return 0
  else
    echo "ERROR: ADGuard failed to restart"
    return 1
  fi
}

case "$1" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  toggle)
    toggle
    ;;
  *)
    echo "Usage: $0 {start|stop|toggle}"
    exit 1
    ;;
esac
