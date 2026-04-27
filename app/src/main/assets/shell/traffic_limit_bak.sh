#!/system/bin/sh

IFACE="br0"  # 设备
BASE_CLASSID="10"

ensure_tc_root() {
  tc qdisc show dev "$IFACE" | grep -q "htb"
  if [ $? -ne 0 ]; then
    echo "[+] init root qdisc..."
    tc qdisc add dev "$IFACE" root handle 1: htb default 9999
    tc class add dev "$IFACE" parent 1: classid 1:1 htb rate 1000mbit ceil 1000mbit
    tc class add dev "$IFACE" parent 1:1 classid 1:9999 htb rate 1000mbit ceil 1000mbit
  fi
}

ip_to_classid() {
  ip="$1"
  last_byte=$(echo "$ip" | awk -F. '{print $4}')
  classid=$(printf "%x" $((BASE_CLASSID + last_byte)))
  echo "1:$classid"
}

add_limit() {
  ip="$1"
  downlimit="$2"  # 实际上限制上传 = 控制下载

  ensure_tc_root

  classid=$(ip_to_classid "$ip")
  echo "[+] set $ip download speed (br0 tx) limit: ${downlimit}kbps"

  iptables -t mangle -A POSTROUTING -d "$ip" -j MARK --set-mark 100
  tc class add dev "$IFACE" parent 1:1 classid "$classid" htb rate "${downlimit}kbit" ceil "${downlimit}kbit"
  tc filter add dev "$IFACE" parent 1: protocol ip handle 100 fw flowid "$classid"
}

show_limit() {
  ip="$1"
  classid=$(ip_to_classid "$ip")

  echo "=== $ip traffic limit status ==="
  iptables -t mangle -L POSTROUTING -n | grep "$ip"
  tc class show dev "$IFACE" | grep "$classid"
  tc filter show dev "$IFACE" | grep "$classid"
}

release_limit() {
  ip="$1"
  classid=$(ip_to_classid "$ip")

  echo "[+] release $ip traffic limit..."

  # 清除 iptables mark 规则
  iptables -t mangle -D POSTROUTING -d "$ip" -j MARK --set-mark 100 2>/dev/null

  # 更强力地清除 tc filter 和 class
  tc filter del dev "$IFACE" parent 1: protocol ip handle 100 fw 2>/dev/null
  tc class del dev "$IFACE" classid "$classid" 2>/dev/null
}

# ========= 参数解析 =========
if [ "$1" = "--limit" ]; then
  if [ "$#" -eq 2 ]; then
    show_limit "$2"
  elif [ "$#" -eq 3 ]; then
    add_limit "$2" "$3"
  else
    echo "usage:"
    echo "  $0 --limit <ip> <download_kbps>"
    echo "  $0 --limit <ip>"
  fi
elif [ "$1" = "--release" ]; then
  if [ "$#" -eq 2 ]; then
    release_limit "$2"
  else
    echo "usage: $0 --release <ip>"
  fi
else
  echo "usage:"
  echo "  $0 --limit <ip> <download_kbps>"
  echo "  $0 --limit <ip>"
  echo "  $0 --release <ip>"
fi