package com.minikano.f50_sms.modules.auth

import android.content.Context
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.KanoUtils.Companion.normalizeLeadingSlashes
import com.minikano.f50_sms.utils.KanoUtils.Companion.normalizePath
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path

object KanoAuth {
    val PREFS_NAME = "kano_ZTE_store"
    val PREF_LOGIN_TOKEN = "login_token"
    val PREF_TOKEN_ENABLED = "login_token_enabled"
    val REQUEST_SECRET_KEY = "minikano_kOyXz0Ciz4V7wR0IeKmJFYFQ20jd"

    fun checkAuth(call: ApplicationCall, context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val tokenStored = prefs.getString(PREF_LOGIN_TOKEN, "") ?: ""
        val tokenEnabled = prefs.getString(PREF_TOKEN_ENABLED, "true")?.toBoolean() ?: true

        val rawPath = call.request.path()
        val method = call.request.httpMethod.value

        val uriForAuth = normalizePath(rawPath)
        val rawPathForSign = normalizeLeadingSlashes(rawPath)

        val uri = normalizePath(rawPath)
        KanoLog.d("UFI_TOOLS_LOG_KanoAuth","uri:$uri\t rawPath:$rawPath")


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
        val timestampStr = headers["kano-t"]
        val clientSignature = headers["kano-sign"]
        val authHeader = headers["authorization"]

        if (timestampStr.isNullOrBlank() || clientSignature.isNullOrBlank() || authHeader.isNullOrBlank() || tokenStored.isBlank()) {
            return false
        }

        if ((KanoUtils.sha256Hex(authHeader.trim()) != KanoUtils.sha256Hex(tokenStored))) {
            return false
        }

        val clientTimestamp = timestampStr.toLongOrNull() ?: return false
        //如果是反向代理，则不要进行path过滤
        val signTarget =
            if (uriForAuth == "/api/proxy" || uriForAuth.startsWith("/api/proxy/")) {
                rawPathForSign
            } else {
                uriForAuth       // 其它接口继续用 normalizePath 的结果
            }

        val raw = "minikano$method$signTarget$clientTimestamp"
        val expectedSignature = KanoUtils.HmacSignature(REQUEST_SECRET_KEY, raw)

        return expectedSignature.equals(clientSignature, ignoreCase = true)
    }
}