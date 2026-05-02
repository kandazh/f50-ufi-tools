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
import kotlinx.serialization.json.Json
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

// Cache for frequently polled device metrics (CPU/thermal/memory)
private data class DeviceMetricsCache(
    val cpuTempRes: String?, val cpuTempMax: String?,
    val cpuFreqInfo: String?, val cpuUsageInfo: String?, val memInfo: String?,
    val cpuUsageRes: Double?, val memUsageRes: Double?,
    val timestamp: Long
)
@Volatile private var metricsCache: DeviceMetricsCache? = null
private const val CACHE_TTL_MS = 500L // 0.5 second cache (matches min refresh rate)

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

                val cpuUsageRes = try {
                    Json.parseToJsonElement(usage).jsonObject["cpu"]?.jsonPrimitive?.double
                } catch (_: Exception) { null }
                val memUsageRes = try {
                    Json.parseToJsonElement(mem).jsonObject["mem_usage_percent"]?.jsonPrimitive?.double
                } catch (_: Exception) { null }

                val result = DeviceMetricsCache(
                    cpuTempRes = temp.replace("\n", ""),
                    cpuTempMax = maxTemp.toString(),
                    cpuFreqInfo = freq,
                    cpuUsageInfo = usage,
                    memInfo = mem,
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

        // Storage info
        var dailyData: Long? = null; var monthlyData: Long? = null
        var availableSize: Long? = null; var usedSize: Long? = null; var totalSize: Long? = null
        var externalTotal: Long? = null; var externalUsed: Long? = null; var externalAvailable: Long? = null
        try {
            val internalStorage = context.filesDir
            val statFs = StatFs(internalStorage.absolutePath)
            totalSize = statFs.blockSizeLong * statFs.blockCountLong
            availableSize = statFs.blockSizeLong * statFs.availableBlocksLong
            usedSize = totalSize!! - availableSize!!
            dailyData = HotboxUtils.getCachedTodayUsage(context)
            monthlyData = HotboxUtils.getCachedMonthlyUsage(context)
            val exStorageInfo = HotboxUtils.getCachedRemovableStorageInfo(context)
            externalTotal = exStorageInfo?.totalBytes ?: 0
            externalAvailable = exStorageInfo?.availableBytes ?: 0
            externalUsed = externalTotal!! - externalAvailable!!
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error getting storage & daily data:  ${e.message}")
        }

        // Battery info
        var batteryLevel: Int? = null; var currentNow: Int? = null; var voltageNow: Int? = null
        try {
            batteryLevel = HotboxUtils.getBatteryPercentage(context)
            val batteryStatus = readBatteryStatus()
            currentNow = batteryStatus.current_uA
            voltageNow = batteryStatus.voltage_uV
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error getting model and battery info: ${e.message}")
        }

        val jsonResult = """
            {
                "app_ver": "${AppMeta.versionName}",
                "app_ver_code": "${AppMeta.versionCode}",
                "build_timestamp": "${AppMeta.buildTimestamp}",
                "model": "${AppMeta.model}",
                "battery": "$batteryLevel",
                "daily_data": $dailyData,
                "monthly_data": $monthlyData,
                "internal_available_storage": $availableSize,
                "internal_used_storage": $usedSize,
                "internal_total_storage": $totalSize,
                "external_total_storage": $externalTotal,
                "external_used_storage": $externalUsed,
                "external_available_storage": $externalAvailable,
                "cpu_temp_list":${metrics.cpuTempRes},
                "cpu_temp":${metrics.cpuTempMax},
                "client_ip":"$ipRes",
                "cpu_usage":${metrics.cpuUsageRes},
                "mem_usage":${metrics.memUsageRes},
                "cpuFreqInfo":${metrics.cpuFreqInfo},
                "cpuUsageInfo":${metrics.cpuUsageInfo},
                "memInfo":${metrics.memInfo},
                "current_now":$currentNow,
                "voltage_now":$voltageNow
            }
        """.trimIndent()
        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(jsonResult, ContentType.Application.Json)
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