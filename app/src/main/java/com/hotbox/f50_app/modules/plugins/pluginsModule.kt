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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

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

        // Translate texts via Google Translate
        post("/api/translate") {
            try {
                val body = call.receiveText()
                val json = JSONObject(body)
                val textsArr = json.getJSONArray("texts")
                val sl = json.optString("sl", "auto")
                val tl = json.optString("tl", "en")

                val results = JSONArray()
                val client = OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(10, TimeUnit.SECONDS)
                    .build()

                for (i in 0 until textsArr.length()) {
                    val text = textsArr.getString(i)
                    try {
                        val encoded = withContext(Dispatchers.IO) {
                            URLEncoder.encode(text, "UTF-8")
                        }
                        val url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=$sl&tl=$tl&dt=t&q=$encoded"
                        val req = Request.Builder().url(url)
                            .addHeader("User-Agent", "Mozilla/5.0")
                            .build()
                        val response = withContext(Dispatchers.IO) { client.newCall(req).execute() }
                        val respBody = response.body?.string() ?: "[]"
                        response.close()

                        // Google returns nested array: [[["translated","original",...],...],...] 
                        val arr = JSONArray(respBody)
                        val sentences = arr.optJSONArray(0)
                        val sb = StringBuilder()
                        if (sentences != null) {
                            for (j in 0 until sentences.length()) {
                                val seg = sentences.optJSONArray(j)
                                if (seg != null && seg.length() > 0) {
                                    sb.append(seg.optString(0, ""))
                                }
                            }
                        }
                        results.put(sb.toString().ifEmpty { text })
                    } catch (e: Exception) {
                        results.put(text)
                    }
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(results.toString(), ContentType.Application.Json, HttpStatusCode.OK)
            } catch (e: Exception) {
                HotboxLog.d(TAG, "Translate error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"Translate error: ${e.message}"}""",
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