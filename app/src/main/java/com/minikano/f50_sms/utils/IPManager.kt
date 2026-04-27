package com.minikano.f50_sms.utils

object IPManager {
    /**
     * 获取当前 WiFi 连接的 IPv4 网关地址
     * @param context 应用上下文
     * @return 网关地址（192.168.0.1），获取失败返回 null
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

                // 过滤掉不太可能是热点的接口
                if (iface.startsWith("br") || iface.startsWith("ap")) {
                    KanoLog.d("UFI_TOOLS_LOG", "IPManager 获取热点IP：$ip:$setPort")
                    if(setPort != null){
                        return "$ip:$setPort" // 找到热点网关 IP
                    }
                    return ip // 找到热点网关 IP
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }
}