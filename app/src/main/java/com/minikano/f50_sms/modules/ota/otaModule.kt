package com.minikano.f50_sms.modules.ota

import android.content.Context
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoRequest
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.RootShell
import com.minikano.f50_sms.utils.ShellKano
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.header
import io.ktor.server.response.respondOutputStream
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.close
import io.ktor.utils.io.jvm.javaio.copyTo
import io.ktor.utils.io.jvm.javaio.toOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import kotlin.concurrent.thread

object ApkState {
    var downloadResultPath: String? = null
    var downloadInProgress = false
    var download_percent = 0
    var downloadError: String? = null
    var currentDownloadingUrl: String = ""
}

fun Route.otaModule(context: Context) {
    val TAG = "[$BASE_TAG]_OTAModule"

    //Check for updates
    get("/api/check_update") {
        try {
            val path = "/UFI-TOOLS-UPDATE"
            val downloadUrl = "${AppMeta.GLOBAL_SERVER_URL}/d$path/"
            val changelogUrl = "${AppMeta.GLOBAL_SERVER_URL}/d$path/changelog.txt"

            // Fetch changelog text
            val changelog = KanoRequest.getTextFromUrl(changelogUrl)

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

            val alistResponse = KanoRequest.postJson(
                "${AppMeta.GLOBAL_SERVER_URL}/api/fs/list",
                requestBody
            )

            val alistBody = alistResponse.body?.string()

            val safeChangelog = changelog
                ?.replace(Regex("\r?\n"), "<br>")
                ?.let { JSONObject.quote(it) }

            // Build JSON response
            val resultJson = """
            {
                "base_uri": "$downloadUrl",
                "alist_res": $alistBody,
                "changelog": $safeChangelog
            }
        """.trimIndent()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(resultJson, ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            KanoLog.d(TAG, "Request error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Download APK from URL
    post("/api/download_apk") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val apkUrl = json.optString("apk_url", "").trim()
            if (apkUrl.isEmpty()) {
                throw IllegalArgumentException("Please provide apk_url")
            }

            KanoLog.d(TAG, "Received apk_url=$apkUrl")

            synchronized(this) {
                if (ApkState.downloadInProgress && apkUrl == ApkState.currentDownloadingUrl) {
                    KanoLog.d(TAG, "APK already downloading, ignoring duplicate request")
                } else {
                    ApkState.downloadInProgress = true
                    ApkState.download_percent = 0
                    ApkState.downloadResultPath = null
                    ApkState.downloadError = null
                    ApkState.currentDownloadingUrl = apkUrl

                    val outputFile = File(context.getExternalFilesDir(null), "downloaded_app.apk")
                    if (outputFile.exists()) outputFile.delete()

                    thread {
                        try {
                            val path = KanoRequest.downloadFile(apkUrl, outputFile) { percent ->
                                ApkState.download_percent = percent
                            }
                            if (path != null) {
                                ApkState.downloadResultPath = path
                                KanoLog.d(TAG, "Download complete：$path")
                            } else {
                                ApkState.downloadError = "Download failed"
                                KanoLog.d(TAG, "Download failed：Return path is null")
                            }
                        } catch (e: Exception) {
                            ApkState.downloadError = e.message ?: "Unknown error"
                            KanoLog.d(TAG, "[Worker thread] download exception: ${e.message}")
                        } finally {
                            ApkState.downloadInProgress = false
                        }
                    }
                }
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"download_started"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            KanoLog.d(TAG, "[Main thread] /download_apk error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"${e.message ?: "Unknown error"}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Download progress
    get("/api/download_apk_status") {
        val status = when {
            ApkState.downloadInProgress -> "downloading"
            ApkState.downloadError != null -> "error"
            ApkState.downloadResultPath != null -> "done"
            else -> "idle"
        }

        val json = """
        {
            "status":"$status",
            "percent":${ApkState.download_percent},
            "error":"${ApkState.downloadError ?: ""}"
        }
    """.trimIndent()

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(json, ContentType.Application.Json)
    }

    //Install APK
    post("/api/install_apk") {
        val outputChannel = ByteChannel(autoFlush = true)

        launch(Dispatchers.IO) {
            val writer = OutputStreamWriter(outputChannel.toOutputStream(), Charsets.UTF_8)
            try {
                ApkState.downloadResultPath = ApkState.downloadResultPath
                if (ApkState.downloadResultPath == null) {
                    writer.write("""{"error":"No downloaded APK detected"}""")
                    return@launch
                }

                //Install using advanced features
                val socketPath = File(context.filesDir, "kano_root_shell.sock")
                //Test if it works
                val testResult =
                    RootShell.sendCommandToSocket(
                        "whoami",
                        socketPath.absolutePath
                    ) ?: "whoamiExecution failed"
                KanoLog.d(TAG, "socatTest result: $testResult")
                if (socketPath.exists() && testResult.contains("root")) {

                    val shellScript = """
                #!/system/bin/sh
                nohup sh -c '
                pm install -r -g "${ApkState.downloadResultPath}" >> /sdcard/ufi_tools_update.log 2>&1
                dumpsys activity start-activity -n com.minikano.f50_sms/.MainActivity >> /sdcard/ufi_tools_update.log 2>&1
                sync
                sync
                echo "${'$'}(date)install and sync complete!" >> /sdcard/ufi_tools_update.log
                ' >/dev/null 2>&1 &
                """.trimIndent()

                    //Save shell script
                    val scriptFile =
                        ShellKano.createShellScript(
                            context,
                            "ufi_tools_update_by_socat.sh",
                            shellScript
                        )
                    val shPath = scriptFile.absolutePath

                    val result =
                        RootShell.sendCommandToSocket(
                            "nohup sh $shPath &",
                            socketPath.absolutePath
                        )

                    KanoLog.d(TAG, "socatInstall APK result: $result")
                    delay(2000)
                    writer.write("""{"result":"success"}""")

                } else {
                    KanoLog.d(TAG, "socat not found, executing plan B")

                    val outFileAdb = KanoUtils.copyFileToFilesDir(context, "shell/adb")
                        ?: throw Exception("Failed to copy adb to filesDir")
                    outFileAdb.setExecutable(true)

                    // Copy APK to sdcard root dir
                    val copyCmd =
                        "${outFileAdb.absolutePath} -s localhost shell sh -c 'cp ${ApkState.downloadResultPath} /sdcard/ufi_tools_latest.apk'"
                    KanoLog.d(TAG, "Executing: $copyCmd")
                    ShellKano.runShellCommand(copyCmd, context)

                    // Create and copy shell script
                    val scriptText = """
                    #!/system/bin/sh
                    pm install -r -g /sdcard/ufi_tools_latest.apk >> /sdcard/ufi_tools_update.log 2>&1
                    dumpsys activity start-activity -n com.minikano.f50_sms/.MainActivity >> /sdcard/ufi_tools_update.log 2>&1
                    sync
                    sync
                    echo "$(date)install and sync complete!" >> /sdcard/ufi_tools_update.log
                """.trimIndent()

                    val scriptFile =
                        ShellKano.createShellScript(context, "ufi_tools_update.sh", scriptText)
                    val shPath = scriptFile.absolutePath

                    val copyShCmd =
                        "${outFileAdb.absolutePath} -s localhost shell sh -c 'cp $shPath /sdcard/ufi_tools_update.sh'"
                    KanoLog.d(TAG, "Executing: $copyShCmd")
                    ShellKano.runShellCommand(copyShCmd, context)

                    suspend fun clickStage() {
                        repeat(10) {
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell input keyevent KEYCODE_BACK",
                                context
                            )
                        }
                        delay(100)
                        repeat(5) {
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell settings put system screen_off_timeout 300000",
                                context
                            )
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell input keyevent KEYCODE_WAKEUP",
                                context
                            )
                            delay(10)
                            ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell input tap 0 0",
                                context
                            )
                            delay(10)

                            val result = ShellKano.runShellCommand(
                                "${outFileAdb.absolutePath} -s localhost shell am start -n com.sprd.engineermode/.EngineerModeActivity",
                                context
                            )
                            if (result != null) {
                                val clicked = ShellKano.parseUiDumpAndClick(
                                    "DEBUG&LOG",
                                    outFileAdb.absolutePath,
                                    context
                                )
                                if (clicked == 0) {
                                    ShellKano.parseUiDumpAndClick(
                                        "Adb shell",
                                        outFileAdb.absolutePath,
                                        context
                                    )
                                }
                                return
                            }
                            delay(400)
                        }
                        throw Exception("click_stage Multiple attempts failed")
                    }

                    suspend fun tryClickStage(maxRetry: Int = 2) {
                        var retry = 0
                        while (retry <= maxRetry) {
                            try {
                                clickStage()
                                return
                            } catch (e: Exception) {
                                KanoLog.w(
                                    TAG,
                                    "click_stage1 Execution failed, attempt ${retry + 1}, error: ${e.message}"
                                )
                                repeat(10) {
                                    ShellKano.runShellCommand(
                                        "${outFileAdb.absolutePath} -s localhost shell input keyevent KEYCODE_BACK",
                                        context
                                    )
                                }
                                Thread.sleep(1000)
                                retry++
                            }
                        }
                        throw Exception("click_stage multiple retries failed")
                    }

                    tryClickStage()

                    try {
                        val escapedCommand =
                            "sh /sdcard/ufi_tools_update.sh".replace("\"", "\\\"")
                        ShellKano.fillInputAndSend(
                            escapedCommand,
                            outFileAdb.absolutePath,
                            context,
                            "",
                            listOf("START", "Start"),
                            needBack = false,
                            useClipBoard = true
                        )
                        writer.write("""{"result":"success"}""")
                    } catch (e: Exception) {
                        writer.write("""{"error":${JSONObject.quote("Execute shell command failed: ${e.message}")}}""")
                    }
                }
            } catch (e: Exception) {
                writer.write("""{"error":${JSONObject.quote("Exception: ${e.message}")}}""")
            } finally {
                writer.flush()
                outputChannel.close()
            }
        }

        call.response.header(HttpHeaders.AccessControlAllowOrigin, "*")
        call.respondOutputStream(ContentType.Application.Json) {
            outputChannel.copyTo(this)
        }
    }

}