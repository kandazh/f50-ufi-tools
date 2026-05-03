package com.hotbox.f50_app.modules

import android.content.Context
import android.util.LruCache
import com.hotbox.f50_app.utils.HotboxLog
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.defaultForFilePath
import io.ktor.server.application.call
import io.ktor.server.request.path
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import java.io.FileNotFoundException

//Static resources with LRU cache
fun Route.staticFileModule(context: Context) {
    val TAG = "[$BASE_TAG]_staticFileModule"

    // 1.5 MB LRU cache for static assets (keys = path, values = byte arrays)
    val maxCacheSize = 1536 * 1024 // 1.5 MB
    val assetCache = object : LruCache<String, ByteArray>(maxCacheSize) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
    }

    get("{...}") {
        val rawPath = (
            call.parameters["..."]
                ?: call.request.path().removePrefix("/")
            ).trim('/')
        val path = if (rawPath.isBlank()) "index.html" else rawPath

        if (path.contains("..")) {
            HotboxLog.w(TAG, "Static resource rejected (invalid path): $rawPath")
            call.respond(HttpStatusCode.Forbidden, "403 Forbidden")
            return@get
        }

        try {
            val bytes = assetCache.get(path) ?: run {
                val loaded = context.assets.open(path).use { it.readBytes() }
                assetCache.put(path, loaded)
                loaded
            }
            val contentType = ContentType.defaultForFilePath(path)
            call.respondBytes(bytes, contentType)
        } catch (e: SecurityException) {
            HotboxLog.e(TAG, "Static resource access denied: $path", e)
            call.respond(HttpStatusCode.Forbidden, "403 Forbidden")
        } catch (e: FileNotFoundException) {
            HotboxLog.e(TAG, "Static resource not found: $path", e)
            call.respond(HttpStatusCode.NotFound, "404 Not Found")
        } catch (e: Exception) {
            HotboxLog.e(TAG, "Static resource read failed: $path", e)
            call.respond(HttpStatusCode.InternalServerError, "500 Internal Server Error")
        }
    }
}
