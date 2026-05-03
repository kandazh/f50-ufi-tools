package com.hotbox.f50_app.utils

import android.os.PowerManager

/**
 * Tracks whether any browser client is actively using the app.
 * Polling services check [isActive] to decide whether to run or sleep.
 * Also manages the WakeLock — acquires when client connects, releases when idle.
 */
object ClientActivityTracker {
    @Volatile
    private var lastRequestTimestamp: Long = 0L

    @Volatile
    private var wakeLockHeld: Boolean = false

    private var powerManager: PowerManager? = null
    private var wakeLockEnabled: Boolean = true

    /** How long after last request before we consider the app "idle" */
    private const val IDLE_TIMEOUT_MS = 2 * 60 * 1000L // 2 minutes

    /** Initialize with PowerManager reference and user's wake lock preference */
    fun init(pm: PowerManager, enabled: Boolean) {
        powerManager = pm
        wakeLockEnabled = enabled
    }

    /** Call on every HTTP request from a client */
    fun markActive() {
        lastRequestTimestamp = System.currentTimeMillis()
        if (wakeLockEnabled && !wakeLockHeld) {
            powerManager?.let {
                WakeLock.execWakeLock(it)
                wakeLockHeld = true
            }
        }
    }

    /** Call periodically to release wake lock when idle */
    fun checkIdle() {
        if (!isActive && wakeLockHeld) {
            WakeLock.releaseWakeLock()
            wakeLockHeld = false
        }
    }

    /** True if a client has made a request within the idle timeout */
    val isActive: Boolean
        get() = (System.currentTimeMillis() - lastRequestTimestamp) < IDLE_TIMEOUT_MS
}
