package com.minikano.f50_sms.modules

import com.minikano.f50_sms.utils.KanoLog
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.httpMethod
import io.ktor.server.request.receiveText
import io.ktor.server.request.uri
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.route
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

const val TAG = "[$BASE_TAG]_reverseProxyModule"

private val reverseProxyClient: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .writeTimeout(5, TimeUnit.SECONDS)
    .retryOnConnectionFailure(false)
    .connectionPool(ConnectionPool(8, 2, TimeUnit.MINUTES))
    .dispatcher(Dispatcher().apply {
        maxRequests = 16
        maxRequestsPerHost = 8
    })
    .build()

//反向代理官方后端
fun Route.reverseProxyModule(targetServerIP:String) {
    //转发到原厂web后端
    route("/api/goform/{...}") {
        KanoLog.d(TAG,"开始反向代理资源...")
        handle {
            val targetServer = "http://${targetServerIP}"
            val originalPath = call.request.uri.removePrefix("/api")
            val queryString = call.request.queryParameters.entries()
                .joinToString("&") { (k, v) -> v.joinToString("&") { "$k=$it" } }

            val fullUrl = if (queryString.isBlank()) {
                "$targetServer$originalPath"
            } else {
                "$targetServer$originalPath?$queryString"
            }

            val method = call.request.httpMethod.value

            // 处理 OPTIONS 请求
            if (method == "OPTIONS") {
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.response.headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                call.response.headers.append("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
                call.respond(HttpStatusCode.OK)
                return@handle
            }

            try {
                val headersBuilder = Headers.Builder()
                headersBuilder.add("Referer", targetServer)
                val ck = call.request.headers["Kano-Cookie"]
                if (!ck.isNullOrBlank()) {
                    headersBuilder.add("Cookie", ck)
                }
                call.request.headers.forEach { key, values ->
                    if (!key.equals("host", ignoreCase = true) &&
                        !key.equals("referer", ignoreCase = true) &&
                        !key.equals("cookie", true)
                    ) {
                        headersBuilder.add(key, values.joinToString(","))
                    }
                }

                val requestBody = if (method == "POST" || method == "PUT") {
                    val body = call.receiveText()
                    body.toRequestBody("application/x-www-form-urlencoded".toMediaTypeOrNull())
                } else null

                val request = Request.Builder()
                    .url(fullUrl)
                    .method(method, requestBody)
                    .headers(headersBuilder.build())
                    .build()

                val response = reverseProxyClient.newCall(request).execute()

                response.headers.forEach { (key, value) ->
                    if (key.equals("Set-Cookie", ignoreCase = true)) {
                        call.response.headers.append("kano-cookie", value)
                    }
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.response.headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                call.response.headers.append("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")

                val responseContentType = response.header("Content-Type") ?: "text/plain"
                val responseBytes = response.body?.bytes() ?: ByteArray(0)
                call.respondBytes(responseBytes, ContentType.parse(responseContentType), HttpStatusCode.fromValue(response.code))
            } catch (e: Exception) {
                KanoLog.e(TAG,"转发出错",e)
                call.respond(HttpStatusCode.InternalServerError, "Proxy error: ${e.message}")
            }
        }
    }
}