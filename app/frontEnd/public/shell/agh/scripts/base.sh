[ -d "/data/adb/magisk" ] && export PATH="/data/adb/magisk:$PATH"
[ -d "/data/adb/ksu/bin" ] && export PATH="/data/adb/ksu/bin:$PATH"
[ -d "/data/adb/ap/bin" ] && export PATH="/data/adb/ap/bin:$PATH"
[ -d "$BIN_DIR" ] && export PATH="$BIN_DIR:$PATH"
MODPATH="/data/agh"
# most users prefer English, so set default language to English
language="en"

# try to get the system language
locale=$(getprop persist.sys.locale || getprop ro.product.locale || getprop persist.sys.language)

# keep language as English for broader compatibility
if echo "$locale" | grep -qi "en"; then
  language="en"
fi

function log() {
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  local str="$timestamp $1"
  echo "$str"
  echo "$str" >> "$MODPATH/history.log"
  # Rotate log if it exceeds 10000 lines to prevent unbounded growth
  if [ -f "$MODPATH/history.log" ]; then
    line_count=$(wc -l < "$MODPATH/history.log" 2>/dev/null || echo 0)
    if [ "$line_count" -gt 10000 ]; then
      tail -n 5000 "$MODPATH/history.log" > "$MODPATH/history.log.tmp" 2>/dev/null && \
        mv "$MODPATH/history.log.tmp" "$MODPATH/history.log" 2>/dev/null || true
    fi
  fi
}
