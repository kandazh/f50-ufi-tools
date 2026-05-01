package com.hotbox.f50_app.modules.auth

import android.content.Context
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.HotboxUtils.Companion.normalizeLeadingSlashes
import com.hotbox.f50_app.utils.HotboxUtils.Companion.normalizePath
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path

object HotboxAuth {
    val PREFS_NAME = "kano_ZTE_store"
    val PREF_LOGIN_TOKEN = "login_token"
    val PREF_TOKEN_ENABLED = "login_token_enabled"
    val REQUEST_SECRET_KEY = "hotbox_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"

    fun checkAuth(call: ApplicationCall, context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val tokenStored = prefs.getString(PREF_LOGIN_TOKEN, "") ?: ""
        val tokenEnabled = prefs.getString(PREF_TOKEN_ENABLED, "true")?.toBoolean() ?: true

        val rawPath = call.request.path()
        val method = call.request.httpMethod.value

        val uriForAuth = normalizePath(rawPath)
        val rawPathForSign = normalizeLeadingSlashes(rawPath)

        val uri = normalizePath(rawPath)
        HotboxLog.d("UFI_TOOLS_LOG_HotboxAuth","uri:$uri\t rawPath:$rawPath")


        val apiWhiteListExact: Set<String> = setOf(
            "/api/get_custom_head",
            "/api/version_info",
            "/api/need_token",
            "/api/get_theme",
            "/api/SELinux"
        )

        val apiWhiteListPrefix: List<String> = listOf(
            "/api/uploads"
        )

        val isApi = uri == "/api" || uri.startsWith("/api/")

        val noAuthRequired =
            !isApi ||
                    apiWhiteListExact.contains(uri) ||
                    apiWhiteListPrefix.any { prefix ->
                        uri == prefix || uri.startsWith("$prefix/")
                    }

        if (!tokenEnabled || noAuthRequired) return true

        val headers = call.request.headers
        val timestampStr = headers["hotbox-t"]
        val clientSignature = headers["hotbox-sign"]
        val authHeader = headers["authorization"]

        if (timestampStr.isNullOrBlank() || clientSignature.isNullOrBlank() || authHeader.isNullOrBlank() || tokenStored.isBlank()) {
            return false
        }

        if ((HotboxUtils.sha256Hex(authHeader.trim()) != HotboxUtils.sha256Hex(tokenStored))) {
            return false
        }

        val clientTimestamp = timestampStr.toLongOrNull() ?: return false
        //Skip path filtering for reverse proxy
        val signTarget =
            if (uriForAuth == "/api/proxy" || uriForAuth.startsWith("/api/proxy/")) {
                rawPathForSign
            } else {
                uriForAuth       // Other APIs use normalizePath result
            }

        val raw = "hotbox$method$signTarget$clientTimestamp"
        val expectedSignature = HotboxUtils.HmacSignature(REQUEST_SECRET_KEY, raw)

        return expectedSignature.equals(clientSignature, ignoreCase = true)
    }
}