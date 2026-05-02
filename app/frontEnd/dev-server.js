const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

// Real HTTP download — returns { bytes, secs }
// In dev mode, redirects external speed test URLs to local endpoint to avoid rate limits
function realDownload(url, maxTimeSec) {
  return new Promise((resolve) => {
    // Redirect external speed test URLs to our own local endpoint
    const bytesMatch = url.match(/bytes=(\d+)/);
    const bytes = bytesMatch ? bytesMatch[1] : '25000000';
    const localUrl = `http://localhost:3000/api/speedtest?ckSize=${Math.ceil(parseInt(bytes) / 1048576)}`;
    
    const startTime = Date.now();
    let totalBytes = 0;
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve({ bytes: totalBytes, secs: (Date.now() - startTime) / 1000 }); } };
    const timeout = (maxTimeSec || 5) * 1000;
    const req = http.get(localUrl, { timeout }, (res) => {
      res.on('data', (chunk) => { totalBytes += chunk.length; });
      res.on('end', done);
      res.on('error', done);
    });
    req.on('error', done);
    req.on('timeout', () => { req.destroy(); });
    setTimeout(() => { req.destroy(); }, timeout);
  });
}

// Real HTTP upload — returns { bytes, secs }
// In dev mode, uploads to local endpoint to avoid rate limits
function realUpload(url, sizeBytes) {
  return new Promise((resolve) => {
    const uploadData = Buffer.alloc(sizeBytes, 0x41);
    const startTime = Date.now();
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve({ bytes: sizeBytes, secs: (Date.now() - startTime) / 1000 }); } };
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/speedtest_upload',
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': sizeBytes },
      timeout: 10000,
    };
    const req = http.request(options, (res) => {
      res.resume();
      res.on('end', done);
      res.on('error', done);
    });
    req.on('error', done);
    req.on('timeout', () => { req.destroy(); });
    req.write(uploadData);
    req.end();
  });
}

// Real ping using system ping command — returns avg ms
function realPing(host, count) {
  try {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? `ping -n ${count} ${host}` : `ping -c ${count} -W 3 ${host}`;
    const output = execSync(cmd, { timeout: 10000, encoding: 'utf8' });
    return output;
  } catch (e) {
    return e.stdout || `ping: ${host}: Name or service not known`;
  }
}

// Real connection timing — returns seconds
function realConnectTime(host) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.get(`http://${host}/`, { timeout: 3000 }, (res) => {
      res.resume();
      const secs = (Date.now() - startTime) / 1000;
      resolve(secs);
    });
    req.on('error', () => resolve((Date.now() - startTime) / 1000));
    req.on('timeout', () => { req.destroy(); resolve((Date.now() - startTime) / 1000); });
  });
}

const app = express();
const publicDir = path.join(__dirname, 'public');

// Mutable toggle state (updated by goform POST, read by goform GET)
const toggleState = {
  _advancedEnabled: false,
  ppp_status: 'ppp_connected',
  usb_port_switch: '1',
  performance_mode: '0',
  indicator_light_switch: '1',
  samba_switch: '0',
  roam_setting_option: 'off',
  dial_roam_setting_option: 'off',
  adb_wifi_enabled: false,
  BlackMacList: 'D8:E9:F0:A1:B2:C3;E2:F3:A4:B5:C6:D7;D1:E2:F3:A4:B5:C6;C1:D2:E3:F4:A5:B6',
  BlackNameList: 'Blocked-Laptop;Smart-TV;Xiaomi-14;OnePlus-12',
  AclMode: '1',
  hostname_overrides: {},
  apn_mode: 'manual',
  apn_Current_index: '1',
  apn_configs: {
    0: 'Default($)internet($)($)($)none($)($)($)IP($)($)($)',
    1: 'MyISP($)data.isp.com($)($)($)chap($)user1($)pass123($)IPv4v6($)($)($)',
    2: 'Custom($)custom.apn($)($)($)pap($)admin($)secret($)IPv6($)($)($)',
  },
  // CPU core online state (cpu0–cpu7)
  cpu_online: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 },
  // WiFi AP settings
  wifi_module_switch: '1',
  wifi_chip: 'chip1',
  wifi_ap: {
    AccessPointSwitchStatus: '1',
    AccessPointIndex: '0',
    ChipIndex: '0',
    SSID: 'UFI-F50-MOCK',
    Password: btoa('password123'),
    AuthMode: 'WPA2PSK',
    ApBroadcastDisabled: '0',
    ApMaxStationNumber: '10',
    ApIsolate: '0',
    QrImageUrl: '/mock_wifi_qr.svg'
  },
  // LAN settings
  lan_ipaddr: '192.168.0.1',
  lan_netmask: '255.255.255.0',
  dhcpEnabled: '1',
  dhcpStart: '192.168.0.100',
  dhcpEnd: '192.168.0.200',
  dhcpLease_hour: '24h',
  mtu: '1500',
  tcp_mss: '1460',
  // Advanced router settings
  nat_mode: '0',
  upnpEnabled: '1',
  DMZEnable: '0',
  DMZIPAddress: '192.168.0.100',
  RemoteManagement: '0',
  WANPingFilter: '1',
  // Port Forwarding
  portForwardRules: '192.168.0.10,8080,8080,TCP;192.168.0.20,3000,3100,UDP',
  portForwardRulesCount: '2',
  // FOTA
  UpgMode: '1',
  UpgIntervalDay: '7',
  UpgRoamPermission: '0',
  zte_update_enabled: '1',
  // Device options
  indicator_light_switch: '0',
  performance_mode: '1',
  // SMS messages (dynamic mock)
  smsMessages: (() => {
    const now = new Date();
    return [
      { id: '1', number: '+919876543210', content: Buffer.from('Hello! How are you doing today?').toString('base64'), date: `${now.getFullYear()},${now.getMonth()+1},${now.getDate()},${now.getHours()},${String(now.getMinutes()).padStart(2,'0')},00,0`, tag: '1' },
      { id: '2', number: '+919123456789', content: Buffer.from('Your OTP is 482917. Valid for 5 minutes.').toString('base64'), date: `${now.getFullYear()},${now.getMonth()+1},${now.getDate()},${now.getHours()-1},30,00,0`, tag: '1' },
      { id: '3', number: '+919876543210', content: Buffer.from('OK, I will call you later').toString('base64'), date: `${now.getFullYear()},${now.getMonth()+1},${now.getDate()},${now.getHours()-2},15,00,0`, tag: '2' },
      { id: '4', number: '+918765432109', content: Buffer.from('Meeting at 3pm tomorrow. Please confirm.').toString('base64'), date: `${now.getFullYear()},${now.getMonth()+1},${now.getDate()-1},14,00,00,0`, tag: '1' },
      { id: '5', number: '+919876543210', content: Buffer.from('Sure, see you there!').toString('base64'), date: `${now.getFullYear()},${now.getMonth()+1},${now.getDate()-1},14,05,00,0`, tag: '3' },
    ];
  })(),
  smsNextId: 6,
};

// Assemble index.html from template + partials
function assembleHTML() {
  const templatePath = path.join(publicDir, 'index.html.template');
  if (!fs.existsSync(templatePath)) {
    return fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  }
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace(/<!--#include\s+([\w\-\/\.]+)\s*-->/g, (match, filePath) => {
    const fullPath = path.join(publicDir, filePath);
    if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, 'utf8');
    return match;
  });
  return html;
}

// Mock /api/smbPath (Add/Remove Advanced Features)
app.use('/api/smbPath', (req, res) => {
  const enable = req.query.enable;
  setTimeout(() => {
    if (enable === '1') {
      toggleState._advancedEnabled = true;
      res.json({ result: 'Execution successful, please wait 1–2 minutes for it to take effect!' });
    } else {
      toggleState._advancedEnabled = false;
      res.json({ result: 'Advanced features removed. Reboot to apply.' });
    }
  }, 800); // Simulate delay
});

// Mock /api/root_shell (used by checkAdvancedFunc -> runShellWithRoot('whoami'))
app.use('/api/root_shell', (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { command } = JSON.parse(body);
        const cmd = (command || '').trim();
        if (!toggleState._advancedEnabled) {
          res.status(500).json({ error: 'Root shell not available' });
        } else if (cmd === 'whoami') {
          res.json({ result: 'root' });
        } else if (cmd === 'echo ok') {
          res.json({ output: 'ok', result: 'ok' });
        } else if (cmd.includes('cat') && cmd.includes('/sys/devices/system/cpu/cpu')) {
          // CPU core online status read
          const m = cmd.match(/cpu(\d+)\/online/);
          if (m) {
            const cpuId = parseInt(m[1]);
            const val = toggleState.cpu_online[cpuId] !== undefined ? toggleState.cpu_online[cpuId] : 1;
            res.json({ result: String(val) });
          } else {
            res.json({ result: '1' });
          }
        } else if (cmd.includes('> /sys/devices/system/cpu/cpu')) {
          // CPU core online write (echo 0/1 > /sys/devices/system/cpu/cpuN/online)
          const writes = cmd.split(/[;\n]/).map(s => s.trim()).filter(Boolean);
          for (const w of writes) {
            const m = w.match(/echo\s+(\d)\s*>\s*\/sys\/devices\/system\/cpu\/cpu(\d+)\/online/);
            if (m) {
              const val = parseInt(m[1]);
              const cpuId = parseInt(m[2]);
              // cpu0 cannot be offlined (boot CPU)
              if (cpuId === 0 && val === 0) continue;
              toggleState.cpu_online[cpuId] = val;
            }
          }
          res.json({ result: '' });
        } else if (cmd.includes('cat') && cmd.includes('quick_shell')) {
          res.json({ result: '#!/system/bin/sh\n# Example script from device\necho "Hello from quick_shell.sh"\nsync\n' });
        } else if (cmd.includes('ls ') && cmd.includes('/files/')) {
          // saveConfig: verify uploaded file exists
          res.json({ result: cmd.split('/files/')[1] || 'mock_uploaded_file.sh' });
        } else if (cmd.includes('mv ')) {
          // saveConfig: move file to target path
          res.json({ result: '' });
        } else if (cmd.startsWith('ping')) {
          // Real ping
          const host = cmd.match(/ping\s+.*?\s+(\S+)$/)?.[1] || '8.8.8.8';
          const count = cmd.includes('-c 1') ? 1 : 3;
          const output = realPing(host, count);
          res.json({ output });
        } else if (cmd.includes('curl') && cmd.includes('-w') && cmd.includes('size_download')) {
          // Real curl download speed test
          const urlMatch = cmd.match(/"(https?:\/\/[^"]+)"/);
          const maxTimeMatch = cmd.match(/--max-time\s+(\d+)/);
          const url = urlMatch ? urlMatch[1] : 'http://speed.cloudflare.com/__down?bytes=10000000';
          const maxTime = maxTimeMatch ? parseInt(maxTimeMatch[1]) : 5;
          realDownload(url, maxTime).then(r => {
            res.json({ output: `${r.bytes} ${r.secs.toFixed(6)}` });
          });
        } else if (cmd.includes('curl') && cmd.includes('-w') && cmd.includes('size_upload')) {
          // Real curl upload speed test
          const uploadSize = 2 * 1024 * 1024; // 2MB like the dd command creates
          realUpload('https://speed.cloudflare.com/__up', uploadSize).then(r => {
            res.json({ output: `${r.bytes} ${r.secs.toFixed(6)}` });
          });
        } else if (cmd.includes('DURATION=') && cmd.includes('speedtest_dl')) {
          // Real download test — download for the specified duration
          const urlMatch = cmd.match(/"(https?:\/\/[^"]+)"/);
          const durationMatch = cmd.match(/DURATION=(\d+)/);
          const url = urlMatch ? urlMatch[1] : 'http://speed.cloudflare.com/__down?bytes=25000000';
          const duration = durationMatch ? parseInt(durationMatch[1]) : 10;
          realDownload(url, duration).then(r => {
            res.json({ output: `${r.bytes} ${Math.round(r.secs * 1000)}` });
          });
        } else if (cmd.includes('DURATION=') && cmd.includes('speedtest_ul')) {
          // Real upload test
          const durationMatch = cmd.match(/DURATION=(\d+)/);
          const duration = durationMatch ? parseInt(durationMatch[1]) : 10;
          const uploadSize = 2 * 1024 * 1024;
          realUpload('https://speed.cloudflare.com/__up', uploadSize).then(r => {
            res.json({ output: `${r.bytes} ${Math.round(r.secs * 1000)}` });
          });
        } else if (cmd.includes('curl') && cmd.includes('speed_upload')) {
          // Real upload speed test (legacy format)
          const uploadSize = 1048576;
          realUpload('https://speed.cloudflare.com/__up', uploadSize).then(r => {
            const speed = r.secs > 0 ? Math.round(r.bytes / r.secs) : 0;
            res.json({ output: `${speed} ${r.bytes} ${r.secs.toFixed(3)}` });
          });
        } else if (cmd.includes('cat /proc/swaps')) {
          // Mock swap status
          if (toggleState._swapEnabled) {
            res.json({ result: 'Filename\t\t\tType\t\tSize\tUsed\tPriority\n/data/swapfile\t\t\tfile\t\t1572860\t0\t-2' });
          } else {
            res.json({ result: 'Filename\t\t\tType\t\tSize\tUsed\tPriority' });
          }
        } else if (cmd.includes('cat') && cmd.includes('swap_setup.log')) {
          // Mock log reading during install
          if (toggleState._swapInstalling) {
            toggleState._swapStep = (toggleState._swapStep || 0) + 1;
            var steps = [
              '=== Starting swap file setup ===',
              '[1/5] Creating 1536MB swap file...',
              '[2/5] Setting permissions...',
              '[3/5] Formatting as swap...',
              '[4/5] Enabling swap...',
              '[5/5] Current swap status:\nFilename Type Size Used Priority\n/data/swapfile file 1572860 0 -2\n=== Swap setup completed ==='
            ];
            var idx = Math.min(toggleState._swapStep, steps.length - 1);
            var log = steps.slice(0, idx + 1).join('\n');
            if (idx >= steps.length - 1) {
              toggleState._swapInstalling = false;
              toggleState._swapEnabled = true;
            }
            res.json({ result: log });
          } else {
            res.json({ result: '' });
          }
        } else if (cmd.includes('sh') && cmd.includes('hotbox_swap.sh')) {
          toggleState._swapInstalling = true;
          toggleState._swapStep = 0;
          res.json({ result: '' });
        } else if (cmd.includes('swapoff')) {
          toggleState._swapEnabled = false;
          res.json({ result: '' });
        } else if (cmd.includes('grep') && cmd.includes('swapon')) {
          res.json({ result: '' });
        } else if (cmd.includes('sed') && cmd.includes('swapon')) {
          res.json({ result: '' });
        } else if (cmd.includes('AdGuardHome --version')) {
          if (toggleState._aghInstalled) {
            res.json({ result: 'AdGuard Home, version v0.107.52' });
          } else {
            res.json({ result: '' });
          }
        } else if (cmd.includes('action.sh toggle') || cmd.includes('action.sh stop')) {
          var action = cmd.includes('stop') ? 'Stopped' : 'Started';
          res.json({ result: action + ' AdGuard Home' });
        } else if (cmd.includes('agh/boot.sh')) {
          res.json({ result: '' });
        } else if (cmd.includes('adg_customize.sh')) {
          toggleState._aghInstalled = true;
          res.json({ result: 'AdGuard Home installed successfully' });
        } else if (cmd.includes('agh/uninstall.sh')) {
          toggleState._aghInstalled = false;
          res.json({ result: 'AdGuard Home removed' });
        } else if (cmd.includes('AdGuardHome.yaml')) {
          res.json({ result: 'bind_host: 0.0.0.0\nbind_port: 3000\nusers:\n  - name: admin\n    password: $2y$10$mock' });
        } else if (cmd.includes('api.github.com') && cmd.includes('AdGuardHome')) {
          res.json({ result: JSON.stringify({ tag_name: 'v0.107.53', assets: [{ name: 'AdGuardHome_linux_arm64.tar.gz', browser_download_url: 'https://github.com/AdguardTeam/AdGuardHome/releases/download/v0.107.53/AdGuardHome_linux_arm64.tar.gz' }] }) });
        } else {
          res.json({ result: 'mock: ' + cmd });
        }
      } catch (e) {
        res.json({ result: toggleState._advancedEnabled ? 'root' : '' });
      }
    });
    return;
  }
  res.json({ result: '' });
});

// Mock /api/user_shell (runs as app UID, no root needed)
app.post('/api/user_shell', (req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const { command } = JSON.parse(body);
      const cmd = (command || '').trim();
      if (cmd.startsWith('ping')) {
        const host = cmd.match(/ping\s+.*?\s+(\S+)$/)?.[1] || '8.8.8.8';
        const count = cmd.includes('-c 1') ? 1 : 3;
        const output = realPing(host, count);
        res.json({ result: { done: true, content: output } });
      } else if (cmd.includes('DURATION=') && cmd.includes('speedtest_dl')) {
        const urlMatch = cmd.match(/"(https?:\/\/[^"]+)"/);
        const durationMatch = cmd.match(/DURATION=(\d+)/);
        const url = urlMatch ? urlMatch[1] : 'http://speed.cloudflare.com/__down?bytes=25000000';
        const duration = durationMatch ? parseInt(durationMatch[1]) : 10;
        realDownload(url, duration).then(r => {
          res.json({ result: { done: true, content: `${r.bytes} ${Math.round(r.secs * 1000)}` } });
        });
      } else if (cmd.includes('DURATION=') && cmd.includes('speedtest_ul')) {
        const uploadSize = 2 * 1024 * 1024;
        realUpload('https://speed.cloudflare.com/__up', uploadSize).then(r => {
          res.json({ result: { done: true, content: `${r.bytes} ${Math.round(r.secs * 1000)}` } });
        });
      } else if (cmd.includes('connect-timeout') && cmd.includes('time_total')) {
        // Real server detection — measure actual connection time to each host
        const hostMatches = cmd.match(/http:\/\/([\w.\-]+)\//g) || [];
        const hosts = hostMatches.map(h => h.replace('http://', '').replace('/', ''));
        Promise.all(hosts.map(host => realConnectTime(host).then(secs => `${host} ${secs.toFixed(6)}`))).then(lines => {
          res.json({ result: { done: true, content: lines.join('\n') } });
        });
      } else if (cmd.includes('dd ') && cmd.includes('speedtest_ul')) {
        // Upload file setup — just acknowledge (not needed for real test)
        res.json({ result: { done: true, content: 'ok' } });
      } else if (cmd.includes('rm -f') && cmd.includes('speedtest_ul')) {
        // Cleanup — just acknowledge
        res.json({ result: { done: true, content: '' } });
      } else if (cmd.includes('curl') && cmd.includes('-w') && cmd.includes('size_download')) {
        const urlMatch = cmd.match(/"(https?:\/\/[^"]+)"/);
        const maxTimeMatch = cmd.match(/--max-time\s+(\d+)/);
        const url = urlMatch ? urlMatch[1] : 'http://speed.cloudflare.com/__down?bytes=10000000';
        const maxTime = maxTimeMatch ? parseInt(maxTimeMatch[1]) : 5;
        console.log('[DL] url:', url, 'maxTime:', maxTime);
        realDownload(url, maxTime).then(r => {
          console.log('[DL] result:', r);
          res.json({ result: { done: true, content: `${r.bytes} ${r.secs.toFixed(6)}` } });
        });
      } else if (cmd.includes('curl') && cmd.includes('-w') && cmd.includes('size_upload')) {
        const uploadSize = 2 * 1024 * 1024;
        realUpload('https://speed.cloudflare.com/__up', uploadSize).then(r => {
          res.json({ result: { done: true, content: `${r.bytes} ${r.secs.toFixed(6)}` } });
        });
      } else {
        res.json({ result: { done: true, content: 'mock: ' + cmd } });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Mock /api/upload_img (file upload → returns mock filename)
app.post('/api/upload_img', (req, res) => {
  // Just return a fake filename; the saveConfig flow then calls root_shell to mv it
  res.json({ url: 'mock_uploaded_file.sh' });
});

// Mock /api/quick_shell (ADB UI automation)
app.get('/api/quick_shell', (req, res) => {
  setTimeout(() => {
    res.json({ result: 'quick_shell.sh executed successfully.\nOutput:\n+ setprop service.adb.tcp.port 5555\n+ stop adbd\n+ start adbd\nDone.' });
  }, 1500);
});

// Mock /api/adb_alive (ADB keep-alive check)
app.get('/api/adb_alive', (req, res) => {
  res.json({ result: 'true' });
});

// Mock /api/adb_wifi_setting for local development
app.use('/api/adb_wifi_setting', (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        toggleState.adb_wifi_enabled = data.enabled === true || data.enabled === 'true';
      } catch {}
      res.json({ result: 'success', enabled: toggleState.adb_wifi_enabled });
    });
    return;
  }
  res.json({ enabled: toggleState.adb_wifi_enabled, port: 5555 });
});

// Mock WiFi QR code image
app.get(['/mock_wifi_qr.svg', '/api/mock_wifi_qr.svg'], (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#fff" rx="12"/>
    <rect x="20" y="20" width="60" height="60" fill="#000" rx="4"/>
    <rect x="28" y="28" width="44" height="44" fill="#fff" rx="2"/>
    <rect x="36" y="36" width="28" height="28" fill="#000" rx="2"/>
    <rect x="120" y="20" width="60" height="60" fill="#000" rx="4"/>
    <rect x="128" y="28" width="44" height="44" fill="#fff" rx="2"/>
    <rect x="136" y="36" width="28" height="28" fill="#000" rx="2"/>
    <rect x="20" y="120" width="60" height="60" fill="#000" rx="4"/>
    <rect x="28" y="128" width="44" height="44" fill="#fff" rx="2"/>
    <rect x="36" y="136" width="28" height="28" fill="#000" rx="2"/>
    <rect x="90" y="90" width="20" height="20" fill="#000" rx="2"/>
    <rect x="120" y="120" width="12" height="12" fill="#000"/>
    <rect x="140" y="120" width="12" height="12" fill="#000"/>
    <rect x="160" y="120" width="12" height="12" fill="#000"/>
    <rect x="120" y="140" width="12" height="12" fill="#000"/>
    <rect x="160" y="140" width="12" height="12" fill="#000"/>
    <rect x="120" y="160" width="12" height="12" fill="#000"/>
    <rect x="140" y="160" width="12" height="12" fill="#000"/>
    <rect x="160" y="160" width="12" height="12" fill="#000"/>
    <rect x="90" y="20" width="12" height="12" fill="#000"/>
    <rect x="90" y="44" width="12" height="12" fill="#000"/>
    <rect x="90" y="68" width="12" height="12" fill="#000"/>
    <rect x="20" y="90" width="12" height="12" fill="#000"/>
    <rect x="44" y="90" width="12" height="12" fill="#000"/>
    <rect x="68" y="90" width="12" height="12" fill="#000"/>
  </svg>`;
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// Mock /api/connInfo for local development
app.use('/api/connInfo', (req, res) => {
  res.json({
    result: 'success',
    data: {
      tcp: '20', tcp_active: '3', tcp_other: '17',
      tcp6: '780', udp: '5', udp6: '15', unix: '423'
    }
  });
});

// Mock /api/version_info for local development
app.use('/api/version_info', (req, res) => {
  res.json({
    app_ver: '4.0.0',
    build_timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 16),
    model: 'F50',
    nickname: 'F50',
    wa_inner_version: 'MU300_ZYV1.0.0B13'
  });
});

// Mock /api/cellularUsage for local development (deterministic by date)
app.use('/api/cellularUsage', (req, res) => {
  function seededRandom(seed) {
    let h = seed | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 2800000000) + 200000000;
  }
  const startTime = Number(req.query.startTime) || (Date.now() - 6 * 86400000);
  const endTime = Number(req.query.endTime) || Date.now();
  const items = [];
  const startD = new Date(startTime); startD.setHours(0,0,0,0);
  const endD = new Date(endTime); endD.setHours(23,59,59,999);
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = d.getFullYear() + '-' + mm + '-' + dd;
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    items.push({ date: dateStr, usage: seededRandom(seed) });
  }
  res.json({ usage: items });
});

// Mock /api/usb_status for local development
app.use('/api/usb_status', (req, res) => {
  res.json({
    maxSpeed: 480000000,
    details: {
      typec_mode: 'gadget',
      gadget_speed: 'USB 2.0 (480Mbps)',
      devices: []
    }
  });
});

// Mock AT command (QoS RDP)
app.use('/api/AT', (req, res) => {
  const cmd = (req.query.command || '').toUpperCase().trim();
  if (cmd.includes('CGEQOSRDP')) {
    res.json({ result: '+CGEQOSRDP: 1,9,0,0,0,0,150000,50000 OK' });
  } else if (cmd.includes('CSQ')) {
    res.json({ result: '+CSQ: 21,99 OK' });
  } else if (cmd.includes('COPS?')) {
    res.json({ result: '+COPS: 0,0,"CHN-UNICOM",7 OK' });
  } else if (cmd.includes('CPIN?')) {
    res.json({ result: '+CPIN: READY OK' });
  } else if (cmd === 'ATI') {
    res.json({ result: 'Quectel EC25\nRevision: EC25EFAR06A06M4G OK' });
  } else if (cmd.includes('SERVINGCELL')) {
    res.json({ result: '+QENG: "servingcell","NOCONN","LTE","FDD",460,01,1A2B3C4,123,100,1,5,5,6E14,-95,-9,-67,16,44 OK' });
  } else if (cmd.includes('CGDCONT?')) {
    res.json({ result: '+CGDCONT: 1,"IP","cmnet","10.45.12.98",0,0,0,0\n+CGDCONT: 2,"IPV4V6","ims","",0,0,0,0 OK' });
  } else if (cmd.includes('QTEMP')) {
    res.json({ result: '+QTEMP: "mdm-modem0",38,"mdm-modem1",36,"soc_thermal",41 OK' });
  } else if (cmd.includes('SIM_SLOT') || cmd.includes('DUAL_SIM_SUPPORT')) {
    res.json({ sim_slot: '0', dual_sim_support: '0' });
  } else {
    res.json({ result: 'OK' });
  }
});

// SMS Forwarding mock endpoints
app.get('/api/sms_forward_enabled', (req, res) => {
  if (req.query.enable !== undefined) {
    toggleState.smsForwardEnabled = req.query.enable;
    console.log('[SMS Forward] Enabled:', req.query.enable);
    return res.json({ result: 'success' });
  }
  res.json({ enabled: toggleState.smsForwardEnabled || '0' });
});
app.get('/api/call_notify_enabled', (req, res) => {
  if (req.query.enable !== undefined) {
    toggleState.callNotifyEnabled = req.query.enable;
    console.log('[Call Notify] Enabled:', req.query.enable);
    return res.json({ result: 'success' });
  }
  res.json({ enabled: toggleState.callNotifyEnabled || '0' });
});
app.get('/api/sms_forward_format', (req, res) => {
  res.json(toggleState.smsForwardFormat || { sms_format: '[SMS] From: {{from}} | {{time}} | {{body}}', call_format: '📞 [CALL] From: {{from}} | {{time}}' });
});
app.post('/api/sms_forward_format', express.json(), (req, res) => {
  toggleState.smsForwardFormat = req.body;
  console.log('[Forward Format] Saved:', req.body);
  res.json({ result: 'success' });
});
app.get('/api/sms_forward_method', (req, res) => {
  res.json({ sms_forward_method: toggleState.smsForwardMethod || 'sms' });
});
app.get('/api/sms_forward_mail', (req, res) => {
  res.json(toggleState.smsForwardSmtp || { smtp_host: '', smtp_port: '', smtp_username: '', smtp_password: '', smtp_to: '', forward_dev_info: '0' });
});
app.post('/api/sms_forward_mail', express.json(), (req, res) => {
  toggleState.smsForwardSmtp = req.body;
  toggleState.smsForwardMethod = 'smtp';
  console.log('[SMS Forward] SMTP saved:', req.body);
  res.json({ result: 'success' });
});
app.get('/api/sms_forward_curl', (req, res) => {
  res.json(toggleState.smsForwardCurl || { curl_text: '' });
});
app.post('/api/sms_forward_curl', express.json(), (req, res) => {
  toggleState.smsForwardCurl = req.body;
  toggleState.smsForwardMethod = 'curl';
  console.log('[SMS Forward] CURL saved:', req.body);
  res.json({ result: 'success' });
});
app.get('/api/sms_forward_dingtalk', (req, res) => {
  res.json(toggleState.smsForwardDingtalk || { webhook_url: '', secret: '', forward_dev_info: '0' });
});
app.post('/api/sms_forward_dingtalk', express.json(), (req, res) => {
  toggleState.smsForwardDingtalk = req.body;
  toggleState.smsForwardMethod = 'dingtalk';
  console.log('[SMS Forward] DingTalk saved:', req.body);
  res.json({ result: 'success' });
});
app.get('/api/sms_forward_whatsapp', (req, res) => {
  res.json(toggleState.smsForwardWhatsapp || { wa_phone_id: '', wa_token: '', wa_to: '', forward_dev_info: '0' });
});
app.post('/api/sms_forward_whatsapp', express.json(), (req, res) => {
  toggleState.smsForwardWhatsapp = req.body;
  toggleState.smsForwardMethod = 'whatsapp';
  console.log('[SMS Forward] WhatsApp saved:', req.body);
  res.json({ result: 'success' });
});
app.get('/api/sms_forward_sms', (req, res) => {
  res.json(toggleState.smsForwardSms || { sms_forward_number: '', sms_forward_prefix: '[FWD from {{from}}]', forward_dev_info: '0' });
});
app.post('/api/sms_forward_sms', express.json(), (req, res) => {
  toggleState.smsForwardSms = req.body;
  toggleState.smsForwardMethod = 'sms';
  console.log('[SMS Forward] SMS saved:', req.body);
  res.json({ result: 'success' });
});

// Mock goform_get_cmd_process (main device poll)
app.use('/api/goform', (req, res) => {
  // Handle goform_set_cmd_process (login, logout, etc.)
  if (req.path === '/goform_set_cmd_process') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const goformId = params.get('goformId');
        if (goformId === 'LOGIN' || goformId === 'LOGIN_MULTI_USER') {
          res.set('hotbox-cookie', 'mock_session_cookie_12345; Path=/');
          res.set('Access-Control-Expose-Headers', 'hotbox-cookie');
          return res.json({ result: '0' });
        }
        // Handle toggle goformIds by updating mutable state
        if (goformId === 'CONNECT_NETWORK') toggleState.ppp_status = 'ppp_connected';
        if (goformId === 'DISCONNECT_NETWORK') toggleState.ppp_status = 'ppp_disconnected';
        if (goformId === 'USB_PORT_SETTING') toggleState.usb_port_switch = params.get('usb_port_switch') || toggleState.usb_port_switch;
        if (goformId === 'PERFORMANCE_MODE_SETTING') toggleState.performance_mode = params.get('performance_mode') || toggleState.performance_mode;
        if (goformId === 'INDICATOR_LIGHT_SETTING') toggleState.indicator_light_switch = params.get('indicator_light_switch') || toggleState.indicator_light_switch;
        if (goformId === 'SAMBA_SETTING') toggleState.samba_switch = params.get('samba_switch') || toggleState.samba_switch;
        if (goformId === 'SET_CONNECTION_MODE') {
          toggleState.roam_setting_option = params.get('roam_setting_option') || toggleState.roam_setting_option;
          toggleState.dial_roam_setting_option = params.get('dial_roam_setting_option') || toggleState.dial_roam_setting_option;
        }
        if (goformId === 'setDeviceAccessControlList') {
          toggleState.BlackMacList = params.get('BlackMacList') || '';
          toggleState.BlackNameList = params.get('BlackNameList') || '';
          toggleState.WhiteMacList = params.get('WhiteMacList') || '';
          toggleState.WhiteNameList = params.get('WhiteNameList') || '';
          toggleState.AclMode = params.get('AclMode') || '2';
        }
        if (goformId === 'EDIT_HOSTNAME') {
          var mac = params.get('mac');
          var hostname = params.get('hostname');
          if (mac && hostname) toggleState.hostname_overrides[mac] = hostname;
          console.log('EDIT_HOSTNAME:', mac, '->', hostname);
        }
        if (goformId === 'APN_PROC_EX') {
          var apnMode = params.get('apn_mode');
          if (apnMode) toggleState.apn_mode = apnMode;
          var action = params.get('apn_action');
          var idx = params.get('index') || '0';
          if (action === 'save') {
            var name = params.get('profile_name') || '';
            var apn = params.get('wan_apn') || '';
            var auth = params.get('ppp_auth_mode') || 'none';
            var user = params.get('ppp_username') || '';
            var pass = params.get('ppp_passwd') || '';
            var pdp = params.get('pdp_type') || 'IP';
            toggleState.apn_configs[idx] = name+'($)'+apn+'($)($)($)'+auth+'($)'+user+'($)'+pass+'($)'+pdp+'($)($)($)';
          } else if (action === 'set_default') {
            toggleState.apn_Current_index = idx;
          } else if (action === 'delete') {
            delete toggleState.apn_configs[idx];
          }
        }
        if (goformId === 'setAccessPointInfo') {
          var ap = toggleState.wifi_ap;
          if (params.get('SSID')) ap.SSID = params.get('SSID');
          if (params.get('AuthMode')) ap.AuthMode = params.get('AuthMode');
          if (params.get('Password')) ap.Password = params.get('Password');
          if (params.has('ApBroadcastDisabled')) ap.ApBroadcastDisabled = params.get('ApBroadcastDisabled');
          if (params.has('ApMaxStationNumber')) ap.ApMaxStationNumber = params.get('ApMaxStationNumber');
          if (params.has('ApIsolate')) ap.ApIsolate = params.get('ApIsolate');
          if (params.has('ChipIndex')) ap.ChipIndex = params.get('ChipIndex');
          if (params.has('AccessPointIndex')) ap.AccessPointIndex = params.get('AccessPointIndex');
        }
        if (goformId === 'switchWiFiModule') {
          toggleState.wifi_module_switch = params.get('SwitchOption') === '0' ? '0' : '1';
        }
        if (goformId === 'switchWiFiChip') {
          var chip = params.get('ChipEnum') || 'chip1';
          toggleState.wifi_chip = chip;
          toggleState.wifi_ap.ChipIndex = chip === 'chip2' ? '1' : '0';
          toggleState.wifi_module_switch = '1';
        }
        if (goformId === 'DHCP_SETTING') {
          if (params.get('lanIp')) toggleState.lan_ipaddr = params.get('lanIp');
          if (params.get('lanNetmask')) toggleState.lan_netmask = params.get('lanNetmask');
          toggleState.dhcpEnabled = params.get('lanDhcpType') === 'SERVER' ? '1' : '0';
          if (params.get('dhcpStart')) toggleState.dhcpStart = params.get('dhcpStart');
          if (params.get('dhcpEnd')) toggleState.dhcpEnd = params.get('dhcpEnd');
          if (params.get('dhcpLease')) toggleState.dhcpLease_hour = params.get('dhcpLease') + 'h';
        }
        if (goformId === 'SET_DEVICE_MTU') {
          if (params.get('mtu')) toggleState.mtu = params.get('mtu');
          if (params.get('tcp_mss')) toggleState.tcp_mss = params.get('tcp_mss');
        }
        if (goformId === 'NAT_SETTING') {
          if (params.get('nat_mode') !== null) toggleState.nat_mode = params.get('nat_mode');
        }
        if (goformId === 'UPNP_SETTING') {
          if (params.get('upnpEnabled') !== null) toggleState.upnpEnabled = params.get('upnpEnabled');
        }
        if (goformId === 'DMZ_SETTING') {
          if (params.get('DMZEnable') !== null) toggleState.DMZEnable = params.get('DMZEnable');
          if (params.get('DMZIPAddress')) toggleState.DMZIPAddress = params.get('DMZIPAddress');
        }
        if (goformId === 'FW_SYS') {
          if (params.get('RemoteManagement') !== null) toggleState.RemoteManagement = params.get('RemoteManagement');
          if (params.get('WANPingFilter') !== null) toggleState.WANPingFilter = params.get('WANPingFilter');
        }
        if (goformId === 'ADD_PORT_FORWARD_RULE') {
          var ip = params.get('portForwardIP') || '';
          var ps = params.get('portForwardPortStart') || '';
          var pe = params.get('portForwardPortEnd') || ps;
          var pr = params.get('portForwardProtocol') || 'TCP';
          var existing = toggleState.portForwardRules ? toggleState.portForwardRules.split(';').filter(Boolean) : [];
          existing.push(ip + ',' + ps + ',' + pe + ',' + pr);
          toggleState.portForwardRules = existing.join(';');
          toggleState.portForwardRulesCount = String(existing.length);
        }
        if (goformId === 'DEL_PORT_FORWARD_RULE') {
          var idx = parseInt(params.get('id') || '0');
          var rules = toggleState.portForwardRules ? toggleState.portForwardRules.split(';').filter(Boolean) : [];
          rules.splice(idx, 1);
          toggleState.portForwardRules = rules.join(';');
          toggleState.portForwardRulesCount = String(rules.length);
        }
        if (goformId === 'SetUpgAutoSetting') {
          if (params.get('UpgMode') !== null) toggleState.UpgMode = params.get('UpgMode');
          if (params.get('UpgIntervalDay')) toggleState.UpgIntervalDay = params.get('UpgIntervalDay');
          if (params.get('UpgRoamPermission') !== null) toggleState.UpgRoamPermission = params.get('UpgRoamPermission');
          if (params.get('zte_update_enabled') !== null) toggleState.zte_update_enabled = params.get('zte_update_enabled');
        }
        if (goformId === 'INDICATOR_LIGHT_SETTING') {
          if (params.get('indicator_light_switch') !== null) toggleState.indicator_light_switch = params.get('indicator_light_switch');
        }
        if (goformId === 'PERFORMANCE_MODE_SETTING') {
          if (params.get('performance_mode') !== null) toggleState.performance_mode = params.get('performance_mode');
        }
        // SMS: Send
        if (goformId === 'SEND_SMS') {
          const number = params.get('Number') || '';
          const body = params.get('MessageBody') || '';
          const now = new Date();
          const id = String(toggleState.smsNextId++);
          // Decode GSM-encoded (hex) content back to text for storage as base64
          let text = '';
          try {
            for (let i = 0; i < body.length; i += 4) {
              text += String.fromCharCode(parseInt(body.substr(i, 4), 16));
            }
          } catch(e) { text = body; }
          toggleState.smsMessages.push({
            id,
            number,
            content: Buffer.from(text).toString('base64'),
            date: `${now.getFullYear()},${now.getMonth()+1},${now.getDate()},${now.getHours()},${String(now.getMinutes()).padStart(2,'0')},00,0`,
            tag: '2' // sent
          });
          console.log(`[SMS] Sent to ${number}: "${text}"`);
          return res.json({ result: 'success' });
        }
        // SMS: Delete
        if (goformId === 'DELETE_SMS') {
          const msgId = params.get('msg_id') || '';
          const ids = msgId.split(';').filter(Boolean);
          toggleState.smsMessages = toggleState.smsMessages.filter(m => !ids.includes(m.id));
          console.log(`[SMS] Deleted id(s): ${msgId}`);
          return res.json({ result: 'success' });
        }
        // SMS: Mark read
        if (goformId === 'SET_MSG_READ') {
          const msgId = params.get('msg_id') || '';
          const ids = msgId.split(';').filter(Boolean);
          toggleState.smsMessages.forEach(m => {
            if (ids.includes(m.id) && m.tag === '1') m.tag = '0'; // mark as read
          });
          return res.json({ result: 'success' });
        }
        res.json({ result: '0' });
      });
      return;
    }
    return res.json({ result: '0' });
  }
  // Handle goform_get_cmd_process
  const cmd = req.query.cmd || '';
  // WiFi module & AP info
  if (cmd.includes('queryWiFiModuleSwitch') || cmd.includes('queryAccessPointInfo')) {
    return res.json({
      WiFiModuleSwitch: toggleState.wifi_module_switch,
      ResponseList: [toggleState.wifi_ap]
    });
  }
  // LD for login hash
  if (cmd === 'LD') {
    return res.json({ LD: 'mock_ld_value_12345' });
  }
  // APN settings
  if (cmd.includes('apn_mode') || cmd.includes('APN_config')) {
    var apnResp = {
      apn_mode: toggleState.apn_mode,
      apn_Current_index: toggleState.apn_Current_index,
      apn_num_preset: '2',
    };
    for (var i = 0; i < 20; i++) {
      apnResp['APN_config' + i] = toggleState.apn_configs[i] || '$';
    }
    return res.json(apnResp);
  }
  // RD for postData AD calculation
  if (cmd === 'RD') {
    return res.json({ RD: 'mock_rd_value_12345' });
  }
  // Password fail check
  if (cmd.includes('psw_fail_num_str')) {
    return res.json({ psw_fail_num_str: '0', login_lock_time: '0' });
  }
  // SMS list
  if (cmd.includes('sms_data_total')) {
    return res.json({ messages: toggleState.smsMessages, sms_data_total: String(toggleState.smsMessages.length) });
  }
  // lan_station_list: separate response
  if (cmd === 'lan_station_list') {
    return res.json({ lan_station_list: [] });
  }
  // queryDeviceAccessControlList alone (used by block/unblock)
  if (cmd.includes('queryDeviceAccessControlList') && !cmd.includes('station_list')) {
    return res.json({
      BlackMacList: toggleState.BlackMacList,
      BlackNameList: toggleState.BlackNameList,
      WhiteMacList: toggleState.WhiteMacList || '',
      WhiteNameList: toggleState.WhiteNameList || '',
      AclMode: toggleState.AclMode || '2'
    });
  }
  // Connected devices (station_list + lan_station_list + blacklist)
  if (cmd.includes('station_list') && cmd.includes('queryDeviceAccessControlList')) {
    // Filter out blocked devices from connected list
    var blockedMacs = (toggleState.BlackMacList || '').split(';').filter(Boolean);
    var allDevices = [
      { hostname: 'iPhone-15', ip_addr: '192.168.0.101', mac_addr: 'A4:B1:C2:D3:E4:F5' },
      { hostname: 'Galaxy-S24', ip_addr: '192.168.0.102', mac_addr: 'B6:C7:D8:E9:F0:A1' },
      { hostname: 'Blocked-Laptop', ip_addr: '192.168.0.103', mac_addr: 'D8:E9:F0:A1:B2:C3' },
      { hostname: 'MacBook-Air', ip_addr: '192.168.0.104', mac_addr: 'E1:F2:A3:B4:C5:D6' },
      { hostname: 'iPad-Pro', ip_addr: '192.168.0.105', mac_addr: 'F1:A2:B3:C4:D5:E6' },
      { hostname: 'Pixel-8', ip_addr: '192.168.0.106', mac_addr: 'A1:B2:C3:D4:E5:F6' },
      { hostname: 'Surface-Go', ip_addr: '192.168.0.107', mac_addr: 'B1:C2:D3:E4:F5:A6' },
      { hostname: 'OnePlus-12', ip_addr: '192.168.0.108', mac_addr: 'C1:D2:E3:F4:A5:B6' },
      { hostname: 'Xiaomi-14', ip_addr: '192.168.0.109', mac_addr: 'D1:E2:F3:A4:B5:C6' },
      { hostname: 'Smart-TV', ip_addr: '192.168.0.110', mac_addr: 'E2:F3:A4:B5:C6:D7' },
    ].map(function(d) { return { ...d, hostname: toggleState.hostname_overrides[d.mac_addr] || d.hostname }; });
    var lanDevices = [
      { hostname: 'Desktop-PC', ip_addr: '192.168.0.100', mac_addr: 'C2:D3:E4:F5:A6:B7' },
      { hostname: 'NAS-Server', ip_addr: '192.168.0.111', mac_addr: 'F2:A3:B4:C5:D6:E7' },
    ].map(function(d) { return { ...d, hostname: toggleState.hostname_overrides[d.mac_addr] || d.hostname }; });
    return res.json({
      station_list: allDevices.filter(function(d) { return blockedMacs.indexOf(d.mac_addr) === -1; }),
      lan_station_list: lanDevices.filter(function(d) { return blockedMacs.indexOf(d.mac_addr) === -1; }),
      BlackMacList: toggleState.BlackMacList,
      BlackNameList: toggleState.BlackNameList,
      WhiteMacList: toggleState.WhiteMacList || '',
      WhiteNameList: toggleState.WhiteNameList || '',
      AclMode: toggleState.AclMode || '2',
      user_ip_addr: '192.168.0.64'
    });
  }
  const jitter = (base, range) => (base + (Math.random() - 0.5) * range).toFixed(0);
  const rx = Math.floor(Math.random() * 50000);
  const tx = Math.floor(Math.random() * 15000);
  res.json({
    // Device identifiers
    imei: '357006520386919',
    imsi: '405852708137974',
    iccid: '89910274410014867802',
    msisdn: '+919514577859',
    sim_msisdn: '+919514577859',
    cr_version: 'MU300_ZYV1.0.0B13',
    wa_inner_version: 'MU300_ZYV1.0.0B13',
    // Network addressing
    wan_ipaddr: '100.82.45.193',
    ipv6_wan_ipaddr: '2402:3a80:183d:b503:74d2:d4ff:fe1c:343f',
    lan_ipaddr: toggleState.lan_ipaddr,
    lan_netmask: toggleState.lan_netmask,
    mac_address: '10:3c:59:c3:0b:12',
    dhcpEnabled: toggleState.dhcpEnabled,
    dhcpStart: toggleState.dhcpStart,
    dhcpEnd: toggleState.dhcpEnd,
    dhcpLease_hour: toggleState.dhcpLease_hour,
    mtu: toggleState.mtu,
    tcp_mss: toggleState.tcp_mss,
    client_ip: '192.168.0.135',
    // Advanced router settings
    nat_mode: toggleState.nat_mode,
    upnpEnabled: toggleState.upnpEnabled,
    DMZEnable: toggleState.DMZEnable,
    DMZIPAddress: toggleState.DMZIPAddress,
    RemoteManagement: toggleState.RemoteManagement,
    WANPingFilter: toggleState.WANPingFilter,
    // Port Forwarding
    portForwardRules: toggleState.portForwardRules,
    portForwardRulesCount: toggleState.portForwardRulesCount,
    // FOTA
    UpgMode: toggleState.UpgMode,
    UpgIntervalDay: toggleState.UpgIntervalDay,
    UpgRoamPermission: toggleState.UpgRoamPermission,
    zte_update_enabled: toggleState.zte_update_enabled,
    // Device options
    indicator_light_switch: toggleState.indicator_light_switch,
    performance_mode: toggleState.performance_mode,
    // Signal (LTE)
    lte_rsrp: jitter(-101, 10),
    Lte_snr: jitter(14, 8),
    lte_rsrq: jitter(-11, 4),
    lte_rssi: jitter(-72, 10),
    rssi: '5',
    // Cell info (LTE)
    Lte_bands: '40',
    Lte_fcn: '38950',
    Lte_bands_widths: '20',
    Lte_pci: '258',
    Lte_cell_id: '22A801',
    Lte_ca_status: 'on',
    network_type: 'LTE_CA',
    network_provider: 'Vi India',
    network_information: 'Vi India',
    network_signalbar: '5',
    network_rssi: jitter(-72, 10),
    ppp_status: toggleState.ppp_status,
    // Battery
    battery_value: '100',
    battery_vol_percent: '100',
    battery_charging: '1',
    // Data usage
    monthly_rx_bytes: String(2684354560 + Math.floor(Math.random() * 100000000)),
    monthly_tx_bytes: String(536870912 + Math.floor(Math.random() * 10000000)),
    monthly_time: '1296000',
    realtime_rx_thrpt: String(rx),
    realtime_tx_thrpt: String(tx),
    realtime_time: '3600',
    data_volume_limit_switch: '1',
    data_volume_limit_size: '50_1024',
    data_volume_alert_percent: '90',
    wan_auto_clear_flow_data_switch: '1',
    traffic_clear_date: '1',
    // WiFi
    wifi_access_sta_num: '1',
    sleep_sysIdleTimeToSleep: '30',
    // USB
    usb_port_switch: toggleState.usb_port_switch,
    // Toggle states
    performance_mode: toggleState.performance_mode,
    indicator_light_switch: toggleState.indicator_light_switch,
    samba_switch: toggleState.samba_switch,
    roam_setting_option: toggleState.roam_setting_option,
    dial_roam_setting_option: toggleState.dial_roam_setting_option,
    // SMS
    sms_received_flag: '0',
    sms_unread_num: '0',
    sms_sim_unread_num: '0',
    // SIM
    sim_slot: '0',
    dual_sim_support: '0',
    loginfo: 'ok'
  });
});

// Mock baseDeviceInfo (CPU, memory, temp, storage, battery details)
app.use('/api/baseDeviceInfo', (req, res) => {
  const jitter = (base, range) => (base + (Math.random() - 0.5) * range).toFixed(0);
  const cpuBase = [8, 10, 9, 10, 5, 5, 5, 9];
  const cpuUsageInfo = { cpu: (5 + Math.random() * 15).toFixed(1) };
  cpuBase.forEach((b, i) => {
    cpuUsageInfo['cpu' + i] = (b + Math.random() * 12).toFixed(1);
  });
  const cpuFreqInfo = {};
  cpuBase.forEach((_, i) => {
    cpuFreqInfo['cpu' + i] = { cur: [614, 936, 1404, 1560][Math.floor(Math.random() * 4)] };
  });
  const tempZones = [
    'AI0', 'AI1', 'APCPU0', 'APCPU1', 'BIG7', 'BIG7MID4', 'BOARD', 'CHG',
    'GPU', 'LIT0', 'LIT1', 'LIT2', 'LIT3', 'LTE', 'MID4', 'MID5',
    'MID5MID6', 'MID6', 'MM', 'NR', 'NR0', 'NR1', 'PA', 'SOC'
  ];
  const cpu_temp_list = tempZones.map(name => ({
    type: name,
    temp: (50000 + Math.random() * 4000).toFixed(0)
  }));
  const memAvail = Math.floor(1505536 * (0.3 + Math.random() * 0.05));
  const memUsed = 1505536 - memAvail;
  const swapFree = Math.floor(1048576 * 0.85);
  const swapUsed = 1048576 - swapFree;
  res.json({
    cpu_usage: (5 + Math.random() * 15).toFixed(1),
    cpu_temp: jitter(52000, 3000),
    mem_usage: (64 + Math.random() * 5).toFixed(1),
    memInfo: {
      mem_total_kb: 1505536,
      mem_available_kb: memAvail,
      mem_used_kb: memUsed,
      mem_usage_percent: (memUsed / 1505536 * 100).toFixed(1),
      swap_total_kb: 1048576,
      swap_free_kb: swapFree,
      swap_used_kb: swapUsed,
      swap_usage_percent: (swapUsed / 1048576 * 100).toFixed(1)
    },
    cpuUsageInfo,
    cpuFreqInfo,
    cpu_temp_list,
    battery: '100',
    current_now: jitter(2000, 5000),
    voltage_now: '3850000',
    daily_data: String(Math.floor(Math.random() * 200000000)),
    internal_total_storage: '9793069056',
    internal_used_storage: '1567691264',
    internal_available_storage: '8225377792',
    external_total_storage: '0',
    external_used_storage: '0',
    external_available_storage: '0',
    model: 'F50'
  });
});

// Mock need_token
app.use('/api/need_token', (req, res) => {
  res.json({ result: 'success', need_token: true });
});

// Mock update_admin_pwd
app.post('/api/update_admin_pwd', express.json(), (req, res) => {
  res.json({ result: 'success' });
});

// Mock scheduled tasks
if (!toggleState.scheduledTasks) toggleState.scheduledTasks = [];

app.get('/api/list_tasks', (req, res) => {
  res.json({ tasks: toggleState.scheduledTasks });
});

app.post('/api/add_task', express.json(), (req, res) => {
  const { id, time, repeatDaily, action } = req.body;
  if (!id || !time) return res.status(400).json({ error: 'Missing id or time' });
  toggleState.scheduledTasks.push({
    key: Date.now(),
    id,
    time,
    repeatDaily: repeatDaily !== false,
    actionMap: action || {},
    lastRunTimestamp: null,
    hasTriggered: false
  });
  console.log('[Task] Added:', id, time);
  res.json({ result: 'success' });
});

app.post('/api/remove_task', express.json(), (req, res) => {
  const { id } = req.body;
  toggleState.scheduledTasks = toggleState.scheduledTasks.filter(t => t.id !== id);
  console.log('[Task] Removed:', id);
  res.json({ result: 'removed' });
});

app.post('/api/clear_task', express.json(), (req, res) => {
  toggleState.scheduledTasks = [];
  console.log('[Task] Cleared all');
  res.json({ result: 'success' });
});

// Mock plugin endpoints
if (!toggleState.pluginCode) toggleState.pluginCode = '';

app.get('/api/get_custom_head', (req, res) => {
  res.json({ text: toggleState.pluginCode });
});

app.post('/api/set_custom_head', express.json(), (req, res) => {
  toggleState.pluginCode = req.body.text || '';
  console.log('[Plugin] Saved, length:', toggleState.pluginCode.length);
  res.json({ result: 'success' });
});

app.get('/api/plugins_store', (req, res) => {
  res.json({
    download_url: 'https://example.com/plugins',
    res: {
      code: 200,
      data: {
        content: [
          { name: 'signal-logger.js', size: 2048, modified: '2025-12-01T10:00:00Z' },
          { name: 'band-lock.js', size: 1536, modified: '2025-11-15T08:30:00Z' },
          { name: 'auto-reconnect.js', size: 3072, modified: '2025-10-20T14:00:00Z' },
          { name: 'sms-notify.js', size: 1024, modified: '2025-09-05T09:00:00Z' },
          { name: 'wifi-scheduler.js', size: 4096, modified: '2025-08-12T11:00:00Z' },
          { name: 'data-usage-monitor.js', size: 2560, modified: '2025-07-22T16:30:00Z' },
          { name: 'battery-saver.js', size: 1280, modified: '2025-06-18T09:45:00Z' },
          { name: 'dns-override.js', size: 1792, modified: '2025-05-10T13:00:00Z' },
          { name: 'vpn-auto-connect.js', size: 3584, modified: '2025-04-25T07:20:00Z' },
          { name: 'network-watchdog.js', size: 2816, modified: '2025-03-30T18:00:00Z' },
          { name: 'speed-limiter.js', size: 1920, modified: '2025-02-14T12:00:00Z' },
          { name: 'connection-stats.js', size: 2304, modified: '2025-01-08T10:30:00Z' },
          { name: 'reboot-scheduler.js', size: 1408, modified: '2024-12-20T15:00:00Z' },
          { name: 'ttl-modifier.js', size: 896, modified: '2024-11-05T08:00:00Z' },
          { name: 'imei-toolkit.js', size: 5120, modified: '2024-10-15T14:30:00Z' }
        ]
      }
    }
  });
});

// Speed test mock endpoint - generates random data for download
app.get('/api/speedtest', (req, res) => {
  const ckSize = parseInt(req.query.ckSize) || 16;
  if (ckSize === 0) {
    // Ping request
    return res.json({ ok: true });
  }
  const bytes = ckSize * 1024 * 1024;
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Length', bytes.toString());
  // Throttle to simulate ~40 Mbps (5 MB/s) — ensures each 2s round takes full duration
  const targetBytesPerSec = 5 * 1024 * 1024;
  const chunkSize = 64 * 1024;
  let sent = 0;
  const startTime = Date.now();
  function sendChunk() {
    while (sent < bytes) {
      const elapsed = (Date.now() - startTime) / 1000;
      const expectedBytes = targetBytesPerSec * elapsed;
      if (sent >= expectedBytes) {
        setTimeout(sendChunk, 10);
        return;
      }
      const size = Math.min(chunkSize, bytes - sent);
      const buf = Buffer.alloc(size, 0x42);
      const ok = res.write(buf);
      sent += size;
      if (!ok) {
        res.once('drain', sendChunk);
        return;
      }
    }
    res.end();
  }
  sendChunk();
});

// Speed test upload endpoint — throttled to simulate ~20 Mbps upload
app.post('/api/speedtest_upload', (req, res) => {
  let size = 0;
  const startTime = Date.now();
  const targetBytesPerSec = 2.5 * 1024 * 1024; // ~20 Mbps
  req.on('data', (chunk) => { size += chunk.length; });
  req.on('end', () => {
    // Simulate upload delay based on data received
    const expectedTime = (size / targetBytesPerSec) * 1000;
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, expectedTime - elapsed);
    setTimeout(() => {
      res.json({ result: 'success', bytes_received: size });
    }, delay);
  });
});

app.use('/api', createProxyMiddleware({
  target: 'http://192.168.0.1:2333/api',
  changeOrigin: false,
}));

// Serve assembled index.html (re-assembled on every request for live editing)
app.get('/', (req, res) => {
  res.type('html').send(assembleHTML());
});

app.get('/index.html', (req, res) => {
  res.type('html').send(assembleHTML());
});

app.use('/', express.static(publicDir));

app.listen(3000, () => {
  console.log('Dev server running at http://localhost:3000');
});