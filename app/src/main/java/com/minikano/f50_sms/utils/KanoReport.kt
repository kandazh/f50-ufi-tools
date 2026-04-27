package com.minikano.f50_sms.utils

import android.os.Build
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.configs.AppMeta.isDeviceRooted
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

    override fun lookup(hostname: String): List<InetAddress> {
        val executor = Executors.newSingleThreadExecutor()
        return try {
            val future = executor.submit<List<InetAddress>> {
                InetAddress.getAllByName(hostname).toList()
            }
            future.get(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (e: Exception) {
            throw UnknownHostException("DNS timeout: $hostname")
        } finally {
            executor.shutdown()
        }
    }
}

class KanoReport {
    companion object {
        private const val BASE_URL = "https://api.kanokano.cn/ufi_tools_report"
        private const val REPORT_PATH = "/report"
        private const val TOKEN = "minikano1234"

        private val reportHttpClient: OkHttpClient = OkHttpClient.Builder()
            .callTimeout(6, TimeUnit.SECONDS)
            .connectTimeout(3, TimeUnit.SECONDS)
            .readTimeout(3, TimeUnit.SECONDS)
            .writeTimeout(3, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
            .build()

        suspend fun reportToServer() {
            // Telemetry disabled — no data sent to external servers
            KanoLog.d("UFI_TOOLS_LOG_report_service","Telemetry disabled, skipping report")
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
            val client = OkHttpClient.Builder()
                .dns(TimeoutDns(3000))
                .callTimeout(3, TimeUnit.SECONDS)
                .connectTimeout(2, TimeUnit.SECONDS)  // 连接超时
                .readTimeout(1, TimeUnit.SECONDS)     // 读取超时
                .writeTimeout(1, TimeUnit.SECONDS)    // 写入超时
                .retryOnConnectionFailure(false)  // 关闭失败重试
                .build()
            val url = "$BASE_URL/report/$uuid"
            val request = Request.Builder()
                .url(url)
                .header("token", TOKEN)
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    KanoLog.e("UFI_TOOLS_LOG_devcheck", "请求失败，code=${response.code}")
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