MODPATH="/data/agh"
AGH_DIR="$MODPATH/agh"
. $AGH_DIR/settings.conf
. $AGH_DIR/scripts/base.sh

resolve_xtables_binary() {
  local name="$1"
  local candidate

  for candidate in "/system/bin/$name" "/system/xbin/$name"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  candidate=$(command -v "$name" 2>/dev/null)
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    echo "$candidate"
    return 0
  fi

  return 1
}

IPTABLES_BIN=$(resolve_xtables_binary iptables) || {
  log "iptables binary not found"
  exit 1
}
IP6TABLES_BIN=$(resolve_xtables_binary ip6tables) || {
  log "ip6tables binary not found"
  exit 1
}

iptables_w="$IPTABLES_BIN -w 64"
ip6tables_w="$IP6TABLES_BIN -w 64"

log "Using iptables binary: $IPTABLES_BIN"
log "Using ip6tables binary: $IP6TABLES_BIN"

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

# Check if an address is IPv4 format
is_ipv4() {
  echo "$1" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]{1,2})?$'
}

# Check if an address is IPv6 format
is_ipv6() {
  echo "$1" | grep -qE '^[0-9a-fA-F:]+(/[0-9]{1,3})?$'
}

verify_firewall_hardening() {
  $iptables_w -C INPUT -m state --state INVALID -j DROP >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv4 INVALID drop rule"
    return 1
  }
  $iptables_w -C INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv4 ESTABLISHED,RELATED accept rule"
    return 1
  }
  $iptables_w -C INPUT -i lo -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv4 loopback accept rule"
    return 1
  }
  $iptables_w -C INPUT -i "$lan_interface" -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv4 LAN accept rule"
    return 1
  }
  $iptables_w -C INPUT -i "$wan_interface" -p udp --sport 67 --dport 68 -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv4 DHCP accept rule"
    return 1
  }
  $iptables_w -C INPUT -i "$wan_interface" -j DROP >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv4 WAN drop rule"
    return 1
  }

  $ip6tables_w -C INPUT -m state --state INVALID -j DROP >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 INVALID drop rule"
    return 1
  }
  $ip6tables_w -C INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 ESTABLISHED,RELATED accept rule"
    return 1
  }
  $ip6tables_w -C INPUT -i lo -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 loopback accept rule"
    return 1
  }
  $ip6tables_w -C INPUT -i "$lan_interface" -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 LAN accept rule"
    return 1
  }
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 ICMPv6 packet-too-big rule"
    return 1
  }
  $ip6tables_w -C INPUT -i "$wan_interface" -p udp --sport 547 --dport 546 -j ACCEPT >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 DHCPv6 accept rule"
    return 1
  }
  $ip6tables_w -C INPUT -i "$wan_interface" -j DROP >/dev/null 2>&1 || {
    log "Firewall verification failed: missing IPv6 WAN drop rule"
    return 1
  }

  return 0
}

harden_firewall() {
  log "Applying firewall hardening (explicit WAN DROP + INPUT policy DROP)"

  # === IPv4 INPUT hardening ===
  # Drop invalid packets early
  $iptables_w -C INPUT -m state --state INVALID -j DROP 2>/dev/null || \
    $iptables_w -I INPUT 1 -m state --state INVALID -j DROP
  # Allow replies to outbound connections (AGH upstream, NTP, etc.)
  $iptables_w -C INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
    $iptables_w -I INPUT 2 -m state --state ESTABLISHED,RELATED -j ACCEPT
  # Allow loopback (internal process communication)
  $iptables_w -C INPUT -i lo -j ACCEPT 2>/dev/null || \
    $iptables_w -I INPUT 3 -i lo -j ACCEPT
  # Allow all LAN traffic (WiFi clients can reach all device services)
  $iptables_w -C INPUT -i "$lan_interface" -j ACCEPT 2>/dev/null || \
    $iptables_w -I INPUT 4 -i "$lan_interface" -j ACCEPT
  # Allow DHCP replies from carrier (broadcast-based, may not match conntrack)
  $iptables_w -C INPUT -i "$wan_interface" -p udp --sport 67 --dport 68 -j ACCEPT 2>/dev/null || \
    $iptables_w -I INPUT 5 -i "$wan_interface" -p udp --sport 67 --dport 68 -j ACCEPT
  # Drop unsolicited WAN traffic before OEM catch-all ACCEPT rules.
  $iptables_w -C INPUT -i "$wan_interface" -j DROP 2>/dev/null || \
    $iptables_w -I INPUT 6 -i "$wan_interface" -j DROP
  # Keep the policy strict too when the firmware allows it.
  $iptables_w -P INPUT DROP 2>/dev/null || \
    log "Unable to set IPv4 INPUT policy to DROP, relying on explicit WAN DROP rule"
  log "IPv4 INPUT: INVALID dropped, ESTABLISHED + loopback + LAN + DHCP allowed, WAN dropped"

  # === IPv6 INPUT hardening ===
  # Drop invalid packets early
  $ip6tables_w -C INPUT -m state --state INVALID -j DROP 2>/dev/null || \
    $ip6tables_w -I INPUT 1 -m state --state INVALID -j DROP
  # Allow replies to outbound connections
  $ip6tables_w -C INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 2 -m state --state ESTABLISHED,RELATED -j ACCEPT
  # Allow loopback
  $ip6tables_w -C INPUT -i lo -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 3 -i lo -j ACCEPT
  # Allow all LAN traffic
  $ip6tables_w -C INPUT -i "$lan_interface" -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 4 -i "$lan_interface" -j ACCEPT
  # Allow essential ICMPv6 from WAN only (neighbor discovery, router adverts, PMTU)
  # Type 1: Destination Unreachable (needed for PMTU discovery)
  # Type 2: Packet Too Big (mandatory for PMTU)
  # Type 3: Time Exceeded
  # Type 133: Router Solicitation
  # Type 134: Router Advertisement
  # Type 135: Neighbor Solicitation
  # Type 136: Neighbor Advertisement
  # Block echo-request (type 128) from WAN to prevent ping-based discovery
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type destination-unreachable -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 5 -i "$wan_interface" -p icmpv6 --icmpv6-type destination-unreachable -j ACCEPT
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 6 -i "$wan_interface" -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type time-exceeded -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 7 -i "$wan_interface" -p icmpv6 --icmpv6-type time-exceeded -j ACCEPT
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type router-solicitation -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 8 -i "$wan_interface" -p icmpv6 --icmpv6-type router-solicitation -j ACCEPT
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type router-advertisement -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 9 -i "$wan_interface" -p icmpv6 --icmpv6-type router-advertisement -j ACCEPT
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type neighbour-solicitation -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 10 -i "$wan_interface" -p icmpv6 --icmpv6-type neighbour-solicitation -j ACCEPT
  $ip6tables_w -C INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type neighbour-advertisement -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 11 -i "$wan_interface" -p icmpv6 --icmpv6-type neighbour-advertisement -j ACCEPT
  # Allow DHCPv6 replies from carrier (scoped to WAN interface)
  $ip6tables_w -C INPUT -i "$wan_interface" -p udp --sport 547 --dport 546 -j ACCEPT 2>/dev/null || \
    $ip6tables_w -I INPUT 12 -i "$wan_interface" -p udp --sport 547 --dport 546 -j ACCEPT
  # Drop unsolicited WAN traffic before OEM catch-all ACCEPT rules.
  $ip6tables_w -C INPUT -i "$wan_interface" -j DROP 2>/dev/null || \
    $ip6tables_w -I INPUT 13 -i "$wan_interface" -j DROP
  # Keep the policy strict too when the firmware allows it.
  $ip6tables_w -P INPUT DROP 2>/dev/null || \
    log "Unable to set IPv6 INPUT policy to DROP, relying on explicit WAN DROP rule"
  log "IPv6 INPUT: INVALID dropped, ESTABLISHED + loopback + LAN + ICMPv6 + DHCPv6 allowed, WAN dropped"
}

remove_hardening() {
  log "Removing firewall hardening (reverting to ACCEPT policy)"
  log "WARNING: Device will be exposed to inbound connections from WAN/IPv6!"
  # Revert policies first (safe order: open policy before removing allow rules)
  $iptables_w -P INPUT ACCEPT
  $ip6tables_w -P INPUT ACCEPT
  # Remove IPv4 hardening rules
  $iptables_w -D INPUT -m state --state INVALID -j DROP 2>/dev/null
  $iptables_w -D INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null
  $iptables_w -D INPUT -i lo -j ACCEPT 2>/dev/null
  $iptables_w -D INPUT -i "$lan_interface" -j ACCEPT 2>/dev/null
  $iptables_w -D INPUT -i "$wan_interface" -p udp --sport 67 --dport 68 -j ACCEPT 2>/dev/null
  $iptables_w -D INPUT -i "$wan_interface" -j DROP 2>/dev/null
  # Remove IPv6 hardening rules
  $ip6tables_w -D INPUT -m state --state INVALID -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i lo -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$lan_interface" -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type destination-unreachable -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type packet-too-big -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type time-exceeded -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type router-solicitation -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type router-advertisement -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type neighbour-solicitation -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p icmpv6 --icmpv6-type neighbour-advertisement -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p udp --sport 547 --dport 546 -j ACCEPT 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -j DROP 2>/dev/null
  log "Firewall hardening removed"
}

enable_iptables() {
  if $iptables_w -t nat -L ADGUARD_REDIRECT_DNS >/dev/null 2>&1; then
    log "ADGUARD_REDIRECT_DNS chain already exists, ensuring jump rules are in place"
    # Ensure OUTPUT jump exists
    $iptables_w -t nat -C OUTPUT -j ADGUARD_REDIRECT_DNS 2>/dev/null || \
      $iptables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS
    # Ensure PREROUTING DNAT rules exist
    $iptables_w -t nat -C PREROUTING -i "$lan_interface" -p udp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" 2>/dev/null || \
      $iptables_w -t nat -I PREROUTING -i "$lan_interface" -p udp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port"
    $iptables_w -t nat -C PREROUTING -i "$lan_interface" -p tcp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" 2>/dev/null || \
      $iptables_w -t nat -I PREROUTING -i "$lan_interface" -p tcp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port"
    # Ensure bypass rules for ignore_src_list
    for subnet in $ignore_src_list; do
      if ! validate_ip_or_cidr "$subnet" || ! is_ipv4 "$subnet"; then
        continue
      fi
      $iptables_w -t nat -C PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null || \
        $iptables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT
      $iptables_w -t nat -C PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null || \
        $iptables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT
    done
    return 0
  fi

  log "Trying to create ADGUARD_REDIRECT_DNS chain"
  $iptables_w -t nat -N ADGUARD_REDIRECT_DNS || {
    log "Failed to create ADGUARD_REDIRECT_DNS chain"
    return 1
  }
  log "Created ADGUARD_REDIRECT_DNS chain"

  log "Adding iptables rules, excluding AdGuardHome itself"
  # Keep the owner bypass first in the custom chain, ahead of redirect rules.
  $iptables_w -t nat -A ADGUARD_REDIRECT_DNS -m owner --uid-owner "$adg_user" --gid-owner "$adg_group" -j RETURN || {
    log "Failed to add iptables rules"
    return 1
  }
  log "Added iptables rules"

  for subnet in $ignore_dest_list; do
    if ! validate_ip_or_cidr "$subnet" || ! is_ipv4 "$subnet"; then
      log "INVALID destination skipped (bad format or not IPv4): $subnet"
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
    if ! validate_ip_or_cidr "$subnet" || ! is_ipv4 "$subnet"; then
      log "INVALID source skipped (bad format or not IPv4): $subnet"
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
    log "Failed to apply PREROUTING udp DNAT rule, rolling back OUTPUT hook"
    $iptables_w -t nat -D OUTPUT -j ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -F ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -X ADGUARD_REDIRECT_DNS 2>/dev/null
    return 1
  }
  log "Applied PREROUTING udp DNAT rule"

  $iptables_w -t nat -I PREROUTING -i "$lan_interface" -p tcp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" || {
    log "Failed to apply PREROUTING tcp DNAT rule, rolling back"
    $iptables_w -t nat -D PREROUTING -i "$lan_interface" -p udp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" 2>/dev/null
    $iptables_w -t nat -D OUTPUT -j ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -F ADGUARD_REDIRECT_DNS 2>/dev/null
    $iptables_w -t nat -X ADGUARD_REDIRECT_DNS 2>/dev/null
    return 1
  }
  log "Applied PREROUTING tcp DNAT rule"

  # Insert bypass rules AFTER DNAT so they end up above DNAT (higher priority with -I)
  for subnet in $ignore_src_list; do
    if ! validate_ip_or_cidr "$subnet" || ! is_ipv4 "$subnet"; then
      continue
    fi
    log "Adding PREROUTING bypass for source: $subnet"
    $iptables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT
    $iptables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT
  done

}

# Separate function for WAN-specific port blocking (only needed when hardening is OFF)
# When hardening is ON, policy DROP already blocks everything from WAN.
apply_wan_firewall() {
  log "Adding WAN firewall rules to block external access on interface: $wan_interface"
  # Use -C to check first (idempotent — safe to call on re-runs)
  $iptables_w -C INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null || \
    $iptables_w -I INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP
  $iptables_w -C INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null || \
    $iptables_w -I INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP
  $iptables_w -C INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null || \
    $iptables_w -I INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP
  # Also block on IPv6 WAN
  $ip6tables_w -C INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null || \
    $ip6tables_w -I INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP
  $ip6tables_w -C INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null || \
    $ip6tables_w -I INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP
  $ip6tables_w -C INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null || \
    $ip6tables_w -I INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP
  log "Applied WAN firewall rules (IPv4 + IPv6)"
}

# Block DNS bypass methods (port 853 for DoT, alternate DNS ports)
# Uses FORWARD chain to block client egress traffic to external DoT/DNS servers
block_dns_bypass_methods() {
  log "Blocking DNS bypass methods on LAN (DoT port 853, alt DNS ports via FORWARD)"
  # Block DoT (DNS-over-TLS) on port 853 for WiFi clients trying to bypass AGH
  # Use FORWARD chain so it blocks client->WAN traffic, not just loopback
  $iptables_w -C FORWARD -i "$lan_interface" -p tcp --dport 853 -j DROP 2>/dev/null || \
    $iptables_w -I FORWARD -i "$lan_interface" -p tcp --dport 853 -j DROP
  $iptables_w -C FORWARD -i "$lan_interface" -p udp --dport 853 -j DROP 2>/dev/null || \
    $iptables_w -I FORWARD -i "$lan_interface" -p udp --dport 853 -j DROP
  # Block alternate DNS ports (5053, 5054, 5055, 9053)
  for port in 5053 5054 5055 9053; do
    $iptables_w -C FORWARD -i "$lan_interface" -p tcp --dport "$port" -j DROP 2>/dev/null || \
      $iptables_w -I FORWARD -i "$lan_interface" -p tcp --dport "$port" -j DROP
    $iptables_w -C FORWARD -i "$lan_interface" -p udp --dport "$port" -j DROP 2>/dev/null || \
      $iptables_w -I FORWARD -i "$lan_interface" -p udp --dport "$port" -j DROP
  done
  # Also block on IPv6
  $ip6tables_w -C FORWARD -i "$lan_interface" -p tcp --dport 853 -j DROP 2>/dev/null || \
    $ip6tables_w -I FORWARD -i "$lan_interface" -p tcp --dport 853 -j DROP
  $ip6tables_w -C FORWARD -i "$lan_interface" -p udp --dport 853 -j DROP 2>/dev/null || \
    $ip6tables_w -I FORWARD -i "$lan_interface" -p udp --dport 853 -j DROP
  for port in 5053 5054 5055 9053; do
    $ip6tables_w -C FORWARD -i "$lan_interface" -p tcp --dport "$port" -j DROP 2>/dev/null || \
      $ip6tables_w -I FORWARD -i "$lan_interface" -p tcp --dport "$port" -j DROP
    $ip6tables_w -C FORWARD -i "$lan_interface" -p udp --dport "$port" -j DROP 2>/dev/null || \
      $ip6tables_w -I FORWARD -i "$lan_interface" -p udp --dport "$port" -j DROP
  done
  log "Blocked DNS bypass methods (port 853 DoT + alternate ports via FORWARD)"
}

# Unblock DNS bypass methods
unblock_dns_bypass_methods() {
  log "Removing DNS bypass blocking"
  # Remove DoT blocking from FORWARD chain (port 853)
  $iptables_w -D FORWARD -i "$lan_interface" -p tcp --dport 853 -j DROP 2>/dev/null
  $iptables_w -D FORWARD -i "$lan_interface" -p udp --dport 853 -j DROP 2>/dev/null
  # Remove alternate DNS port blocking from FORWARD
  for port in 5053 5054 5055 9053; do
    $iptables_w -D FORWARD -i "$lan_interface" -p tcp --dport "$port" -j DROP 2>/dev/null
    $iptables_w -D FORWARD -i "$lan_interface" -p udp --dport "$port" -j DROP 2>/dev/null
  done
  # Remove IPv6 blocking from FORWARD
  $ip6tables_w -D FORWARD -i "$lan_interface" -p tcp --dport 853 -j DROP 2>/dev/null
  $ip6tables_w -D FORWARD -i "$lan_interface" -p udp --dport 853 -j DROP 2>/dev/null
  for port in 5053 5054 5055 9053; do
    $ip6tables_w -D FORWARD -i "$lan_interface" -p tcp --dport "$port" -j DROP 2>/dev/null
    $ip6tables_w -D FORWARD -i "$lan_interface" -p udp --dport "$port" -j DROP 2>/dev/null
  done
  log "Removed DNS bypass blocking"
}

disable_iptables() {
  # Always clean up WAN firewall rules (they exist independently of the NAT chain)
  log "Removing WAN firewall rules"
  $iptables_w -D INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null
  $iptables_w -D INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null
  $iptables_w -D INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p udp --dport "$redir_port" -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p tcp --dport "$redir_port" -j DROP 2>/dev/null
  $ip6tables_w -D INPUT -i "$wan_interface" -p tcp --dport 3000 -j DROP 2>/dev/null
  log "Removed WAN firewall rules (IPv4 + IPv6)"

  # Always attempt PREROUTING cleanup (these can exist even if chain was manually removed)
  log "Deleting PREROUTING DNAT rules"
  $iptables_w -t nat -D PREROUTING -i "$lan_interface" -p udp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" 2>/dev/null
  $iptables_w -t nat -D PREROUTING -i "$lan_interface" -p tcp --dport 53 -j DNAT --to-destination "$router_ip":"$redir_port" 2>/dev/null
  for subnet in $ignore_src_list; do
    $iptables_w -t nat -D PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
    $iptables_w -t nat -D PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
  log "Deleted PREROUTING DNAT rules"

  if ! $iptables_w -t nat -L ADGUARD_REDIRECT_DNS >/dev/null 2>&1; then
    log "ADGUARD_REDIRECT_DNS chain does not exist, skipping chain deletion"
    return 0
  fi

  log "Deleting iptables OUTPUT rules"
  $iptables_w -t nat -D OUTPUT -j ADGUARD_REDIRECT_DNS || {
    log "Failed to delete iptables OUTPUT rules"
  }
  log "Deleted iptables OUTPUT rules"

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
      log "ADGUARD_REDIRECT_DNS6 chain already exists, ensuring jump rules are in place"
      # Ensure OUTPUT jump exists
      $ip6tables_w -t nat -C OUTPUT -j ADGUARD_REDIRECT_DNS6 2>/dev/null || \
        $ip6tables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS6
      # Ensure PREROUTING rules exist
      $ip6tables_w -t nat -C PREROUTING -i "$lan_interface" -p udp --dport 53 -j REDIRECT --to-ports "$redir_port" 2>/dev/null || \
        $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -p udp --dport 53 -j REDIRECT --to-ports "$redir_port"
      $ip6tables_w -t nat -C PREROUTING -i "$lan_interface" -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port" 2>/dev/null || \
        $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port"
      # Ensure PREROUTING bypass rules for ignore_src_list
      for subnet in $ignore_src_list; do
        if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
          continue
        fi
        $ip6tables_w -t nat -C PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null || \
          $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT
        $ip6tables_w -t nat -C PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null || \
          $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT
      done
      return 0
    fi

    log "Creating ADGUARD_REDIRECT_DNS6 chain"
    $ip6tables_w -t nat -N ADGUARD_REDIRECT_DNS6 || {
      log "Failed to create ADGUARD_REDIRECT_DNS6 chain"
      return 1
    }

    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -m owner --uid-owner "$adg_user" --gid-owner "$adg_group" -j RETURN

    # Apply ignore_dest_list bypasses for IPv6
    for subnet in $ignore_dest_list; do
      if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
        continue
      fi
      $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -d "$subnet" -j RETURN
    done

    # Apply ignore_src_list bypasses for IPv6
    for subnet in $ignore_src_list; do
      if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
        continue
      fi
      $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -s "$subnet" -j RETURN
    done

    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -p udp --dport 53 -j REDIRECT --to-ports "$redir_port"
    $ip6tables_w -t nat -A ADGUARD_REDIRECT_DNS6 -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port"
    $ip6tables_w -t nat -I OUTPUT -j ADGUARD_REDIRECT_DNS6
    $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -p udp --dport 53 -j REDIRECT --to-ports "$redir_port"
    $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port"
    # Insert PREROUTING bypass rules for ignore_src_list (above REDIRECT rules)
    for subnet in $ignore_src_list; do
      if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
        continue
      fi
      log "Adding IPv6 PREROUTING bypass for source: $subnet"
      $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT
      $ip6tables_w -t nat -I PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT
    done
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
    if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
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
    $ip6tables_w -t nat -D PREROUTING -i "$lan_interface" -p udp --dport 53 -j REDIRECT --to-ports "$redir_port" 2>/dev/null
    $ip6tables_w -t nat -D PREROUTING -i "$lan_interface" -p tcp --dport 53 -j REDIRECT --to-ports "$redir_port" 2>/dev/null
    # Clean up PREROUTING bypass rules for ignore_src_list
    for subnet in $ignore_src_list; do
      $ip6tables_w -t nat -D PREROUTING -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
      $ip6tables_w -t nat -D PREROUTING -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
    done
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
    log "ADGUARD_BLOCK_DNS chain already exists, ensuring hooks are in place"
    # Ensure OUTPUT hook exists
    $ip6tables_w -t filter -C OUTPUT -j ADGUARD_BLOCK_DNS 2>/dev/null || \
      $ip6tables_w -t filter -I OUTPUT -j ADGUARD_BLOCK_DNS
    # Ensure FORWARD rules exist
    $ip6tables_w -t filter -C FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP 2>/dev/null || \
      $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP
    $ip6tables_w -t filter -C FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP 2>/dev/null || \
      $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP
    # Ensure FORWARD bypass rules for ignore_src_list
    for subnet in $ignore_src_list; do
      if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
        continue
      fi
      $ip6tables_w -t filter -C FORWARD -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null || \
        $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT
      $ip6tables_w -t filter -C FORWARD -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null || \
        $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT
    done
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
  # Apply ignore_src_list bypass for FORWARD (so bypassed clients aren't blocked)
  for subnet in $ignore_src_list; do
    if ! validate_ip_or_cidr "$subnet" || is_ipv4 "$subnet"; then
      continue
    fi
    log "Adding IPv6 FORWARD block bypass for source: $subnet"
    $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
    $ip6tables_w -t filter -I FORWARD -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
  log "Applied IPv6 FORWARD DNS block rules"
}

del_block_ipv6_dns() {
  # Always clean up FORWARD rules (they exist independently of the chain)
  log "Cleaning up IPv6 FORWARD DNS block rules"
  $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -p udp --dport 53 -j DROP 2>/dev/null
  $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -p tcp --dport 53 -j DROP 2>/dev/null
  # Clean up FORWARD bypass rules for ignore_src_list
  for subnet in $ignore_src_list; do
    $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -s "$subnet" -p udp --dport 53 -j ACCEPT 2>/dev/null
    $ip6tables_w -t filter -D FORWARD -i "$lan_interface" -s "$subnet" -p tcp --dport 53 -j ACCEPT 2>/dev/null
  done
  log "Cleaned up IPv6 FORWARD DNS block rules"

  if ! $ip6tables_w -t filter -L ADGUARD_BLOCK_DNS >/dev/null 2>&1; then
    log "ADGUARD_BLOCK_DNS chain does not exist, skipping chain deletion"
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
}

case "$1" in
enable)
  if [ "$enable_firewall_hardening" = true ]; then
    harden_firewall || {
      log "Failed to apply firewall hardening"
      exit 1
    }
    verify_firewall_hardening || {
      log "Firewall hardening verification failed"
      exit 1
    }
  else
    # Without hardening, apply targeted WAN blocks for AGH ports
    apply_wan_firewall
  fi

  # Block DNS bypass methods (DoT, alternate DNS ports) - only if iptables enabled
  if [ "$enable_iptables" = true ]; then
    block_dns_bypass_methods
  fi

  if [ "$enable_iptables" = false ]; then
    log "enable_iptables is disabled in settings, skipping DNS redirect rules"
  else
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
  fi
  ;;
disable)
  disable_failed=0
  log "Disabling iptables"
  disable_iptables || {
    log "Failed to disable iptables"
    disable_failed=1
  }
  if [ "$disable_failed" -eq 0 ]; then
    log "Disabled iptables"
  fi
  # Always attempt IPv6 cleanup regardless of current settings,
  # in case settings were changed between enable and disable
  log "Cleaning up ipv6 DNS blocking (if active)"
  del_block_ipv6_dns || disable_failed=1
  log "Cleaning up IPv6 DNS redirect (if active)"
  disable_ipv6_iptables || disable_failed=1
  # Remove DNS bypass blocking
  unblock_dns_bypass_methods || disable_failed=1
  if [ "$disable_failed" -ne 0 ]; then
    exit 1
  fi
  # NOTE: Hardening is NOT removed on disable for security.
  # The device stays protected even when AGH is stopped.
  # Use 'unharden' to explicitly remove if needed.
  ;;
unharden)
  remove_hardening
  ;;
*)
  echo "Usage: $0 {enable|disable|unharden}"
  exit 1
  ;;
esac
