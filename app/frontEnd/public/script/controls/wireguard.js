/**
 * WireGuard VPN Panel — manage WireGuard tunnels
 * Uses /api/wireguard endpoints (requires root)
 */
(function () {
  var loaded = false;
  var refreshTimer = null;

  document.addEventListener('ctrl-panel-show', function (e) {
    if (e.detail.tab === 'wireguard') initWg();
  });

  function logEl() { return document.getElementById('WG_LOG'); }
  function wgLog(msg, append) {
    var el = logEl();
    if (!el) return;
    if (append) { el.innerHTML += msg + '<br>'; } else { el.innerHTML = msg; }
    el.scrollTop = el.scrollHeight;
  }

  function initWg() {
    if (loaded) { refreshStatus(); return; }
    loaded = true;
    bindEvents();
    refreshStatus();
  }

  function bindEvents() {
    var genBtn = document.getElementById('WG_GENKEY_BTN');
    var saveBtn = document.getElementById('WG_SAVE_BTN');
    var connectBtn = document.getElementById('WG_CONNECT_BTN');
    var disconnectBtn = document.getElementById('WG_DISCONNECT_BTN');

    if (genBtn) genBtn.addEventListener('click', generateKey);
    if (saveBtn) saveBtn.addEventListener('click', saveTunnel);
    if (connectBtn) connectBtn.addEventListener('click', function () { connectTunnel(null); });
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectTunnel);
  }

  async function refreshStatus() {
    try {
      var res = await fetchWithTimeout(HOTBOX_baseURL + '/wireguard', { method: 'GET', headers: common_headers }, 10000);
      var data = await res.json();
      if (data.error) { wgLog('<span style="color:#f87171">' + data.error + '</span>'); return; }

      var badge = document.getElementById('WG_STATUS_BADGE');
      var activeInfo = document.getElementById('WG_ACTIVE_INFO');
      var activeName = document.getElementById('WG_ACTIVE_NAME');
      var transferInfo = document.getElementById('WG_TRANSFER_INFO');
      var transferEl = document.getElementById('WG_TRANSFER');
      var connectBtn = document.getElementById('WG_CONNECT_BTN');
      var disconnectBtn = document.getElementById('WG_DISCONNECT_BTN');

      if (data.active) {
        badge.textContent = 'Connected';
        badge.style.background = 'rgba(74,222,128,0.15)';
        badge.style.color = '#4ade80';
        activeInfo.style.display = '';
        activeName.textContent = data.active_config || 'unknown';
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = '';

        if (data.transfer) {
          transferInfo.style.display = '';
          transferEl.textContent = formatTransfer(data.transfer);
        }

        // Auto-refresh while connected
        if (!refreshTimer) refreshTimer = setInterval(refreshStatus, 10000);
      } else {
        badge.textContent = 'Disconnected';
        badge.style.background = 'rgba(248,113,113,0.15)';
        badge.style.color = '#fca5a5';
        activeInfo.style.display = 'none';
        transferInfo.style.display = 'none';
        connectBtn.style.display = data.configs && data.configs.length > 0 ? '' : 'none';
        disconnectBtn.style.display = 'none';

        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
      }

      // Render tunnel list
      renderTunnelList(data.configs || [], data.active_config, data.active);
    } catch (e) {
      wgLog('<span style="color:#f87171">Failed to load status: ' + (e.message || e) + '</span>');
    }
  }

  function formatTransfer(raw) {
    // raw format: "<pubkey>\t<rx>\t<tx>\n"
    var parts = raw.split('\t');
    if (parts.length >= 3) {
      return '↓ ' + humanBytes(parseInt(parts[1])) + '  ↑ ' + humanBytes(parseInt(parts[2]));
    }
    return raw;
  }

  function humanBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function renderTunnelList(configs, activeConfig, isActive) {
    var container = document.getElementById('WG_TUNNEL_LIST');
    if (!container) return;
    if (!configs.length) {
      container.innerHTML = '<span style="color:#64748b;font-size:12px">No saved tunnels. Add one below.</span>';
      return;
    }

    container.innerHTML = '';
    configs.forEach(function (name) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px';

      var label = document.createElement('span');
      label.style.cssText = 'flex:1;font-size:13px;color:#e2e8f0';
      label.textContent = name;
      if (isActive && name === activeConfig) {
        label.innerHTML += ' <span style="color:#4ade80;font-size:11px">● active</span>';
      }
      row.appendChild(label);

      if (!isActive || name !== activeConfig) {
        var connBtn = document.createElement('button');
        connBtn.className = 'ctrl-submit-btn';
        connBtn.style.cssText = 'padding:4px 10px;font-size:11px';
        connBtn.textContent = 'Connect';
        connBtn.addEventListener('click', function () { connectTunnel(name); });
        row.appendChild(connBtn);
      }

      var delBtn = document.createElement('button');
      delBtn.className = 'ctrl-submit-btn';
      delBtn.style.cssText = 'padding:4px 10px;font-size:11px;background:rgba(248,113,113,0.1);border-color:rgba(248,113,113,0.3);color:#fca5a5';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', function () { deleteTunnel(name); });
      row.appendChild(delBtn);

      container.appendChild(row);
    });
  }

  async function generateKey() {
    wgLog('Generating keypair...');
    try {
      var res = await fetchWithTimeout(HOTBOX_baseURL + '/wireguard/genkey', { method: 'POST', headers: common_headers }, 10000);
      var data = await res.json();
      if (data.error) { wgLog('<span style="color:#f87171">' + data.error + '</span>'); return; }

      document.getElementById('WG_NEW_PRIVKEY').value = data.private_key;
      document.getElementById('WG_NEW_PUBKEY').textContent = data.public_key;
      document.getElementById('WG_PUBKEY_DISPLAY').style.display = '';
      wgLog('<span style="color:#4ade80">Keypair generated. Share the public key with your VPN server.</span>');
    } catch (e) {
      wgLog('<span style="color:#f87171">Key generation failed: ' + (e.message || e) + '</span>');
    }
  }

  async function saveTunnel() {
    var name = document.getElementById('WG_NEW_NAME').value.trim();
    var privkey = document.getElementById('WG_NEW_PRIVKEY').value.trim();
    var addr = document.getElementById('WG_NEW_ADDR').value.trim();
    var dns = document.getElementById('WG_NEW_DNS').value.trim();
    var peerPubkey = document.getElementById('WG_NEW_PEER_PUBKEY').value.trim();
    var endpoint = document.getElementById('WG_NEW_PEER_ENDPOINT').value.trim();
    var allowedIps = document.getElementById('WG_NEW_ALLOWED_IPS').value.trim();
    var psk = document.getElementById('WG_NEW_PSK').value.trim();
    var keepalive = parseInt(document.getElementById('WG_NEW_KEEPALIVE').value) || 25;

    if (!name || !privkey || !addr || !peerPubkey || !endpoint) {
      wgLog('<span style="color:#f87171">Fill in all required fields (name, private key, address, peer key, endpoint)</span>');
      return;
    }

    wgLog('Saving tunnel: ' + name + '...');
    try {
      var body = {
        name: name,
        private_key: privkey,
        address: addr,
        dns: dns,
        peer_public_key: peerPubkey,
        peer_endpoint: endpoint,
        allowed_ips: allowedIps || '0.0.0.0/0, ::/0',
        peer_preshared_key: psk,
        persistent_keepalive: keepalive
      };

      var res = await fetchWithTimeout(HOTBOX_baseURL + '/wireguard/save', {
        method: 'POST', headers: common_headers, body: JSON.stringify(body)
      }, 10000);
      var data = await res.json();

      if (data.error) { wgLog('<span style="color:#f87171">' + data.error + '</span>'); return; }

      wgLog('<span style="color:#4ade80">Tunnel "' + name + '" saved. Public key: ' + (data.public_key || '—') + '</span>');

      // Clear form
      document.getElementById('WG_NEW_NAME').value = '';
      document.getElementById('WG_NEW_PRIVKEY').value = '';
      document.getElementById('WG_NEW_ADDR').value = '';
      document.getElementById('WG_NEW_DNS').value = '';
      document.getElementById('WG_NEW_PEER_PUBKEY').value = '';
      document.getElementById('WG_NEW_PEER_ENDPOINT').value = '';
      document.getElementById('WG_NEW_PSK').value = '';
      document.getElementById('WG_PUBKEY_DISPLAY').style.display = 'none';

      refreshStatus();
    } catch (e) {
      wgLog('<span style="color:#f87171">Save failed: ' + (e.message || e) + '</span>');
    }
  }

  async function connectTunnel(name) {
    if (!name) {
      // Get first available config
      var listEl = document.getElementById('WG_TUNNEL_LIST');
      var first = listEl && listEl.querySelector('span');
      if (first) name = first.textContent.replace(' ● active', '').trim();
      if (!name) { wgLog('<span style="color:#f87171">No tunnel selected</span>'); return; }
    }

    wgLog('Connecting to ' + name + '...');
    try {
      var res = await fetchWithTimeout(HOTBOX_baseURL + '/wireguard/connect', {
        method: 'POST', headers: common_headers, body: JSON.stringify({ name: name })
      }, 25000);
      var data = await res.json();

      if (data.error) { wgLog('<span style="color:#f87171">' + data.error + '</span>'); return; }

      wgLog('<span style="color:#4ade80">Connected to ' + name + '</span>');
      refreshStatus();
    } catch (e) {
      wgLog('<span style="color:#f87171">Connect failed: ' + (e.message || e) + '</span>');
    }
  }

  async function disconnectTunnel() {
    wgLog('Disconnecting...');
    try {
      var res = await fetchWithTimeout(HOTBOX_baseURL + '/wireguard/disconnect', {
        method: 'POST', headers: common_headers
      }, 10000);
      var data = await res.json();

      if (data.error) { wgLog('<span style="color:#f87171">' + data.error + '</span>'); return; }

      wgLog('<span style="color:#4ade80">Disconnected</span>');
      refreshStatus();
    } catch (e) {
      wgLog('<span style="color:#f87171">Disconnect failed: ' + (e.message || e) + '</span>');
    }
  }

  async function deleteTunnel(name) {
    if (!confirm('Delete tunnel "' + name + '"?')) return;
    wgLog('Deleting ' + name + '...');
    try {
      var res = await fetchWithTimeout(HOTBOX_baseURL + '/wireguard/delete', {
        method: 'POST', headers: common_headers, body: JSON.stringify({ name: name })
      }, 10000);
      var data = await res.json();
      if (data.error) { wgLog('<span style="color:#f87171">' + data.error + '</span>'); return; }
      wgLog('<span style="color:#4ade80">Deleted ' + name + '</span>');
      refreshStatus();
    } catch (e) {
      wgLog('<span style="color:#f87171">Delete failed: ' + (e.message || e) + '</span>');
    }
  }
})();
