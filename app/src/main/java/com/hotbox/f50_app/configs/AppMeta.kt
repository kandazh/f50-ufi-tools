package com.hotbox.f50_app.configs

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import com.hotbox.f50_app.modules.PREFS_NAME
import com.hotbox.f50_app.utils.DeviceModelChecker
import android.os.PowerManager
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.getBooleanCompat
import java.io.File
import androidx.core.content.edit
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.HotboxUtils.Companion.isSha256Hex
import com.hotbox.f50_app.utils.WakeLock

object AppMeta {
    var versionName: String = "unknown"
        private set

    var versionCode: Int = 0
        private set
    var model: String = Build.MODEL
        private set

    var nickName: String = Build.MODEL
        private set

    var isDeviceRooted:Boolean = false
        private set

    var isReadUseTerms:Boolean = false

    var isEnableLog:Boolean = false
        private set

    var isEnableWakeLock:Boolean = false
        private set

    var GLOBAL_SERVER_URL = "https://pan.kanokano.cn"
        private set

    var isDefaultOrWeakToken = false
        private set

    private const val PREFS_NAME = "kano_ZTE_store"
    private const val GLOBAL_SERVER_URL_KEY = "GLOBAL_SERVER_URL"
    private val PREF_ISDEBUG = "hotbox_is_debug"
    private val PREF_WAKELOCK = "wakeLock"
    private val PREF_NICKNAME = "nickname"
    private val PREF_IS_WEAK_TOKEN = "is_weak_token"

    fun updateIsDefaultOrWeakToken(context: Context,value: Boolean) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        //Persist
        prefs.edit(commit = true) {
            putBoolean(PREF_IS_WEAK_TOKEN,value)
        }
        isDefaultOrWeakToken = value
    }

    fun setGlobalServerUrl(context: Context,url: String) {
        if(url.isEmpty() || url.isBlank()) throw Exception("url is empty")
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit(commit = true) { putString(GLOBAL_SERVER_URL_KEY, url) }
        GLOBAL_SERVER_URL = url
    }

    fun setIsEnableLog(context: Context,flag: Boolean) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit(commit = true) { putBoolean(PREF_ISDEBUG, flag)}
        isEnableLog = flag
    }

    fun setIsEnableLog(prefs: SharedPreferences, flag: Boolean) {
        prefs.edit(commit = true) { putBoolean(PREF_ISDEBUG, flag) }
        isEnableLog = flag
    }

    fun setIsEnableWakeLock(context: Context,flag: Boolean) {
        val isLock = if(flag) "lock" else "unlock"
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit(commit = true) { putString(PREF_WAKELOCK, isLock)}
        isEnableWakeLock = flag
        //Update wake lock
        if (isEnableWakeLock) {
            WakeLock.execWakeLock(context.getSystemService(Context.POWER_SERVICE) as PowerManager)
        } else {
            WakeLock.releaseWakeLock()
        }
    }

    fun setNickName (prefs: SharedPreferences, nickname: String) {
        if(nickname.isEmpty()){
            nickName = Build.MODEL

        } else {
            nickName = nickname
        }
        prefs.edit(commit = true) { putString(PREF_NICKNAME, nickName) }
    }

    fun init(context: Context) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            val isWeak = prefs.getBoolean(PREF_IS_WEAK_TOKEN, false)
            updateIsDefaultOrWeakToken(context,isWeak)

            //Pre-process token
            HotboxUtils.transformLoginToken(context, prefs)

            val globalServerAddress = prefs.getString(GLOBAL_SERVER_URL_KEY, null)
            if (globalServerAddress != null) {
                GLOBAL_SERVER_URL = globalServerAddress
            }

            val pkgInfo = context.applicationContext.packageManager.getPackageInfo(context.packageName, 0)
            versionName = pkgInfo.versionName.toString()

            @Suppress("DEPRECATION")
            versionCode = pkgInfo.versionCode
            model = if (Build.MODEL.contains("MU5352")) "U30 Lite" else Build.MODEL

            val socketPath = File(context.filesDir, "hotbox_root_shell.sock")
            isDeviceRooted = socketPath.exists()

            isReadUseTerms = prefs.getString("isReadUseTerms", "false").toBoolean()

            isEnableLog = prefs.getBooleanCompat(PREF_ISDEBUG, false)

            nickName = prefs.getString("nickname",Build.MODEL) ?: Build.MODEL
        } catch (e: Exception) {
            HotboxLog.e("UFI_TOOLS_LOG","AppMeta init failed！！",e)
        }
    }
}