package com.hotbox.f50_app.utils

import android.content.Context
import android.util.Log

object DeviceModelChecker {
    suspend fun checkBlackList(context:Context): Boolean {
        Log.d("UFI_TOOLS_LOG_devcheck", "Blocklist feature disabled")
        return false
    }

    fun checkIsNotUFI(context: Context):Boolean{
        val isUFI_0 = HotboxUtils.isAppInstalled(context,"com.zte.web")
        val isUFI = ShellHotbox.runShellCommand("pm list package")
        Log.d("UFI_TOOLS_LOG_devcheck", "isUFI_0：${isUFI_0},has com.zte.web? :${isUFI?.contains("com.zte.web")} ")
        return !(isUFI != null && isUFI.contains("com.zte.web")) || !isUFI_0
    }
}