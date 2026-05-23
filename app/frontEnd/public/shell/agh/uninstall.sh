MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
$AGH_DIR/scripts/tool.sh stop
echo "ADGuard stopped successfully"
# Wait for tool.sh to complete (graceful shutdown + iptables disable takes ~5s)
sleep 8
# Remove boot hook to prevent orphaned startup attempts at next reboot
sed -i '/agh.*boot.sh/d' /sdcard/hotbox/hotbox_boot.sh 2>/dev/null || true
[ -d "$MODPATH" ] && rm -rf "$MODPATH"
echo "ADGuard uninstalled successfully"
