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
     * Must call this method to initialize first, pass Context,
     * Can only call getUUID() after initialization
     */
    fun init(context: Context) {
        if (initialized) return
        uuidFile = File(File(context.filesDir, "userid"), "id")
        cachedUUID = loadOrCreateUUID(context)
        initialized = true
    }

    /**
     * Get UUID, must call init() first or throws exception
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
            Log.e("UFI_TOOLS_LOG", "Device unique identifier read failed", e)
            null
        }
    }
}