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
import org.json.JSONArray
import org.json.JSONObject

fun Route.pluginsModule(context: Context) {
    val TAG = "[$BASE_TAG]_pluginsModule"
    val PLUGIN_STORE_NAME = "hotbox_plugin_store"
    val PLUGIN_PREFIX = "plugin::"

    authenticatedRoute(context){
        // Save a single plugin by name
        post("/api/set_plugin") {
            try {
                val body = call.receiveText()
                val bodyBytes = body.toByteArray(Charsets.UTF_8)
                val maxSizeInBytes = 5 * 1024 * 1024

                if (bodyBytes.size > maxSizeInBytes) {
                    throw Exception("Plugin size exceeds limit: ${bodyBytes.size / 1024}KB/${maxSizeInBytes / 1024}KB")
                }

                val json = JSONObject(body)
                val name = json.optString("name", "").trim()
                val text = json.optString("text", "").trim()

                if (name.isEmpty()) throw Exception("Plugin name is required")
                if (text.isEmpty()) throw Exception("Plugin code is required")

                val sharedPref =
                    context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
                sharedPref.edit(commit = true) {
                    putString(PLUGIN_PREFIX + name, text)
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":"success"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )
            } catch (e: Exception) {
                HotboxLog.d(TAG, "Save plugin error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        // Delete a plugin by name
        post("/api/delete_plugin") {
            try {
                val body = call.receiveText()
                val json = JSONObject(body)
                val name = json.optString("name", "").trim()

                if (name.isEmpty()) throw Exception("Plugin name is required")

                val sharedPref =
                    context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
                sharedPref.edit(commit = true) {
                    remove(PLUGIN_PREFIX + name)
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":"success"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )
            } catch (e: Exception) {
                HotboxLog.d(TAG, "Delete plugin error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        // List all installed plugin names
        get("/api/list_plugins") {
            try {
                val sharedPref =
                    context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
                val allEntries = sharedPref.all
                val plugins = JSONArray()
                allEntries.keys
                    .filter { it.startsWith(PLUGIN_PREFIX) }
                    .sorted()
                    .forEach { key ->
                        val name = key.removePrefix(PLUGIN_PREFIX)
                        plugins.put(name)
                    }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    plugins.toString(),
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )
            } catch (e: Exception) {
                HotboxLog.d(TAG, "List plugins error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        // Backward compat: save all plugins as one blob (used by old save flow)
        post("/api/set_custom_head") {
            try {
                val body = call.receiveText()
                val json = JSONObject(body)
                val text = json.optString("text", "").trim()

                // Parse markers and save each plugin individually
                val sharedPref =
                    context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
                val editor = sharedPref.edit()

                // Clear all existing plugins
                sharedPref.all.keys.filter { it.startsWith(PLUGIN_PREFIX) }.forEach { editor.remove(it) }

                if (text.isNotEmpty()) {
                    val markerRegex = Regex("""// \[Plugin: (.+?)]\n([\s\S]*?)// \[/Plugin: \1]""")
                    val matches = markerRegex.findAll(text)
                    var hasMarked = false
                    matches.forEach { match ->
                        val name = match.groupValues[1]
                        editor.putString(PLUGIN_PREFIX + name, match.value)
                        hasMarked = true
                    }
                    // Any leftover code not in markers
                    if (!hasMarked) {
                        editor.putString(PLUGIN_PREFIX + "Custom Code", text)
                    }
                }

                editor.apply()

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText("""{"result":"success"}""", ContentType.Application.Json, HttpStatusCode.OK)
            } catch (e: Exception) {
                HotboxLog.d(TAG, "Config error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText("""{"error":"${e.message}"}""", ContentType.Application.Json, HttpStatusCode.InternalServerError)
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

    // Read all plugins combined (public, no auth needed for page load)
    get("/api/get_custom_head") {
        try {
            val sharedPref =
                context.getSharedPreferences(PLUGIN_STORE_NAME, Context.MODE_PRIVATE)
            val allEntries = sharedPref.all
            val combined = allEntries.entries
                .filter { it.key.startsWith(PLUGIN_PREFIX) }
                .sortedBy { it.key }
                .mapNotNull { it.value as? String }
                .joinToString("\n\n")

            val json = JSONObject(mapOf("text" to combined)).toString()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error reading plugins: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error reading plugins"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}