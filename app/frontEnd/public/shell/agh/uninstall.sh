MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
$AGH_DIR/scripts/tool.sh stop
echo "ADGuard stopped successfully"
sleep 1
[ -d "$MODPATH" ] && rm -rf "$MODPATH"
echo "ADGuard uninstalled successfully"
