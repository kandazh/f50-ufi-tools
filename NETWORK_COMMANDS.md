# Network & iptables Commands (Android / ttyd)

## Accessing Root Shell on Device

### Option 1: ttyd (Web Terminal)
- Browse to `http://192.168.0.1:1146` — already has root access

### Option 2: Hotbox App API (from code/scripts)
```sh
# Auth: SHA256("admin") as authorization header
# Endpoint: POST http://192.168.0.1:2333/api/root_shell
# Body: { "command": "your command here", "timeout": 10000 }
```

### Option 3: Via VS Code Browser (page.evaluate)
```javascript
// Login first (page must be http://192.168.0.1:2333/)
await page.evaluate(async () => {
  const token = SHA256("admin").toLowerCase();  // app's own SHA256 function
  HOTBOX_TOKEN = token;
  common_headers.authorization = token;
  localStorage.setItem('hotbox_sms_token', token);
});

// Then run commands
await page.evaluate(async () => {
  const res = await runShellWithRoot('iptables -t nat -L -nv --line-numbers');
  return res;  // { success: true, content: "..." }
});
```

### Option 4: ADB (non-root, limited)
```powershell
adb -s 192.168.0.1:5555 shell  # WiFi ADB — no root, can't run iptables
```

### Notes
- ADB shell does NOT have root — can't run iptables/ss/etc.
- Samba preexec (`samba_exec.sh`) runs as root but requires SMB access trigger
- The hotbox app's socat socket: `/data/data/com.hotbox.f50_app/files/hotbox_root_shell.sock`
- crypto.subtle doesn't work on HTTP (non-HTTPS), use the app's global `SHA256()` function

---

## iptables / ip6tables

```sh
# NAT table (DNS redirect rules)
iptables -t nat -L -nv --line-numbers
ip6tables -t nat -L -nv --line-numbers

# Filter INPUT (firewall hardening)
iptables -t filter -L INPUT -nv --line-numbers
ip6tables -t filter -L INPUT -nv --line-numbers

# Filter FORWARD (DNS bypass blocking)
iptables -t filter -L FORWARD -nv --line-numbers
ip6tables -t filter -L FORWARD -nv --line-numbers

# Specific chain only
iptables -t nat -L ADGUARD_REDIRECT_DNS -nv --line-numbers

# Check if a specific rule exists (-C returns 0 if exists)
iptables -C INPUT -i sipa_eth0 -j DROP
```

## Listening ports

```sh
# TCP listening
ss -tlnp

# UDP listening
ss -ulnp

# All connections (established + listening)
ss -tunap
```

## Interfaces & routing

```sh
# All interfaces
ip link show

# Interface IPs
ip addr show

# IPv4 routes
ip route show
ip route show table all | grep default

# IPv6 routes
ip -6 route show

# WAN interface specifically
ip addr show sipa_eth0
```

## DNS testing

```sh
# Active DNS connections (conntrack)
cat /proc/net/nf_conntrack | grep "dport=53"

# Check AGH is responding (if curl available)
curl -s http://127.0.0.1:3000/control/status
```

## Processes & sockets

```sh
# What's running
ps -ef | grep -E "AdGuard|smbd|ttyd|iperf|dnsmasq"

# Who owns a port
ss -tlnp | grep :8858
```

## Conntrack (active connections)

```sh
# All tracked connections
cat /proc/net/nf_conntrack | wc -l

# DNS connections specifically
cat /proc/net/nf_conntrack | grep "dport=53"

# Connections to a specific IP
cat /proc/net/nf_conntrack | grep "dst=1.1.1.1"

# Connection count by state
cat /proc/net/nf_conntrack | awk '{print $4}' | sort | uniq -c | sort -rn
```

## Bandwidth & traffic

```sh
# Live bytes per interface
cat /proc/net/dev

# Traffic on WAN (bytes rx/tx)
cat /sys/class/net/sipa_eth0/statistics/rx_bytes
cat /sys/class/net/sipa_eth0/statistics/tx_bytes

# iperf3 test (server already running on :5201)
# From a client: iperf3 -c 192.168.0.1
```

## ARP & neighbors

```sh
# ARP table (who's on LAN)
ip neigh show

# Only reachable neighbors
ip neigh show | grep REACHABLE

# IPv6 neighbors
ip -6 neigh show
```

## Network namespaces & policy routing

```sh
# All routing tables
ip rule show

# Specific table routes
ip route show table sipa_eth0
ip route show table main

# MTU check (important for carrier)
ip link show sipa_eth0 | grep mtu
```

## Firewall packet counters (useful to see what's being hit)

```sh
# Reset counters then watch
iptables -t nat -Z    # zero counters
iptables -t filter -Z
# ... wait, then check again with -v to see new hits
iptables -t nat -L PREROUTING -nv
```

## Debugging connectivity issues

```sh
# Check if AGH is resolving
echo "test" | nc -u -w2 127.0.0.1 8858  # UDP to AGH DNS port

# Trace where packets go (if traceroute available)
ip route get 8.8.8.8

# Check for dropped packets
iptables -t filter -L -nv | grep -i drop

# Kernel network stats (errors, drops)
cat /proc/net/snmp | grep -E "^(Ip|Tcp|Udp)"
netstat -s 2>/dev/null | head -40

# Check DNS upstream connectivity (AGH uses DoT on 853)
cat /proc/net/nf_conntrack | grep "dport=853"
```

## Quick health check (run all at once)

```sh
echo "=== AGH STATUS ==="; ps -ef | grep AdGuard | grep -v grep; \
echo "=== LISTENING ==="; ss -tlnp | grep -E "8858|3000|53"; \
echo "=== WAN IP ==="; ip addr show sipa_eth0 | grep inet; \
echo "=== DNS DNAT HITS ==="; iptables -t nat -L PREROUTING -nv | grep "dpt:53"; \
echo "=== DROPPED ON WAN ==="; iptables -L INPUT -nv | grep "sipa_eth0.*DROP"
```
