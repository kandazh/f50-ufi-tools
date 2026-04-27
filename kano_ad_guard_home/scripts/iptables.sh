
cat > /data/agh/agh/scripts/iptables.sh << 'ENDOFFILE'
MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
. $AGH_DIR/settings.conf
. $AGH_DIR/scripts/base.sh

iptables_w="iptables -w 64"
ip6tables_w="ip6tables -w 64"

# Auto-detect WAN interface (cellular data interface)
# Falls back to sipa_eth0 if detection fails
detect_wan_interface() {
  # Try common cellular WAN interfaces in order of likelihood
  for iface in sipa_eth0 rmnet_data0 wwan0 pdp0 ccmni0 seth_lte0; do
    if ip link show "$iface" >/dev/null 2>&1; then
      echo "$iface"
      return
    fi
  done
  # Fallback: find interface with default route
  local detected
  detected=$(ip route 2>/dev/null | awk '/default/{print $5; exit}')
  if [ -n "$detected" ] && [ "$detected" != "$lan_interface" ]; then
    echo "$detected"
    return
  fi
  echo "sipa_eth0"
}
wan_interface=$(detect_wan_interface)
log "Detected WAN interface: $wan_interface"

# Validate IP/CIDR format to prevent command injection
validate_ip_or_cidr() {
  local input="$1"
  # Reject empty input
  [ -z "$input" ] && return 1
  # Match IPv4: 1.2.3.4 or 1.2.3.4/24
  if echo "$input" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]{1,2})?$'; then
    return 0
  fi
  # Match IPv6: hex:colon format with optional /prefix (0-128)
  if echo "$input" | grep -qE '^[0-9a-fA-F:]+(/[0-9]{1,3})?$'; then
    local prefix
    prefix=$(echo "$input" | grep -oE '/[0-9]+$' | tr -d '/')
    if [ -n "$prefix" ] && [ "$prefix" -gt 128 ]; then
      return 1
    fi
    return 0
  fi
  return 1
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
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -m owner --uid-owner "$adg_user" --gid-owner "$adg_group" -j RETURN || {
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
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -p udp --dport 53 -j REDIRECT --to-ports "$redir_port" || {
    log "Failed to redirect udp 53 to $redir_port, rolling back"
    $iptables_w -t nat -F ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -X ADGUARD_REDIRECT_DNS 2>/dev/null
    return 1
  }
  log "Redirected udp 53 to $redir_port"

  log "Redirecting tcp 53 to $redir_port"
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port" || {
    log "Failed to redirect tcp 53 to $redir_port, rolling back"
    $iptables_w -t nat -F ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -X ADGUARD_REDIRECT_DNS 2>/dev/null
    return 1
  }
  log "Redirected tcp 53 to $redir_port"

  log "Applying iptables rules to OUTPUT"
  $iptables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS || {
    log "Failed to apply iptables rules to OUTPUT, rolling back"
    $iptables_w -t nat -F ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -X ADGUARD_REDIRECT_DNS 2>/dev/null
    return 1
  }
  log "Applied iptables rules to OUTPUT"

  log "Applying DNAT rules to PREROUTING for client DNS"
  $iptables_w -t nat -I PREROUTING -i "$lan_interface" -p udp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" || {
    log "Failed to apply PREROUTING udp DNAT rule"
    return 1
  }
  log "Applied PREROUTING udp DNAT rule"

  $iptables_w -t nat -I PREROUTING -i "$lan_interface" -p tcp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" || {
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
    $iptables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT
    $iptables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT
  done

  # Block WAN access to AGH DNS and web UI ports (prevent open resolver / remote admin)
  log "Adding WAN firewall rules to block external access on interface: $wan_interface"
  $iptables_w -I INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP
  $iptables_w -I INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP
  $iptables_w -I INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP
  # Also block on IPv6 WAN
  $ip6tables_w -I INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null
  $ip6tables_w -I INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null
  $ip6tables_w -I INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null
  log "Applied WAN firewall rules (IPv4 + IPv6)"
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
    $iptables_w -t nat -D PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
    $iptables_w -t nat -D PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
  log "Deleted PREROUTING DNAT rules"

  log "Removing WAN firewall rules"
  $iptables_w -D INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null
  $iptables_w -D INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null
  $iptables_w -D INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null
  log "Removed WAN firewall rules (IPv4 + IPv6)"

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

    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -m owner --uid-owner "$adg_user" --gid-owner "$adg_group" -j RETURN
    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -p udp --dport 53 -j REDIRECT --to-ports "$redir_port"
    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port"
    $ip6tables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS6
    $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -p udp --dport 53 -j REDIRECT --to-ports "$redir_port"
    $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port"
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
  $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD udp DROP"
    return 1
  }
  $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD tcp DROP"
    return 1
  }

  # Apply ignore_src_list bypass for IPv6 FORWARD (so bypassed clients aren't blocked)
  for subnet in $ignore_src_list; do
    if ! validate_ip_or_cidr "$subnet"; then
      continue
    fi
    log "Adding IPv6 FORWARD bypass for source: $subnet"
    $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
    $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
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
  $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP 2>/dev/null
  $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP 2>/dev/null
  # Clean up FORWARD bypass rules for ignore_src_list
  for subnet in $ignore_src_list; do
    $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
    $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
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
  $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP || {
    log "Failed to apply IPv6 FORWARD udp DROP"
    return 1
  }
  $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP || {
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
  $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP 2>/dev/null
  $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP 2>/dev/null
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