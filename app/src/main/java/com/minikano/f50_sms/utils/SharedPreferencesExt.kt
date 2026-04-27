package com.minikano.f50_sms.utils

import android.content.SharedPreferences

fun SharedPreferences.getBooleanCompat(key: String, default: Boolean): Boolean {
    return try {
        // try the normal fast path
        getBoolean(key, default)
    } catch (e: ClassCastException) {
        // fallback: it was stored as String previously; try to read string and parse
        val s = getString(key, null)
        val parsed = when {
            s == null -> default
            s.equals("true", ignoreCase = true) -> true
            s.equals("false", ignoreCase = true) -> false
            else -> s.toBooleanStrictOrNull() ?: default // best-effort parse
        }
        // migrate to boolean to avoid future ClassCastException
        edit().putBoolean(key, parsed).commit()
        parsed
    }
}
