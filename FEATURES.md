# ZTE F50 Hotbox - Complete Feature List

## 📊 Dashboard & Monitoring

### Real-time Metrics
- **CPU Monitoring**: Real-time CPU usage percentage with core-by-core breakdown
- **Memory Monitoring**: RAM usage, available memory, cached memory visualization
- **Thermal Monitoring**: Multi-zone temperature sensors (CPU, GPU, modem, PA, etc.)
- **Network Speed**: Real-time download/upload speed graphs
- **Core Utilization Charts**: Visual representation of CPU core usage patterns
- **System Load**: Current system load indicator

### Device Information
- Device model and board name
- Android OS version
- CPU architecture and core count
- Carrier information
- SIM card details (IMEI, ICCID, IMSI)
- Signal strength (RSRP, RSRQ, SINR)

---

## 🌐 Network Management

### LAN Configuration
- DHCP settings management
- MTU/TCP MSS tuning (1300-1500 / 1260-1460 bytes)
- Gateway IP configuration
- Subnet mask management

### WiFi Control
- WiFi settings and configuration
- WiFi hotspot management
- WiFi security settings
- SSID configuration for 2.4GHz and 5GHz bands
- WiFi coverage settings

### Cellular Network
- **Network Mode Selection**: Force 5G/4G/3G preference
- **SIM Selection**: Switch between dual SIMs
- **Roaming Control**: Enable/disable international roaming
- **High-Speed Rail Mode**: Special mode for trains
- **Band Locking**: Lock to specific 5G and 4G bands
- **Cell Tower Locking**: Force connection to specific towers
- **APN Configuration**: Manage multiple APN profiles
- **Signal Strength Monitoring**: Real-time signal metrics

### Firewall & Security
- Firewall rules management
- IP/Port filtering (IPv4 and IPv6)
- Port mapping and forwarding
- DMZ settings
- MAC filtering
- Access control lists

---

## 🎮 Device Control

### CPU Management
- **CPU Core Control**: Enable/disable individual CPU cores
- **Performance Scaling**: Adjust CPU frequency scaling
- **Thermal Control**: Thermal throttling settings
- **Power Mode Selection**: Performance vs. power-saving profiles

### Battery Management
- Wake lock control (prevent sleep mode)
- Battery health monitoring
- Power consumption analytics
- Sleep/awake state tracking

### System Control
- Device reboot (immediate)
- Graceful shutdown
- Scheduled reboot at specified times
- Low current mode for power saving
- Device LED control

### Speed Testing
- Download speed test
- Upload speed test
- Latency measurement
- Speed test history tracking

---

## 🔧 Advanced Tools & Access

### ADB (Android Debug Bridge)
- **USB Debugging**: Toggle USB debugging on/off
- **Network ADB**: Enable remote ADB over TCP (port 5555)
- ADB connection status monitoring
- Quick ADB connection from UI

### Root Access
- Root shell access via Samba socket hook
- Root command execution capability
- Secure authenticated root shell

### Terminal Access
- **TTYD Web Terminal**: Full web-based terminal emulator
- Command execution interface
- Shell history

### Shell Utilities
- **Quick Shell**: Automated ADB command sequences
- **Process Manager**: Monitor and kill running processes
- **AT Commands**: Send AT commands directly to modem
- System property getter/setter

### Device Diagnostics
- Health checks with customizable targets
- Device connectivity verification
- Comprehensive diagnostics suite

---

## 🚀 Network Optimization

### System Tweaks
- Network buffer tuning
- TCP property management
- IP stack optimization
- Connection timeout settings

### Performance Profiles
- **Default Profile**: Standard balanced settings
- **Performance Profile**: Optimized for maximum speed
- **Conservative Profile**: Power-saving configuration
- Boot persistence for all tweaks (survive reboot)

### Network Diagnostics
- Packet loss detection
- Latency jitter monitoring
- DNS resolution time per upstream
- Path MTU discovery
- TCP connection state tracking
- 3G/4G/5G codec detection

---

## 💬 SMS & Communications

### SMS Forwarding
- Forward incoming SMS to:
  - Email address
  - Webhook endpoint
  - Dingtalk notification
  - Another phone number
- Selective SMS forwarding based on sender

### Power & Status Notifications
- Notification on device power on
- Notification on device power off
- Call incoming alerts
- SMS blacklist (ignore from specific numbers)

### Message Management
- Custom message formatting
- SMS read/unread status
- SMS history

---

## 🔐 VPN & Proxy

### WireGuard VPN
- Full VPN management interface
- Connect/disconnect control
- VPN configuration upload
- VPN status monitoring
- Traffic statistics

### Reverse Proxy
- Transparent proxy to factory backend API
- Automatic request routing
- Authentication pass-through

### Generic Proxy
- User-configurable proxy settings
- HTTP/HTTPS proxy support
- SOCKS proxy support (if available)

---

## 💾 System Management

### Over-The-Air Updates
- APK download capability
- APK upload from device
- Automatic APK installation
- Update progress monitoring
- Update history

### Configuration Management
- Admin password change
- Device access control
- Settings backup/restore
- Configuration profiles

### Task Scheduling
- **Scheduled Reboot**: Set automatic reboot times
- **Scheduled Tasks**: General purpose task scheduling
- **Repeat Options**: One-time, daily, weekly, monthly tasks
- Task history and logs

### Virtual Memory
- Swap space configuration
- Virtual memory tuning
- Memory optimization

---

## 📡 Advanced Features

### AdGuard Home Integration
- DNS-level ad blocking
- Ad filter management
- Safe browsing protection
- Parental controls
- Query logging
- Statistics tracking

### Custom Plugins
- Plugin system for extensibility
- Third-party module support
- Custom functionality integration

### File Sharing
- **Samba/SMB Support**: Network file sharing
- File access permissions
- Shared folder management
- File transfer via network

### Theming
- Custom image uploads
- Theme management interface
- UI customization

### Data Management
- **Data Usage Tracking**: Per-app cellular data usage
- **Data Alerts**: Threshold-based notifications
- **Data Limits**: Per-app or total data limits
- Monthly usage reset scheduler
- Cost estimator

---

## 📋 Data & Monitoring Features

### Connection Status
- Connected device list
- WiFi client information
- LTE/5G connection status
- Signal quality indicators

### Traffic Analysis
- Real-time bandwidth monitoring
- Per-connection speed metrics
- Network traffic logging
- Data type classification

### Performance Analytics
- CPU frequency scaling analysis
- Temperature trend tracking
- Memory pressure monitoring
- Power consumption patterns

---

## 🔐 Security & Authentication

### Authentication
- HMAC-SHA256 token-based security
- Session management
- Secure API endpoints
- Admin password protection

### Access Control
- Device access restrictions
- API rate limiting
- User permission management
- Activity logging

---

## 📱 User Interface

### Web Interface
- Responsive HTML5/CSS3 design
- Real-time data updates
- Embedded asset loading
- Dark/Light theme support

### Mobile Support
- Mobile-optimized layout
- Touch-friendly controls
- Responsive design

### Main Tabs
- **Dashboard**: Overview and key metrics
- **Network**: Network configuration and status
- **Controls**: Device control options
- **Settings**: Configuration and advanced options

---

## 🏗️ Technical Architecture

### Backend
- Kotlin + Ktor web server (port 2333)
- Android 13 compatible
- Root-level system access
- Multi-threaded request handling

### Frontend
- Vanilla JavaScript (no heavy frameworks)
- Express.js dev server (port 3000)
- Static asset serving
- Real-time WebSocket updates (if implemented)

### API
- 60+ REST endpoints
- JSON request/response format
- Comprehensive error handling
- Authentication on protected endpoints

### Build System
- Gradle 8.7.2
- npm for frontend
- Automated build and install scripts

---

## ✨ Special Capabilities

### Root-Level Features
- System property modification (`setprop`)
- Process management (kill, priority)
- Network stack manipulation
- Firmware flashing
- Deep system diagnostics

### Network Features
- Raw socket operations
- Packet injection
- Traffic shaping
- Route management

### Modem Features
- Direct modem communication via AT commands
- Band selection and locking
- Signal quality diagnostics
- Modem state querying

---

## 📈 Future-Ready Features

The app is designed for extension with:
- Pluggable architecture
- Modular Kotlin design
- RESTful API for integration
- Configuration persistence
- Scheduled task framework
- Event notification system

---

**Last Updated**: May 21, 2026  
**App Version**: Hotbox F50  
**Device**: ZTE F50 (MU300)  
**OS**: Android 13
