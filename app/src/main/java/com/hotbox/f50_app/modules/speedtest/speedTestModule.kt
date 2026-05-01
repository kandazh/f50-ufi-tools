package com.hotbox.f50_app.modules.speedtest

import android.content.Context
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveStream
import io.ktor.server.response.respond
import io.ktor.server.response.respondOutputStream
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
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

    //Speed test
    get("/api/speedtest") {
        if (!speedTestLimiter.tryAcquire()) {
            call.respond(HttpStatusCode.TooManyRequests, "Too many speed test requests, try later")
            return@get
        }
        try {
            withContext(SpeedTestDispatchers.dispatcher) {
                HotboxLog.d(TAG, "Current thread: ${Thread.currentThread().name}")
                val parms = call.request.queryParameters
                val totalChunks = HotboxUtils.getChunkCount(parms["ckSize"]).coerceIn(1, 1024)
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

    // Upload speed test — consume incoming data and report bytes received
    post("/api/speedtest_upload") {
        if (!speedTestLimiter.tryAcquire()) {
            call.respond(HttpStatusCode.TooManyRequests, "Too many speed test requests, try later")
            return@post
        }
        try {
            withContext(SpeedTestDispatchers.dispatcher) {
                val parms = call.request.queryParameters
                val enableCors = parms.contains("cors") || true

                if (enableCors) {
                    call.response.headers.append("Access-Control-Allow-Origin", "*")
                    call.response.headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                }

                val inputStream = call.receiveStream()
                val buffer = ByteArray(65536)
                var totalBytes = 0L
                while (true) {
                    val read = inputStream.read(buffer)
                    if (read == -1) break
                    totalBytes += read
                }

                call.respondText(
                    """{"bytes":$totalBytes}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )
            }
        } finally {
            speedTestLimiter.release()
        }
    }
}