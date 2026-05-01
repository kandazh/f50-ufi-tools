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
}
