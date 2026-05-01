package com.hotbox.f50_app.modules.config

import android.content.Context
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxRequest
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.json.JSONObject
import androidx.core.content.edit
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.HotboxUtils

fun Route.configModule(context: Context) {
    val TAG = "[$BASE_TAG]_configModule"
    val PREFS_NAME = "kano_ZTE_store"
    val PREF_LOGIN_TOKEN = "login_token"

    //Check if default token
    get("/api/is_weak_token") {
        try {
            val jsonResult = """{"is_weak_token":${AppMeta.isDefaultOrWeakToken}}""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(jsonResult, ContentType.Application.Json)
        } catch (e: Exception) {
            HotboxLog.d("UFI_TOOLS_LOG", "Error checking weak token: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error checking weak token"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Set token
    post("/api/set_token") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val token = json.optString("token", "").trim()
            if (token.isEmpty() || token.isBlank()) {
                throw IllegalArgumentException("Please provide token")
            }

            val regex = Regex("^(?=.*[a-zA-Z])(?=.*\\d).{8,128}$")
            if(token.length < 8) {
                throw IllegalArgumentException("token must be at least 8 characters")
            }
            else if(!regex.matches(token)) {
                throw IllegalArgumentException("Token must contain both numbers and letters")
            }

            HotboxLog.d(TAG, "Received token=$token")

            val pref = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            pref.edit(commit = true) {
                putString(PREF_LOGIN_TOKEN, HotboxUtils.sha256Hex(token))
            }
            AppMeta.updateIsDefaultOrWeakToken(context,HotboxUtils.isWeakToken(token = token))

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Set token error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "Unknown error"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get global server address
    get("/api/get_res_server") {
        try {
            // Build JSON response
            val resultJson = """{
                "res_server": "${AppMeta.GLOBAL_SERVER_URL}"
            }""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Set resource server
    post("/api/set_res_server") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val resServerUrl = json.optString("res_server", "").trim()
            if (resServerUrl.isEmpty() || resServerUrl.isBlank()) {
                throw IllegalArgumentException("Please provide res_server")
            }

            HotboxLog.d(TAG, "Received res_server=$resServerUrl")

            AppMeta.setGlobalServerUrl(context, resServerUrl)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error setting resServerUrl: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "Unknown error"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get log switch status
    get("/api/get_log_status") {
        try {
            // Build JSON response
            val resultJson = """{
                "debug_log_enabled": "${AppMeta.isEnableLog}"
            }""".trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Set log switch status
    post("/api/set_log_status") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val debugEnabled = json.optBoolean("debug_log_enabled", false)

            HotboxLog.d(TAG, "Received debug_log_enabled=$debugEnabled")

            AppMeta.setIsEnableLog(context, debugEnabled)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error setting debug_log_enabled: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "Unknown error"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Set wake lock switch status
    post("/api/set_wakelock_status") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val wakeLockEnabled = json.optBoolean("wakelock_enabled", false)

            HotboxLog.d(TAG, "Received wakelock_enabled=$wakeLockEnabled")

            AppMeta.setIsEnableWakeLock(context, wakeLockEnabled)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error setting wakelock_enabled: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "Unknown error"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}