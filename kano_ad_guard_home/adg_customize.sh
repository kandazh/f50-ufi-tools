SKIPUNZIP=1

# most users prefer English, so set default language to English
language="en"

# try to get the system language
locale=$(getprop persist.sys.locale || getprop ro.product.locale || getprop persist.sys.language)

# keep language as English for broader compatibility
if echo "$locale" | grep -qi "en"; then
  language="en"  # Still use English even for regional languages
fi

MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
BIN_DIR="$AGH_DIR/bin"
SCRIPT_DIR="$AGH_DIR/scripts"
PID_FILE="$AGH_DIR/bin/agh.pid"
ZIPFILE="/data/kano_ad_guard_home.zip"

echo $ZIPFILE , $MODPATH, $AGH_DIR, $BIN_DIR, $SCRIPT_DIR, $PID_FILE

function ui_print() {
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  msg="$timestamp $1"
  echo "$msg" >> "$MODPATH/history.log"
  echo "$msg"
}

function abort() {
  ui_print "$1"
  exit 1
}

function info() {
  ui_print "$1"
}

function error() {
  abort "$1"
}

info "- 🚀 Installing AdGuardHome"

rm -rf "$MODPATH"
mkdir -p "$MODPATH" "$AGH_DIR" "$BIN_DIR" "$SCRIPT_DIR"
info "- 📦 Extracting module basic files..."
unzip -o "$ZIPFILE" "action.sh" -d "$MODPATH" >/dev/null 2>&1 
unzip -o "$ZIPFILE" "boot.sh" -d "$MODPATH" >/dev/null 2>&1
unzip -o "$ZIPFILE" "uninstall.sh" -d "$MODPATH" >/dev/null 2>&1
unzip -o "$ZIPFILE" "webroot/*" -d "$MODPATH" >/dev/null 2>&1

extract_all() {

  info "- 🌟 Extracting script files..."
  unzip -o "$ZIPFILE" "scripts/*" -d "$AGH_DIR" >/dev/null 2>&1 || {
    error "- ❌ Failed to extract scripts from $ZIPFILE"
  }

  info "- 🛠️ Extracting binary files..."
  unzip -o "$ZIPFILE" "bin/*" -d "$AGH_DIR" >/dev/null 2>&1 || {
    error "- ❌ Failed to extract binary files from $ZIPFILE"
  }

  info "- 📜 Extracting configuration files..."
  unzip -o "$ZIPFILE" "settings.conf" -d "$AGH_DIR" >/dev/null 2>&1 || {
    error "- ❌ Failed to extract settings.conf from $ZIPFILE"
  }
   
  # Debug: List what was extracted
  info "- 🔍 Checking extracted files..."
  ls -la "$AGH_DIR/" 2>/dev/null || true
  ls -la "$BIN_DIR/" 2>/dev/null || true
  ls -la "$SCRIPT_DIR/" 2>/dev/null || true
}

info "- 📦 First time installation, extracting files..."
extract_all

info "- 🔐 Setting permissions..."

if [ ! -f "$BIN_DIR/AdGuardHome" ]; then
  error "- ❌ AdGuardHome binary not found at $BIN_DIR/AdGuardHome"
fi

chmod +x "$BIN_DIR/AdGuardHome" || error "- ❌ Failed to set execute permission on AdGuardHome binary"
chown root:net_raw "$BIN_DIR/AdGuardHome" || error "- ❌ Failed to set ownership on AdGuardHome binary"
chmod +x "$SCRIPT_DIR"/*.sh "$MODPATH"/*.sh || error "- ❌ Failed to set execute permissions on scripts"

info "- ✅ Installation completed, please reboot."
