package com.minikano.f50_sms.configs

import android.content.Context
import android.os.Build
import java.io.File
import java.io.IOException

object SMBConfig {
    private val ALLOWED_COMMAND = "/system/bin/sh /data/data/com.minikano.f50_sms/files/samba_exec.sh"

    fun writeConfig(context: Context): String? {
        // Sanitize model name: only allow alphanumeric, space, dash, underscore
        val model = Build.MODEL.replace(Regex("[^a-zA-Z0-9 _\\-]"), "_")
        val fileName = "smb.conf"
        val presetString = """[global]
    workgroup = SAMBA
    netbios name = Android
    server string = Android Samber Server
    security = user
    passdb backend = smbpasswd:/data/samba/etc/smbpasswd
    map to guest = bad user
    root preexec = $ALLOWED_COMMAND

[$model]
    comment = Android Server
    path = /data/SAMBA_SHARE
    browseable = yes
    writable = yes
    public = yes
    guest ok = yes

[Internal]
    comment = Android Server
    path = /sdcard/DCIM
    browseable = yes
    writable = yes
    public = yes
    guest ok = yes

[External]
    comment = Android Server
    path = /mnt/media_rw
    browseable = yes
    writable = yes
    public = yes
    guest ok = yes

[SDCard]
    comment = Android Server
    path = /storage/sdcard0
    browseable = yes
    writable = yes
    public = yes
    guest ok = yes
            """.trimIndent()
        return try {
            val dir = context.getExternalFilesDir(null)
            if (dir != null) {
                val file = File(dir, fileName)
                file.writeText(presetString, Charsets.UTF_8)
                file.absolutePath
            } else {
                null
            }
        } catch (e: IOException) {
            e.printStackTrace()
            null
        }
    }
}