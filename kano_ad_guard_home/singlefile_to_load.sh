cat > /data/agh/agh/scripts/debug.sh << 'ENDOFFILE'
#!/system/bin/sh
MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
LOG="$AGH_DIR/debug.log"

{
  echo "==== AdGuardHome Debug Log - $(date) ===="
  echo

  echo "== System Information =="
  uname -a
  echo "Android Version: $(getprop ro.build.version.release)"
  echo "Device Model: $(getprop ro.product.model)"
  echo "Device Brand: $(getprop ro.product.brand)"
  echo "Architecture: $(uname -m)"
  echo "Kernel: $(uname -r)"
  echo

  echo "== AdGuardHome Version =="
  if [ -f "$AGH_DIR/bin/AdGuardHome" ]; then
    "$AGH_DIR/bin/AdGuardHome" --version
  else
    echo "AdGuardHome binary not found"
  fi
  echo

  echo "== Root Method =="
  if [ -d "/data/adb/magisk" ]; then
    echo "Magisk"
  elif [ -d "/data/adb/ksu" ]; then
    echo "KernelSU"
  elif [ -d "/data/adb/ap" ]; then
    echo "APatch"
  else
    echo "Unknown"
  fi
  echo

  echo "== BusyBox Version =="
  [ -d "/data/adb/magisk" ] && export PATH="/data/adb/magisk:$PATH"
  [ -d "/data/adb/ksu/bin" ] && export PATH="/data/adb/ksu/bin:$PATH"
  [ -d "/data/adb/ap/bin" ] && export PATH="/data/adb/ap/bin:$PATH"
  if command -v busybox >/dev/null 2>&1; then
    busybox --version
  else
    echo "BusyBox not found"
  fi
  echo

  echo "== AGH Directory Listing =="
  ls -lR "$AGH_DIR"
  echo

  echo "== AGH Bin Log (last 30 lines) =="
  tail -n 30 "$AGH_DIR/bin.log" 2>/dev/null
  echo

  echo "== AGH Settings =="
  cat "$AGH_DIR/settings.conf" 2>/dev/null
  echo

  echo "== AGH PID File =="
  cat "$AGH_DIR/bin/agh.pid" 2>/dev/null
  echo

  echo "== Running Processes (AdGuardHome) =="
  ps -A | grep AdGuardHome
  echo

  echo "== iptables -t nat -L -n -v =="
  iptables -t nat -L -n -v
  echo

  echo "== iptables -t filter INPUT -L -n -v =="
  iptables -t filter -L INPUT -n -v
  echo

  echo "== ip6tables -t filter -L -n -v =="
  ip6tables -t filter -L -n -v
  echo

  echo "== ip6tables -t filter INPUT -L -n -v =="
  ip6tables -t filter -L INPUT -n -v
  echo

  echo "== ip6tables -t nat -L -n -v =="
  ip6tables -t nat -L -n -v 2>&1
  echo

  echo "== Listening Ports (AGH) =="
  netstat -tlnup 2>/dev/null | grep -E "8858|3000" || ss -tlnp 2>/dev/null | grep -E "8858|3000" || echo "netstat/ss not available"
  echo

  echo "== IPv4 Routes =="
  ip route
  echo

  echo "== IPv6 Routes =="
  ip -6 route
  echo

  echo "== Network Interfaces =="
  ip addr
  echo

  echo "== Memory Usage =="
  free -h 2>/dev/null || cat /proc/meminfo | head -5
  echo

  echo "== Disk Usage =="
  df -h "$MODPATH" 2>/dev/null
  echo

  echo "== DNS Resolution Test =="
  nslookup google.com 2>/dev/null || echo "nslookup not available"
  echo

} >"$LOG" 2>&1

echo "Debug information collected in: $LOG"
echo "Please share this file when reporting issues"
ENDOFFILE
chmod +x /data/agh/agh/scripts/debug.sh



cat > /data/agh/agh/scripts/iptables.sh << 'ENDOFFILE'
MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
. $AGH_DIR/settings.conf
. $AGH_DIR/scripts/base.sh

iptables_w="iptables -w 64"
ip6tables_w="ip6tables -w 64"
wan_interface="sipa_eth0"

# Validate IP/CIDR format to prevent command injection
validate_ip_or_cidr() {
  echo "$1" | grep -qE '^[0-9a-fA-F.:]+(/[0-9]+)?$'
}

enable_iptables() {
  if $iptables_w -t nat -L ADGUARD_REDIRECT_DNS >/dev/null 2>&1; then
    log "ADGUARD_REDIRECT_DNS chain already exists, skipping creation"
    return 0
  fi

  log "Trying to create ADGUARD_REDIRECT_DNS chain"
  $iptables_w -t nat -N ADGUARD_REDIRECT_DNS || {
    log "Failed to create ADGUARD_REDIRECT_DNS chain"
    return 1
  }
  log "Created ADGUARD_REDIRECT_DNS chain"

  log "Adding iptables rules, excluding AdGuardHome itself"
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -m owner --uid-owner $adg_user --gid-owner $adg_group -j RETURN || {
    log "Failed to add iptables rules"
    return 1
  }
  log "Added iptables rules"

  for subnet in $ignore_dest_list; do
    if ! validate_ip_or_cidr "$subnet"; then
      log "INVALID destination skipped (bad format): $subnet"
      continue
    fi
    log "Adding iptables rules for destination: $subnet"
    $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -d "$subnet" -j RETURN || {
      log "Failed to add iptables rules for destination: $subnet"
      return 1
    }
    log "Added iptables rules for destination: $subnet"
  done

  for subnet in $ignore_src_list; do
    if ! validate_ip_or_cidr "$subnet"; then
      log "INVALID source skipped (bad format): $subnet"
      continue
    fi
    log "Adding iptables rules for source: $subnet"
    $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -s "$subnet" -j RETURN || {
      log "Failed to add iptables rules for source: $subnet"
      return 1
    }
    log "Added iptables rules for source: $subnet"
  done

  log "Redirecting udp 53 to $redir_port"
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -p udp --dport 53 -j REDIRECT --to-ports $redir_port || {
    log "Failed to redirect udp 53 to $redir_port"
    return 1
  }
  log "Redirected udp 53 to $redir_port"

  log "Redirecting tcp 53 to $redir_port"
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -p tcp --dport 53 -j REDIRECT --to-ports $redir_port || {
    log "Failed to redirect tcp 53 to $redir_port"
    return 1
  }
  log "Redirected tcp 53 to $redir_port"

  log "Applying iptables rules to OUTPUT"
  $iptables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS || {
    log "Failed to apply iptables rules to OUTPUT"
    return 1
  }
  log "Applied iptables rules to OUTPUT"

  log "Applying DNAT rules to PREROUTING for client DNS"
  $iptables_w -t nat -I PREROUTING -i $lan_interface -p udp --dport 53 -j DNAT --to-destination $router_ip:$redir_port || {
    log "Failed to apply PREROUTING udp DNAT rule"
    return 1
  }
  log "Applied PREROUTING udp DNAT rule"

  $iptables_w -t nat -I PREROUTING -i $lan_interface -p tcp --dport 53 -j DNAT --to-destination $router_ip:$redir_port || {
    log "Failed to apply PREROUTING tcp DNAT rule"
    return 1
  }
  log "Applied PREROUTING tcp DNAT rule"

  # Insert bypass rules AFTER DNAT so they end up above DNAT (higher priority with -I)
  for subnet in $ignore_src_list; do
    if ! validate_ip_or_cidr "$subnet"; then
      continue
    fi
    log "Adding PREROUTING bypass for source: $subnet"
    $iptables_w -t nat -I PREROUTING -i $lan_interface -s "$subnet" -p udp --dport 53 -j ACCEPT
    $iptables_w -t nat -I PREROUTING -i $lan_interface -s "$subnet" -p tcp --dport 53 -j ACCEPT
  done

  # Block WAN access to AGH DNS and web UI ports (prevent open resolver / remote admin)
  log "Adding WAN firewall rules to block external access"
  $iptables_w -I INPUT -i $wan_interface -p udp --dport $redir_port -j DROP
  $iptables_w -I INPUT -i $wan_interface -p tcp --dport $redir_port -j DROP
  $iptables_w -I INPUT -i $wan_interface -p tcp --dport 3000 -j DROP
  log "Applied WAN firewall rules"
}

disable_iptables() {
  if ! $iptables_w -t nat -L ADGUARD_REDIRECT_DNS >/dev/null 2>&1; then
    log "ADGUARD_REDIRECT_DNS chain does not exist, skipping deletion"
    return 0
  fi

  log "Deleting iptables OUTPUT rules"
  $iptables_w -t nat -D OUTPUT -j ADGUARD_REDIRECT_DNS || {
    log "Failed to delete iptables OUTPUT rules"
  }
  log "Deleted iptables OUTPUT rules"

  log "Deleting PREROUTING DNAT rules"
  $iptables_w -t nat -D PREROUTING -i $lan_interface -p udp --dport 53 -j DNAT --to-destination $router_ip:$redir_port || {
    log "Failed to delete PREROUTING udp DNAT rule"
  }
  $iptables_w -t nat -D PREROUTING -i $lan_interface -p tcp --dport 53 -j DNAT --to-destination $router_ip:$redir_port || {
    log "Failed to delete PREROUTING tcp DNAT rule"
  }
  for subnet in $ignore_src_list; do
    $iptables_w -t nat -D PREROUTING -i $lan_interface -s $subnet -p udp --dport 53 -j ACCEPT 2>/dev/null
    $iptables_w -t nat -D PREROUTING -i $lan_interface -s $subnet -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
  log "Deleted PREROUTING DNAT rules"

  log "Removing WAN firewall rules"
  $iptables_w -D INPUT -i $wan_interface -p udp --dport $redir_port -j DROP 2>/dev/null
  $iptables_w -D INPUT -i $wan_interface -p tcp --dport $redir_port -j DROP 2>/dev/null
  $iptables_w -D INPUT -i $wan_interface -p tcp --dport 3000 -j DROP 2>/dev/null
  log "Removed WAN firewall rules"

  log "Flushing iptables rules"
  $iptables_w -t nat -F ADGUARD_REDIRECT_DNS || {
    log "Failed to flush iptables rules"
    return 1
  }
  log "Flushed iptables rules"

  log "Deleting iptables chain"
  $iptables_w -t nat -X ADGUARD_REDIRECT_DNS || {
    log "Failed to delete iptables chain"
    return 1
  }
}

enable_ipv6_iptables() {
  # First try ip6tables NAT (preferred method)
  if $ip6tables_w -t nat -L >/dev/null 2>&1; then
    log "ip6tables nat supported, using NAT redirect"

    if $ip6tables_w -t nat -L ADGUARD_REDIRECT_DNS6 >/dev/null 2>&1; then
      log "ADGUARD_REDIRECT_DNS6 chain already exists, skipping creation"
      return 0
    fi

    log "Creating ADGUARD_REDIRECT_DNS6 chain"
    $ip6tables_w -t nat -N ADGUARD_REDIRECT_DNS6 || {
      log "Failed to create ADGUARD_REDIRECT_DNS6 chain"
      return 1
    }

    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -m owner --uid-owner $adg_user --gid-owner $adg_group -j RETURN
    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -p udp --dport 53 -j REDIRECT --to-ports $redir_port
    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -p tcp --dport 53 -j REDIRECT --to-ports $redir_port
    $ip6tables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS6
    $ip6tables_w -t nat -I PREROUTING -i $lan_interface -p udp --dport 53 -j REDIRECT --to-ports $redir_port
    $ip6tables_w -t nat -I PREROUTING -i $lan_interface -p tcp --dport 53 -j REDIRECT --to-ports $redir_port
    log "Applied IPv6 NAT redirect rules"
    return 0
  fi

  # Fallback: ip6tables NAT not supported
  # Only block IPv6 DNS in FORWARD (WiFi clients on br0) to prevent AGH bypass.
  # Do NOT block IPv6 DNS in OUTPUT — system processes (CLAT/464XLAT, NTP,
  # connectivity checks) need IPv6 DNS on IPv6-only carriers like JIO.
  # AGH uses DoT/DoH (port 853/443), not port 53, so its upstreams are unaffected.
  log "ip6tables nat not supported, blocking IPv6 DNS only for WiFi clients (FORWARD)"

  # Block WiFi client IPv6 DNS in FORWARD to force them through IPv4 → AGH
  $ip6tables_w -t filter -I FORWARD -i $lan_interface -p udp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD udp DROP"
    return 1
  }
  $ip6tables_w -t filter -I FORWARD -i $lan_interface -p tcp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD tcp DROP"
    return 1
  }
  log "Applied IPv6 FORWARD DNS DROP rules for WiFi clients"
}

disable_ipv6_iptables() {
  # Clean up NAT rules if they exist
  if $ip6tables_w -t nat -L ADGUARD_REDIRECT_DNS6 >/dev/null 2>&1; then
    $ip6tables_w -t nat -D PREROUTING -i $lan_interface -p udp --dport 53 -j REDIRECT --to-ports $redir_port 2>/dev/null
    $ip6tables_w -t nat -D PREROUTING -i $lan_interface -p tcp --dport 53 -j REDIRECT --to-ports $redir_port 2>/dev/null
    $ip6tables_w -t nat -D OUTPUT -j ADGUARD_REDIRECT_DNS6 2>/dev/null
    $ip6tables_w -t nat -F ADGUARD_REDIRECT_DNS6 2>/dev/null
    $ip6tables_w -t nat -X ADGUARD_REDIRECT_DNS6 2>/dev/null
    log "Cleaned up IPv6 NAT redirect rules"
  fi

  # Clean up FILTER fallback rules (legacy ADGUARD_FORCE_IPV4_DNS chain)
  if $ip6tables_w -t filter -L ADGUARD_FORCE_IPV4_DNS >/dev/null 2>&1; then
    $ip6tables_w -t filter -D OUTPUT -j ADGUARD_FORCE_IPV4_DNS 2>/dev/null
    $ip6tables_w -t filter -F ADGUARD_FORCE_IPV4_DNS 2>/dev/null
    $ip6tables_w -t filter -X ADGUARD_FORCE_IPV4_DNS 2>/dev/null
    log "Cleaned up legacy IPv6 OUTPUT filter rules"
  fi

  # Clean up FORWARD rules
  $ip6tables_w -t filter -D FORWARD -i $lan_interface -p udp --dport 53 -j DROP 2>/dev/null
  $ip6tables_w -t filter -D FORWARD -i $lan_interface -p tcp --dport 53 -j DROP 2>/dev/null
  log "Cleaned up IPv6 FORWARD DNS DROP rules"
}

add_block_ipv6_dns() {
  if $ip6tables_w -t filter -L ADGUARD_BLOCK_DNS >/dev/null 2>&1; then
    log "ADGUARD_BLOCK_DNS chain already exists, skipping creation"
    return 0
  fi

  log "Creating ADGUARD_BLOCK_DNS chain"
  $ip6tables_w -t filter -N ADGUARD_BLOCK_DNS || {
    log "Failed to create ADGUARD_BLOCK_DNS chain"
    return 1
  }
  log "Created ADGUARD_BLOCK_DNS chain"

  log "Blocking ipv6 udp 53"
  $ip6tables_w -t filter -A ADGUARD_BLOCK_DNS -p udp --dport 53 -j DROP || {
    log "Failed to block ipv6 udp 53"
    return 1
  }
  log "Blocked ipv6 udp 53"

  log "Blocking ipv6 tcp 53"
  $ip6tables_w -t filter -A ADGUARD_BLOCK_DNS -p tcp --dport 53 -j DROP || {
    log "Failed to block ipv6 tcp 53"
    return 1
  }
  log "Blocked ipv6 tcp 53"

  log "Applying ipv6 iptables rules"
  $ip6tables_w -t filter -I OUTPUT -j ADGUARD_BLOCK_DNS || {
    log "Failed to apply ipv6 iptables rules"
    return 1
  }
  log "Applied ipv6 iptables rules"

  log "Blocking IPv6 DNS in FORWARD for WiFi clients"
  $ip6tables_w -t filter -I FORWARD -i $lan_interface -p udp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD udp DROP"
    return 1
  }
  $ip6tables_w -t filter -I FORWARD -i $lan_interface -p tcp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD tcp DROP"
    return 1
  }
  log "Applied IPv6 FORWARD DNS block rules"
}

del_block_ipv6_dns() {
  if ! $ip6tables_w -t filter -L ADGUARD_BLOCK_DNS >/dev/null 2>&1; then
    log "ADGUARD_BLOCK_DNS chain does not exist, skipping deletion"
    return 0
  fi

  log "Deleting ipv6 iptables rules"
  $ip6tables_w -t filter -F ADGUARD_BLOCK_DNS || {
    log "Failed to delete ipv6 iptables rules"
    return 1
  }
  log "Deleted ipv6 iptables rules"

  log "Deleting ipv6 iptables chain"
  $ip6tables_w -t filter -D OUTPUT -j ADGUARD_BLOCK_DNS || {
    log "Failed to delete ipv6 iptables chain"
    return 1
  }
  log "Deleted ipv6 iptables chain"

  log "Flushing ipv6 iptables rules"
  $ip6tables_w -t filter -X ADGUARD_BLOCK_DNS || {
    log "Failed to flush ipv6 iptables rules"
    return 1
  }
  log "Flushed ipv6 iptables rules"

  log "Cleaning up IPv6 FORWARD DNS block rules"
  $ip6tables_w -t filter -D FORWARD -i $lan_interface -p udp --dport 53 -j DROP 2>/dev/null
  $ip6tables_w -t filter -D FORWARD -i $lan_interface -p tcp --dport 53 -j DROP 2>/dev/null
  log "Cleaned up IPv6 FORWARD DNS block rules"
}

case "$1" in
enable)
  log "Enabling iptables"
  enable_iptables || {
    log "Failed to enable iptables"
    exit 1
  }
  log "Enabled iptables"
  
  if [ "$block_ipv6_dns" = true ]; then
    log "Enabling ipv6 DNS blocking"
    add_block_ipv6_dns || {
      log "Failed to enable ipv6 DNS blocking"
      exit 1
    }
    log "Enabled ipv6 DNS blocking"
  elif [ "$redirect_ipv6_dns" = true ]; then
    log "Enabling IPv6 DNS redirect"
    enable_ipv6_iptables || {
      log "Failed to enable IPv6 DNS redirect"
      exit 1
    }
    log "Enabled IPv6 DNS redirect"
  fi
  ;;
disable)
  log "Disabling iptables"
  disable_iptables || {
    log "Failed to disable iptables"
    exit 1
  }
  log "Disabled iptables"
  # Always attempt IPv6 cleanup regardless of current settings,
  # in case settings were changed between enable and disable
  log "Cleaning up ipv6 DNS blocking (if active)"
  del_block_ipv6_dns
  log "Cleaning up IPv6 DNS redirect (if active)"
  disable_ipv6_iptables
  ;;
*)
  echo "Usage: $0 {enable|disable}"
  exit 1
  ;;
esac
ENDOFFILE
chmod +x /data/agh/agh/scripts/iptables.sh

cat > /data/agh/agh/scripts/tool.sh << 'ENDOFFILE'
MODPATH="/data/agh"

. $MODPATH/agh/settings.conf
. $MODPATH/agh/scripts/base.sh

start_adguardhome() {
  # check if AdGuardHome is already running
  if [ -f "$PID_FILE" ]; then
    adg_pid=$(cat "$PID_FILE")
    if kill -0 "$adg_pid" 2>/dev/null; then
      log "AdGuardHome is already running (PID: $adg_pid)"
      exit 0
    fi
  fi

  # to fix https://github.com/AdguardTeam/AdGuardHome/issues/7002
  export SSL_CERT_DIR="/system/etc/security/cacerts/"
  # set timezone
  export TZ="$timezone"
  # run binary
  "$BIN_DIR/AdGuardHome" --no-check-update >>"$AGH_DIR/bin.log" 2>&1 &
  adg_pid=$!

  # wait briefly for AdGuardHome to initialize
  sleep 2

  # check if AdGuardHome started successfully
  if kill -0 "$adg_pid" 2>/dev/null; then
    echo "$adg_pid" >"$PID_FILE"
    # check if iptables is enabled
    if [ "$enable_iptables" = true ]; then
      $SCRIPT_DIR/iptables.sh enable
      log "🥰 started PID: $adg_pid iptables: enabled"
    else
      log "🥰 started PID: $adg_pid iptables: disabled"
    fi
  else
    log "😭 Error occurred, check logs for details"
    sh $MODPATH/agh/scripts/debug.sh
    exit 1
  fi
}

stop_adguardhome() {
  if [ -f "$PID_FILE" ]; then
    adg_pid=$(cat "$PID_FILE")
    log "Stopping AdGuardHome PID: $adg_pid"
    kill "$adg_pid" 2>/dev/null
    # Give AGH up to 5 seconds to shut down gracefully
    i=0
    while [ $i -lt 5 ] && kill -0 "$adg_pid" 2>/dev/null; do
      sleep 1
      i=$((i + 1))
    done
    # Force kill if still running
    if kill -0 "$adg_pid" 2>/dev/null; then
      log "AGH did not stop gracefully, force killing"
      kill -9 "$adg_pid" 2>/dev/null
    fi
    rm -f "$PID_FILE"
  else
    log "Force killing AdGuardHome"
    pkill -f "AdGuardHome" || pkill -9 -f "AdGuardHome"
  fi
  log "AdGuardHome stopped"
  $SCRIPT_DIR/iptables.sh disable
  log "Iptables disabled"
}

toggle_adguardhome() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
    stop_adguardhome
  else
    start_adguardhome
  fi
}

case "$1" in
start)
  start_adguardhome
  ;;
stop)
  stop_adguardhome
  ;;
toggle)
  toggle_adguardhome
  ;;
*)
  echo "Usage: $0 {start|stop|toggle}"
  exit 1
  ;;
esac
ENDOFFILE
chmod +x /data/agh/agh/scripts/tool.sh


cat > /data/agh/agh/bin/AdGuardHome.yaml << 'ENDOFFILE'

http:
  pprof:
    port: 6060
    enabled: false
  doh:
    routes:
      - GET /dns-query
      - POST /dns-query
      - GET /dns-query/{ClientID}
      - POST /dns-query/{ClientID}
    insecure_enabled: false
  address: 192.168.0.1:3000
  session_ttl: 24h
users:
  - name: kandazh
    password: $2b$12$5HYsblr7FP1MwYflQzDKaeIX993h2gMvtLKkEN8NHNurBO930W2Nq
  - name: root
    password: $2b$12$cPAt2pujJVjMiWIecnb1ZehxtoWUu87R.Q0cE9ogZlXppx/fhymxS
auth_attempts: 3
block_auth_min: 60
http_proxy: ""
language: ""
theme: auto
dns:
  bind_hosts:
    - 192.168.0.1
    - 127.0.0.1
    - '::1'
  port: 8858
  anonymize_client_ip: false
  ratelimit: 20
  ratelimit_subnet_len_ipv4: 24
  ratelimit_subnet_len_ipv6: 56
  ratelimit_whitelist: []
  refuse_any: true
  upstream_dns:
    - tls://1.1.1.1
    - tls://8.8.8.8
    - tls://[2606:4700:4700::1111]
    - tls://[2001:4860:4860::8888]
  upstream_dns_file: ""
  bootstrap_dns:
    - 1.1.1.1
    - 8.8.8.8
    - 9.9.9.9
    - 2606:4700:4700::1111
    - 2001:4860:4860::8888
  fallback_dns:
    - tls://9.9.9.9
    - tls://208.67.222.222
    - tls://[2620:fe::fe]
    - tls://[2001:4860:4860::8888]
  upstream_mode: parallel
  fastest_timeout: 2s
  allowed_clients: []
  disallowed_clients: []
  blocked_hosts:
    - version.bind
    - id.server
    - hostname.bind
  trusted_proxies:
    - 127.0.0.0/8
    - ::1/128
  cache_enabled: true
  cache_size: 67108864
  cache_ttl_min: 43200
  cache_ttl_max: 86400
  cache_optimistic: true
  cache_optimistic_answer_ttl: 30s
  cache_optimistic_max_age: 12h
  bogus_nxdomain: []
  aaaa_disabled: false
  enable_dnssec: true
  edns_client_subnet:
    custom_ip: ""
    enabled: true
    use_custom: false
  max_goroutines: 300
  handle_ddr: true
  ipset: []
  ipset_file: ""
  bootstrap_prefer_ipv6: true
  upstream_timeout: 3s
  private_networks: []
  use_private_ptr_resolvers: true
  local_ptr_upstreams: []
  use_dns64: false
  dns64_prefixes: []
  serve_http3: false
  use_http3_upstreams: false
  serve_plain_dns: true
  hostsfile_enabled: true
  pending_requests:
    enabled: true
tls:
  enabled: false
  server_name: ""
  force_https: false
  port_https: 443
  port_dns_over_tls: 853
  port_dns_over_quic: 853
  port_dnscrypt: 0
  dnscrypt_config_file: ""
  certificate_chain: ""
  private_key: ""
  certificate_path: ""
  private_key_path: ""
  strict_sni_check: false
querylog:
  dir_path: ""
  ignored: []
  interval: 24h
  size_memory: 1000
  enabled: true
  ignored_enabled: false
  file_enabled: true
statistics:
  dir_path: ""
  ignored: []
  interval: 24h
  enabled: true
  ignored_enabled: false
filters:
  - enabled: true
    url: https://easylist.to/easylist/easylist.txt
    name: EasyList
    id: 3
  - enabled: true
    url: https://easylist.to/easylist/easyprivacy.txt
    name: EasyPrivacy
    id: 4
  - enabled: true
    url: https://raw.githubusercontent.com/TG-Twilight/AWAvenue-Ads-Rule/main/AWAvenue-Ads-Rule.txt
    name: AWAvenue-Ads-Rule
    id: 1732747955
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
    id: 1764849880
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_59.txt
    name: AdGuard DNS Popup Hosts filter
    id: 1764849881
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_53.txt
    name: AWAvenue Ads Rule
    id: 1764849882
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_67.txt
    name: HaGeZi's Apple Tracker Blocklist
    id: 1764849883
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_29.txt
    name: 'CHN: AdRules DNS List'
    id: 1764849885
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_10.txt
    name: Scam Blocklist by DurableNapkin
    id: 1764849886
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_9.txt
    name: The Big List of Hacked Malware Web Sites
    id: 1764849887
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_50.txt
    name: uBlock₀ filters – Badware risks
    id: 1764849888
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_49.txt
    name: HaGeZi's Ultimate Blocklist
    id: 1764849890
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_33.txt
    name: Steven Black's List
    id: 1764849891
whitelist_filters: []
user_rules:
  - '! ---- Block ZTE domains ----'
  - '||ztems.com^$important'
  - '||ztesmarthome.com^$important'
  - '||kanokano.cn^$important'
  - '! ---- Allow YouTube core domains ----'
  - '@@||youtube.com^$important'
  - '@@||googlevideo.com^$important'
  - '@@||ytimg.com^$important'
  - '@@||ggpht.com^$important'
  - '! ---- Block Google ad/trackers ----'
  - '||googleadservices.com^'
  - '||googlesyndication.com^'
  - '||doubleclick.net^'
  - '||googletagmanager.com^'
  - '||googletagservices.com^'
  - '! ---- Block YouTube ads domain ----'
  - '||ads.youtube.com^'
  - '! ---- Allow Microsoft Teams events ----'
  - '@@||teams.events.data.microsoft.com^$important'
  - '@@||browser.pipe.aria.microsoft.com^$important'
  - '@@||nexusrules.officeapps.live.com^$important'
  - '! ---- Allow Android connectivity checks ----'
  - '@@||connectivitycheck.gstatic.com^$important'
  - '@@||connectivitycheck.android.com^$important'
  - '@@||clients3.google.com^$important'
  - '! ---- Block common encrypted DNS endpoints (helps prevent bypass via Private
    DNS / browser DoH) ----'
  - '||dns.google^$important'
  - '||dns.quad9.net^$important'
  - '||cloudflare-dns.com^$important'
  - '||mozilla.cloudflare-dns.com^$important'
  - '||dns.adguard-dns.com^$important'
  - '||doh.opendns.com^$important'
  - '||dns.cloudflare.com^$important'
  - '||one.one.one.one^$important'
  - '||family.cloudflare-dns.com^$important'
  - '||security.cloudflare-dns.com^$important'
  - '||dns.nextdns.io^$important'
  - '||anycast.dns.nextdns.io^$important'
  - '||dns10.quad9.net^$important'
  - '||dns11.quad9.net^$important'
dhcp:
  enabled: false
  interface_name: br0
  local_domain_name: lan
  dhcpv4:
    gateway_ip: 192.168.0.1
    subnet_mask: 255.255.255.0
    range_start: 192.168.0.2
    range_end: 192.168.0.254
    lease_duration: 86400
    icmp_timeout_msec: 1000
    options: []
  dhcpv6:
    range_start: ""
    lease_duration: 86400
    ra_slaac_only: false
    ra_allow_slaac: false
filtering:
  blocking_ipv4: ""
  blocking_ipv6: ""
  blocked_services:
    schedule:
      time_zone: Asia/Kolkata
    ids: []
  protection_disabled_until: null
  safe_search:
    enabled: true
    bing: true
    duckduckgo: true
    ecosia: true
    google: true
    pixabay: true
    yandex: true
    youtube: true
  blocking_mode: default
  parental_block_host: family-block.dns.adguard.com
  safebrowsing_block_host: standard-block.dns.adguard.com
  rewrites: []
  safe_fs_patterns: []
  safebrowsing_cache_size: 1048576
  safesearch_cache_size: 1048576
  parental_cache_size: 1048576
  cache_time: 120
  filters_update_interval: 72
  blocked_response_ttl: 86400
  filtering_enabled: true
  rewrites_enabled: true
  parental_enabled: true
  safebrowsing_enabled: true
  protection_enabled: true
clients:
  runtime_sources:
    whois: true
    arp: true
    rdns: true
    dhcp: true
    hosts: true
  persistent: []
log:
  enabled: true
  file: ""
  max_backups: 0
  max_size: 100
  max_age: 3
  compress: false
  local_time: true
  verbose: false
os:
  group: ""
  user: ""
  rlimit_nofile: 0
schema_version: 34

ENDOFFILE

cat > /data/agh/boot.sh << 'ENDOFFILE'
MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"

# Wait for network to be ready (JIO takes time to connect)
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  # Check if any WAN interface has a global address (IPv4 or IPv6)
  if ip addr 2>/dev/null | grep -qE "inet6.*scope global|inet [0-9]+\.[0-9]+.*scope global"; then
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
    echo "AdGuardHome not installed properly" >> "$MODPATH/boot.log"
    exit 1
fi

# Start AdGuardHome
echo "Starting AdGuardHome at boot - $(date)" >> "$MODPATH/boot.log"
$AGH_DIR/scripts/tool.sh start >> "$MODPATH/boot.log" 2>&1
ENDOFFILE
chmod +x /data/agh/boot.sh

cat > /data/agh/agh/settings.conf << 'ENDOFFILE'

# Whether to enable the built-in iptables rules
enable_iptables=true

# Block DNS requests for ipv6, only effective when enable_iptables=true
# Set to false if you want to allow IPv6 DNS queries
block_ipv6_dns=false

# Redirect IPv6 DNS through AdGuard Home, required for IPv6-only carriers like JIO
# Only effective when enable_iptables=true and block_ipv6_dns=false
redirect_ipv6_dns=true

# Router IP address (br0 interface), must match AdGuardHome bind address
router_ip="192.168.0.1"

# LAN interface name for WiFi clients
lan_interface="br0"

# Redirect port, please keep it consistent with AdGuardHome settings
redir_port=8858

# Timezone for AdGuardHome logs
timezone="Asia/Kolkata"

# User group and user, used to bypass AdGuardHome itself
adg_user=root
adg_group=net_raw

# List of destination addresses to bypass, separated by spaces
ignore_dest_list=""

# List of source addresses to bypass, separated by spaces
ignore_src_list=""

# File paths, do not modify
readonly AGH_DIR="/data/agh/agh"
readonly BIN_DIR="$AGH_DIR/bin"
readonly SCRIPT_DIR="$AGH_DIR/scripts"
readonly PID_FILE="$AGH_DIR/bin/agh.pid"
ENDOFFILE
