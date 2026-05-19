package com.hotbox.f50_app.utils

import android.app.usage.NetworkStatsManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import com.hotbox.f50_app.ADBService.Companion.isExecutingDisabledFOTA
import com.hotbox.f50_app.modules.deviceInfo.MyStorageInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Calendar
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import androidx.core.content.edit
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.configs.AppMeta.updateIsDefaultOrWeakToken
import com.hotbox.f50_app.utils.SmsPoll.forwardByEmail
import com.hotbox.f50_app.utils.SmsPoll.forwardSmsByCurl
import com.hotbox.f50_app.utils.SmsPoll.forwardSmsByDingTalk
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.ln
import kotlin.math.pow

class HotboxUtils {
    companion object {
        fun HmacSignature(secret: String, data: String): String {
            val hmacMd5Bytes = hmac("HmacMD5", secret, data)
            val mid = hmacMd5Bytes.size / 2
            val part1 = hmacMd5Bytes.sliceArray(0 until mid)
            val part2 = hmacMd5Bytes.sliceArray(mid until hmacMd5Bytes.size)
            val sha1 = sha256(part1)
            val sha2 = sha256(part2)
            val combined = sha1 + sha2
            val finalHash = sha256(combined)
            return finalHash.joinToString("") { "%02x".format(it) }
        }

        fun hmac(algorithm: String, key: String, data: String): ByteArray {
            val mac = Mac.getInstance(algorithm)
            val secretKeySpec = SecretKeySpec(key.toByteArray(), algorithm)
            mac.init(secretKeySpec)
            return mac.doFinal(data.toByteArray())
        }

        fun sha256(data: ByteArray): ByteArray {
            val digest = MessageDigest.getInstance("SHA-256")
            return digest.digest(data)
        }

        fun sha256Hex(input: String): String {
            val bytes = input.toByteArray(Charsets.UTF_8)
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
            return digest.joinToString("") { "%02x".format(it) }
        }

        fun Long.toReadableSize(decimals: Int = 2): String {
            if (this <= 0) return "0 B"

            val units = arrayOf("B", "KB", "MB", "GB", "TB", "PB", "EB")
            val base = 1024.0

            val exp = (ln(this.toDouble()) / ln(base)).toInt()
            val value = this / base.pow(exp)

            return "%.${decimals}f%s".format(value, units[exp])
        }

        //Get battery level
        fun getBatteryPercentage(context: Context): Int {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter) ?: return -1

            val level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1)

            return ((level / scale.toFloat()) * 100).toInt()
        }

        private var lastStorageInfo: MyStorageInfo? = null
        private var lastStorageUpdateTime: Long = 0

        fun getCachedRemovableStorageInfo(context: Context): MyStorageInfo? {
            val now = System.currentTimeMillis()
            if (lastStorageInfo == null || now - lastStorageUpdateTime > 10_000) {
                val dirs = context.getExternalFilesDirs(null)
                for (file in dirs) {
                    val path = file?.absolutePath ?: continue
                    if (!path.contains("/storage/emulated/0")) {
                        val statFs = StatFs(path)
                        val total = statFs.blockSizeLong * statFs.blockCountLong
                        val available = statFs.blockSizeLong * statFs.availableBlocksLong

                        lastStorageInfo = MyStorageInfo(path, total, available)
                        lastStorageUpdateTime = now
                        break
                    }
                }
            }
            return lastStorageInfo
        }

        fun getStartOfDayMillis(): Long {
            val cal = Calendar.getInstance()
            cal.set(Calendar.HOUR_OF_DAY, 0)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.timeInMillis
        }

        fun getStartOfMonthMillis(): Long {
            val cal = Calendar.getInstance()
            cal.set(Calendar.DAY_OF_MONTH,1)
            cal.set(Calendar.HOUR_OF_DAY, 0)
            cal.set(Calendar.MINUTE, 0)
            cal.set(Calendar.SECOND, 0)
            cal.set(Calendar.MILLISECOND, 0)
            return cal.timeInMillis
        }

        fun getTodayDataUsage(
            context: Context,
        ): Long {
            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val startTime = getStartOfDayMillis()
            val endTime = System.currentTimeMillis()

            var totalBytes = 0L

            try {
                val summary = networkStatsManager.querySummaryForDevice(
                    ConnectivityManager.TYPE_MOBILE, null, startTime, endTime
                )
                totalBytes = summary.rxBytes + summary.txBytes
            } catch (e: Exception) {
                e.printStackTrace()
            }

            return totalBytes
        }

        data class MonthlyDataBreakdown(
            val total: Long,
            val download: Long, // rxBytes = data received from network = downloaded
            val upload: Long,   // txBytes = data sent to network = uploaded
        )

        fun getMonthlyDataUsage(
            context: Context,
        ): Long {
            return getMonthlyDataBreakdown(context).total
        }

        fun getMonthlyDataBreakdown(
            context: Context,
        ): MonthlyDataBreakdown {
            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val startTime = getStartOfMonthMillis()
            val endTime = System.currentTimeMillis()

            try {
                val summary = networkStatsManager.querySummaryForDevice(
                    ConnectivityManager.TYPE_MOBILE, null, startTime, endTime
                )
                return MonthlyDataBreakdown(
                    total = summary.rxBytes + summary.txBytes,
                    download = summary.rxBytes,
                    upload = summary.txBytes,
                )
            } catch (e: Exception) {
                e.printStackTrace()
            }

            return MonthlyDataBreakdown(0L, 0L, 0L)
        }

        //Get data usage on demand
        fun getRangeDataUsage(
            context: Context,
            startMills:Long,
            endMills:Long
        ): Long {
            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val startTime = startMills
            val endTime = endMills

            var totalBytes = 0L

            try {
                val summary = networkStatsManager.querySummaryForDevice(
                    ConnectivityManager.TYPE_MOBILE, null, startTime, endTime
                )
                totalBytes = summary.rxBytes + summary.txBytes
            } catch (e: Exception) {
                e.printStackTrace()
            }

            return totalBytes
        }

        fun getRangeDailyDataUsage(
            context: Context,
            startMills: Long,
            endMills: Long
        ): List<Map<String, String>> {
            val result = mutableListOf<Map<String, String>>()

            if (startMills > endMills) return result

            val networkStatsManager =
                context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

            val calendar = Calendar.getInstance()
            calendar.timeInMillis = startMills
            calendar.set(Calendar.HOUR_OF_DAY, 0)
            calendar.set(Calendar.MINUTE, 0)
            calendar.set(Calendar.SECOND, 0)
            calendar.set(Calendar.MILLISECOND, 0)

            val endCalendar = Calendar.getInstance()
            endCalendar.timeInMillis = endMills

            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())

            while (calendar.timeInMillis <= endMills) {
                val currentDayStart = calendar.timeInMillis

                val dayStart = maxOf(currentDayStart, startMills)

                val dayEndCalendar = calendar.clone() as Calendar
                dayEndCalendar.set(Calendar.HOUR_OF_DAY, 23)
                dayEndCalendar.set(Calendar.MINUTE, 59)
                dayEndCalendar.set(Calendar.SECOND, 59)
                dayEndCalendar.set(Calendar.MILLISECOND, 999)

                val dayEnd = minOf(dayEndCalendar.timeInMillis, endMills)

                var totalBytes = 0L

                try {
                    val summary = networkStatsManager.querySummaryForDevice(
                        ConnectivityManager.TYPE_MOBILE,
                        null,
                        dayStart,
                        dayEnd
                    )
                    totalBytes = summary.rxBytes + summary.txBytes
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                result.add(
                    mapOf(
                        "date" to sdf.format(Date(currentDayStart)),
                        "usage" to totalBytes.toString()
                    )
                )

                calendar.add(Calendar.DAY_OF_MONTH, 1)
            }

            return result
        }

        // Parse URL-encoded request body
        fun parseUrlEncoded(data: String): Map<String, String> {
            val params = mutableMapOf<String, String>()
            val pairs = data.split("&")

            for (pair in pairs) {
                val keyValue = pair.split("=")
                if (keyValue.size == 2) {
                    val key = keyValue[0]
                    val value = keyValue[1]
                    params[key] = java.net.URLDecoder.decode(value, Charsets.UTF_8.name())  // decode
                }
            }

            return params
        }


        //Get memory info
        fun parseMeminfo(meminfo: String): Float {
            val memMap = mutableMapOf<String, Long>()

            meminfo.lines().forEach { line ->
                val parts = line.split(Regex("\\s+"))
                if (parts.size >= 2) {
                    val key = parts[0].removeSuffix(":")
                    val value = parts[1].toLongOrNull() ?: return@forEach
                    memMap[key] = value
                }
            }

            val total = memMap["MemTotal"] ?: return 0f
            val free = memMap["MemFree"] ?: 0
            val cached = memMap["Cached"] ?: 0
            val buffers = memMap["Buffers"] ?: 0

            val used = total - free - cached - buffers
            return used.toFloat() / total
        }

        fun parseCpuStat(raw: String): Pair<Long, Long>? {
            val line = raw.lines().firstOrNull { it.startsWith("cpu ") } ?: return null
            val parts = line.trim().split(Regex("\\s+"))
            if (parts.size < 8) return null

            val user = parts[1].toLongOrNull() ?: return null
            val nice = parts[2].toLongOrNull() ?: return null
            val system = parts[3].toLongOrNull() ?: return null
            val idle = parts[4].toLongOrNull() ?: return null
            val iowait = parts[5].toLongOrNull() ?: 0
            val irq = parts[6].toLongOrNull() ?: 0
            val softirq = parts[7].toLongOrNull() ?: 0

            val total = user + nice + system + idle + iowait + irq + softirq
            val idleAll = idle + iowait
            return Pair(total, idleAll)
        }

        fun getChunkCount(param: String?): Int {
            val default = 4
            val max = 1024

            return param?.toIntOrNull()?.let {
                when {
                    it <= 0 -> default
                    it > max -> max
                    else -> it
                }
            } ?: default
        }

        fun copyToClipboard(context: Context, label: String, text: String) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText(label, text)
            clipboard.setPrimaryClip(clip)
        }

        fun copyFileToFilesDir(
            context: Context,
            path: String,
            skipIfExists: Boolean = true
        ): File? {
            val assetManager = context.assets
            val fileName = File(path).name
            val outFile = File(context.filesDir, fileName)

            // If append mode and target file exists, return it directly to avoid interfering with executable
            if (skipIfExists && outFile.exists()) {
                HotboxLog.d("UFI_TOOLS_LOG", "File already exists, skipping copy: ${outFile.absolutePath}")
                return outFile
            }

            val input = try {
                assetManager.open(path)
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "assets  does not contain file: $path")
                return null
            }

            return try {
                HotboxLog.d(
                    "UFI_TOOLS_LOG",
                    "Starting copy: $fileName to ${context.filesDir}（skipIfExists？：$skipIfExists）"
                )
                input.use { ins ->
                    FileOutputStream(outFile, skipIfExists).use { out ->
                        ins.copyTo(out)
                    }
                }
                HotboxLog.d("UFI_TOOLS_LOG", "Copy $fileName succeeded -> ${outFile.absolutePath}")
                outFile
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "Copy $fileName failed: ${e.message}")
                null
            }
        }

        fun parseShellArgs(command: String): List<String> {
            val matcher = Regex("""(["'])(.*?)(?<!\\)\1|(\S+)""") // Handle single/double quoted and unquoted params
            return matcher.findAll(command).map {
                val quoted = it.groups[2]?.value
                val plain = it.groups[3]?.value
                when {
                    quoted != null -> quoted
                    plain != null -> plain.replace("\\", "")
                    else -> ""
                }
            }.toList()
        }

        fun isAppInstalled(context: Context, packageName: String): Boolean {
            return try {
                context.packageManager.getPackageInfo(packageName, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }

        fun adaptIPChange(
            context: Context,
            userTouched: Boolean = false,
            onIpChanged: ((String) -> Unit)? = null
        ) {
            val prefs = context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            val ip_add = prefs.getString("gateway_ip", null)
            val need_auto_ip = prefs.getString("auto_ip_enabled", true.toString())
            val currentIp = IPManager.getHotspotGatewayIp("8080")

            if ((ip_add != null && need_auto_ip == "true") || userTouched) {
                HotboxLog.d("UFI_TOOLS_LOG", "Auto-detect IP gateway: $currentIp")
                if (currentIp == null) {
                    HotboxLog.d("UFI_TOOLS_LOG", "Auto-detect IP gateway failed")
                    Handler(Looper.getMainLooper()).post {
                        Toast.makeText(context, "Auto-detect IP gateway failed...", Toast.LENGTH_SHORT).show()
                    }
                    return
                }
                if ((currentIp != ip_add) || userTouched) {
                    if (userTouched) {
                        HotboxLog.d("UFI_TOOLS_LOG", "User clicked, auto-detect IP gateway")
                        Handler(Looper.getMainLooper()).post {
                            Toast.makeText(context, "Auto-detect IP gateway~", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        HotboxLog.d(
                            "UFI_TOOLS_LOG",
                            "Local IP gateway change detected, auto-changing to: $currentIp"
                        )
                        Handler(Looper.getMainLooper()).post {
                            Toast.makeText(
                                context,
                                "Local IP gateway change detected, auto-changing to: $currentIp",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                    prefs.edit(commit = true) { putString("gateway_ip", currentIp) }
                    if (currentIp != null) {
                        onIpChanged?.invoke(currentIp)
                    } // Notify Compose to update UI
                }
            } else if (need_auto_ip == "true") {
                //Possibly first start
                prefs.edit(commit = true) { putString("gateway_ip", currentIp) }
                HotboxLog.d("UFI_TOOLS_LOG", "Possibly first launch, auto-changing gateway to: $currentIp")
            }
        }

        private fun isADBEnabled(context: Context): Boolean {
            return try {
                runBlocking(Dispatchers.IO) {
                    val sharedPrefs =
                        context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
                    val ADB_IP =
                        sharedPrefs.getString("gateway_ip", "")?.substringBefore(":")
                            ?: throw Exception("No ADMIN_IP")

                    val req = HotboxGoformRequest("http://$ADB_IP:8080")
                    val result = req.getData(mapOf("cmd" to "usb_port_switch"))
                    val adb_enabled = result?.getString("usb_port_switch")
                    Log.d("UFI_TOOLS_LOG", "Query ADB enabled status: $adb_enabled")
                    adb_enabled == "1"
                }
            } catch (e: Exception) {
                Log.e("UFI_TOOLS_LOG", "Query ADB enabled status execution error: ${e.message}")
                false
            }
        }

        fun copyAssetToExternalStorage(
            context: Context,
            assetPath: String,
            skipIfExists: Boolean = false
        ): File? {
            val fileName = File(assetPath).name
            val outFile = File(context.getExternalFilesDir(null), fileName)

            // If append mode and target file exists, return it directly to avoid interfering with executable
            if (skipIfExists && outFile.exists()) {
                HotboxLog.d("UFI_TOOLS_LOG", "External file already exists, skipping copy: ${outFile.absolutePath}")
                return outFile
            }

            val input = try {
                context.assets.open(assetPath)
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "assets  does not contain file: $assetPath")
                return null
            }

            return try {
                HotboxLog.d(
                    "UFI_TOOLS_LOG",
                    "Starting copy: $fileName to external storage dir (skipIfExists?: $skipIfExists）"
                )
                input.use { ins ->
                    FileOutputStream(outFile, skipIfExists).use { out ->
                        ins.copyTo(out)
                    }
                }
                HotboxLog.d("UFI_TOOLS_LOG", "Copy succeeded -> ${outFile.absolutePath}")
                outFile
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "Copy failed: ${e.message}")
                null
            }
        }

        //Recursively copy all dirs and files from assets to files
        fun copyAssetsRecursively(
            context: Context,
            assetPath: String = "",
            destDir: File = context.filesDir
        ) {
            val assetManager = context.assets
            val fileList = assetManager.list(assetPath) ?: return

            for (fileName in fileList) {
                val fullAssetPath = if (assetPath.isEmpty()) fileName else "$assetPath/$fileName"
                val outFile = File(destDir, fileName)

                if ((assetManager.list(fullAssetPath)?.isNotEmpty() == true)) {
                    // Is directory, recursively copy
                    outFile.mkdirs()
                    copyAssetsRecursively(context, fullAssetPath, outFile)
                } else {
                    // Is file, copy
                    assetManager.open(fullAssetPath).use { input ->
                        FileOutputStream(outFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    outFile.setExecutable(true)
                    outFile.setReadable(true)
                }
            }
        }

        fun normalizeLineEndingsInDirShallow(dir: File) {
            if (!dir.exists() || !dir.isDirectory) return

            dir.listFiles()?.forEach { file ->
                if (file.isFile && file.extension == "sh") {
                    try {
                        val bytes = file.readBytes()

                        // Whether contains \r
                        if (!bytes.contains('\r'.code.toByte())) return@forEach

                        val normalized = bytes
                            .toString(Charsets.UTF_8)
                            .replace("\r\n", "\n")
                            .replace("\r", "\n")

                        file.writeText(normalized, Charsets.UTF_8)
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
        }

        fun getStatusCode(urlStr: String): Int {
            val url = URL(urlStr)
            val connection = url.openConnection() as HttpURLConnection
            return try {
                connection.requestMethod = "GET"
                connection.connectTimeout = 1500
                connection.readTimeout = 1500
                connection.instanceFollowRedirects = false
                connection.connect()
                connection.responseCode // Return status code
            } catch (e: Exception) {
                e.printStackTrace()
                -1 // Indicates request failed
            } finally {
                connection.disconnect()
            }
        }


        private var cachedTotal = 0L
        private var lastUpdate = 0L
        fun getCachedTodayUsage(context: Context): Long {
            val now = System.currentTimeMillis()
            if (now - lastUpdate > 10_000) { // Update every 10 seconds
                cachedTotal = getTodayDataUsage(context)
                lastUpdate = now
            }
            return cachedTotal
        }

        private var cachedMonthlyTotal = 0L
        private var lastMonthlyUpdate = 0L
        fun getCachedMonthlyUsage(context: Context): Long {
            val now = System.currentTimeMillis()
            if (now - lastMonthlyUpdate > 10_000) { // Update every 10 seconds
                cachedMonthlyTotal = getMonthlyDataUsage(context)
                lastMonthlyUpdate = now
            }
            return cachedMonthlyTotal
        }

        fun getSELinuxStatus(): String {
            try {
                val process = Runtime.getRuntime().exec("getenforce")
                val reader = process.inputStream.bufferedReader()
                return reader.readLine().trim()
            } catch (e: Exception) {
                e.printStackTrace()
                return "Unknown"
            }
        }

        @Serializable
        data class ShellResult(
            val done: Boolean,   // true: Normal output; false: Error or timeout
            val content: String  // Output content or error message
        )

        fun sendShellCmd(cmd: String, timeoutSeconds: Long = 300): ShellResult {
            if (cmd.isEmpty()) return ShellResult(done = false, content = "Error: empty command")

            return try {
                val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", cmd))

                val output = StringBuilder()
                val error = StringBuilder()

                val reader = process.inputStream.bufferedReader()
                val errorReader = process.errorStream.bufferedReader()

                // Start two threads to read output, avoid blocking
                val outThread = Thread {
                    reader.useLines { lines ->
                        lines.forEach { line -> output.appendLine(line) }
                    }
                }
                val errThread = Thread {
                    errorReader.useLines { lines ->
                        lines.forEach { line -> error.appendLine(line) }
                    }
                }

                outThread.start()
                errThread.start()

                // Wait for execution, max timeoutSeconds seconds
                val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)

                if (!finished) {
                    process.destroyForcibly() // Timeout kills the process
                    return ShellResult(done = false, content = "Error: Command timed out after $timeoutSeconds seconds")
                }

                // Ensure output threads end
                outThread.join()
                errThread.join()

                return if (error.isNotEmpty()) {
                    ShellResult(done = false, content = error.toString().trim())
                } else {
                    ShellResult(done = true, content = output.toString().trim())
                }
            } catch (e: Exception) {
                e.printStackTrace()
                ShellResult(done = false, content = "Exception: ${e.message}")
            }
        }

        fun disableFota(context: Context):Boolean{
            if(isExecutingDisabledFOTA){
                HotboxLog.w("UFI_TOOLS_LOG", "Disable FOTA operation in progress, no need to repeat")
                return false
            }
            try {
                isExecutingDisabledFOTA = true
                // Copy dependency files
                val outFileAdb = copyFileToFilesDir(context, "shell/adb")
                    ?: throw Exception("Failed to copy adb to filesDir")

                // Set execute permission
                outFileAdb.setExecutable(true)

                val cmds = listOf(
                    "${outFileAdb.absolutePath} -s localhost shell pm disable-user --user 0 com.zte.zdm",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.zdm",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 cn.zte.aftersale",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.zdmdaemon",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.zdmdaemon.install",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.analytics",
                    "${outFileAdb.absolutePath} -s localhost shell pm uninstall -k --user 0 com.zte.neopush"
                )

                cmds.forEach{item->ShellHotbox.runShellCommand(item, context = context)}
                return true
            } catch (e:Exception){
                return false
            } finally {
                isExecutingDisabledFOTA = false
            }
        }

        fun isWeakToken(token: String): Boolean {
            val t = token.ifBlank { "admin" }

            val rules: List<(String) -> Boolean> = listOf(
                { it == "admin" },           // Default weak password
                { it.length < 8 },           // Minimum length
                { !it.any { c -> c.isDigit() } }, // No digits
                { !it.any { c -> c.isLetter() } } // No letters
            )

            return rules.any { rule -> rule(t) }
        }

        fun isUsbDebuggingEnabled(context: Context): Boolean {
            return try {
                Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1
            } catch (e: Exception) {
                try {
                    Settings.Secure.getInt(context.contentResolver, Settings.Secure.ADB_ENABLED, 0) == 1
                } catch (e: Exception) {
                    //Cannot read due to permissions, default is Enabled
                    true
                }
            }
        }

        fun normalizePath(rawPath: String): String {
            fun decodeOnce(s: String): String {
                return try {
                    URLDecoder.decode(s, StandardCharsets.UTF_8.name())
                } catch (e: Exception) {
                    s
                }
            }

            var p = decodeOnce(rawPath)
            p = decodeOnce(p)

            p = p.replace('\\', '/')

            p = p.replace(Regex("/+"), "/")

            if (!p.startsWith("/")) p = "/$p"

            return p
        }

        fun normalizeLeadingSlashes(p: String): String {
            var s = p.replace('\\', '/')
            s = s.replace(Regex("^/+"), "/")
            if (!s.startsWith("/")) s = "/$s"
            return s
        }

        fun isSha256Hex(s: String?): Boolean {
            return !s.isNullOrBlank() && Regex("^[a-fA-F0-9]{64}$").matches(s)
        }

        fun transformLoginToken(context: Context,prefs: SharedPreferences){
            //Pre-process token，If token stored as plaintext, perform hash
            val token = prefs.getString("login_token","") ?: ""
            if(!(token.isEmpty() || token.isBlank())){
                //If stored token is not hash, change it
                if(!isSha256Hex(token) ){
                    val hashToken = sha256Hex(token)
                    prefs.edit(commit = true) { putString("login_token", hashToken) }
                }
            }
        }
        private val PREFS_NAME = "Hotbox_ZTE_store"
        private val PREF_GATEWAY_IP = "gateway_ip"
        private val PREF_LOGIN_TOKEN = "login_token"
        private val PREF_TOKEN_ENABLED = "login_token_enabled"
        private val PREF_AUTO_IP_ENABLED = "auto_ip_enabled"
        private val PREF_ISDEBUG = "hotbox_is_debug"
        private val PREF_WAKELOCK = "wakeLock"

        private val PREF_POWER_STATUS_FORWARD = "hotbox_power_status_forward_enabled"

        fun initSharedPerfs(context: Context){
            //Initialize login_token
            val spf = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            HotboxUtils.transformLoginToken(context,spf)
            val existing = spf.all
            spf.edit(commit = true) {
                if (!existing.containsKey(PREF_LOGIN_TOKEN)) {
                    putString(PREF_LOGIN_TOKEN, HotboxUtils.sha256Hex("admin"))
                    updateIsDefaultOrWeakToken(context,true)
                }
                if (!existing.containsKey(PREF_ISDEBUG)) {
                    putBoolean(PREF_ISDEBUG, false)
                }
                if (!existing.containsKey(PREF_GATEWAY_IP)) {
                    putString(PREF_GATEWAY_IP, "192.168.0.1:8080")
                }
                if (!existing.containsKey(PREF_TOKEN_ENABLED)) {
                    putString(PREF_TOKEN_ENABLED, true.toString())
                }
                if (!existing.containsKey(PREF_AUTO_IP_ENABLED)) {
                    putString(PREF_AUTO_IP_ENABLED, true.toString())
                }
                if (!existing.containsKey(PREF_WAKELOCK)) {
                    putString(PREF_WAKELOCK, "lock")
                }
                if (!existing.containsKey(PREF_POWER_STATUS_FORWARD)) {
                    putString(PREF_POWER_STATUS_FORWARD, "1")
                }

            }
        }

        private var catchedFlowMonth : Long = 0L
        private var lastMonthlyFlowUpdate = 0L
        fun getCatchedFlowMonth(context: Context): Long {
            val now = System.currentTimeMillis()
            if (now - lastMonthlyFlowUpdate > 10_000) { // Update every 10 seconds
               try {
                    runBlocking(Dispatchers.IO) {
                        val sharedPrefs =
                            context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
                        val ADB_IP =
                            sharedPrefs.getString("gateway_ip", "")?.substringBefore(":")
                        val req = HotboxGoformRequest("http://$ADB_IP:8080")
                        val result = req.getData(mapOf(
                            "cmd" to "monthly_rx_bytes,monthly_tx_bytes"
                        ))

                        val monthlyRxBytes = result?.getLong("monthly_rx_bytes")
                        val monthlyTxBytes = result?.getLong("monthly_tx_bytes")

                        if(monthlyRxBytes == null || monthlyTxBytes == null){
                            throw Exception("monthly_rx_bytes=$monthlyRxBytes,monthly_tx_bytes:$monthlyTxBytes")
                        }

                        val summaryBytes = monthlyRxBytes + monthlyTxBytes
                        catchedFlowMonth = summaryBytes
                    }
                } catch (e: Exception) {
                    Log.e("UFI_TOOLS_LOG", "Query official backend data usage error: ${e.message}")
                }
                lastMonthlyFlowUpdate = now
            }
            return catchedFlowMonth
        }
        fun buildStatusSmsMsg(text:String,context: Context,TAG:String): String {
            if(text.isBlank()) return text
            var replacedCurl = text
            runBlocking(Dispatchers.IO) {
                try {
                    val templates = listOf<String>(
                        "{{cpu-usage}}" ,
                        "{{mem-usage}}" ,
                        "{{app-ver}}" ,
                        "{{battery-level}}" ,
                        "{{battery-current}}" ,
                        "{{battery-voltage}}" ,
                        "{{model}}" ,
                        "{{boot-time}}" ,
                        "{{cpu-temp}}" ,
                        "{{daily-flow}}" ,
                        "{{monthly-flow-count}}" ,
                        "{{monthly-flow-sum}}" ,
                        "{{nickname}}" ,
                    )
                    if(replacedCurl.contains(templates[0])){
                        val usage = calculateCpuUsage()
                        val cpuUsageRes = Json.parseToJsonElement(usage)
                            .jsonObject["cpu"]
                            ?.jsonPrimitive
                            ?.double
                        replacedCurl = replacedCurl
                            .replace(templates[0],"${cpuUsageRes}%")
                    }
                    if(replacedCurl.contains(templates[1])){
                        val mem = getMemoryUsage()
                        val memUsageRes = Json.parseToJsonElement(mem)
                            .jsonObject["mem_usage_percent"]
                            ?.jsonPrimitive
                            ?.double
                        replacedCurl = replacedCurl
                            .replace(templates[1],"${memUsageRes}%")
                    }
                    if(replacedCurl.contains(templates[2])){
                        replacedCurl = replacedCurl
                            .replace(templates[2],AppMeta.versionName)
                    }
                    if(replacedCurl.contains(templates[3])){
                        val batteryLevel: Int = HotboxUtils.getBatteryPercentage(context)
                        replacedCurl = replacedCurl
                            .replace(templates[3],"$batteryLevel%")
                    }
                    if(replacedCurl.contains(templates[4]) || replacedCurl.contains(templates[5])){
                        val batteryStatus = readBatteryStatus()
                        if(replacedCurl.contains(templates[4])){
                            replacedCurl = replacedCurl
                                .replace(templates[4],"${batteryStatus.current_uA/1000}mA")
                        }
                        if(replacedCurl.contains(templates[5])){
                            val text = String.format("%.2f", batteryStatus.voltage_uV / 1_000_000.0)
                            replacedCurl = replacedCurl
                                .replace(templates[5],"${text}V")
                        }
                    }
                    if(replacedCurl.contains(templates[6])){
                        replacedCurl = replacedCurl
                            .replace(templates[6],"${AppMeta.model}")
                    }
                    if(replacedCurl.contains(templates[7])){
                        try {
                            val result = sendShellCmd("cut -d. -f1 /proc/uptime")
                            if (!result.done) throw Exception(result.content)
                            HotboxLog.d(TAG, "cut -d. -f1 /proc/uptime Execution result: $result")
                            val time = result.content.toLongOrNull()
                                ?.takeIf { it >= 0 }
                                ?.let { "%.2f".format(it / 3600.0) }
                                ?: "Unknown"
                            replacedCurl = replacedCurl
                                .replace(templates[7], "${time}h")
                        } catch (e: Exception){
                            HotboxLog.e(TAG, "Error getting device uptime info: ${e.message}")
                        }
                    }
                    if(replacedCurl.contains(templates[8])){
                        val (maxTemp) = readThermalZones()
                        val temp = maxTemp
                            .takeIf { it >= 0 }
                            ?.let { "%.2f".format(it / 1000.0) }
                            ?: "Unknown"
                        replacedCurl = replacedCurl
                            .replace(templates[8], "${temp}°C")
                    }
                    if(replacedCurl.contains(templates[9])){
                        val dailyData = getCachedTodayUsage(context)
                        replacedCurl = replacedCurl
                            .replace(templates[9], dailyData.toReadableSize())
                    }
                    //Monthly data usage (Android)
                    if(replacedCurl.contains(templates[10])){
                        val dailyData = getCachedMonthlyUsage(context)
                        replacedCurl = replacedCurl
                            .replace(templates[10], dailyData.toReadableSize())
                    }
                    //Monthly data usage (official backend)
                    if(replacedCurl.contains(templates[11])){
                        replacedCurl = replacedCurl
                            .replace(templates[11], getCatchedFlowMonth(context).toReadableSize())
                    }
                    //Nickname
                    if(replacedCurl.contains(templates[12])){
                        replacedCurl = replacedCurl
                            .replace(templates[12], AppMeta.nickName)
                    }
                } catch (e: Exception) {
                    HotboxLog.e(TAG, "Error getting device info: ${e.message}")
                }
            }
            return replacedCurl
        }

        //Low battery forward notification
        fun forwardBatteryStatusMessage(context: Context,smsContent: SmsInfo) {
            try {
                val sharedPrefs =
                    context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
                val sms_forward_method = sharedPrefs.getString("hotbox_sms_forward_method", "") ?: ""
                when (sms_forward_method) {
                    "SMTP" -> {
                        forwardByEmail(smsContent, context)
                    }
                    "CURL" -> {
                        forwardSmsByCurl(smsContent, context)
                    }
                    "DINGTALK" -> {
                        forwardSmsByDingTalk(smsContent, context)
                    }
                    "SMS" -> {
                        SmsPoll.forwardBySms(smsContent, context)
                    }
                }
                HotboxLog.d("UFI_TOOLS_LOG_LowBatteryForward","Low battery forward message succeeded, type: $sms_forward_method")
            } catch (e: Exception){
                HotboxLog.e("UFI_TOOLS_LOG_LowBatteryForward","Low battery forward message error: ",e)
            }
        }
    }
}