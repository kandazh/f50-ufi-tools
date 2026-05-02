package com.hotbox.f50_app.utils

import android.content.Context
import android.net.Uri
import android.provider.CallLog
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.HotboxUtils.Companion.buildStatusSmsMsg
import com.hotbox.f50_app.utils.HotboxUtils.Companion.sendShellCmd
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
    private val PREFS_NAME = "Hotbox_ZTE_store"
    private val TAG = "UFI_TOOLS_LOG_SmsPool"

    fun checkNewSmsAndSend(context: Context) {
        val sms = getLatestSms(context) ?: return

        val now = System.currentTimeMillis()
        val minute = 2
        val withinMin = now - sms.timestamp <= minute * 60 * 1000
        val isNew = lastSms == null || sms != lastSms

        if (withinMin && isNew) {
            HotboxLog.d(TAG, "New SMS: ${sms.address} - ${sms.body}")
            lastSms = sms

            val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

            // Forward pre-processing
            val keywords = sharedPrefs.getString("hotbox_sms_forward_blacklist_keywords", "") ?: ""
            val phone = sharedPrefs.getString("hotbox_sms_forward_blacklist_phone", "") ?: ""

            val phoneList = phone
                .split('\n')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            if (phoneList.contains(sms.address)) {
                HotboxLog.d(TAG, "Source number ${sms.address} in phone blocklist, skipping forward")
                return
            }

            val keywordsList = keywords
                .split('\n')
                .map { it.trim() }
                .filter { it.isNotEmpty() }

            for (item in keywordsList) {
                if (sms.body.contains(item)) {
                    HotboxLog.d(TAG, "SMS matched keyword [$item]，skipping SMS forward")
                    return
                }
            }

            val sms_forward_method = sharedPrefs.getString("hotbox_sms_forward_method", "") ?: ""
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
                "SMS" -> {
                    forwardBySms(lastSms, context)
                }
            }
        } else {
            HotboxLog.d(
                TAG,
                "No new SMS, within ${minute}min: $withinMin, is new: $isNew"
            )
        }
    }

    //Forward via CURL
    fun forwardSmsByCurl(sms_data: SmsInfo?, context: Context) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val originalCurl = sharedPrefs.getString("hotbox_sms_curl", null)
        if (originalCurl.isNullOrEmpty()) {
            HotboxLog.e(TAG, "curl Config error: hotbox_sms_curl is empty")
            return
        }

        HotboxLog.d(TAG, "Starting SMS forwarding... (CURL)")
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

            HotboxCURL(context).send(replacedCurl)
        } catch (e: Exception){
            HotboxLog.e(TAG,"SMS forward (forwardSmsByCurl) error: ",e)
        }
    }

    //Forward via SMTP email
    fun forwardByEmail(sms_data: SmsInfo?, context: Context,notSMS: Boolean = false) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val smtpHost = sharedPrefs.getString("hotbox_smtp_host", null)
        if (smtpHost.isNullOrEmpty()) {
            HotboxLog.e(TAG, "SMTP Config error: hotbox_smtp_host is empty")
            return
        }

        val smtpTo = sharedPrefs.getString("hotbox_smtp_to", null)
        if (smtpTo.isNullOrEmpty()) {
            HotboxLog.e(TAG, "SMTP Config error: hotbox_smtp_to is empty")
            return
        }

        val smtpPort = sharedPrefs.getString("hotbox_smtp_port", null)
        if (smtpPort.isNullOrEmpty()) {
            HotboxLog.e(TAG, "SMTP Config error: hotbox_smtp_port is empty")
            return
        }

        val username = sharedPrefs.getString("hotbox_smtp_username", null)
        if (username.isNullOrEmpty()) {
            HotboxLog.e(TAG, "SMTP Config error: hotbox_smtp_username is empty")
            return
        }

        val password = sharedPrefs.getString("hotbox_smtp_password", null)
        if (password.isNullOrEmpty()) {
            HotboxLog.e(TAG, "SMTP Config error: hotbox_smtp_password is empty")
            return
        }

        val smtpClient = HotboxSMTP(smtpHost, smtpPort, username, password)

        HotboxLog.d(TAG, "Starting SMS forwarding... (SMTP)")

        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault())
        val previewText = sms_data.body.trimStart().let {
            if (it.length > 37) it.take(37) + "…" else it
        }
        val shouldForwardDeviceInfo = sharedPrefs.getString("hotbox_smtp_forward_device_info","0")?: "0"
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

        val webhookUrl = sharedPrefs.getString("hotbox_dingtalk_webhook", null)
        if (webhookUrl.isNullOrEmpty()) {
            HotboxLog.e(TAG, "DingTalk config error: hotbox_dingtalk_webhook is empty")
            return
        }

        val secret = sharedPrefs.getString("hotbox_dingtalk_secret", null)

        HotboxLog.d(TAG, "Starting SMS forwarding... (DingTalk)")
        val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(ZoneId.systemDefault())
        val smsText = JSONObject.quote(sms_data.body.trim()).removeSurrounding("\"")
        val smsFrom = sms_data.address
        val smsTime = formatter.format(Instant.ofEpochMilli(sms_data.timestamp))

        val shouldForwardDeviceInfo = sharedPrefs.getString("hotbox_dingtalk_forward_device_info","0")?: "0"
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
        val dingTalkClient = HotboxDingTalk(webhookUrl, secret)
        dingTalkClient.sendMessage(messageContent)
    }

    //Forward via SMS (ZTE goform API)
    fun forwardBySms(sms_data: SmsInfo?, context: Context) {
        if (sms_data == null) return
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val forwardNumber = sharedPrefs.getString("hotbox_sms_forward_number", null)
        if (forwardNumber.isNullOrEmpty()) {
            HotboxLog.e(TAG, "SMS forward config error: hotbox_sms_forward_number is empty")
            return
        }

        val ADB_IP = sharedPrefs.getString("gateway_ip", "")?.substringBefore(":") ?: ""
        if (ADB_IP.isEmpty()) {
            HotboxLog.e(TAG, "SMS forward error: gateway_ip is empty")
            return
        }

        val ADMIN_PWD = sharedPrefs.getString("ADMIN_PWD", "Wa@9w+YWRtaW4=") ?: "Wa@9w+YWRtaW4="

        HotboxLog.d(TAG, "Starting SMS forwarding... (SMS to $forwardNumber)")
        try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneId.systemDefault())
            val smsTime = formatter.format(Instant.ofEpochMilli(sms_data.timestamp))

            val shouldForwardDeviceInfo = sharedPrefs.getString("hotbox_sms_forward_device_info", "0") ?: "0"
            var statusText = ""
            if (shouldForwardDeviceInfo == "1") {
                statusText = buildStatusSmsMsg(
                    "\nDaily:{{daily-flow}} Monthly:{{monthly-flow-count}} Battery:{{battery-level}}",
                    context, TAG
                )
            }

            // Use user-defined format template, or fallback
            val smsFormat = sharedPrefs.getString("hotbox_sms_format", "") ?: ""
            val body = if (smsFormat.isNotEmpty()) {
                smsFormat
                    .replace("{{from}}", sms_data.address)
                    .replace("{{time}}", smsTime)
                    .replace("{{body}}", sms_data.body) + statusText
            } else {
                "SMS from ${sms_data.address}\nTime: $smsTime\n${sms_data.body}$statusText"
            }

            sendSmsViaGoform(body, forwardNumber, ADB_IP, ADMIN_PWD)
        } catch (e: Exception) {
            HotboxLog.e(TAG, "SMS forward (forwardBySms) error: ", e)
        }
    }

    //Forward call notification via SMS
    fun forwardCallBySms(callerNumber: String, callTime: Long, context: Context) {
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val forwardNumber = sharedPrefs.getString("hotbox_sms_forward_number", null)
        if (forwardNumber.isNullOrEmpty()) {
            HotboxLog.e(TAG, "Call notify config error: hotbox_sms_forward_number is empty")
            return
        }

        val ADB_IP = sharedPrefs.getString("gateway_ip", "")?.substringBefore(":") ?: ""
        if (ADB_IP.isEmpty()) {
            HotboxLog.e(TAG, "Call notify error: gateway_ip is empty")
            return
        }

        val ADMIN_PWD = sharedPrefs.getString("ADMIN_PWD", "Wa@9w+YWRtaW4=") ?: "Wa@9w+YWRtaW4="

        HotboxLog.d(TAG, "Forwarding call notification... (SMS to $forwardNumber)")
        try {
            val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                .withZone(ZoneId.systemDefault())
            val timeStr = formatter.format(Instant.ofEpochMilli(callTime))

            // Use user-defined call format template, or fallback
            val callFormat = sharedPrefs.getString("hotbox_call_format", "") ?: ""
            val body = if (callFormat.isNotEmpty()) {
                callFormat
                    .replace("{{from}}", callerNumber)
                    .replace("{{time}}", timeStr)
            } else {
                "Call from $callerNumber\nTime: $timeStr"
            }

            sendSmsViaGoform(body, forwardNumber, ADB_IP, ADMIN_PWD)
        } catch (e: Exception) {
            HotboxLog.e(TAG, "Call notify (forwardCallBySms) error: ", e)
        }
    }

    private fun sendSmsViaGoform(body: String, toNumber: String, ip: String, password: String) {
        // Encode to UTF-16BE hex (GSM encoding for ZTE)
        val encodedBody = body.toByteArray(Charsets.UTF_16BE).joinToString("") { "%02X".format(it) }

        runBlocking {
            val req = HotboxGoformRequest("http://$ip:8080")
            val cookie = req.login(password)
            if (cookie != null) {
                val result = req.postData(cookie, mapOf(
                    "goformId" to "SEND_SMS",
                    "Number" to toNumber,
                    "MessageBody" to encodedBody
                ))
                req.logout(cookie)
                HotboxLog.d(TAG, "SMS send result: $result")
            } else {
                HotboxLog.e(TAG, "SMS send error: login failed")
            }
        }
    }

    // Check for new missed/incoming calls and notify
    private var lastCallTimestamp: Long = 0

    fun checkNewCallAndNotify(context: Context) {
        val sharedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val callNotifyEnabled = sharedPrefs.getString("hotbox_call_notify_enabled", "0") ?: "0"
        if (callNotifyEnabled != "1") return

        val smsForwardMethod = sharedPrefs.getString("hotbox_sms_forward_method", "") ?: ""
        if (smsForwardMethod != "SMS") return // Only SMS method supports call notify for now

        try {
            val uri = CallLog.Calls.CONTENT_URI
            val projection = arrayOf(
                CallLog.Calls.NUMBER,
                CallLog.Calls.DATE,
                CallLog.Calls.TYPE
            )
            val sortOrder = "${CallLog.Calls.DATE} DESC"

            val cursor = context.contentResolver.query(uri, projection, null, null, sortOrder)
            cursor?.use {
                if (it.moveToFirst()) {
                    val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER))
                    val date = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))
                    val type = it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))

                    // Only forward incoming/missed calls within last 2 minutes
                    val now = System.currentTimeMillis()
                    val isRecent = now - date <= 2 * 60 * 1000
                    val isIncoming = type == CallLog.Calls.INCOMING_TYPE || type == CallLog.Calls.MISSED_TYPE
                    val isNew = date > lastCallTimestamp

                    if (isRecent && isIncoming && isNew) {
                        lastCallTimestamp = date
                        HotboxLog.d(TAG, "New call from $number, forwarding notification")
                        forwardCallBySms(number, date, context)
                    }
                }
            }
        } catch (e: Exception) {
            HotboxLog.e(TAG, "Call log read error: ", e)
        }
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
            HotboxLog.e(TAG, "No SMS permission, cannot read SMS", e)
            null
        }
    }
}