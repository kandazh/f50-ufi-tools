package com.hotbox.f50_app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.DeviceModelChecker
import com.hotbox.f50_app.utils.HotboxUtils
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
            }
        }
    }
}