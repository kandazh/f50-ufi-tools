package com.hotbox.f50_app.utils

import android.content.Context
import android.os.Build
import com.hotbox.f50_app.ADBService.Companion.adbIsReady
import com.hotbox.f50_app.ADBService.Companion.isExecutedSambaMount
import com.hotbox.f50_app.utils.HotboxUtils.Companion.sendShellCmd
import com.hotbox.f50_app.utils.ShellHotbox.Companion.executeShellFromAssetsSubfolderWithArgs
import com.hotbox.f50_app.utils.ShellHotbox.Companion.openSMB
import java.util.concurrent.atomic.AtomicBoolean
import jcifs.smb.SmbFile
import jcifs.context.SingletonContext
import java.io.File

object SmbThrottledRunner {
    private val running = AtomicBoolean(false)
    private val PREF_GATEWAY_IP = "gateway_ip"
    private val PREFS_NAME = "Hotbox_ZTE_store"

    fun runOnceInThread(context: Context) {
        if (running.get()) {
            HotboxLog.d("UFI_TOOLS_LOG", "SMB command in progress, skipping")
            return
        }
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val gatewayIP = sharedPrefs.getString(PREF_GATEWAY_IP, "192.168.0.1:445")

        HotboxLog.d("UFI_TOOLS_LOG", "SMB command in progress, IP: ${gatewayIP}，skipping")

        val host = gatewayIP?.substringBefore(":")

        running.set(true)

        Thread {
            val samba_result = sendShellCmd("cat /data/samba/etc/smb.conf | grep samba_exec.sh")
            val advancedIsEnable =
                samba_result.done && samba_result.content.contains("samba_exec.sh")
            var needOpenSMB = false
            if(advancedIsEnable) {
                try {
                    HotboxLog.d(
                        "UFI_TOOLS_LOG",
                        "Starting SMB command, connecting to: \"smb://$host/Internal/\""
                    )

                    val ctx = SingletonContext.getInstance()
                    val smbFile = SmbFile("smb://$host/Internal/", ctx)

                    if (smbFile.exists()) {
                        HotboxLog.d("UFI_TOOLS_LOG", "SMB path exists")
                        if (!isExecutedSambaMount) {
                            try {
                                val socketPath = File(context.filesDir, "hotbox_root_shell.sock")
                                if (!socketPath.exists()) {
                                    throw Exception("Command failed, socat socket not found (are advanced features enabled?)")
                                }
                                val result =
                                    RootShell.sendCommandToSocket(
                                        """
mkdir -p /sdcard/hotbox
# Mount full internal storage
[ ! -d "/data/SAMBA_SHARE/Internal" ] && mkdir -p "/data/SAMBA_SHARE/Internal"
mount | grep " /data/SAMBA_SHARE/Internal " >/dev/null 2>&1
if [ ${'$'}? -ne 0 ]; then
    mount --bind /sdcard /data/SAMBA_SHARE/Internal
    echo "Mounted /sdcard -> /data/SAMBA_SHARE/Internal"
fi
# Mount external SD card if present
if [ -d "/mnt/media_rw" ] && [ "${'$'}(ls /mnt/media_rw 2>/dev/null)" ]; then
    [ ! -d "/data/SAMBA_SHARE/External" ] && mkdir -p "/data/SAMBA_SHARE/External"
    mount | grep " /data/SAMBA_SHARE/External " >/dev/null 2>&1
    if [ ${'$'}? -ne 0 ]; then
        mount --bind /mnt/media_rw /data/SAMBA_SHARE/External
        echo "Mounted /mnt/media_rw -> /data/SAMBA_SHARE/External"
    fi
fi
                        """.trimIndent(),
                                        socketPath.absolutePath
                                    )
                                        ?: throw Exception("Please check command input format")

                                HotboxLog.d("UFI_TOOLS_LOG", "SMB mount execution result: $result")
                                isExecutedSambaMount = true
                            } catch (e: Exception) {
                                HotboxLog.e("UFI_TOOLS_LOG", "SMB mount execution failed", e)
                            }
                        }
                    } else {
                        HotboxLog.d("UFI_TOOLS_LOG", "SMBPath does not exist")
                        needOpenSMB = true
                    }
                } catch (e: Exception) {
                    HotboxLog.e("UFI_TOOLS_LOG", "SMB command error: ${e.message}")
                    needOpenSMB = true
                } finally {
                    running.set(false)
                    HotboxLog.d("UFI_TOOLS_LOG", "SMB command execution complete")
                }
                if (needOpenSMB) {
                    openSMB(context)
                }
            } else {
                HotboxLog.d("UFI_TOOLS_LOG", "No SMB config change detected, advanced features not enabled, skipping")
                running.set(false)
            }
        }.start()
    }
}