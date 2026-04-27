package com.minikano.f50_sms.utils

import android.content.Context
import android.util.Log
import java.io.File
import java.util.UUID
import androidx.core.content.edit

object UniqueDeviceIDManager {

    private var cachedUUID: String? = null
    private lateinit var uuidFile: File
    private var initialized = false
    private val PREFS_NAME = "kano_ZTE_store"

    /**
     * 必须先调用此方法初始化，传入 Context，
     * 初始化后才能调用 getUUID()
     */
    fun init(context: Context) {
        if (initialized) return
        uuidFile = File(File(context.filesDir, "userid"), "id")
        cachedUUID = loadOrCreateUUID(context)
        initialized = true
    }

    /**
     * 获取UUID，必须先调用 init() 完成初始化，否则会抛异常
     */
    fun getUUID(): String? {
        check(initialized) { "UniqueDeviceIDManager must be initialized first by calling init(context)" }
        return cachedUUID
    }

    private fun loadOrCreateUUID(context: Context): String? {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val storedUUID = prefs.getString("device_uuid", null)
            if (!storedUUID.isNullOrEmpty()) {
                return storedUUID
            }
            val newUUID = UUID.randomUUID().toString()
            prefs.edit(commit = true) { putString("device_uuid", newUUID) }
            newUUID
        } catch (e: Exception) {
            Log.e("UFI_TOOLS_LOG", "设备唯一标识符读取失败", e)
            null
        }
    }
}