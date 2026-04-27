package com.minikano.f50_sms.utils

import android.content.Context
import android.util.Log

object DeviceModelChecker {
    suspend fun checkBlackList(context:Context): Boolean {
        Log.d("UFI_TOOLS_LOG_devcheck", "黑名单功能不启用")
        return false
    }

    fun checkIsNotUFI(context: Context):Boolean{
        val isUFI_0 = KanoUtils.isAppInstalled(context,"com.zte.web")
        val isUFI = ShellKano.runShellCommand("pm list package")
        Log.d("UFI_TOOLS_LOG_devcheck", "isUFI_0：${isUFI_0},has com.zte.web? :${isUFI?.contains("com.zte.web")} ")
        return !(isUFI != null && isUFI.contains("com.zte.web")) || !isUFI_0
    }
}