package com.minikano.f50_sms

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
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.KanoUtils
import com.minikano.f50_sms.utils.UniqueDeviceIDManager
import com.minikano.f50_sms.utils.WakeLock
import kotlin.concurrent.thread

class WebService : Service() {
    private var webServer: KanoWebServer? = null
    private val port = 2333
    private val SERVER_INTENT = "com.minikano.f50_sms.SERVER_STATUS_CHANGED"
    private val UI_INTENT = "com.minikano.f50_sms.UI_STATUS_CHANGED"

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
        KanoUtils.adaptIPChange(applicationContext)

        val prefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
        val needWakeLock = prefs.getString("wakeLock", "lock") ?: "lock"
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if(needWakeLock != "lock") {
            KanoLog.d("UFI_TOOLS_LOG","Wake lock not needed, releasing...")
            WakeLock.releaseWakeLock()
        } else {
            KanoLog.d("UFI_TOOLS_LOG","Wake lock needed, executing...")
            WakeLock.execWakeLock(pm)
        }

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
        val prefs = getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
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
                    val server = KanoWebServer(applicationContext, 2333, currentIp)
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