package com.minikano.f50_sms.modules.speedtest

import android.content.Context
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.response.respondOutputStream
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

object SpeedTestCache {
    val buffer = ByteArray(1024 * 1024) { 0x66.toByte() }
}

val speedTestLimiter = Semaphore(6)

object SpeedTestDispatchers {
    val dispatcher = Executors.newFixedThreadPool(6) {
        Thread(it, "SpeedTestThread").apply {
            priority = Thread.MAX_PRIORITY
        }
    }.asCoroutineDispatcher()

    fun close() {
        dispatcher.close()
    }
}

fun Route.speedTestModule(context: Context) {
    val TAG = "[$BASE_TAG]_speedTestModule"

    //测速
    get("/api/speedtest") {
        if (!speedTestLimiter.tryAcquire()) {
            call.respond(HttpStatusCode.TooManyRequests, "测速请求过多，请稍后再试")
            return@get
        }
        try {
            withContext(SpeedTestDispatchers.dispatcher) {
                KanoLog.d(TAG, "当前线程数: ${Thread.currentThread().name}")
                val parms = call.request.queryParameters
                val totalChunks = KanoUtils.getChunkCount(parms["ckSize"]).coerceIn(1, 1024)
                val enableCors = parms.contains("cors")
                val buffer = SpeedTestCache.buffer

                if (enableCors) {
                    call.response.headers.append("Access-Control-Allow-Origin", "*")
                    call.response.headers.append("Access-Control-Allow-Methods", "GET, POST")
                }

                val contentLength = buffer.size.toLong() * totalChunks
                call.response.headers.append(HttpHeaders.ContentLength, contentLength.toString())
                call.response.headers.append(
                    HttpHeaders.ContentType,
                    ContentType.Application.OctetStream.toString()
                )
                call.response.headers.append(
                    HttpHeaders.ContentDisposition,
                    "attachment; filename=random.dat"
                )
                call.response.headers.append(
                    HttpHeaders.CacheControl,
                    "no-store, no-cache, must-revalidate"
                )
                call.response.headers.append(HttpHeaders.Pragma, "no-cache")
                call.response.headers.append("Content-Transfer-Encoding", "binary")

                call.respondOutputStream(contentType = ContentType.Application.OctetStream) {
                    repeat(totalChunks) {
                        write(buffer)
                    }
                    flush()
                }
            }
        } finally {
            speedTestLimiter.release()
        }
    }
}