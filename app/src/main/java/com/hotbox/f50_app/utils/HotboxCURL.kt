package com.hotbox.f50_app.utils

import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean
class HotboxCURL(private val context: Context) {
    // Prevent duplicate sends
    private val isSending = AtomicBoolean(false)

    fun send(command:String) {
        // If already sending, return immediately
        if (!isSending.compareAndSet(false, true)) {
            HotboxLog.w("UFI_TOOLS_LOG_Curl", "CURL request in progress, ignoring duplicate")
            return
        }
        Thread {
            try {
                HotboxLog.w("UFI_TOOLS_LOG_Curl", "Executing CURL: $command")
                val args = HotboxUtils.parseShellArgs(command.replaceFirst("curl", ""))
                val result = ShellHotbox.executeShellFromAssetsSubfolderWithArgs(
                    context,
                    "shell/curl",
                    *args.toTypedArray(),
                    timeoutMs = 10000
                ) ?: throw Exception("runShellCommand is null")
                HotboxLog.w("UFI_TOOLS_LOG_Curl", "CURL command execution result: $result")
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG_Curl", "curlRequest failed: ${e.message}", e)
            } finally {
                isSending.set(false)
            }
        }.start()
    }
}