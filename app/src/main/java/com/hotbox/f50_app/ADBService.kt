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
import com.hotbox.f50_app.utils.ShellHotbox
import com.hotbox.f50_app.utils.ShellHotbox.Companion.executeShellFromAssetsSubfolderWithArgs
import com.hotbox.f50_app.utils.ShellHotbox.Companion.killProcessByName
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
    private val iperfExecutor = Executors.newSingleThreadExecutor()
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
        }

        //Start scheduled tasks
        TaskSchedulerManager.init(applicationContext)
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
        val sharedPrefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
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
            val sharedPrefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            if (sharedPrefs.getString("hotbox_sms_forward_enabled", "0") == "1") {
                try {
                    SmsPoll.checkNewSmsAndSend(applicationContext)
                } catch (e: Exception) {
                    HotboxLog.e(TAG, "Error reading SMS", e)
                }
            }
            handler.postDelayed(this, 5000)
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
            try {
                HotboxLog.d(TAG, "Activating SMB built-in script...")
                SmbThrottledRunner.runOnceInThread(applicationContext)
            } catch (e: Exception) {
                HotboxLog.e(TAG, "SMB built-in script activation error")
            }
            handler.postDelayed(this, 20_000)
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
                    // Poll every 11 seconds
                    Thread.sleep(11_000)
                }
            } catch (e: Exception) {
                HotboxLog.e(TAG, "ADB Keep-alive thread exception", e)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        handlerThread.quitSafely()
        handler.removeCallbacksAndMessages(null)
        adbExecutor.shutdownNow()
        iperfExecutor.shutdownNow()
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