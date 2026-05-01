#!/system/bin/sh
# Read highest thermal zone temperature in millidegrees
if [ -d /sys/class/thermal ]; then
    awk '{print $1}' /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -nr | head -n1
else
    echo "-1"
fi