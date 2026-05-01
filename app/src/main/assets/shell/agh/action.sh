MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"

start() {
  $AGH_DIR/scripts/tool.sh start
  echo "ADGuard started successfully"
}

stop() {
  $AGH_DIR/scripts/tool.sh stop
  echo "ADGuard stopped successfully"
}

toggle() {
  $AGH_DIR/scripts/tool.sh toggle
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
