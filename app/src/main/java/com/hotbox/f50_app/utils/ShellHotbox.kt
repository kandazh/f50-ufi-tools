package com.hotbox.f50_app.utils

import android.content.Context
import android.util.Log
import com.hotbox.f50_app.ADBService.Companion.adbIsReady
import com.hotbox.f50_app.utils.HotboxUtils.Companion.sendShellCmd
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.w3c.dom.Document
import org.w3c.dom.NodeList
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit
import javax.xml.parsers.DocumentBuilderFactory

class ShellHotbox {
    companion object {
        const val PREFS_NAME = "kano_ZTE_store"

        fun runShellCommand(command: String?, escaped: Boolean = false): String? {
            val output = StringBuilder()
            try {
                var process = Runtime.getRuntime().exec(command)
                if (escaped) {
                    process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                }
                val reader = BufferedReader(
                    InputStreamReader(process.inputStream)
                )

                var line: String?
                while ((reader.readLine().also { line = it }) != null) {
                    output.append(line).append("\n")
                }

                reader.close()
                if (!process.waitFor(30, TimeUnit.SECONDS)) {
                    process.destroyForcibly()
                    Log.w("ShellHotbox", "Process timed out after 30s: $command")
                }
            } catch (e: IOException) {
                e.printStackTrace()
                return null
            } catch (e: InterruptedException) {
                e.printStackTrace()
                return null
            }

            return output.toString().trim { it <= ' ' }
        }

        fun runShellCommand(command: String?, context: Context): String? {
            val output = StringBuilder()
            try {
                // Set HOME env var
                val env = arrayOf("HOME=${context.filesDir.absolutePath}")

                // Start process (with env vars)
                val process = Runtime.getRuntime().exec(command, env)

                val reader = BufferedReader(
                    InputStreamReader(process.inputStream)
                )
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    output.append(line).append("\n")
                }

                reader.close()
                if (!process.waitFor(30, TimeUnit.SECONDS)) {
                    process.destroyForcibly()
                    Log.w("ShellHotbox", "Process timed out after 30s: $command")
                }
            } catch (e: IOException) {
                e.printStackTrace()
                return null
            } catch (e: InterruptedException) {
                e.printStackTrace()
                return null
            }

            return output.toString().trim { it <= ' ' }
        }

        /**
         * ADB find UI widget and click
         * @return 1 0 -1
         * 1 = already on AT send screen
         * 0 = click executed successfully
         * -1 means execution failed, no text found
         */
        fun parseUiDumpAndClick(targetText: String, adbPath: String, context: Context): Number {
            val cacheFile = getUiDoc(adbPath, context)

            val doc = cacheFile
            HotboxLog.d("UFI_TOOLS_LOG", "doc read result: ${doc.getElementsByTagName("node")}")

            //tap logic
            val nodes = doc.getElementsByTagName("node")
            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                val attrs = node.attributes
                val text = attrs.getNamedItem("text")?.nodeValue ?: ""
                HotboxLog.d("UFI_TOOLS_LOG", "Node text: '$text'")
                if (text.contains(targetText)) {
                    val bounds = attrs.getNamedItem("bounds")?.nodeValue ?: continue
                    val regex = Regex("""\[(\d+),(\d+)\]\[(\d+),(\d+)\]""")
                    val match = regex.find(bounds) ?: continue
                    val (x1, y1, x2, y2) = match.destructured
                    val tapX = (x1.toInt() + x2.toInt()) / 2
                    val tapY = (y1.toInt() + y2.toInt()) / 2
                    val result = runShellCommand(
                        "$adbPath -s localhost shell input tap $tapX $tapY",
                        context
                    )
                        ?: throw Exception("Failed to execute input tap")
                    HotboxLog.d("UFI_TOOLS_LOG", "input tap click coordinates: $tapX,$tapY result: ${result} ")
                    return 0
                } else if (text.contains("AT Command:")) {
                    //Already on AT page
                    return 1
                }
            }
            return -1
        }

        /**
         * Fill input content and send AT command
         */
        fun fillInputAndSend(
            inputText: String,
            adbPath: String,
            context: Context,
            resId: String,
            btnName: List<String>,
            needBack: Boolean = true,
            useClipBoard: Boolean = false
        ): String {
            val doc = getUiDoc(adbPath, context)
            val nodes = doc.getElementsByTagName("node")
            val escapedInput = inputText.replace(" ", "%s")
            //Copy text to clipboard
            HotboxUtils.copyToClipboard(context, "sambaCommand", inputText)

            // Find input field
            var inputClicked = false
            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                val attrs = node.attributes
                val clazz = attrs.getNamedItem("class")?.nodeValue ?: ""
                val bounds = attrs.getNamedItem("bounds")?.nodeValue ?: continue

                if (clazz == "android.widget.EditText") {
                    val regex = Regex("""\[(\d+),(\d+)\]\[(\d+),(\d+)\]""")
                    val match = regex.find(bounds) ?: continue
                    val (x1, y1, x2, y2) = match.destructured
                    val tapX = (x1.toInt() + x2.toInt()) / 2
                    val tapY = (y1.toInt() + y2.toInt()) / 2

                    repeat(3) {
                        runShellCommand(
                            "$adbPath -s localhost shell input tap $tapX $tapY",
                            context
                        )
                        HotboxLog.d("UFI_TOOLS_LOG", "Click input field coordinates: $tapX,$tapY")
                    }

                    // Input text
                    if (!useClipBoard) {
                        Thread.sleep(200) // Wait for soft keyboard to appear
                        runShellCommand(
                            "$adbPath -s localhost shell input text \"$escapedInput\"",
                            context
                        )
                        HotboxLog.d("UFI_TOOLS_LOG", "Input text: $inputText")
                        inputClicked = true
                        if (escapedInput.length > 20) {
                            Thread.sleep(500) // Wait for input to finish
                        }
                        break
                    } else {
                        runShellCommand(
                            "$adbPath -s localhost shell input keyevent KEYCODE_PASTE",
                            context
                        )
                        HotboxLog.d("UFI_TOOLS_LOG", "Read clipboard, input text: $inputText")
                        inputClicked = true
                        Thread.sleep(666) // Wait for input to finish
                        break
                    }
                }
            }

            if (!inputClicked) throw Exception("EditText input field not found")

            fun getBtnAndClick(nodes_after: NodeList): String? {
                //Find button and click
                for (i in 0 until nodes_after.length) {
                    val node = nodes_after.item(i)
                    val attrs = node.attributes
                    val text = attrs.getNamedItem("text")?.nodeValue ?: ""
                    val bounds = attrs.getNamedItem("bounds")?.nodeValue ?: continue

                    if (btnName.any { it.equals(text, ignoreCase = true) }) {
                        val regex = Regex("""\[(\d+),(\d+)\]\[(\d+),(\d+)\]""")
                        val match = regex.find(bounds) ?: continue
                        val (x1, y1, x2, y2) = match.destructured
                        val tapX = (x1.toInt() + x2.toInt()) / 2
                        val tapY = (y1.toInt() + y2.toInt()) / 2
                        runShellCommand(
                            "$adbPath -s localhost shell input tap $tapX $tapY",
                            context
                        )
                        HotboxLog.d(
                            "UFI_TOOLS_LOG",
                            "Click ${btnName.joinToString(", ")} coordinates: $tapX,$tapY"
                        )
                        //Continue checking result
                        if (resId != "") {
                            val res = getTextFromUIByResourceId(resId, adbPath, context)
                            if (needBack) {
                                //Just go back
                                Thread.sleep(800) // Wait for input to finish
                                repeat(10) {
                                    runShellCommand(
                                        "$adbPath -s localhost shell input keyevent KEYCODE_BACK",
                                        context
                                    )
                                }
                            }
                            return res[0]
                        } else {
                            if (needBack) {
                                //Just go back
                                Thread.sleep(800) // Wait for input to finish
                                repeat(10) {
                                    runShellCommand(
                                        "$adbPath -s localhost shell input keyevent KEYCODE_BACK",
                                        context
                                    )
                                }
                            }
                            return ""
                        }
                    }
                }
                return null
            }

            var res: String? = null

            for (i in 0 until 10) {
                val nodes_after = getUiDoc(adbPath, context).getElementsByTagName("node")
                var temp = getBtnAndClick(nodes_after)
                if (temp != null) {
                    res = temp
                    break
                }
            }

            if (res != null) {
                return res as String
            }

            throw Exception("Not found: ${btnName.joinToString(", ")} button")
        }

        fun createShellScript(context: Context, fileName: String, scriptContent: String): File {
            val scriptFile = File(context.getExternalFilesDir(null), fileName)

            try {
                // If file exists, delete old file
                if (scriptFile.exists()) {
                    scriptFile.delete()
                }
            } catch (e: Exception) {
                HotboxLog.d("UFI_TOOLS_LOG", "Error deleting script: ${e.message}")
            }

            // Write content (writeText itself overwrites)
            scriptFile.writeText(scriptContent)

            // Set execute permission (some devices need re-setting after delete)
            scriptFile.setExecutable(true)

            return scriptFile
        }

        private fun getTextFromUIByResourceId(
            resId: String,
            adbPath: String,
            context: Context
        ): List<String> {
            val doc = getUiDoc(adbPath, context)
            val nodes = doc.getElementsByTagName("node")

            val resultTexts = mutableListOf<String>()

            for (i in 0 until nodes.length) {
                val node = nodes.item(i)
                val attrs = node.attributes

                val resourceId = attrs.getNamedItem("resource-id")?.nodeValue ?: continue
                if (resourceId == resId) {
                    val text = attrs.getNamedItem("text")?.nodeValue ?: ""
                    resultTexts.add(text)
                }
            }

            HotboxLog.d(
                "UFI_TOOLS_LOG",
                "Based on: $resId Found total ${resultTexts.size} result_text entries: $resultTexts"
            )
            return resultTexts
        }

        //Get UI
        private fun getUiDoc(adbPath: String, context: Context, maxRetry: Int = 3): Document {
            if (adbPath.isEmpty()) throw Exception("adbPath required")

            repeat(maxRetry) { attempt ->
                try {

                    // Clear old XML
                    runShellCommand("$adbPath -s localhost shell rm /sdcard/hotbox_ui.xml", context)
                    Thread.sleep(200)

                    // Dump current UI
                    runShellCommand(
                        "$adbPath -s localhost shell uiautomator dump /sdcard/hotbox_ui.xml",
                        context
                    )
                        ?: throw Exception("uiautomator dump failed")

                    Thread.sleep(300)

                    // cat reads XML content
                    val xmlContent = runShellCommand(
                        "$adbPath -s localhost shell cat /sdcard/hotbox_ui.xml",
                        context
                    )
                        ?: throw Exception("cat hotbox_ui.xml failed")

                    if (!xmlContent.trim().endsWith("</hierarchy>")) {
                        HotboxLog.w("UFI_TOOLS_LOG", "UI XML incomplete, attempt ${attempt + 1}  attempt(s)")
                        Thread.sleep(200)
                        return@repeat
                    }

                    // Convert to Document
                    val factory = DocumentBuilderFactory.newInstance()
                    val builder = factory.newDocumentBuilder()
                    val inputStream = xmlContent.byteInputStream()
                    return builder.parse(inputStream)
                } catch (e: Exception) {
                    HotboxLog.e("UFI_TOOLS_LOG", "Parse UI XML failed, attempt ${attempt + 1} : ${e.message}")
                    Thread.sleep(200)
                }
            }

            throw Exception("Unable to get complete UI dump after multiple attempts")
        }


        fun killProcessByName(processKeyword: String) {
            try {
                val psProcess = ProcessBuilder("ps").start()
                val output = psProcess.inputStream.bufferedReader().readText()

                val lines = output.lines()
                for (line in lines) {
                    if (line.contains(processKeyword)) {
                        val tokens = line.trim().split(Regex("\\s+"))
                        if (tokens.size > 1) {
                            val pid = tokens[1]
                            HotboxLog.w("UFI_TOOLS_LOG", "Matched process: $line，Preparing kill -9 $pid")
                            try {
                                ProcessBuilder("kill", "-9", pid).start().waitFor()
                                HotboxLog.w("UFI_TOOLS_LOG", "Killed -9 $pid")
                            } catch (e: Exception) {
                                HotboxLog.e("UFI_TOOLS_LOG", "kill -9 $pid failed: ${e.message}")
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "killProcessByName execution failed: ${e.message}")
            }
        }

        fun executeShellFromAssetsSubfolderWithArgs(
            context: Context,
            assetSubPath: String,
            vararg args: String,
            timeoutMs: Long = 20000,  // Default max wait 20 seconds
            onTimeout: (() -> Unit)? = null  // Timeout callback
        ): String? {
            return try {
                val assetManager = context.assets
                val inputStream = assetManager.open(assetSubPath)
                val fileName = File(assetSubPath).name
                val outFile = File(context.filesDir, fileName)

                if (!outFile.exists()) {
                    inputStream.use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    HotboxLog.d("UFI_TOOLS_LOG", "${outFile} File copy complete")
                } else {
                    HotboxLog.d("UFI_TOOLS_LOG", "${outFile} File already exists, no copy needed")
                }

                outFile.setExecutable(true)

                val command = ArrayList<String>().apply {
                    add(outFile.absolutePath)
                    addAll(args)
                }

                HotboxLog.d("UFI_TOOLS_LOG", "Executing command: ${command.joinToString(" ")}")

                val process = ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .apply {
                        environment()["HOME"] = context.filesDir.absolutePath
                    }
                    .start()

                // Start thread to read output
                val outputBuilder = StringBuilder()
                val readerThread = Thread {
                    try {
                        process.inputStream.bufferedReader().forEachLine {
                            outputBuilder.appendLine(it)
                        }
                    } catch (e: Exception) {
                        HotboxLog.w("UFI_TOOLS_LOG", "Exception reading process output: ${e.message}")
                    }
                }
                readerThread.start()

                // Wait max timeoutMs milliseconds
                val finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)

                if (!finished) {
                    HotboxLog.w("UFI_TOOLS_LOG", "Execution timeout, force destroying process")
                    process.destroy()

                    // Call callback
                    onTimeout?.invoke()
                }

                readerThread.join(100) // Wait max 100ms for output to finish
                outputBuilder.toString().trim()

            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "Execution exception: ${e.message}")
                null
            }
        }

        //Check if ADB is alive
        fun ensureAdbAlive(context: Context): Boolean {
            try {
                val adbPath = "shell/adb"

                // First check
                var result = executeShellFromAssetsSubfolderWithArgs(context, adbPath, "devices")
                HotboxLog.d("UFI_TOOLS_LOG", "adb device execution status: $result")

                if (result?.contains("localhost:5555\tdevice") == true) {
                    HotboxLog.d("UFI_TOOLS_LOG", "adbAlive, no need to start")
                    return true
                }

                HotboxLog.w("UFI_TOOLS_LOG", "adbNo device or exited, trying to start")

                // Restart ADB server
                executeShellFromAssetsSubfolderWithArgs(context, adbPath, "kill-server")
                Thread.sleep(1000)
                executeShellFromAssetsSubfolderWithArgs(context, adbPath, "connect", "localhost")

                // Wait max 10 seconds for device to become 'device'
                val maxWaitMs = 10_000
                val interval = 500
                var waited = 0

                while (waited < maxWaitMs) {
                    result = executeShellFromAssetsSubfolderWithArgs(context, adbPath, "devices")
                    HotboxLog.d("UFI_TOOLS_LOG", "Waiting for ADB to start: $result")
                    if (result?.contains("localhost:5555\tdevice") == true) {
                        HotboxLog.d("UFI_TOOLS_LOG", "ADBConnection successful")
                        return true
                    }
                    Thread.sleep(interval.toLong())
                    waited += interval
                }

                HotboxLog.e("UFI_TOOLS_LOG", "Waiting for ADB device timeout")
                return false
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "Check/start ADB failed: ${e.message}")
                return false
            }
        }

        fun executeShellFromAssetsSubfolder(
            context: Context,
            assetSubPath: String,
            outFileName: String = "tmp_script.sh"
        ): String? {
            try {
                val assetManager = context.assets

                val inputStream = assetManager.open(assetSubPath)
                val outFile = File(context.filesDir, outFileName)

                if (!outFile.exists()) {
                    inputStream.use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                }

                outFile.setExecutable(true)

                val process = Runtime.getRuntime().exec(outFile.absolutePath)

                val reader = process.inputStream.bufferedReader()
                val output = reader.readText()

                if (!process.waitFor(30, TimeUnit.SECONDS)) {
                    process.destroyForcibly()
                    Log.w("ShellHotbox", "Process timed out: ${outFile.absolutePath}")
                }

                return output
            } catch (e: Exception) {
                HotboxLog.d("UFI_TOOLS_LOG", "Execution error: ${e.message}")
                e.printStackTrace()
            }

            return null
        }


        fun runADB(context: Context) {
            //Network ADB
            //adb setprop service.adb.tcp.port 5555
            Thread {
                try {
                    runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                    runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                    Log.d("UFI_TOOLS_LOG", "Network ADB debug prop executed successfully")
                } catch (e: Exception) {
                    try {
                        runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                        runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                        Log.d("UFI_TOOLS_LOG", "Network ADB debug prop executed successfully")
                    } catch (e: Exception) {
                        Log.d("UFI_TOOLS_LOG", "Network ADB debug prop execution error: ${e.message}")
                    }
                }
                Thread.sleep(500)
                try {
                    Log.d("UFI_TOOLS_LOG", "Starting ADB IP activation process")

                    val sharedPrefs =
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

                    val ADB_IP_ENABLED = sharedPrefs.getString("ADB_IP_ENABLED", "") ?: null

                    Log.d("UFI_TOOLS_LOG", "ADB_IP_ENABLED:${ADB_IP_ENABLED}")

                    if (ADB_IP_ENABLED == "true") {
                        val ADB_IP =
                            sharedPrefs.getString("gateway_ip", "")?.substringBefore(":")
                                ?: throw Exception("No ADMIN_IP")
                        val ADMIN_PWD =
                            sharedPrefs.getString("ADMIN_PWD","Wa@9w+YWRtaW4=") ?: "Wa@9w+YWRtaW4="

                        Log.d(
                            "UFI_TOOLS_LOG", "Reading network ADB config: ADB_IP: ${
                                ADB_IP
                            } ADMIN_PWD:${
                                ADMIN_PWD.take(2)
                            }"
                        )

                        suspend fun waitUntilReachable(ip: String, timeoutSeconds: Int = 30): Boolean {
                            val intervalMillis = 300L
                            val maxAttempts = timeoutSeconds * 1000 / intervalMillis
                            val req = HotboxGoformRequest("http://$ip:8080")

                            repeat(maxAttempts.toInt()) {
                                try {
                                    val result = req.getData(
                                        mapOf(
                                            "multi_data" to "1",
                                            "cmd" to "loginfo"
                                        )
                                    )
                                    HotboxLog.d("UFI_TOOLS_LOG", "Trying to connect: $result")
                                    if (result != null) {
                                        HotboxLog.d("UFI_TOOLS_LOG", "http://$ip:8080 accessible")
                                        return true
                                    }
                                } catch (e: Exception) {
                                    HotboxLog.d("UFI_TOOLS_LOG", "Connection exception: ${e.message}")
                                }
                                delay(intervalMillis)
                            }

                            HotboxLog.e("UFI_TOOLS_LOG", "http://$ip:8080 at $timeoutSeconds  seconds not accessible")
                            return false
                        }

                        try {
                            runBlocking {
                                //Wait max 30s for official web backend to fully start
                                val reachable = waitUntilReachable(ADB_IP, 30)
                                if (!reachable) {
                                    HotboxLog.e("UFI_TOOLS_LOG", "Official web service unreachable, aborting ADB auto-start")
                                    return@runBlocking
                                }

                                val req = HotboxGoformRequest("http://$ADB_IP:8080")
                                val cookie = req.login(ADMIN_PWD)
                                if (cookie != null) {
                                    val result1 = req.postData(
                                        cookie, mapOf(
                                            "goformId" to "USB_PORT_SETTING",
                                            "usb_port_switch" to "0"
                                        )
                                    )
                                    HotboxLog.d("UFI_TOOLS_LOG", "Close ADBD result: $result1")
                                    delay(500)
                                    val result2 = req.postData(
                                        cookie, mapOf(
                                            "goformId" to "USB_PORT_SETTING",
                                            "usb_port_switch" to "1"
                                        )
                                    )
                                    HotboxLog.d("UFI_TOOLS_LOG", "Enable ADBD result: $result2")

                                    val result3 = req.postData(
                                        cookie, mapOf(
                                            "goformId" to "SetUpgAutoSetting",
                                            "UpgMode" to "0",
                                            "UpgIntervalDay" to "114514",
                                            "UpgRoamPermission" to "0"
                                        )
                                    )

                                    HotboxLog.d("UFI_TOOLS_LOG", "Disable FOTA result: $result3")

                                    val samba_result = sendShellCmd("cat /data/samba/etc/smb.conf | grep samba_exec.sh")

                                    if(samba_result.done && samba_result.content.contains("samba_exec.sh")){
                                        val result = req.postData(
                                            cookie, mapOf(
                                                "goformId" to "SAMBA_SETTING",
                                                "samba_switch" to "1",
                                            )
                                        )
                                        HotboxLog.d("UFI_TOOLS_LOG", "Enable samba result: $result")
                                    }

                                    req.logout(cookie)
                                    if (result1?.getString("result") == "success" && result2?.getString("result") == "success") {
                                        HotboxLog.d("UFI_TOOLS_LOG", "ADB_WIFI auto-start execution successful")
                                    }
                                }
                            }

                        } catch (e: Exception) {
                            HotboxLog.e("UFI_TOOLS_LOG", "ADB_WIFI execution error: ${e.message}")
                        }
                    } else {
                        Log.d("UFI_TOOLS_LOG", "No need for ADB_WIFI auto-start")
                    }
                } catch (e: Exception) {
                    Log.d("UFI_TOOLS_LOG", "ADB_WIFIAuto-start execution error: ${e.message}")
                    e.printStackTrace()
                }

                Thread.sleep(5000)
                executeShellFromAssetsSubfolderWithArgs(
                    context, "shell/adb", "start-server"
                )
                ensureAdbAlive(context)
            }.start()
        }

        fun openSMB (context: Context){
            //Samba switch closed, restart immediately
            try {
                val open_command = "settings put global samba_enable 1"
                val socketPath = File(context.filesDir, "hotbox_root_shell.sock")

                if (adbIsReady) {
                    val outFile_adb = HotboxUtils.copyFileToFilesDir(context, "shell/adb")
                    if(outFile_adb != null){
                        outFile_adb.setExecutable(true)
                        HotboxLog.d("UFI_TOOLS_LOG", "sambawas closed, trying to open (using ADB method)...")
                        val res = runShellCommand(
                            "${outFile_adb.absolutePath} -s localhost shell $open_command",
                            context
                        )
                        HotboxLog.d("UFI_TOOLS_LOG", "Open samba using ADB method result: $res")
                    }
                }

                if (socketPath.exists()) {
                    HotboxLog.d("UFI_TOOLS_LOG", "sambawas closed, trying to open (using root method)...")
                    val res =  RootShell.sendCommandToSocket(open_command.trimIndent(),
                        socketPath.absolutePath,
                        2000
                    )
                    HotboxLog.d("UFI_TOOLS_LOG", "Open samba using root method result: $res")
                }
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "smbOpen execution failed", e)
            }
        }
    }
}