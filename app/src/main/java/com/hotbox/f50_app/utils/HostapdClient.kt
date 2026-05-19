package com.hotbox.f50_app.utils

import java.io.File
import java.util.concurrent.atomic.AtomicInteger

/**
 * Communicates with hostapd via its Unix DGRAM control socket (through root shell + socat)
 * to retrieve per-station (per-client) WiFi information like
 * signal strength (RSSI) and TX/RX link speeds.
 *
 * The app runs as uid 10099 but the hostapd socket is owned by wifi:wifi (770),
 * so we must use the root shell daemon to execute socat as root.
 */
object HostapdClient {
    private const val TAG = "UFI_TOOLS_LOG"
    private const val HOSTAPD_CTRL_PATH = "/data/vendor/wifi/hostapd/ctrl/wlan0"
    private const val SOCAT_PATH = "/data/data/com.hotbox.f50_app/files/socat"
    private const val TMP_SOCK_PREFIX = "/data/local/tmp/hotbox_hapd_"
    private val counter = AtomicInteger(0)

    // Must be set before use (set from the module that has context)
    var rootShellSocketPath: String = ""

    data class StationInfo(
        val macAddress: String,
        val signal: Int? = null,         // RSSI in dBm
        val txBitrate: Int? = null,      // TX bitrate in Mbps
        val rxBitrate: Int? = null,      // RX bitrate in Mbps
        val txBytes: Long? = null,
        val rxBytes: Long? = null,
        val txPackets: Long? = null,
        val rxPackets: Long? = null,
        val connectedTime: Long? = null, // seconds
    )

    /**
     * Query all connected stations from hostapd.
     * Returns list of StationInfo or empty list if unavailable.
     */
    fun getAllStations(): List<StationInfo> {
        var stations = mutableListOf<StationInfo>()
        if (rootShellSocketPath.isEmpty()) {
            HotboxLog.d(TAG, "hostapd: rootShellSocketPath not set")
            return stations
        }
        if (!File(rootShellSocketPath).exists()) {
            HotboxLog.d(TAG, "hostapd: root shell socket not found at $rootShellSocketPath")
            return stations
        }

        try {
            // Try STA-FIRST / STA-NEXT iteration
            val firstResponse = sendCommand("STA-FIRST")
            if (firstResponse.isNullOrBlank() || firstResponse.startsWith("FAIL")) {
                HotboxLog.d(TAG, "hostapd STA-FIRST failed: ${firstResponse?.take(80)}")
                return stations
            }

            // Parse first station
            val first = parseStationResponse(firstResponse)
            if (first != null) {
                stations.add(first)
                // Iterate remaining stations
                var currentMac = first.macAddress
                var maxIter = 20 // safety limit
                while (maxIter-- > 0) {
                    val nextResponse = sendCommand("STA-NEXT $currentMac")
                    if (nextResponse.isNullOrBlank() || nextResponse.startsWith("FAIL")) break
                    val next = parseStationResponse(nextResponse)
                    if (next == null || next.macAddress == currentMac) break
                    stations.add(next)
                    currentMac = next.macAddress
                }
            }
        } catch (e: Exception) {
            HotboxLog.d(TAG, "hostapd getAllStations error: ${e.message}")
        }

        // Supplement missing signal/tx_bitrate from iw station dump (kernel-level data)
        if (stations.isNotEmpty() && stations.any { it.signal == null || it.txBitrate == null }) {
            try {
                val iwData = getIwStationDump()
                if (iwData.isNotEmpty()) {
                    stations = stations.map { sta ->
                        val iw = iwData[sta.macAddress]
                        if (iw != null) {
                            sta.copy(
                                signal = sta.signal ?: iw.signal,
                                txBitrate = sta.txBitrate ?: iw.txBitrate,
                                rxBitrate = sta.rxBitrate ?: iw.rxBitrate
                            )
                        } else sta
                    }.toMutableList()
                }
            } catch (e: Exception) {
                HotboxLog.d(TAG, "iw station dump fallback error: ${e.message}")
            }
        }

        return stations
    }

    /**
     * Parse `iw dev wlan0 station dump` output for per-client signal and tx bitrate.
     * Returns map of mac -> StationInfo (only signal/txBitrate/rxBitrate populated).
     */
    private fun getIwStationDump(): Map<String, StationInfo> {
        if (rootShellSocketPath.isEmpty()) return emptyMap()
        val output = RootShell.sendCommandToSocket("iw dev wlan0 station dump", rootShellSocketPath, 5000)
            ?: return emptyMap()

        val result = mutableMapOf<String, StationInfo>()
        var currentMac: String? = null
        var signal: Int? = null
        var txBitrate: Int? = null
        var rxBitrate: Int? = null

        for (line in output.lines()) {
            val stationMatch = Regex("Station\\s+([0-9a-fA-F:]{17})").find(line)
            if (stationMatch != null) {
                // Save previous station
                if (currentMac != null) {
                    result[currentMac] = StationInfo(currentMac, signal = signal, txBitrate = txBitrate, rxBitrate = rxBitrate)
                }
                currentMac = stationMatch.groupValues[1].lowercase()
                signal = null
                txBitrate = null
                rxBitrate = null
            } else if (currentMac != null) {
                val trimmed = line.trim()
                if (trimmed.startsWith("signal:")) {
                    signal = Regex("-?\\d+").find(trimmed)?.value?.toIntOrNull()
                } else if (trimmed.startsWith("tx bitrate:")) {
                    txBitrate = Regex("([\\d.]+)\\s*MBit/s").find(trimmed)?.groupValues?.get(1)?.toDoubleOrNull()?.toInt()
                } else if (trimmed.startsWith("rx bitrate:")) {
                    rxBitrate = Regex("([\\d.]+)\\s*MBit/s").find(trimmed)?.groupValues?.get(1)?.toDoubleOrNull()?.toInt()
                }
            }
        }
        // Save last station
        if (currentMac != null) {
            result[currentMac] = StationInfo(currentMac, signal = signal, txBitrate = txBitrate, rxBitrate = rxBitrate)
        }
        return result
    }

    /**
     * Send a command to hostapd control interface via root shell + socat.
     */
    private fun sendCommand(command: String): String? {
        val sockId = "${android.os.Process.myPid()}_${counter.getAndIncrement()}"
        val tmpSock = "$TMP_SOCK_PREFIX$sockId"
        // Use socat to send DGRAM to hostapd and receive reply
        val shellCmd = "rm -f $tmpSock; echo -n '$command' | $SOCAT_PATH -t2 - UNIX-SENDTO:$HOSTAPD_CTRL_PATH,bind=$tmpSock; rm -f $tmpSock"

        return try {
            val result = RootShell.sendCommandToSocket(shellCmd, rootShellSocketPath, 5000)
            if (result.isNullOrBlank()) {
                HotboxLog.d(TAG, "hostapd sendCommand('$command') got null/blank")
                null
            } else {
                result
            }
        } catch (e: Exception) {
            HotboxLog.d(TAG, "hostapd sendCommand('$command') error: ${e.message}")
            null
        }
    }

    /**
     * Parse response from STA-FIRST or STA-NEXT command.
     * Format:
     * <mac_address>\n
     * key=value\n
     * ...
     */
    private fun parseStationResponse(response: String): StationInfo? {
        val lines = response.trim().lines()
        if (lines.isEmpty()) return null

        val mac = lines[0].trim()
        if (!mac.matches(Regex("[0-9a-fA-F:]{17}"))) return null

        var signal: Int? = null
        var txBitrate: Int? = null
        var rxBitrate: Int? = null
        var txBytes: Long? = null
        var rxBytes: Long? = null
        var txPackets: Long? = null
        var rxPackets: Long? = null
        var connectedTime: Long? = null

        for (line in lines.drop(1)) {
            val parts = line.split("=", limit = 2)
            if (parts.size != 2) continue
            val key = parts[0].trim()
            val value = parts[1].trim()

            when (key) {
                "signal" -> {
                    val v = value.toIntOrNull()
                    // hostapd reports 0 when driver doesn't provide signal
                    if (v != null && v != 0) signal = v
                }
                "tx_rate_info", "tx_bitrate" -> txBitrate = parseRateInfo(value)
                "rx_rate_info", "rx_bitrate" -> rxBitrate = parseRateInfo(value)
                "tx_bytes" -> txBytes = value.toLongOrNull()
                "rx_bytes" -> rxBytes = value.toLongOrNull()
                "tx_packets" -> txPackets = value.toLongOrNull()
                "rx_packets" -> rxPackets = value.toLongOrNull()
                "connected_time" -> connectedTime = value.toLongOrNull()
            }
        }

        return StationInfo(
            macAddress = mac.lowercase(),
            signal = signal,
            txBitrate = txBitrate,
            rxBitrate = rxBitrate,
            txBytes = txBytes,
            rxBytes = rxBytes,
            txPackets = txPackets,
            rxPackets = rxPackets,
            connectedTime = connectedTime,
        )
    }

    /**
     * Parse rate info from hostapd.
     * Formats seen:
     *   "8667 vhtmcs 9 vhtnss 2 shortGI" → first number is 100kbps units (8667 = 866.7 Mbps)
     *   "780.0 MBit/s" → direct Mbps
     *   "0" → 0 (no rate available)
     * Returns value in Mbps (integer), or null if 0/unavailable.
     */
    private fun parseRateInfo(value: String): Int? {
        if (value == "0") return null

        // Try "XXX.X MBit/s" format first
        val mbitMatch = Regex("([\\d.]+)\\s*MBit/s").find(value)
        if (mbitMatch != null) {
            return mbitMatch.groupValues[1].toDoubleOrNull()?.toInt()
        }

        // First token is numeric (100kbps units): "8667 vhtmcs 9 ..."
        val firstToken = value.split(" ").firstOrNull() ?: return null
        val numeric = firstToken.toLongOrNull()
        if (numeric != null && numeric > 0) return (numeric / 10).toInt() // 100kbps → Mbps

        return null
    }
}
