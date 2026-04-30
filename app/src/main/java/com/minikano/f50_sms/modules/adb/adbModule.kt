package com.minikano.f50_sms.modules.adb

import android.content.Context
import com.minikano.f50_sms.ADBService
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.modules.PREFS_NAME
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.utils.ShellKano.Companion
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

//Static resources
fun Route.adbModule(context: Context) {
    val TAG = "[$BASE_TAG]_adbModule"

    //Update ADMIN_PWD
    post("/api/update_admin_pwd"){
        try {
            // Get JSON body
            val body = call.receiveText()
            val json = JSONObject(body)

            val password = json.optString("password", "")

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // Save config
            sharedPrefs.edit(commit = true) {
                putString("ADMIN_PWD", password)
            }

            // Respond
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "Parse ADB_WIFI POST request error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Parameter parsing failed"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get network ADB auto-start status
    get("/api/adb_wifi_setting") {
        try {
            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val adbIpEnabled = sharedPrefs.getString("ADB_IP_ENABLED", "false")

            call.respondText(
                """{"enabled":$adbIpEnabled}""",
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "Error getting network ADB info: ${e.message}")

            call.respondText(
                """{"error":"Failed to get network ADB info"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Change network ADB auto-start status
    post("/api/adb_wifi_setting") {
        try {
            // Get JSON body
            val body = call.receiveText()
            val json = JSONObject(body)

            val enabled = json.optBoolean("enabled", false)
            val password = json.optString("password", "")

            KanoLog.d(
                TAG,
                "Received ADB_WIFI config: enabled=$enabled, password=$password"
            )

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // Save config
            if (enabled) {
                sharedPrefs.edit(commit = true) {
                    putString("ADMIN_PWD", password)
                    putString("ADB_IP_ENABLED", "true")
                }
            } else {
                sharedPrefs.edit(commit = true) {
                    remove("ADMIN_PWD")
                    putString("ADB_IP_ENABLED", "false")
                }
            }

            KanoLog.d(TAG, "ADMIN_PWD:${sharedPrefs.getString("ADMIN_PWD", "")}")

            // Respond
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success","enabled":"$enabled"}""",
                ContentType.Application.Json
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "Parse ADB_WIFI POST request error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Parameter parsing failed"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Network ADB running status
    get("/api/adb_alive") {
        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(
            """{"result":"${ADBService.adbIsReady}"}""".trimIndent(),
            ContentType.Application.Json,
            HttpStatusCode.OK
        )
    }

}