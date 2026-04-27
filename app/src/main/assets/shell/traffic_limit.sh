#!/system/bin/sh

IFACE="br0"
TC="tc" # 某些设备可能需改为 "/system/bin/tc"

json_output() {
  echo "$1" | tr -d '\n'
}

add_global_limit() {
  mbit="$1"

  if [ -z "$mbit" ] || ! echo "$mbit" | grep -qE '^[0-9]+$'; then
    json_output '{"done":false,"error":"Invalid limit value"}'
    return
  fi

  # 删除旧 qdisc
  $TC qdisc del dev "$IFACE" root 2>/dev/null

  # 添加 root qdisc
  if ! $TC qdisc add dev "$IFACE" root handle 1: htb default 10; then
    json_output '{"done":false,"error":"Failed to add root qdisc"}'
    return
  fi

  # 添加父类（限速）
  if ! $TC class add dev "$IFACE" parent 1: classid 1:1 htb rate "${mbit}mbit" ceil "${mbit}mbit"; then
    json_output '{"done":false,"error":"Failed to add parent class"}'
    return
  fi

  # 默认 class（大带宽，不限速）
  $TC class add dev "$IFACE" parent 1:1 classid 1:9999 htb rate 10000mbit ceil 10000mbit 2>/dev/null

  # 限速 class（我们设置默认用这个）
  if ! $TC class add dev "$IFACE" parent 1:1 classid 1:10 htb rate "${mbit}mbit" ceil "${mbit}mbit"; then
    json_output '{"done":false,"error":"Failed to add limit class"}'
    return
  fi

  json_output "{\"done\":true,\"mbit\":${mbit}}"
}

show_global_limit() {
  LIMIT_INFO=$($TC class show dev "$IFACE" | grep "1:10" | grep -o "rate [0-9]\+mbit" | awk '{print $2}')
  if [ -n "$LIMIT_INFO" ]; then
    json_output "{\"done\":true,\"enabled\":true,\"speed_mbit\":\"${LIMIT_INFO}\"}"
  else
    json_output '{"done":true,"enabled":false,"speed_mbit":"0"}'
  fi
}

release_global_limit() {
  $TC qdisc del dev "$IFACE" root 2>/dev/null
  json_output '{"done":true,"released":true}'
}

# 命令解析
case "$1" in
  --limit)
    if [ "$#" -eq 2 ]; then
      add_global_limit "$2"
    elif [ "$#" -eq 1 ]; then
      show_global_limit
    else
      json_output '{"done":false,"error":"Invalid usage of --limit"}'
    fi
    ;;
  --release)
    release_global_limit
    ;;
  *)
    json_output '{"done":false,"error":"Unknown command"}'
    ;;
esac