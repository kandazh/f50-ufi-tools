package com.minikano.f50_sms.utils

import android.util.Log
import com.minikano.f50_sms.configs.AppMeta.isEnableLog

object KanoLog {
    fun d(tag: String, message: () -> String) {
        if (isEnableLog) Log.d(tag, message())
    }
    fun d(tag: String, message:String) {
        if (isEnableLog) Log.d(tag, message)
    }

    fun i(tag: String, message: () -> String) {
        if (isEnableLog) Log.i(tag, message())
    }
    fun i(tag: String, message:String) {
        if (isEnableLog) Log.i(tag, message)
    }

    fun w(tag: String, message: () -> String) {
        if (isEnableLog) Log.w(tag, message())
    }
    fun w(tag: String, message:String) {
        if (isEnableLog) Log.w(tag, message)
    }

    fun e(tag: String, message: () -> String) {
        if (isEnableLog) Log.e(tag, message())
    }
    fun e(tag: String, message:String) {
        if (isEnableLog) Log.e(tag, message)
    }
    fun e(tag: String, message:String,e:Exception) {
        if (isEnableLog) Log.e(tag, message,e)
    }

    // 堆栈或记录日志到文件
    fun e(tag: String, throwable: Throwable, message: () -> String) {
        if (isEnableLog) Log.e(tag, message(), throwable)
    }
}