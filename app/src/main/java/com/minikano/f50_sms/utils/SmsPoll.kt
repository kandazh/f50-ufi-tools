package com.minikano.f50_sms.utils

import android.content.Context
import android.net.Uri
import com.minikano.f50_sms.configs.AppMeta
import com.minikano.f50_sms.utils.KanoUtils.Companion.buildStatusSmsMsg
import com.minikano.f50_sms.utils.KanoUtils.Companion.sendShellCmd
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class SmsInfo(val address: String, val body: String, val timestamp: Long)

object SmsPoll {
    private var lastSms: SmsInfo? = null

    //store
    private val PREFS_NAME = "kano_ZTE_store"
    private val TAG = "UFI_TOOLS_LOG_SmsPool"

    fun checkNewSmsAndSend(context: Context) {
        val sms = getLatestSms(context) ?: return

        val now = System.currentTimeMillis()
        val minute = 2
        val withinMin = now - sms.timestamp <= minute * 60 * 1000
        val isNew = lastSms == null || sms != lastSms

        if (withinMin && isNew) {
            KanoLog.d(TAG, "New SMS: ${sms.address} - ${sms.body}")
            lastSms = sms

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // Forward pre-processing
            val keywords = sharedPrefs.getString("kano_sms_forward_blacklist_keywords", "") ?: ""
            val phone = sharedPrefs.getString("kano_sms_forward_blacklist_phone", "") ?: ""

            val phoneList = phone
                .split('\n')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            if (phoneList.contains(sms.address)) {
                KanoLog.d(TAG, "Source number ${sms.address} in phone blocklist, skipping forward")
                return
            }

            val keywordsList = keywords
                .split('\n')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            for (item in keywordsList) {
                if (sms.body.contains(item)) {
                    KanoLog.d(TAG, "SMS matched keyword [$item]，skipping SMS forward")
                    return
                }
            }

            val sms_forward_method = sharedPrefs.getString("kano_sms_forward_method", "") ?: ""
            when (sms_forward_method) {
                "SMTP" -> {
                    forwardByEmail(lastSms, context)
                }
                "CURL" -> {
                    forwardSmsByCurl(lastSms, context)
                }
                "DINGTALK" -> {
                    forwardSmsByDingTalk(lastSms, context)
                }
            }
        } else {
            KanoLog.d(
                TAG,
                "No new SMS, within ${minute}min: $withinMin, is new: $isNew"
            )
        }
    }

    //Forward via CURL
    fun forwardSmsByCurl(sms_data: SmsInfo?, context: Context) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val originalCurl = sharedPrefs.getString("kano_sms_curl", null)
        if (originalCurl.isNullOrEmpty()) {
            KanoLog.e(TAG, "curl Config error: kano_sms_curl is empty")
            return
        }

        KanoLog.d(TAG, "Starting SMS forwarding... (CURL)")
        try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneId.systemDefault())
            val smsText = JSONObject.quote(sms_data.body.trim()).removeSurrounding("\"")
            val smsFrom = sms_data.address
            val smsTime = formatter.format(Instant.ofEpochMilli(sms_data.timestamp))

            //Replace and send
            var replacedCurl = originalCurl
                .replace("{{sms-body}}", smsText)
                .replace("{{sms-time}}", smsTime)
                .replace("{{sms-from}}", smsFrom).trimIndent()

            //Find other replaceable placeholders
            replacedCurl = buildStatusSmsMsg(replacedCurl,context, TAG)

            KanoCURL(context).send(replacedCurl)
        } catch (e: Exception){
            KanoLog.e(TAG,"SMS forward (forwardSmsByCurl) error: ",e)
        }
    }

    //Forward via SMTP email
    fun forwardByEmail(sms_data: SmsInfo?, context: Context,notSMS: Boolean = false) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val smtpHost = sharedPrefs.getString("kano_smtp_host", null)
        if (smtpHost.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP Config error: kano_smtp_host is empty")
            return
        }

        val smtpTo = sharedPrefs.getString("kano_smtp_to", null)
        if (smtpTo.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP Config error: kano_smtp_to is empty")
            return
        }

        val smtpPort = sharedPrefs.getString("kano_smtp_port", null)
        if (smtpPort.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP Config error: kano_smtp_port is empty")
            return
        }

        val username = sharedPrefs.getString("kano_smtp_username", null)
        if (username.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP Config error: kano_smtp_username is empty")
            return
        }

        val password = sharedPrefs.getString("kano_smtp_password", null)
        if (password.isNullOrEmpty()) {
            KanoLog.e(TAG, "SMTP Config error: kano_smtp_password is empty")
            return
        }

        val smtpClient = KanoSMTP(smtpHost, smtpPort, username, password)

        KanoLog.d(TAG, "Starting SMS forwarding... (SMTP)")

        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault())
        val previewText = sms_data.body.trimStart().let {
            if (it.length > 37) it.take(37) + "…" else it
        }
        val shouldForwardDeviceInfo = sharedPrefs.getString("kano_smtp_forward_device_info","0")?: "0"
        var statusText = ""
        if(shouldForwardDeviceInfo == "1") {
            statusText = buildStatusSmsMsg(
            """
            <p><b>🌐 Daily usage: </b>{{daily-flow}}</p>
            <p><b>🌛 Monthly usage (advanced backend stats): </b>{{monthly-flow-count}}  </p>
            <p><b>🌛 Monthly usage (official backend stats): </b>{{monthly-flow-sum}}</p>
            <p><b>🔥 CPU temp: </b>{{cpu-temp}}</p>
            <p><b>🖥️ CPU usage: </b>{{cpu-usage}}</p>
            <p><b>🧠 Memory usage: </b>{{mem-usage}}</p>
            <p><b>🔋 Battery info: </b>{{battery-level}} {{battery-current}} {{battery-voltage}}</p>
            <p><b>⏱️ Uptime: </b>{{boot-time}}</p>
            <p><b>📱 Device name: </b>{{model}}({{nickname}})</p>
            <p><b>📦 APP version: </b>{{app-ver}}</p>
            """.trimIndent(), context, TAG
            )
        }
        var body =
        """
        <div>
            <p>${sms_data!!.body.trimStart()}</p>
            <p>📩 <b>From: </b>${sms_data.address}</p>
            <p>⏰ <b>Time: </b>${formatter.format(Instant.ofEpochMilli(sms_data.timestamp))}</p>
            <hr/>
            $statusText
            <div style="text-align: center;">
                <i>Powered by <a href="https://github.com/kanoqwq/UFI-TOOLS" target="_blank">UFI-TOOLS</a></i>
            </div>
        </div>
        """.trimIndent()
        if(notSMS){
            body =
            """
            <div>
                $statusText
                <div style="text-align: center;">
                    <i>Powered by <a href="https://github.com/kanoqwq/UFI-TOOLS" target="_blank">UFI-TOOLS</a></i>
                </div>
            </div>
            """.trimIndent()
        }
        smtpClient.sendEmail(
            to = smtpTo,
            subject = previewText,
            body = body
        )
    }

    //Forward via DingTalk webhook
    fun forwardSmsByDingTalk(sms_data: SmsInfo?, context: Context,notSMS: Boolean = false) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val webhookUrl = sharedPrefs.getString("kano_dingtalk_webhook", null)
        if (webhookUrl.isNullOrEmpty()) {
            KanoLog.e(TAG, "DingTalk config error: kano_dingtalk_webhook is empty")
            return
        }

        val secret = sharedPrefs.getString("kano_dingtalk_secret", null)

        KanoLog.d(TAG, "Starting SMS forwarding... (DingTalk)")
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault())
        val smsText = JSONObject.quote(sms_data.body.trim()).removeSurrounding("\"")
        val smsFrom = sms_data.address
        val smsTime = formatter.format(Instant.ofEpochMilli(sms_data.timestamp))

        val shouldForwardDeviceInfo = sharedPrefs.getString("kano_dingtalk_forward_device_info","0")?: "0"
        var statusText = ""
        if(shouldForwardDeviceInfo == "1"){
            statusText = buildStatusSmsMsg(
            """
            🌐 Daily usage: {{daily-flow}}    
            🌛 Monthly usage (advanced backend stats): {{monthly-flow-count}}    
            🌛 Monthly usage (official backend stats): {{monthly-flow-sum}}    
            🔥 CPU temp: {{cpu-temp}}
            🖥️ CPU usage: {{cpu-usage}}
            🧠 Memory usage: {{mem-usage}}
            🔋 Battery info: {{battery-level}} {{battery-current}} {{battery-voltage}}
            ⏱️ Uptime: {{boot-time}}
            📱 Device name: {{model}}({{nickname}})
            📦 APP version: {{app-ver}}
            """.trimIndent(),context, TAG)
        }
        var smsTypeString =
        """
        📱 New SMS notification
            
        📄 content: $smsText
        📞 From: $smsFrom
        ⏰ Time: $smsTime
        """.trimIndent()
        if(notSMS){
            smsTypeString = "📱 Device info\n"
        }
        // Build DingTalk message content
        val messageContent = listOf(
            smsTypeString,
            statusText,
            "\nPowered by UFI-TOOLS"
        ).filter { it.isNotBlank() }
            .joinToString("\n")
        val dingTalkClient = KanoDingTalk(webhookUrl, secret)
        dingTalkClient.sendMessage(messageContent)
    }

    fun getLatestSms(context: Context): SmsInfo? {
        val uri = Uri.parse("content://sms/inbox")
        val projection = arrayOf("address", "body", "date")
        val sortOrder = "date DESC"

        return try {
            val cursor = context.contentResolver.query(uri, projection, null, null, sortOrder)
            cursor?.use {
                if (it.moveToFirst()) {
                    val address = it.getString(it.getColumnIndexOrThrow("address"))
                    val body = it.getString(it.getColumnIndexOrThrow("body"))
                    val date = it.getLong(it.getColumnIndexOrThrow("date"))
                    SmsInfo(address, body, date)
                } else null
            }
        } catch (e: Exception) {
            KanoLog.e(TAG, "No SMS permission, cannot read SMS", e)
            null
        }
    }
}