package com.hotbox.f50_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.BatteryReceiver
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxReport.Companion.reportToServer
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.HotboxUtils.Companion.isUsbDebuggingEnabled
import com.hotbox.f50_app.utils.RootShell
import com.hotbox.f50_app.utils.ShellHotbox
import com.hotbox.f50_app.utils.ShellHotbox.Companion.executeShellFromAssetsSubfolderWithArgs
import com.hotbox.f50_app.utils.ShellHotbox.Companion.killProcessByName
import com.hotbox.f50_app.utils.ClientActivityTracker
import com.hotbox.f50_app.utils.SmbThrottledRunner
import com.hotbox.f50_app.utils.SmsInfo
import com.hotbox.f50_app.utils.SmsPoll
import com.hotbox.f50_app.utils.TaskSchedulerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class ADBService : Service() {
    private lateinit var handlerThread: HandlerThread
    private lateinit var handler: Handler
    private val adbExecutor = Executors.newSingleThreadExecutor()
    private val adbWakeSignal = Object()
    private val iperfExecutor = Executors.newSingleThreadExecutor()
    private val aghWatchdogExecutor = Executors.newSingleThreadExecutor()
    private var disableFOTATimes = 3

    private  val TAG = "UFI_TOOLS_LOG_ADBService"
    private var batteryReceiver: BatteryReceiver? = null

    companion object {
        @Volatile
        var adbIsReady: Boolean = false
        var isExecutedDisabledFOTA = false
        var isExecutingDisabledFOTA = false
        var isExecutedSambaMount = false
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1234599, createNotification())

        handlerThread = HandlerThread("HotboxBackgroundHandler")
        handlerThread.start()
        handler = Handler(handlerThread.looper)
        // Execute tasks serially
        handler.post {
            resetFilesFromAssets(applicationContext)

            // Wait for file copy to complete
            startAdbKeepAliveTask(applicationContext)
            startIperfTask(applicationContext)
            val executor = Executors.newFixedThreadPool(3)
            executor.execute(runnableSMS)
            executor.execute(runnableSMB)
            // Telemetry disabled — do not execute runnableRPT
            // executor.execute(runnableRPT)
            //Subscribe to battery event receiver
            registerBatteryReceiver()

            // When a client first connects after idle, run SMB and wake ADB loop
            ClientActivityTracker.onFirstConnect = {
                handler.removeCallbacks(runnableSMB)
                handler.post(runnableSMB)
                synchronized(adbWakeSignal) { adbWakeSignal.notifyAll() }
            }
        }

        //Start scheduled tasks
        TaskSchedulerManager.init(applicationContext)

        // Setup AGH system boot hook (like legacy plugin does)
        setupAghBootHook()

        // Start AGH watchdog (checks every 5 minutes, restarts if crashed)
        startAghWatchdog()

        return START_STICKY
    }

    private fun registerBatteryReceiver(){
        batteryReceiver = BatteryReceiver(onLowBattery = {
            forwardMessage(
                """
                ${AppMeta.nickName} Battery low (10%), please charge soon~
                    Battery low (10%). Please charge your device.
                """.trimIndent()
                ,"${AppMeta.nickName} Battery low (10%)")
        },
        onVeryLowBattery = {
            forwardMessage(
                """
                ${AppMeta.nickName} Battery very low (5%), please charge soon~
                Battery is very low (5%). Please charge your device.
                """.trimIndent()
                ,"${AppMeta.nickName} Battery very low (5%)")
        },
        onFullBattery = {
            forwardMessage(
                """
                ${AppMeta.nickName} Fully charged~
                ${AppMeta.nickName} is fully charged.
                """.trimIndent()
                ,"${AppMeta.nickName} Fully charged~")

        },
        onCharge = {
            forwardMessage(
                """
                ${AppMeta.nickName} Power connected~
                ${AppMeta.nickName} power connected.
                """.trimIndent()
            ,"${AppMeta.nickName} Power connected~")
        })

        registerReceiver(
            batteryReceiver,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        )
        Log.d(TAG, "BatteryReceiver Registered")
    }

    private fun forwardMessage(message:String,title:String){
        val sharedPrefs = getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
        val isEnabledPowerStatusForward =
            (sharedPrefs.getString("hotbox_power_status_forward_enabled", "0") ?: "0") == "1"
        val isSMSForwardEnabled = sharedPrefs.getString("hotbox_sms_forward_enabled", "0") == "1"
        if (isEnabledPowerStatusForward && isSMSForwardEnabled) {
            HotboxUtils.forwardBatteryStatusMessage(this,SmsInfo(title,
               message , System.currentTimeMillis()))
        }
    }

    private fun resetFilesFromAssets(context: Context) {
        val filesDir = context.filesDir


        // Delete all files
        filesDir.listFiles()?.forEach { file ->
            if (file.isFile) {
                try {
                    file.delete()
                } catch (e: Exception) {
                    Log.e(TAG, "Delete failed:${e.message}")
                }
            }
        }

        // Copy all files from assets
        try {
            HotboxUtils.copyAssetsRecursively(context, "shell", context.filesDir)
            HotboxUtils.normalizeLineEndingsInDirShallow(context.filesDir)
            Log.d(TAG, "Files dir initialized")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize files dir: ${e.message}")
        }
    }

    private val runnableSMS = object : Runnable {
        override fun run() {
            if (!ClientActivityTracker.isActive) {
                handler.postDelayed(this, 300000)
                return
            }
            val sharedPrefs = getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            if (sharedPrefs.getString("hotbox_sms_forward_enabled", "0") == "1") {
                try {
                    SmsPoll.checkNewSmsAndSend(applicationContext)
                } catch (e: Exception) {
                    HotboxLog.e(TAG, "Error reading SMS", e)
                }
                try {
                    SmsPoll.checkNewCallAndNotify(applicationContext)
                } catch (e: Exception) {
                    HotboxLog.e(TAG, "Error checking calls", e)
                }
            }
            handler.postDelayed(this, 300000)
        }
    }

    private val rptScope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO)
    @Volatile
    private var rptRunning = false
    private val runnableRPT = object : Runnable {
        override fun run() {
            if (rptRunning) {
                HotboxLog.w(TAG, "Previous RPT not finished, skipping this time")
            } else {
                rptScope.launch {
                    rptRunning = true
                    try {
                        HotboxLog.d(TAG, "Periodically sending status...")
                        reportToServer()
                    } catch (e: Exception) {
                        HotboxLog.e(TAG, "Error sending status: ", e)
                    } finally {
                        rptRunning = false
                    }
                }
            }
            handler.postDelayed(this, TimeUnit.HOURS.toMillis(5))
        }
    }

    private val runnableSMB = object : Runnable {
        override fun run() {
            if (!ClientActivityTracker.isActive) {
                handler.postDelayed(this, 300000)
                return
            }
            try {
                HotboxLog.d(TAG, "Activating SMB built-in script...")
                SmbThrottledRunner.runOnceInThread(applicationContext)
            } catch (e: Exception) {
                HotboxLog.e(TAG, "SMB built-in script activation error")
            }
            handler.postDelayed(this, 300_000)
        }
    }

    private fun startIperfTask(context: Context){
        iperfExecutor.execute {
            try{
                HotboxLog.d(TAG, "iperf3Starting...")
                killProcessByName("iperf3")
                val result =
                    executeShellFromAssetsSubfolderWithArgs(
                        applicationContext,
                        "shell/iperf3",
                        "-s",
                        "-D",
                    )
                if (result != null) {
                    HotboxLog.d(TAG, "iperf3Started")
                } else {
                    HotboxLog.e(TAG, "iperf3Start failed (user mode)")
                }
            }catch (e:Exception){
                HotboxLog.e(TAG, "iperf3commandExecution error",e)
            }
        }
    }

    private fun startAdbKeepAliveTask(context: Context) {
        adbExecutor.execute {
            try {
                val adbPath = "shell/adb"

                while (!Thread.currentThread().isInterrupted) {
                    if (!ClientActivityTracker.isActive) {
                        HotboxLog.d(TAG, "No active client, ADB keep-alive sleeping...")
                        adbIsReady = false
                        ClientActivityTracker.checkIdle() // Release wake lock if idle
                        synchronized(adbWakeSignal) { adbWakeSignal.wait(30_000) }
                        continue
                    }
                    val isDebugEnabled = isUsbDebuggingEnabled(context)
                    if (!isDebugEnabled){
                        HotboxLog.d(TAG, "ADB not enabled, skipping ADB keep-alive")
                        adbIsReady = false
                    }
                    else {
                        HotboxLog.d(TAG, "Keeping ADB service alive...")

                        var result =
                            executeShellFromAssetsSubfolderWithArgs(context, adbPath, "devices") {
                                ShellHotbox.killProcessByName("adb")
                            }

                        if (result?.contains("localhost:5555\tdevice") == true) {
                            HotboxLog.d(TAG, "adbAlive, no need to start")
                            adbIsReady = true
                            if (!isExecutedDisabledFOTA) {
                                disableFOTATimes--
                                if (disableFOTATimes <= 0) {
                                    HotboxLog.d(
                                        TAG,
                                        "3 consecutive attempts to disable FOTA via ADB, forcingisExecutingDisabledFOTA = true"
                                    )
                                    isExecutingDisabledFOTA = true
                                }
                                val res = HotboxUtils.disableFota(applicationContext)
                                if (res) {
                                    HotboxLog.d(TAG, "Disable FOTA via ADB completed")
                                }
                                isExecutedDisabledFOTA = true
                            }
                        } else {
                            HotboxLog.w(TAG, "adbNo device or exited, trying to start")
                            adbIsReady = false

                            ShellHotbox.killProcessByName("adb")
                            Thread.sleep(1000)

                            executeShellFromAssetsSubfolderWithArgs(
                                context,
                                adbPath,
                                "connect",
                                "localhost"
                            ) {
                                ShellHotbox.killProcessByName("adb")
                            }

                            val maxWaitMs = 5_000
                            val interval = 500
                            var waited = 0

                            while (waited < maxWaitMs) {
                                result = executeShellFromAssetsSubfolderWithArgs(
                                    context,
                                    adbPath,
                                    "devices"
                                ) {
                                    ShellHotbox.killProcessByName("adb")
                                }

                                if (result?.contains("localhost:5555\tdevice") == true) {
                                    HotboxLog.d(TAG, "ADBConnection successful: $result")
                                    adbIsReady = true
                                    break
                                } else {
                                    HotboxLog.d(TAG, "ADBNot connected: $result")
                                }

                                Thread.sleep(interval.toLong())
                                waited += interval
                            }
                        }
                    }
                    // Poll interval — interruptible so client connect wakes it immediately
                    synchronized(adbWakeSignal) { adbWakeSignal.wait(11_000) }
                }
            } catch (e: Exception) {
                HotboxLog.e(TAG, "ADB Keep-alive thread exception", e)
            }
        }
    }

    private fun setupAghBootHook() {
        // F50 uses /sdcard/ufi_tools_boot.sh to auto-start services at system boot
        // Add AGH boot hook so it starts even if app crashes
        try {
            val aghBinary = java.io.File("/data/agh/agh/bin/AdGuardHome")
            val bootHookFile = java.io.File("/sdcard/ufi_tools_boot.sh")
            val aghBootScript = java.io.File("/data/agh/boot.sh")
            
            if (aghBinary.exists()) {
                // Make boot.sh executable
                aghBootScript.setExecutable(true)
                HotboxLog.d(TAG, "AGH boot.sh is executable")
                
                // Check if boot hook already exists
                if (bootHookFile.exists()) {
                    val bootContent = bootHookFile.readText()
                    if (!bootContent.contains("agh") || !bootContent.contains("boot.sh")) {
                        // Add boot hook
                        bootHookFile.appendText("\nsh /data/agh/boot.sh &\n")
                        HotboxLog.d(TAG, "AGH boot hook added to /sdcard/ufi_tools_boot.sh")
                    }
                } else {
                    // Create boot file with AGH hook
                    bootHookFile.writeText("sh /data/agh/boot.sh &\n")
                    HotboxLog.d(TAG, "Created /sdcard/ufi_tools_boot.sh with AGH boot hook")
                }
            }
        } catch (e: Exception) {
            HotboxLog.e(TAG, "Failed to setup AGH boot hook: ${e.message}")
        }
    }

    private fun startAghWatchdog() {
        aghWatchdogExecutor.execute {
            try {
                // F50 is always-on hotspot device - uptime is critical
                // No battery concerns, so aggressive monitoring is appropriate
                
                var lastRestartAttemptMs = 0L
                
                while (!Thread.currentThread().isInterrupted) {
                    try {
                        val pidFile = java.io.File("/data/agh/agh/bin/agh.pid")
                        val binary = java.io.File("/data/agh/agh/bin/AdGuardHome")
                        val socketPath = java.io.File(applicationContext.filesDir, "hotbox_root_shell.sock")
                        
                        // Try to detect boot phase from /proc/uptime (seconds since boot)
                        val inBootPhase = try {
                            val uptimeSeconds = java.io.File("/proc/uptime").readText().split(" ")[0].toDouble().toLong()
                            uptimeSeconds < 300 // First 5 minutes after device boot
                        } catch (e: Exception) {
                            false // If can't read uptime, assume not in boot phase
                        }

                        // If binary doesn't exist, nothing to start
                        if (!binary.exists()) {
                            Thread.sleep(if (inBootPhase) 5_000L else 300_000L)
                            continue
                        }

                        // Check if socket exists for sending commands
                        if (!socketPath.exists()) {
                            // Socket doesn't exist yet - wait for it to be established
                            // Root shell might not be ready yet, especially during boot
                            HotboxLog.d(TAG, "AGH watchdog: root shell socket not ready, waiting...")
                            Thread.sleep(if (inBootPhase) 5_000L else 300_000L)
                            continue
                        }

                        // Binary and socket exist - check if AGH is running
                        var needsRestart = false
                        
                        if (pidFile.exists()) {
                            // Check if process is actually alive
                            val checkResult = RootShell.sendCommandToSocket(
                                "pid=\$(cat /data/agh/agh/bin/agh.pid 2>/dev/null); " +
                                "if [ -n \"\$pid\" ] && kill -0 \"\$pid\" 2>/dev/null && " +
                                "grep -q AdGuardHome /proc/\$pid/cmdline 2>/dev/null; then " +
                                "echo ALIVE; else echo DEAD; fi",
                                socketPath.absolutePath,
                                5000
                            )
                            if (checkResult == null || !checkResult.contains("ALIVE")) {
                                needsRestart = true
                                HotboxLog.w(TAG, "AGH watchdog: process dead/stale, restarting")
                            }
                        } else {
                            // No PID file = not running
                            needsRestart = true
                            HotboxLog.d(TAG, "AGH watchdog: no PID file, restarting")
                        }

                        // Restart immediately if needed - F50 is always-on, uptime critical
                        if (needsRestart) {
                            val timeSinceLastAttempt = System.currentTimeMillis() - lastRestartAttemptMs
                            if (timeSinceLastAttempt > 3_000) { // Minimum 3 seconds between restart attempts to avoid tight loop
                                HotboxLog.d(TAG, "AGH watchdog: attempting restart via tool.sh")
                                val restartResult = RootShell.sendCommandToSocket(
                                    "rm -f /data/agh/agh/bin/agh.pid; sh /data/agh/agh/scripts/tool.sh start 2>&1",
                                    socketPath.absolutePath,
                                    30000
                                )
                                lastRestartAttemptMs = System.currentTimeMillis()
                                if (restartResult != null && restartResult.contains("error", ignoreCase = true)) {
                                    HotboxLog.w(TAG, "AGH restart may have failed: $restartResult")
                                }
                            }
                        }

                        // Check frequency:
                        // - Boot phase (first 5 min): every 5 seconds (aggressive for fast startup)
                        // - Normal: every 5 minutes (F50 always-on, AGH rarely crashes, reduce polling overhead)
                        Thread.sleep(if (inBootPhase) 5_000L else 300_000L)
                        
                    } catch (e: Exception) {
                        HotboxLog.e(TAG, "AGH watchdog error: ${e.message}")
                        Thread.sleep(10_000L) // Brief wait on error
                    }
                }
            } catch (_: InterruptedException) {
                HotboxLog.d(TAG, "AGH watchdog stopped")
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handlerThread.quitSafely()
        handler.removeCallbacksAndMessages(null)
        adbExecutor.shutdownNow()
        iperfExecutor.shutdownNow()
        aghWatchdogExecutor.shutdownNow()
        batteryReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        TaskSchedulerManager.scheduler?.stop()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        val channelId = "hotbox_adb_service"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "adb_serviceBackground service",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("adb_serviceRunning in background")
            .setContentText("Executing adb_service scheduled tasks")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .build()
    }
}