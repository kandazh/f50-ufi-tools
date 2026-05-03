package com.hotbox.f50_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.UniqueDeviceIDManager
import com.hotbox.f50_app.utils.ClientActivityTracker
import com.hotbox.f50_app.utils.WakeLock
import kotlin.concurrent.thread

class WebService : Service() {
    private var webServer: HotboxWebServer? = null
    private val port = 2333
    private val SERVER_INTENT = "com.hotbox.f50_app.SERVER_STATUS_CHANGED"
    private val UI_INTENT = "com.hotbox.f50_app.UI_STATUS_CHANGED"

    @Volatile
    private var allowAutoStart = true
    private var allowAutoReStart = true

    private val statusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action
            Log.d("UFI_TOOLS_LOG", "WebService Received Intent")
            if (action == UI_INTENT) {
                val shouldStart = intent.getBooleanExtra("status", false)
                if (shouldStart) {
                    startWebServer()
                } else {
                    stopWebServer()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        AppMeta.init(this)
        // Call once to initialize when Application or Activity starts:
        UniqueDeviceIDManager.init(this)

        //Detect IP changes, adapt to user IP subnet changes
        HotboxUtils.adaptIPChange(applicationContext)

        val prefs = getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
        val needWakeLock = prefs.getString("wakeLock", "lock") ?: "lock"
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        // Initialize activity tracker — wake lock will only be acquired when a client connects
        ClientActivityTracker.init(pm, needWakeLock == "lock")
        HotboxLog.d("UFI_TOOLS_LOG","Wake lock deferred until client connects (enabled=${needWakeLock == "lock"})")

        // Register broadcast receiver
        registerReceiver(statusReceiver, IntentFilter(UI_INTENT), Context.RECEIVER_EXPORTED)

        // Single startForeground call with one notification
        startForeground(114514, createNotification())

        allowAutoReStart = true
        startWebServer()

        Log.d("UFI_TOOLS_LOG", "WebService Init Success!")
    }

    private val serverLock = Any()

    private fun startWebServer() {
        val prefs = getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
        Thread {
            synchronized(serverLock) {
                if (webServer != null) {
                    sendBroadcast(Intent(SERVER_INTENT).putExtra("status", true))
                    return@synchronized
                }

                val currentIp = prefs.getString("gateway_ip", "0.0.0.0:8080") ?: "0.0.0.0:8080"
                allowAutoStart = true
                try {
                    Log.d("UFI_TOOLS_LOG", "Starting web service, binding to: 0.0.0.0:$port")
                    val server = HotboxWebServer(applicationContext, 2333, currentIp)
                    server.start()
                    webServer = server
                    sendBroadcast(Intent(SERVER_INTENT).putExtra("status", true))
                    Log.d("UFI_TOOLS_LOG", "Service started successfully, address: 0.0.0.0:$port")
                } catch (fallbackEx: Exception) {
                    webServer = null
                    Log.e("UFI_TOOLS_LOG", "Service start failed: ${fallbackEx.message}")
                    sendBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
                }
            }
        }.start()
    }

    private fun stopWebServer() {
        Thread {
            synchronized(serverLock) {
                allowAutoStart = false
                allowAutoReStart = false

                val server = webServer ?: run {
                    sendBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
                    return@synchronized
                }

                try {
                    server.stop()
                    webServer = null
                    sendBroadcast(Intent(SERVER_INTENT).putExtra("status", false))
                    Log.d("UFI_TOOLS_LOG", "Web server stopped")
                } catch (e: Exception) {
                    Log.e("UFI_TOOLS_LOG", "Failed to stop service: ${e.message}", e)
                }
            }
        }.start()
    }

    override fun onDestroy() {
        unregisterReceiver(statusReceiver)
        stopWebServer()
        super.onDestroy()
    }

    private fun createNotification(): Notification {
        val channelId = "web_server_channel"
        val channel = NotificationChannel(
            channelId, "Web Server", NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)

        val builder =
            NotificationCompat.Builder(this, channelId).setContentTitle("ZTE Tools Web Server")
                .setContentText("Service running in background")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setOngoing(true)

        return builder.build()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}