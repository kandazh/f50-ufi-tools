MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"

start() {
  $AGH_DIR/scripts/tool.sh start   # Start ADGuard
  echo "ADGuard started successfully"
}

stop() {
  $AGH_DIR/scripts/tool.sh stop    # Stop ADGuard
  echo "ADGuard stopped successfully"
}

toggle() {
  $AGH_DIR/scripts/tool.sh toggle  # Start or stop ADGuard
  echo "ADGuard restarted successfully"
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