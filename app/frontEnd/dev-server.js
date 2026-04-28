const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

const app = express();
const publicDir = path.join(__dirname, 'public');

// Mutable toggle state (updated by goform POST, read by goform GET)
const toggleState = {
  ppp_status: 'ppp_connected',
  usb_port_switch: '1',
  performance_mode: '0',
  indicator_light_switch: '1',
  samba_switch: '0',
  roam_setting_option: 'off',
  dial_roam_setting_option: 'off',
  adb_wifi_enabled: false,
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
  const cmd = req.query.command || '';
  if (cmd.includes('CGEQOSRDP')) {
    // +CGEQOSRDP: cid,qci,dl_gbr,ul_gbr,dl_mbr,ul_mbr,dl_max,ul_max
    res.json({ result: '+CGEQOSRDP: 1,9,0,0,0,0,150000,50000 OK' });
  } else if (cmd.includes('sim_slot') || cmd.includes('dual_sim_support')) {
    res.json({ sim_slot: '0', dual_sim_support: '0' });
  } else {
    res.json({ result: 'OK' });
  }
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
          res.set('kano-cookie', 'mock_session_cookie_12345; Path=/');
          res.set('Access-Control-Expose-Headers', 'kano-cookie');
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
        res.json({ result: '0' });
      });
      return;
    }
    return res.json({ result: '0' });
  }
  // Handle goform_get_cmd_process
  const cmd = req.query.cmd || '';
  // LD for login hash
  if (cmd === 'LD') {
    return res.json({ LD: 'mock_ld_value_12345' });
  }
  // RD for postData AD calculation
  if (cmd === 'RD') {
    return res.json({ RD: 'mock_rd_value_12345' });
  }
  // Password fail check
  if (cmd.includes('psw_fail_num_str')) {
    return res.json({ psw_fail_num_str: '0', login_lock_time: '0' });
  }
  // lan_station_list: separate response
  if (cmd === 'lan_station_list') {
    return res.json({ lan_station_list: [] });
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
    lan_ipaddr: '192.168.0.1',
    mac_address: '10:3c:59:c3:0b:12',
    client_ip: '192.168.0.135',
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
    // WiFi
    wifi_access_sta_num: '1',
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