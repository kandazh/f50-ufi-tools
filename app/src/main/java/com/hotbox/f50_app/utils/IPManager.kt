package com.hotbox.f50_app.utils

object IPManager {
    /**
     * Get current WiFi IPv4 gateway address
     * @param context Application context
     * @return Gateway address (192.168.0.1), null on failure
     */
    fun getHotspotGatewayIp(setPort:String?): String? {
        try {
            val process = Runtime.getRuntime().exec("ip route")
            val output = process.inputStream.bufferedReader().use { it.readText() }
            process.destroy()

            val regex = Regex("""([0-9.]+/\d+)\s+dev\s+(\w+)\s+.*src\s+([0-9.]+)""")

            regex.findAll(output).forEach { match ->
                val iface = match.groupValues[2]
                val ip = match.groupValues[3]

                // Filter interfaces unlikely to be hotspot
                if (iface.startsWith("br") || iface.startsWith("ap")) {
                    HotboxLog.d("UFI_TOOLS_LOG", "IPManager got hotspot IP: $ip:$setPort")
                    if(setPort != null){
                        return "$ip:$setPort" // Found hotspot gateway IP
                    }
                    return ip // Found hotspot gateway IP
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }
}