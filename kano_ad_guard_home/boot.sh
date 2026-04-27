cat > /data/agh/boot.sh << 'ENDOFFILE'
MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"

# Wait for network to be ready (JIO takes time to connect)
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  # Check if any WAN interface has a global address (IPv4 or IPv6)
  # IPv4: match full x.x.x.x format; IPv6: match any global scope address
  if ip addr 2>/dev/null | grep -qE "inet6.*scope global|inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+.*scope global"; then
    echo "Network ready after ${WAITED}s - $(date)" >> "$MODPATH/boot.log"
    break
  fi
  sleep 5
  WAITED=$((WAITED + 5))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "WARNING: Network not ready after ${MAX_WAIT}s, starting anyway - $(date)" >> "$MODPATH/boot.log"
fi

# Check if AdGuardHome directory exists
if [ ! -d "$AGH_DIR" ]; then
    echo "AdGuardHome not installed properly - $(date)" >> "$MODPATH/boot.log"
    exit 1
fi

# Check if AdGuardHome binary exists
if [ ! -f "$AGH_DIR/bin/AdGuardHome" ]; then
    echo "AdGuardHome binary not found - $(date)" >> "$MODPATH/boot.log"
    exit 1
fi

# Start AdGuardHome
echo "Starting AdGuardHome at boot - $(date)" >> "$MODPATH/boot.log"
$AGH_DIR/scripts/tool.sh start >> "$MODPATH/boot.log" 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: AdGuardHome failed to start - $(date)" >> "$MODPATH/boot.log"
fi
ENDOFFILE
chmod +x /data/agh/boot.sh