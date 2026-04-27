package com.minikano.f50_sms.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.BatteryManager

class BatteryReceiver(
    private val onLowBattery: () -> Unit,
    private val onVeryLowBattery: () -> Unit,
    private val onFullBattery: () -> Unit,
    private val onCharge: () -> Unit,
) : BroadcastReceiver() {

    private var triggeredLowBattery = false
    private var triggeredVeryLowBattery = false
    private var triggeredFullBattery = false
    private var triggeredCharging = false

    override fun onReceive(context: Context?, intent: Intent?) {
        intent ?: return

        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)

        if (level < 0 || scale <= 0) return

        val batteryPct = level * 100 / scale

        val isDischarging = status == BatteryManager.BATTERY_STATUS_DISCHARGING
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL

        val isFull = status == BatteryManager.BATTERY_STATUS_FULL ||
                (batteryPct >= 100 && isCharging)

        if (batteryPct <= 10 && batteryPct > 5 && isDischarging && !triggeredLowBattery) {
            triggeredLowBattery = true
            onLowBattery()
        }

        if (batteryPct <= 5 && isDischarging && !triggeredVeryLowBattery) {
            triggeredVeryLowBattery = true
            onVeryLowBattery()
        }

        if (isFull && !triggeredFullBattery) {
            triggeredFullBattery = true
            onFullBattery()
        }

        if (isCharging && !triggeredCharging && !isFull) {
            triggeredCharging = true
            onCharge()
        }

        if (batteryPct > 15) {
            triggeredLowBattery = false
        }

        if (batteryPct > 10) {
            triggeredVeryLowBattery = false
        }

        if (!isFull) {
            triggeredFullBattery = false
        }

        if (!isCharging) {
            triggeredCharging = false
        }
    }
}