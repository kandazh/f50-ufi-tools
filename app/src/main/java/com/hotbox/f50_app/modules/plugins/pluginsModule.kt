package com.hotbox.f50_app.modules.plugins

import android.content.Context
import androidx.core.content.edit
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.modules.auth.authenticatedRoute
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

fun Route.pluginsModule(context: Context) {
    val TAG = "[$BASE_TAG]_pluginsModule"
    val PLUGIN_STORE_NAME = "kano_plugin_store"
    val PLUGIN_KEY = "kano_plugins"

    authenticatedRoute(context){
        //Save plugin
        post("/api/set_custom_head") {
            try {
                val body = call.receiveText()
                val bodyBytes = body.toByteArray(Charsets.UTF_8)
                val maxSizeInBytes = 5 * 1024 * 1024

                if (bodyBytes.size > maxSizeInBytes) {
                    throw Exception("Plugin size exceeds limit: ${bodyBytes.size / 1024}KB/${maxSizeInBytes / 1024}KB")
                }

                val json = JSONObject(body)
                val text = json.optString("text", "").trim()

                val sharedPref =
                    context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
                sharedPref.edit(commit = true){
                    putString(PLUGIN_KEY, text)
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":"success"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } catch (e: Exception) {
                HotboxLog.d(TAG, "Config error:  ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"Config error: ${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        //Get plugin from store
        get("/api/plugins_store"){
            try {
                val download_url = "${AppMeta.GLOBAL_SERVER_URL}/d/UFI-TOOLS-UPDATE/plugins/ufi-tools-plugins"
                val url = "${AppMeta.GLOBAL_SERVER_URL}/api/fs/list"
                val path = "/UFI-TOOLS-UPDATE/plugins/ufi-tools-plugins"

                // Request alist API
                val requestBody = """
            {
                "path": "$path",
                "password": "",
                "page": 1,
                "per_page": 0,
                "refresh": false
            }
        """.trimIndent()

                val alistResponse = HotboxRequest.postJson(url, requestBody)

                val alistBody = alistResponse.body?.string()

                // Build JSON response
                val resultJson = """{
                    |"download_url":"$download_url",
                    |"res":$alistBody
                    |}""".trimMargin()

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                if (resultJson != null) {
                    call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
                }else{
                    throw Exception("Response is empty")
                }
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
    }

    //Read plugin
    get("/api/get_custom_head") {
        try {
            val sharedPref =
                context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
            val text = sharedPref.getString(PLUGIN_KEY, "") ?: ""
            val json = JSONObject(mapOf("text" to text)).toString()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                json,
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error reading custom header: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error reading custom header"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}