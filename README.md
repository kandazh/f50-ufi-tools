# ZTE F50 Hotbox

A modernized fork of [UFI-TOOLS](https://github.com/kanoqwq/UFI-TOOLS) — custom web-based management interface for the ZTE F50 (MU300) MiFi hotspot running Android 13.

Replaces the stock web UI with a feature-rich dashboard accessible at `192.168.0.1:2333`.

## Quick Start

```powershell
# Build and install to connected device via ADB
.\build-and-install.ps1
```

### Development

```powershell
cd app/frontEnd
pnpm install
node dev-server.js    # http://localhost:3000
```

### Requirements

- Android SDK (API 33)
- JDK 17+
- Node.js 18+
- ADB with device connected
- Device must be rooted

## Architecture

| Layer | Tech | Details |
|-------|------|---------|
| Backend | Kotlin + Ktor | Web server on port 2333, root-level system access |
| Frontend | Vanilla JS/CSS | No framework, SSI-style includes, built with `build.js` |
| Build | Gradle 8.7.2 | `build-and-install.ps1` handles full pipeline |
| Dev | Express.js | Dev server on port 3000 with mock API |

## Project Structure

```
app/
├── frontEnd/          # Frontend source
│   ├── public/        # HTML, CSS, JS assets
│   ├── build.js       # Production build (assemble + obfuscate)
│   └── dev-server.js  # Dev server with mock API
└── src/main/          # Kotlin backend (Ktor server)
gradle/                # Gradle wrapper & version catalog
platform-tools/        # Bundled ADB
```

---

## Features

**Status**: ✅ Production-ready | **89+ verified features**  
**Last Updated**: May 2026

### 📊 Dashboard & Monitoring

- ✅ Real-time CPU usage with core-by-core breakdown
- ✅ Memory monitoring (total, available, used)
- ✅ Multi-zone thermal sensor monitoring
- ✅ Network speed graphs
- ✅ Battery status display
- ✅ Storage information
- ✅ Connected device count

---

## 🌐 Network Management

### LAN Configuration
- ✅ DHCP settings management
- ✅ MTU/TCP MSS tuning
- ✅ Gateway IP & subnet mask configuration

### WiFi Control
- ✅ WiFi settings configuration
- ✅ WiFi hotspot management
- ✅ WiFi security settings

### Cellular Network
- ✅ Network mode selection (5G/4G/3G)
- ✅ Dual SIM selection
- ✅ Band locking (5G and 4G)
- ✅ Cell tower locking
- ✅ APN configuration
- ✅ Signal strength monitoring (RSRP, RSRQ, SINR)

### Connection Management
- ✅ Connected devices list
- ✅ LTE/5G connection status
- ✅ Signal quality indicators
- ✅ Data management/tracking

### Firewall & Security
- ✅ IP/Port filtering (IPv4 & IPv6)
- ✅ MAC address filtering
- ✅ Access control management

---

## 🔌 ADB & Root Access

### USB Debugging
- ✅ Toggle USB debugging on/off
- ✅ USB debug status monitoring

### Network ADB (TCP Port 5555)
- ✅ Enable/disable network ADB
- ✅ Auto-start on device startup
- ✅ WiFi-based remote access
- ✅ Admin password management

---

## 🔧 Advanced Tools

### AT Commands
- ✅ Send AT commands directly to modem
- ✅ Modem diagnostics
- ✅ Custom AT sequence execution

### Diagnostic Tools
- ✅ Ping/Ping6 (IPv4 and IPv6)
- ✅ Traceroute/Traceroute6
- ✅ DNS lookup (nslookup)
- ✅ HTTP diagnostics (curl)
- ✅ Customizable diagnostic parameters

### Terminal Access
- ✅ TTYD web-based terminal
- ✅ Full shell command execution
- ✅ Command history

### Process Management
- ✅ View running processes
- ✅ Kill processes
- ✅ Process stats (memory, CPU)

### Speed Testing
- ✅ Download speed test
- ✅ Upload speed test
- ✅ Cellular speed test
- ✅ Progress tracking

### Quick Shell
- ✅ Automated ADB command sequences
- ✅ Pre-configured shell shortcuts

---

## 💬 SMS & Communications

### SMS Forwarding (Multiple Methods)
- ✅ Forward to Email (SMTP)
- ✅ Forward via Webhook/curl
- ✅ Forward via DingTalk
- ✅ Forward to another phone number
- ✅ Custom message formatting
- ✅ SMS blacklist management

### Notifications
- ✅ Power on/off notifications
- ✅ Incoming call alerts

---

## 🔐 VPN & Proxy

### WireGuard VPN
- ✅ Generate WireGuard keypairs
- ✅ Save/load VPN configurations
- ✅ Connect to VPN
- ✅ Disconnect from VPN
- ✅ Delete VPN configurations
- ✅ VPN status monitoring

### Generic Proxy
- ✅ HTTP/HTTPS proxy forwarding
- ✅ Host validation

---

## 📋 Task Scheduling

- ✅ Add scheduled tasks
- ✅ Remove scheduled tasks
- ✅ List all scheduled tasks
- ✅ Get task details
- ✅ Custom time and repeat options
- ✅ Clear all tasks
- ✅ Schedule device reboot (separate module)

---

## 📡 DNS & Ad-Blocking

### AdGuard Home Integration
- ✅ Actively running with watchdog monitoring
- ✅ DNS-level ad blocking
- ✅ Safe browsing protection
- ✅ Parental controls
- ✅ Query logging
- ✅ Statistics tracking
- ✅ Listens on port 3000 & 8858
- ✅ Auto-restart on crash

---

## 📦 System Management

### Over-The-Air Updates
- ✅ APK download
- ✅ APK upload
- ✅ APK installation
- ✅ Download progress monitoring
- ✅ Update checking

### Configuration Management
- ✅ Admin password management
- ✅ Device access control
- ✅ Token management
- ✅ Disable FOTA (firmware updates)
- ✅ Wakelock control (prevent sleep)
- ✅ Logging control

### Theme Customization
- ✅ Custom image uploads
- ✅ Theme management
- ✅ UI customization

### Virtual Memory
- ✅ Swap space configuration

---

## 🧩 Plugins System

- ✅ Plugin upload and storage
- ✅ Plugin listing
- ✅ Plugin deletion
- ✅ Custom head/CSS injection
- ✅ Plugin store interface

---

## 📱 User Interface

### Main Dashboard Tab
- ✅ CPU, Memory, Temperature graphs
- ✅ Network speed visualization
- ✅ Battery status
- ✅ Device info overview

### Network Tab
- ✅ LAN configuration
- ✅ WiFi management
- ✅ APN settings
- ✅ Connected devices
- ✅ Firewall rules
- ✅ Band locking
- ✅ Cell tower locking
- ✅ Data management

### Controls Tab (Settings)
- ✅ Root Access (USB debug, Network ADB)
- ✅ AdGuard Home configuration
- ✅ TTYD Terminal
- ✅ Process Manager
- ✅ Quick Shell
- ✅ Speed Test (WiFi + Cellular)
- ✅ AT Commands
- ✅ Virtual Memory
- ✅ Plugins manager
- ✅ Diagnostics
- ✅ WireGuard VPN
- ✅ SMS forwarding & notifications
- ✅ Password management
- ✅ Task scheduling
- ✅ Schedule reboot
- ✅ APK installation
- ✅ Advanced settings
- ✅ Clean all (memory cleaner)

---

## 🔐 Security & Authentication

- ✅ HMAC-SHA256 token-based security
- ✅ Session management
- ✅ Admin password protection
- ✅ Secure API endpoints
- ✅ Input validation
