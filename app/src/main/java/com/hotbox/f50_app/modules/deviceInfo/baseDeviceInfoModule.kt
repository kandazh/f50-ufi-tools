package com.hotbox.f50_app.modules.deviceInfo

import android.content.Context
import android.os.StatFs
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.configs.AppMeta.isReadUseTerms
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.modules.PREFS_NAME
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.UniqueDeviceIDManager
import com.hotbox.f50_app.utils.calculateCpuUsage
import com.hotbox.f50_app.utils.getCpuFreqJson
import com.hotbox.f50_app.utils.getMemoryUsage
import com.hotbox.f50_app.utils.readBatteryStatus
import com.hotbox.f50_app.utils.readThermalZones
import com.hotbox.f50_app.utils.readUsbDevices
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.origin
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import androidx.core.content.edit
import com.hotbox.f50_app.utils.readNetConnCount
import io.ktor.server.request.receiveText
import kotlinx.serialization.json.JsonObject
import org.json.JSONArray
import org.json.JSONObject

data class MyStorageInfo(
    val path: String, val totalBytes: Long, val availableBytes: Long
)

@Serializable
private data class BaseDeviceInfoResponse(
    val app_ver: String,
    val app_ver_code: String,
    val build_timestamp: String,
    val model: String,
    val battery: String? = null,
    val daily_data: Long? = null,
    val monthly_data: Long? = null,
    val internal_available_storage: Long? = null,
    val internal_used_storage: Long? = null,
    val internal_total_storage: Long? = null,
    val external_total_storage: Long? = null,
    val external_used_storage: Long? = null,
    val external_available_storage: Long? = null,
    val cpu_temp_list: JsonElement? = null,
    val cpu_temp: Int? = null,
    val client_ip: String? = null,
    val cpu_usage: Double? = null,
    val mem_usage: Double? = null,
    val cpuFreqInfo: JsonElement? = null,
    val cpuUsageInfo: JsonElement? = null,
    val memInfo: JsonElement? = null,
    val current_now: Int? = null,
    val voltage_now: Int? = null,
)

private data class DeviceStorageSnapshot(
    val dailyData: Long? = null,
    val monthlyData: Long? = null,
    val availableSize: Long? = null,
    val usedSize: Long? = null,
    val totalSize: Long? = null,
    val externalTotal: Long? = null,
    val externalUsed: Long? = null,
    val externalAvailable: Long? = null,
    val timestamp: Long,
)

private data class DeviceBatterySnapshot(
    val batteryLevel: Int? = null,
    val currentNow: Int? = null,
    val voltageNow: Int? = null,
    val timestamp: Long,
)

// Cache for frequently polled device metrics (CPU/thermal/memory)
private data class DeviceMetricsCache(
    val cpuTempList: JsonElement?, val cpuTempMax: Int?,
    val cpuFreqInfo: JsonElement?, val cpuUsageInfo: JsonElement?, val memInfo: JsonElement?,
    val cpuUsageRes: Double?, val memUsageRes: Double?,
    val timestamp: Long
)
@Volatile private var metricsCache: DeviceMetricsCache? = null
@Volatile private var storageCache: DeviceStorageSnapshot? = null
@Volatile private var batteryCache: DeviceBatterySnapshot? = null
private const val CACHE_TTL_MS = 3000L // 3 second cache — reduces /proc/sys reads on low-RAM devices

private fun parseJsonElementOrNull(value: String?): JsonElement? {
    if (value.isNullOrBlank()) return null
    return try {
        Json.parseToJsonElement(value)
    } catch (_: Exception) {
        null
    }
}

private fun readStorageSnapshot(context: Context, tag: String, timestamp: Long): DeviceStorageSnapshot {
    return try {
        val internalStorage = context.filesDir
        val statFs = StatFs(internalStorage.absolutePath)
        val totalSize = statFs.blockSizeLong * statFs.blockCountLong
        val availableSize = statFs.blockSizeLong * statFs.availableBlocksLong
        val usedSize = totalSize - availableSize
        val dailyData = HotboxUtils.getCachedTodayUsage(context)
        val monthlyData = HotboxUtils.getCachedMonthlyUsage(context)
        val removableStorageInfo = HotboxUtils.getCachedRemovableStorageInfo(context)
        val externalTotal = removableStorageInfo?.totalBytes ?: 0L
        val externalAvailable = removableStorageInfo?.availableBytes ?: 0L

        DeviceStorageSnapshot(
            dailyData = dailyData,
            monthlyData = monthlyData,
            availableSize = availableSize,
            usedSize = usedSize,
            totalSize = totalSize,
            externalTotal = externalTotal,
            externalUsed = externalTotal - externalAvailable,
            externalAvailable = externalAvailable,
            timestamp = timestamp,
        )
    } catch (e: Exception) {
        HotboxLog.d(tag, "Error getting storage & daily data: ${e.message}")
        DeviceStorageSnapshot(timestamp = timestamp)
    }
}

private suspend fun readBatterySnapshot(context: Context, tag: String, timestamp: Long): DeviceBatterySnapshot {
    return try {
        val batteryLevel = HotboxUtils.getBatteryPercentage(context)
        val batteryStatus = try {
            readBatteryStatus()
        } catch (e: Exception) {
            HotboxLog.d(tag, "Error getting battery status: ${e.message}")
            null
        }

        DeviceBatterySnapshot(
            batteryLevel = batteryLevel.takeIf { it >= 0 },
            currentNow = batteryStatus?.current_uA,
            voltageNow = batteryStatus?.voltage_uV,
            timestamp = timestamp,
        )
    } catch (e: Exception) {
        HotboxLog.d(tag, "Error getting battery info: ${e.message}")
        DeviceBatterySnapshot(timestamp = timestamp)
    }
}

fun Route.baseDeviceInfoModule(context: Context) {
    val TAG = "[$BASE_TAG]_baseDeviceInfoModule"

    get("/api/baseDeviceInfo") {
        //Client IP
        var ipRes: String? = null
        try {
            val headers = call.request.headers

            val ip = headers["http-client-ip"]
                ?: headers["x-forwarded-for"]
                ?: headers["remote-addr"]
                ?: call.request.origin.remoteAddress

            HotboxLog.d(TAG, "Got client IP: $ip")
            ipRes = ip
        } catch (e: Exception) {
            HotboxLog.e(TAG, "Error getting client IP: ${e.message}")
            ipRes = null
        }

        // CPU/thermal/memory with cache
        val now = System.currentTimeMillis()
        val cached = metricsCache
        val metrics = if (cached != null && (now - cached.timestamp) < CACHE_TTL_MS) {
            cached
        } else {
            try {
                val usage = calculateCpuUsage()
                val freq = getCpuFreqJson()
                val mem = getMemoryUsage()
                val (maxTemp, temp) = readThermalZones()

                val usageJson = parseJsonElementOrNull(usage)
                val freqJson = parseJsonElementOrNull(freq)
                val memJson = parseJsonElementOrNull(mem)
                val tempJson = parseJsonElementOrNull(temp)

                val cpuUsageRes = try {
                    usageJson?.jsonObject?.get("cpu")?.jsonPrimitive?.double
                } catch (_: Exception) { null }
                val memUsageRes = try {
                    memJson?.jsonObject?.get("mem_usage_percent")?.jsonPrimitive?.double
                } catch (_: Exception) { null }

                val result = DeviceMetricsCache(
                    cpuTempList = tempJson,
                    cpuTempMax = maxTemp.takeIf { it >= 0 },
                    cpuFreqInfo = freqJson,
                    cpuUsageInfo = usageJson,
                    memInfo = memJson,
                    cpuUsageRes = cpuUsageRes,
                    memUsageRes = memUsageRes,
                    timestamp = now
                )
                metricsCache = result
                result
            } catch (e: Exception) {
                HotboxLog.d(TAG, "Error getting CPU/thermal/memory info:  ${e.message}")
                DeviceMetricsCache(null, null, null, null, null, null, null, now)
            }
        }

        val storage = storageCache?.takeIf { (now - it.timestamp) < CACHE_TTL_MS }
            ?: readStorageSnapshot(context, TAG, now).also { storageCache = it }

        val battery = batteryCache?.takeIf { (now - it.timestamp) < CACHE_TTL_MS }
            ?: readBatterySnapshot(context, TAG, now).also { batteryCache = it }

        val response = BaseDeviceInfoResponse(
            app_ver = AppMeta.versionName,
            app_ver_code = AppMeta.versionCode.toString(),
            build_timestamp = AppMeta.buildTimestamp,
            model = AppMeta.model,
            battery = battery.batteryLevel?.toString(),
            daily_data = storage.dailyData,
            monthly_data = storage.monthlyData,
            internal_available_storage = storage.availableSize,
            internal_used_storage = storage.usedSize,
            internal_total_storage = storage.totalSize,
            external_total_storage = storage.externalTotal,
            external_used_storage = storage.externalUsed,
            external_available_storage = storage.externalAvailable,
            cpu_temp_list = metrics.cpuTempList,
            cpu_temp = metrics.cpuTempMax,
            client_ip = ipRes,
            cpu_usage = metrics.cpuUsageRes,
            mem_usage = metrics.memUsageRes,
            cpuFreqInfo = metrics.cpuFreqInfo,
            cpuUsageInfo = metrics.cpuUsageInfo,
            memInfo = metrics.memInfo,
            current_now = battery.currentNow,
            voltage_now = battery.voltageNow,
        )
        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(Json.encodeToString(response), ContentType.Application.Json)
    }

    get("/api/connInfo"){
        try {
            val res = readNetConnCount()
            val jsonResult = """{"result":"success","data":{"tcp":"${res.tcp}","tcp_active":"${res.tcpActive}","tcp_other":"${res.tcpOther}","tcp6":"${res.tcp6}","udp":"${res.udp}","udp6":"${res.udp6}","unix":"${res.unix}"}}"""
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting connection info: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting connection info (SELinux status: ${HotboxUtils.getSELinuxStatus()})"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get data usage (time range)
    get("/api/cellularUsage") {
        try {
            val method = call.request.queryParameters["method"] ?: "date-range"
            val startTime = call.request.queryParameters["startTime"]?.toLongOrNull()
            val endTime = call.request.queryParameters["endTime"]?.toLongOrNull()

            if (startTime == null) {
                throw Exception("Missing parameter startTime")
            }
            if (endTime == null) {
                throw Exception("Missing parameter endTime")
            }

            HotboxLog.d(TAG, "cellularUsage Input parameter: startTime：$startTime endTime：$endTime method：$method")

            val jsonResult = if (method != "mills-range") {
                val res = HotboxUtils.getRangeDailyDataUsage(context, startTime, endTime)

                JSONObject().apply {
                    put("result", "success")
                    put("usage", JSONArray(res))
                }.toString()
            } else {
                val res = HotboxUtils.getRangeDataUsage(context, startTime, endTime)

                JSONObject().apply {
                    put("result", "success")
                    put("usage", res.toString())
                }.toString()
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)

        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting data usage: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                JSONObject().apply {
                    put("error", "Error getting data usage: ${e.message}")
                }.toString(),
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    post("/api/accept_terms"){
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            AppMeta.isReadUseTerms = true
            sharedPrefs.edit(commit = true) { putString("isReadUseTerms", "true") }
            val jsonResult = """{"result":"success"}""".trimIndent()
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting terms info: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting terms info"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Set nickname
    post("/api/set_nickname"){
        try {
            val body = call.receiveText()
            val json = JSONObject(body)
            var nickname = json.optString("nickname", "").trim()
            if (nickname.length > 255) {
                nickname = nickname.take(255)
            }
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            AppMeta.setNickName(sharedPrefs,nickname)
            val jsonResult = """{"result":"success"}""".trimIndent()
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error setting nickname: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error setting nickname"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get version info
    get("/api/version_info") {
        try {
            val jsonResult = """
            {
                "app_ver": "${AppMeta.versionName}",
                "app_ver_code": "${AppMeta.versionCode}",
                "build_timestamp": "${AppMeta.buildTimestamp}",
                "model":"${AppMeta.model}",
                "nickname":"${AppMeta.nickName}",
                "accept_terms":${AppMeta.isReadUseTerms}
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting version info: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting version info"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    get("/api/device_id") {
        try {
            val jsonResult = """{"device_id": "${UniqueDeviceIDManager.getUUID()}"}""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting device ID: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting device ID"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //SELinux status
    get("/api/SELinux"){
        try {
            val res = HotboxUtils.getSELinuxStatus()
            val jsonResult = """
            {
                "selinux": "$res"
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting SELinux status: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting SELinux status"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Whether token is needed
    get("/api/need_token") {
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val needToken = sharedPrefs.getString("login_token_enabled", true.toString())

            val jsonResult = """
            {
                "need_token": $needToken
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting token info: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting token info"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //USB device tree and interface status
    get("/api/usb_status") {
        try {
            val (maxSpeed,details) = readUsbDevices()
            val jsonResult = """
            {
                "maxSpeed":$maxSpeed,
                "details":$details
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error getting USB devices info: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting USB devices info"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}