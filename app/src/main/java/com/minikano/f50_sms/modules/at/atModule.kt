package com.minikano.f50_sms.modules.at

import android.content.Context
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.ShellKano
import com.minikano.f50_sms.modules.BASE_TAG
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import java.io.File

fun Route.atModule(context: Context) {
    val TAG = "[$BASE_TAG]_atModule"
    // Cache the sendat binary path to avoid copying on every AT call
    var cachedSendatFile: File? = null

    //AT command
    get("/api/AT") {
        try {
            val command = call.request.queryParameters["command"]
                ?: throw Exception("Missing query parameter: command")
            val slot = call.request.queryParameters["slot"]?.toIntOrNull() ?: 0

            KanoLog.d(TAG, "AT_command parameter: $command")

            if (!command.trim().startsWith("AT", ignoreCase = true)) {
                throw Exception("Parse failed, AT command must start with 'AT'")
            }

            val outFileAt = cachedSendatFile?.takeIf { it.exists() && it.canExecute() }
                ?: run {
                    val f = KanoUtils.copyFileToFilesDir(context, "shell/sendat")
                        ?: throw Exception("Failed to copy sendat to filesDir")
                    f.setExecutable(true)
                    cachedSendatFile = f
                    f
                }

            val atCommand = "${outFileAt.absolutePath} -n $slot -c '${command.trim()}'"
            val result = ShellKano.runShellCommand(atCommand, true)
                ?: throw Exception("AT Command has no output")

            var res = result
                .replace("\"", "\\\"") // Escape quotes
                .replace("\n", "")
                .replace("\r", "")
                .trimStart()

            if (res.lowercase().endsWith("ok")) {
                res = res.dropLast(2).trimEnd() + " OK"
            }
            if (res.startsWith(",")) {
                res = res.removePrefix(",").trimStart()
            }

            KanoLog.d(TAG, "AT_cmd：$atCommand")
            KanoLog.d(TAG, "AT_result：$res")

            call.respondText(
                """{"result":"$res"}""",
                ContentType.Application.Json
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "AT commandExecution error: ${e.message}")

            call.respondText(
                """{"error":"AT commandExecution error: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

}