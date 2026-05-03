package com.hotbox.f50_app.utils

import android.os.Build
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.configs.AppMeta.isDeviceRooted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Request
import org.json.JSONObject
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class TimeoutDns(
    private val timeoutMs: Long = 3000
) : Dns {
    private val executor = Executors.newSingleThreadExecutor()

    override fun lookup(hostname: String): List<InetAddress> {
        return try {
            val future = executor.submit<List<InetAddress>> {
                InetAddress.getAllByName(hostname).toList()
            }
            future.get(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (e: Exception) {
            throw UnknownHostException("DNS timeout: $hostname")
        }
    }
}

class HotboxReport {
    companion object {
        private const val BASE_URL = "https://api.kanokano.cn/ufi_tools_report"
        private const val REPORT_PATH = "/report"
        private const val TOKEN = "hotbox1234"

        private val reportHttpClient: OkHttpClient = OkHttpClient.Builder()
            .dns(TimeoutDns(3000))
            .callTimeout(6, TimeUnit.SECONDS)
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.SECONDS)
            .writeTimeout(3, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()

        suspend fun reportToServer() {
            // Telemetry disabled — no data sent to external servers
            HotboxLog.d("UFI_TOOLS_LOG_report_service","Telemetry disabled, skipping report")
            return
        }

        data class Report(
            val id: Long?,
            val uuid: String,
            val deviceName: String?,
            val appVer: String?,
            val firmwareVer: String?,
            val requestTime: String?,
            val isRoot: Boolean,
            val isWhiteList: Boolean
        )

        suspend fun getRemoteDeviceRegisterItem(uuid: String): Report? = withContext(Dispatchers.IO) {
            val url = "$BASE_URL/report/$uuid"
            val request = Request.Builder()
                .url(url)
                .header("token", TOKEN)
                .get()
                .build()

            reportHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    HotboxLog.e("UFI_TOOLS_LOG_devcheck", "Request failed, code=${response.code}")
                    return@withContext null
                }
                val bodyStr = response.body?.string() ?: return@withContext null
                val json = JSONObject(bodyStr)
                return@withContext Report(
                    id = json.optLong("id"),
                    uuid = json.getString("uuid"),
                    deviceName = json.optString("device_name", null),
                    appVer = json.optString("app_ver", null),
                    firmwareVer = json.optString("firmware_ver", null),
                    requestTime = json.optString("request_time", null),
                    isRoot = json.optBoolean("is_root", false),
                    isWhiteList = json.optBoolean("is_white_list", true)
                )
            }
        }
    }
}