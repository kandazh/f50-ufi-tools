MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"

# F50 is always-on hotspot device - network should be ready quickly
# But do a quick sanity check (max 10 seconds)
MAX_WAIT=10
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if ip route show 2>/dev/null | grep -q "default"; then
    echo "Network ready after ${WAITED}s - $(date)" >> "$MODPATH/boot.log"
    break
  fi
  sleep 1
  WAITED=$((WAITED + 1))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "WARNING: No default route after ${MAX_WAIT}s, starting anyway - $(date)" >> "$MODPATH/boot.log"
fi

# Check if AdGuardHome directory exists
if [ ! -d "$AGH_DIR" ]; then
    echo "ERROR: AdGuardHome directory not found - $(date)" >> "$MODPATH/boot.log"
    exit 1
fi

# Check if AdGuardHome binary exists
if [ ! -f "$AGH_DIR/bin/AdGuardHome" ]; then
    echo "ERROR: AdGuardHome binary not found - $(date)" >> "$MODPATH/boot.log"
    exit 1
fi

# Start AdGuardHome
echo "Starting AdGuardHome - $(date)" >> "$MODPATH/boot.log"
$AGH_DIR/scripts/tool.sh start >> "$MODPATH/boot.log" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "SUCCESS: AdGuardHome started - $(date)" >> "$MODPATH/boot.log"
else
    echo "ERROR: AdGuardHome start failed with exit code $EXIT_CODE - $(date)" >> "$MODPATH/boot.log"
    # Log binary stderr for debugging
    if [ -f "$AGH_DIR/bin.log" ]; then
        echo "--- Last 20 lines from AdGuardHome binary log ---" >> "$MODPATH/boot.log"
        tail -20 "$AGH_DIR/bin.log" >> "$MODPATH/boot.log" 2>&1
    fi
fi
