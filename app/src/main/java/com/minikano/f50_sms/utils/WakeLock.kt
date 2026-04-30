package com.minikano.f50_sms.utils

import android.os.PowerManager
import android.util.Log

class WakeLock {

    companion object {
        private var wakeLock: PowerManager.WakeLock? = null
        private var wakeLock2: PowerManager.WakeLock? = null
        private var wakeLock3: PowerManager.WakeLock? = null

        fun execWakeLock (pm: PowerManager){
            //Prevent holding duplicate wake locks
            releaseWakeLock()
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_DIM_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UFI-TOOLS::WakeLock"
            )
            wakeLock?.acquire()
            Log.d("UFI_TOOLS_LOG", "Wake lock enabled, preventing screen off!")

            wakeLock2 = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UFI-TOOLS::FULL_WAKE_LOCK"
            )
            wakeLock2?.acquire()
            Log.d("UFI_TOOLS_LOG", "Stronger wake lock enabled, keeping screen on!")

            wakeLock3 = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UFI-TOOLS::BrightWakeLock"
            )
            wakeLock3?.acquire()
            Log.d("UFI_TOOLS_LOG", "Screen brightness wake lock enabled, keeping screen on!")
        }

        fun releaseWakeLock() {
            wakeLock?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "Wake lock released")
            }
            wakeLock2?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "FULL_WAKE_LOCK released")
            }
            wakeLock3?.let {
                if (it.isHeld) it.release()
                Log.d("UFI_TOOLS_LOG", "BrightWakeLock released")
            }
        }
    }
}