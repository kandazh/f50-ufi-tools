package com.minikano.f50_sms.utils

import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean
class KanoCURL(private val context: Context) {
    // Prevent duplicate sends
    private val isSending = AtomicBoolean(false)

    fun send(command:String) {
        // If already sending, return immediately
        if (!isSending.compareAndSet(false, true)) {
            KanoLog.w("UFI_TOOLS_LOG_Curl", "CURL request in progress, ignoring duplicate")
            return
        }
        Thread {
            try {
                KanoLog.w("UFI_TOOLS_LOG_Curl", "Executing CURL: $command")
                val args = KanoUtils.parseShellArgs(command.replaceFirst("curl", ""))
                val result = ShellKano.executeShellFromAssetsSubfolderWithArgs(
                    context,
                    "shell/curl",
                    *args.toTypedArray(),
                    timeoutMs = 10000
                ) ?: throw Exception("runShellCommand is null")
                KanoLog.w("UFI_TOOLS_LOG_Curl", "CURL command execution result: $result")
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG_Curl", "curlRequest failed: ${e.message}", e)
            } finally {
                isSending.set(false)
            }
        }.start()
    }
}