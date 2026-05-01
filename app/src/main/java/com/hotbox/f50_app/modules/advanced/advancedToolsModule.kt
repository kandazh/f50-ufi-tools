package com.hotbox.f50_app.modules.advanced

import android.content.Context
import com.hotbox.f50_app.ADBService.Companion.adbIsReady
import com.hotbox.f50_app.configs.SMBConfig
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.HotboxUtils.Companion.sendShellCmd
import com.hotbox.f50_app.utils.RootShell
import com.hotbox.f50_app.utils.ShellHotbox
import com.hotbox.f50_app.utils.SmbThrottledRunner
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondOutputStream
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import java.io.PipedInputStream
import java.io.PipedOutputStream

fun Route.advancedToolsModule(context: Context, targetServerIP: String) {
    val TAG = "[$BASE_TAG]_advanceToolsModule"

    //Enable advanced features
    get("/api/smbPath") {
        try {
            val enabled = call.request.queryParameters["enable"]
                ?: throw Exception("Missing query parameter: enable")

            HotboxLog.d(TAG, "enable parameter: $enabled")

            // Copy dependency files
            val outFileAdb = HotboxUtils.copyFileToFilesDir(context, "shell/adb")
                ?: throw Exception("Failed to copy adb to filesDir")
            val smbPath = SMBConfig.writeConfig(context)
                ?: throw Exception("Failed to copy smb.conf to filesDir")
            val outFileTtyd = HotboxUtils.copyFileToFilesDir(context, "shell/ttyd")
                ?: throw Exception("Failed to copy ttyd to filesDir")
            val outFileSocat = HotboxUtils.copyFileToFilesDir(context, "shell/socat")
                ?: throw Exception("Failed to copy socat to filesDir")
            val outFileSmbSh =
                HotboxUtils.copyFileToFilesDir(context, "shell/samba_exec.sh", false)
                    ?: throw Exception("Failed to copy samba_exec.sh to filesDir")

            // Set execute permission
            outFileAdb.setExecutable(true)
            outFileTtyd.setExecutable(true)
            outFileSocat.setExecutable(true)
            outFileSmbSh.setExecutable(true)

            var jsonResult = """{"result":"Execution successful<br>Execution successful!"}"""

            if (enabled == "1") {
                val cmdShell =
                    "cat $smbPath > /data/samba/etc/smb.conf"
                val cmdAdb =
                    "${outFileAdb.absolutePath} -s localhost shell cat $smbPath > /data/samba/etc/smb.conf"

                val resultShell = sendShellCmd(cmdShell,3)
                var resultAdb:String? = null

                if(adbIsReady) {
                    resultAdb = ShellHotbox.runShellCommand(cmdAdb, context = context)
                }

                HotboxLog.d(TAG, "Shell enable advanced mode result, success: ${resultShell.done} content: ${resultShell.content}")
                HotboxLog.d(TAG, "ADB enable advanced mode result$resultAdb")

                val queryShell = "grep 'samba_exec.sh' /data/samba/etc/smb.conf"
                val sambaResult =  sendShellCmd(queryShell,3)
                var sambaAdbResult:String? = null

                if(adbIsReady) {
                    sambaAdbResult = ShellHotbox.runShellCommand("${outFileAdb.absolutePath} -s localhost shell $queryShell", context = context)
                }

                HotboxLog.d(TAG, "Shell query advanced features enabled result: ${sambaResult.done} ${sambaResult.content}")
                HotboxLog.d(TAG, "ADB query advanced features enabled result: $sambaAdbResult")

                if( resultAdb == null && !resultShell.done){
                    if(adbIsReady){
                        throw Exception("Enable advanced featuresfailed (ADB and Shell execution unsuccessful), please factory reset and reinstall<br>Failed to enable advanced features (resultAdb and resultShell execution unsuccessful)")
                    }else {
                        throw Exception("Enable advanced featuresfailed (ADB and Shell execution unsuccessful), please enable network ADB and retry<br>Failed to enable advanced features (resultAdb and resultShell execution unsuccessful)")
                    }
                }

                val queryShellIsDone = sambaResult.done && sambaResult.content.contains("samba_exec.sh")
                val queryAdbIsDone = sambaAdbResult != null && sambaAdbResult.contains("samba_exec.sh")

                if(!queryShellIsDone && !queryAdbIsDone){
                    if(adbIsReady){
                        throw Exception("Enable advanced featuresfailed (config file not changed or does not exist), please factory reset and reinstall<br>Failed to enable advanced features (conf not changed or does not exist), please reset your device to factory")
                    }else {
                        throw Exception("Enable advanced featuresfailed (config file not changed or does not exist), please enable network ADB and retry<br>Failed to enable advanced features (conf not changed or does not exist), please enable ADB")
                    }
                }

                jsonResult = """{"result":"Execution successful, please wait 1-2 minutes to take effect!<br>Execution successful, please wait 1-2 minutes for it to take effect!"}"""
            } else {
                val script = """
                chattr -i /data/samba/etc/smb.conf
                chmod 777 /data/samba/etc/smb.conf
                chattr -i /data/samba/etc/smb.conf
                rm -f /data/samba/etc/smb.conf
                sync
            """.trimIndent()

                val socketPath = File(context.filesDir, "hotbox_root_shell.sock")
                if (!socketPath.exists()) {
                    throw Exception("Command failed, socat socket not found (are advanced features enabled?)<br>Command execution failed, could not find the sock created by socat (are advanced features enabled?)")
                }

                val result = RootShell.sendCommandToSocket(script, socketPath.absolutePath)
                    ?: throw Exception("Failed to delete smb.conf")
                HotboxLog.d(TAG, "sendCommandToSocket Output:\n$result")
            }

            HotboxLog.d(TAG, "Refreshing SMB...")
            SmbThrottledRunner.runOnceInThread(context)

            call.respondText(jsonResult, ContentType.Application.Json)

        } catch (e: Exception) {
            HotboxLog.d(TAG, "smbPath execution error: ${e.message}")
            call.respondText(
                """{"error":"Error：${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Disable system updates
    get("/api/disable_fota") {
        try {
            val res = HotboxUtils.disableFota(context)

            if(!res) throw Exception("Disable system updates failed")

            val jsonResult = """{"result":"Execution successful, use advanced features for forced disable!"}"""

            call.respondText(jsonResult, ContentType.Application.Json)

        } catch (e: Exception) {
            HotboxLog.d(TAG, "Disable system updates error: ${e.message}")
            call.respondText(
                """{"error":"Disable system updates error: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Check if TTYD exists
    get("/api/hasTTYD") {
        try {
            val params = call.request.queryParameters
            val port =
                params["port"] ?: throw IllegalArgumentException("query Missing port parameter")

            val host = targetServerIP.substringBefore(":")
            val fullUrl = "http://$host:$port"
            val code = HotboxUtils.getStatusCode(fullUrl)

            HotboxLog.d(TAG, "TTYDGet IP+port info: $host:$port  returned code: $code")

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"code":"$code","ip":"$host:$port"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error getting TTYD info: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error getting TTYD info: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //User shell
    post("/api/user_shell") {
        try {
            val body = call.receiveText()

            val json = try {
                JSONObject(body)
            } catch (e: Exception) {
                throw Exception("Error parsing request JSON")
            }

            val text = json.optString("command", "").trim()

            HotboxLog.d(TAG, "Received command: ${text}")

            if (text.isNotEmpty()) {

                val result = sendShellCmd(text)

                if(!result.done) throw Exception(result.content)

                HotboxLog.d(TAG, "Execution result: ${result}")

                val parsedResult = Json.encodeToString(result)

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":$parsedResult}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } else {
                throw Exception("commandcannot be empty")
            }

        } catch (e: Exception) {
            HotboxLog.d(TAG, "Shell execution error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":${JSONObject.quote("Shell execution error: ${e.message}")}}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Quick Shell
    get("/api/quick_shell") {
        val pipedInput = PipedInputStream()
        val pipedOutput = PipedOutputStream(pipedInput)

        CoroutineScope(Dispatchers.IO).launch {
            val writer = OutputStreamWriter(pipedOutput, Charsets.UTF_8)
            try {
                val outFile_adb = HotboxUtils.copyFileToFilesDir(context, "shell/adb")
                    ?: throw Exception("Failed to copy adb to filesDir")
                outFile_adb.setExecutable(true)

                fun click_stage1() {
                    var Eng_result: Any? = null
                    ShellHotbox.runShellCommand(
                        "${outFile_adb.absolutePath} -s localhost shell settings put system screen_off_timeout 300000",
                        context
                    )
                    repeat(2) {
                        Thread.sleep(10)
                        ShellHotbox.runShellCommand(
                            "${outFile_adb.absolutePath} -s localhost shell input keyevent KEYCODE_WAKEUP",
                            context
                        )
                    }
                    Thread.sleep(10)
                    ShellHotbox.runShellCommand(
                        "${outFile_adb.absolutePath} -s localhost shell input tap 0 0",
                        context
                    )
                    Thread.sleep(10)
                    repeat(10) {
                        Eng_result = ShellHotbox.runShellCommand(
                            "${outFile_adb.absolutePath} -s localhost shell am start -n com.sprd.engineermode/.EngineerModeActivity",
                            context
                        )
                        HotboxLog.d(TAG, "Engineering mode open result: $Eng_result")
                    }
                    if (Eng_result == null) {
                        throw Exception("Engineering mode activity open failed")
                    }
                    Thread.sleep(400)
                    val res_debug_log_btn = ShellHotbox.parseUiDumpAndClick(
                        "DEBUG&LOG",
                        outFile_adb.absolutePath,
                        context
                    )
                    if (res_debug_log_btn == -1) throw Exception("Failed to click DEBUG&LOG")
                    if (res_debug_log_btn == 0) {
                        val res = ShellHotbox.parseUiDumpAndClick(
                            "Adb shell",
                            outFile_adb.absolutePath,
                            context
                        )
                        if (res == -1) throw Exception("Failed to click Adb Shell button")
                    }
                }

                fun tryClickStage1(maxRetry: Int = 2) {
                    var retry = 0
                    while (retry <= maxRetry) {
                        try {
                            click_stage1()
                            return
                        } catch (e: Exception) {
                            HotboxLog.w(
                                TAG,
                                "click_stage1 Execution failed, attempt ${retry + 1}, error: ${e.message}"
                            )
                            repeat(10) {
                                ShellHotbox.runShellCommand(
                                    "${outFile_adb.absolutePath} -s localhost shell input keyevent KEYCODE_BACK",
                                    context
                                )
                            }
                            Thread.sleep(1000)
                            retry++
                        }
                    }
                    throw Exception("click_stage1 multiple retries failed")
                }

                tryClickStage1()

                var jsonResult = """{"result":"Execution successful"}"""
                try {
                    val escapedCommand =
                        "sh /sdcard/quick_shell.sh".replace("\"", "\\\"")
                    ShellHotbox.fillInputAndSend(
                        escapedCommand,
                        outFile_adb.absolutePath,
                        context,
                        "",
                        listOf("START", "Start"),
                        useClipBoard = true
                    )
                } catch (e: Exception) {
                    jsonResult = """{"result":"Execution failed"}"""
                }
                writer.write(jsonResult)
            } catch (e: Exception) {
                writer.write("""{"error":"quick_shellExecution error: ${e.message}"}""")
            } finally {
                writer.flush()
                pipedOutput.close()
            }
        }

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondOutputStream(
            contentType = ContentType.Application.Json,
            status = HttpStatusCode.OK
        ) {
            pipedInput.copyTo(this)
        }
    }

    //rootShell execution
    post("/api/root_shell") {
        try {
            val body = call.receiveText()

            val json = try {
                JSONObject(body)
            } catch (e: Exception) {
                throw Exception("Error parsing request JSON")
            }

            val text = json.optString("command", "").trim()
            var timeout = json.optInt("timeout",100 * 1000)

            timeout = if(timeout > 100 * 1000) {
                HotboxLog.d(TAG, "timeoutGreater than 100*1000ms, will use 100s")
                100 * 1000
            } else {
                timeout
            }

            HotboxLog.d(TAG, "Received command: ${text} timeout： ${timeout}")

            if (text.isNotEmpty()) {

                val socketPath = File(context.filesDir, "hotbox_root_shell.sock")
                if (!socketPath.exists()) {
                    throw Exception("Command failed, socat socket not found (are advanced features enabled?)")
                }

                val result =
                    RootShell.sendCommandToSocket(
                        text,
                        socketPath.absolutePath,
                        timeout
                    )
                        ?: throw Exception("Please check command input format")

                HotboxLog.d(TAG, "Execution result: ${result}")

                val parsedResult = Json.encodeToString(result)

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":$parsedResult}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } else {
                throw Exception("commandcannot be empty")
            }

        } catch (e: Exception) {
            HotboxLog.d(TAG, "Shell execution error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Shell execution error: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}