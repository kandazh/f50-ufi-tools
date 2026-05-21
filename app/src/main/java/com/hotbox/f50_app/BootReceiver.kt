package com.hotbox.f50_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.DeviceModelChecker
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.RootShell
import com.hotbox.f50_app.utils.ShellHotbox
import com.hotbox.f50_app.utils.UniqueDeviceIDManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("UFI_TOOLS_LOG", "Boot broadcast received, starting service")
            //Initialize SharedPreferences
            HotboxUtils.initSharedPerfs(context)
            AppMeta.init(context)
            UniqueDeviceIDManager.init(context)

            // Run all checks in background, then start services only if device is valid
            CoroutineScope(Dispatchers.IO).launch {
                //check
                val isNotUFI = DeviceModelChecker.checkIsNotUFI(context)
                if (isNotUFI){
                    Log.d("UFI_TOOLS_LOG", "Device is not UFI/MIFI, terminating")
                    return@launch
                }

                UniqueDeviceIDManager.init(context)
                val isUnSupportDevice = DeviceModelChecker.checkBlackList(context)
                Log.d("UFI_TOOLS_LOG", "Blocklist check result: $isUnSupportDevice")

                if (isUnSupportDevice) {
                    Log.d("UFI_TOOLS_LOG", "Unsupported device detected, not starting services")
                    return@launch
                }

                // Device is valid — start services on main thread
                withContext(Dispatchers.Main) {
                    val startIntent = Intent(context, WebService::class.java)
                    startIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startForegroundService(startIntent)
                    Log.d("UFI_TOOLS_LOG", "Starting WebService")

                    val startIntent_ADB = Intent(context, ADBService::class.java)
                    startIntent_ADB.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startForegroundService(startIntent_ADB)
                    Log.d("UFI_TOOLS_LOG", "Starting ADBService")
                }

                //Activate network ADB etc.
                ShellHotbox.runADB(context)
                Log.d("UFI_TOOLS_LOG", "Activate network ADB")

                // Auto-start AdGuardHome if installed - try immediately as early as possible
                try {
                    val aghBinary = java.io.File("/data/agh/agh/bin/AdGuardHome")
                    if (aghBinary.exists()) {
                        val socketPath = java.io.File(context.filesDir, "hotbox_root_shell.sock")
                        // Wait briefly for socket (first attempt to start - early boot safety)
                        var waited = 0
                        while (!socketPath.exists() && waited < 10) {
                            Thread.sleep(500)
                            waited++
                        }
                        if (socketPath.exists()) {
                            Log.d("UFI_TOOLS_LOG", "AGH binary found at boot, attempting early startup")
                            try {
                                RootShell.sendCommandToSocket(
                                    "sh /data/agh/agh/scripts/tool.sh start",
                                    socketPath.absolutePath,
                                    15000
                                )
                                Log.d("UFI_TOOLS_LOG", "AGH early startup command sent")
                            } catch (e: Exception) {
                                Log.d("UFI_TOOLS_LOG", "Early AGH startup failed, watchdog will retry: ${e.message}")
                            }
                        } else {
                            Log.d("UFI_TOOLS_LOG", "AGH binary found but socket not available at boot, watchdog will start it later")
                        }
                    }
                } catch (e: Exception) {
                    Log.e("UFI_TOOLS_LOG", "Failed to check AGH at boot", e)
                }
            }
        }
    }
}