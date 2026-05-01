package com.minikano.f50_sms.utils

import android.os.PowerManager
import android.util.Log

class WakeLock {

    companion object {
        private var wakeLock: PowerManager.WakeLock? = null

        fun execWakeLock(pm: PowerManager) {
            //Prevent holding duplicate wake locks
            releaseWakeLock()
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "UFI-TOOLS::WakeLock"
            )
            // Acquire with 12-hour timeout to prevent indefinite hold
            wakeLock?.acquire(12 * 60 * 60 * 1000L)
            Log.d("UFI_TOOLS_LOG", "Wake lock enabled (PARTIAL, 12h timeout)")
        }

        fun releaseWakeLock() {
            wakeLock?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "Wake lock released")
            }
            wakeLock = null
        }
    }
}