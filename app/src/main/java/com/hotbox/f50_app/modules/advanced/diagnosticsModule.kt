package com.hotbox.f50_app.modules.advanced

import android.content.Context
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils.Companion.sendShellCmd
import com.hotbox.f50_app.utils.RootShell
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import org.json.JSONObject
import java.io.File

fun Route.diagnosticsModule(context: Context) {
    val TAG = "[$BASE_TAG]_diagnosticsModule"
    val curlBin = "${context.filesDir.absolutePath}/curl"

    // Allowed diagnostic tools and their command templates
    val allowedTools = mapOf(
        "ping" to { target: String, opts: JSONObject ->
            val count = opts.optInt("count", 4).coerceIn(1, 20)
            val timeout = opts.optInt("timeout", 5).coerceIn(1, 15)
            "ping -c $count -W $timeout ${shellEscape(target)} 2>&1"
        },
        "ping6" to { target: String, opts: JSONObject ->
            val count = opts.optInt("count", 4).coerceIn(1, 20)
            val timeout = opts.optInt("timeout", 5).coerceIn(1, 15)
            "ping6 -c $count -W $timeout ${shellEscape(target)} 2>&1"
        },
        "traceroute" to { target: String, opts: JSONObject ->
            val maxHops = opts.optInt("max_hops", 15).coerceIn(5, 30)
            val timeout = opts.optInt("timeout", 3).coerceIn(1, 10)
            "toybox traceroute -m $maxHops -w $timeout ${shellEscape(target)} 2>&1"
        },
        "traceroute6" to { target: String, opts: JSONObject ->
            val maxHops = opts.optInt("max_hops", 15).coerceIn(5, 30)
            val timeout = opts.optInt("timeout", 3).coerceIn(1, 10)
            "toybox traceroute6 -m $maxHops -w $timeout ${shellEscape(target)} 2>&1"
        },
        "nslookup" to { target: String, opts: JSONObject ->
            val server = opts.optString("server", "").trim()
            if (server.isNotEmpty()) {
                // Query specific DNS server using ping to resolve + nc for raw DNS isn't practical
                // Use ping-based resolution showing the IP, then try reverse too
                "echo 'Server: ${shellEscape(server)}' && ping -c1 -W3 ${shellEscape(target)} 2>&1 | head -1 | sed 's/PING /Name: /;s/ (.*//' && ping -c1 -W3 ${shellEscape(target)} 2>&1 | head -1 | grep -oP '\\(\\K[^)]+' | sed 's/^/Address: /' 2>&1"
            } else {
                "echo 'Server: (system default)' && ping -c1 -W3 ${shellEscape(target)} 2>&1 | head -1 | sed 's/PING /Name: /;s/ (.*//' && ping -c1 -W3 ${shellEscape(target)} 2>&1 | head -1 | grep -oP '\\(\\K[^)]+' | sed 's/^/Address: /' 2>&1"
            }
        },
        "curl" to { target: String, opts: JSONObject ->
            val timeout = opts.optInt("timeout", 10).coerceIn(1, 30)
            "$curlBin -sS -o /dev/null -w 'dns: %{time_namelookup}s\\nconnect: %{time_connect}s\\ntls: %{time_appconnect}s\\nttfb: %{time_starttransfer}s\\ntotal: %{time_total}s\\nhttp_code: %{http_code}\\nremote_ip: %{remote_ip}' --max-time $timeout -I ${shellEscape(target)} 2>&1"
        }
    )

    // Validate target: must be hostname, IP, or URL — no shell injection
    fun isValidTarget(target: String): Boolean {
        if (target.isEmpty() || target.length > 253) return false
        // Allow hostnames, IPs, IPv6 addresses, and http(s) URLs
        val hostnameRegex = Regex("""^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$""")
        val ipv4Regex = Regex("""^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$""")
        val ipv6Regex = Regex("""^[0-9a-fA-F:]+$""")
        val urlRegex = Regex("""^https?://[a-zA-Z0-9\-\._~:/?#\[\]@!$&'()*+,;=%]+$""")
        return hostnameRegex.matches(target) || ipv4Regex.matches(target) ||
                ipv6Regex.matches(target) || urlRegex.matches(target)
    }

    // POST /api/diagnostics — run a diagnostic tool
    post("/api/diagnostics") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val tool = json.optString("tool", "").trim()
            val target = json.optString("target", "").trim()
            val options = json.optJSONObject("options") ?: JSONObject()

            if (tool.isEmpty()) throw Exception("Missing 'tool' parameter")
            if (target.isEmpty()) throw Exception("Missing 'target' parameter")
            if (tool !in allowedTools) throw Exception("Unknown tool: $tool. Allowed: ${allowedTools.keys.joinToString()}")
            if (!isValidTarget(target)) throw Exception("Invalid target: contains disallowed characters")

            // For curl, only allow http/https URLs
            if (tool == "curl" && !target.startsWith("http://") && !target.startsWith("https://")) {
                throw Exception("curl requires an http:// or https:// URL")
            }

            val commandBuilder = allowedTools[tool]!!
            val command = commandBuilder(target, options)

            HotboxLog.d(TAG, "Running diagnostic: $tool -> $target")

            val socketPath = File(context.filesDir, "hotbox_root_shell.sock")
            val hasRoot = socketPath.exists()

            val timeoutMs = when (tool) {
                "traceroute", "traceroute6" -> 60000L
                "curl" -> 35000L
                else -> 25000L
            }

            val output: String = if (hasRoot) {
                RootShell.sendCommandToSocket(command, socketPath.absolutePath, timeoutMs.toInt())
                    ?: "Command timed out or returned null"
            } else {
                val result = sendShellCmd(command, timeoutMs / 1000)
                if (result.done) result.content else "Timeout: ${result.content}"
            }

            val result = JSONObject()
            result.put("tool", tool)
            result.put("target", target)
            result.put("output", output.trim())

            call.respondText(
                result.toString(),
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Diagnostics error: ${e.message}")
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"") ?: "Unknown error"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}

/** Shell-escape a string to prevent injection */
private fun shellEscape(input: String): String {
    // Only allow safe characters — reject anything with shell metacharacters
    val safe = input.replace(Regex("""[^a-zA-Z0-9._\-:/\[\]@?=&#%+~]"""), "")
    return "'$safe'"
}
