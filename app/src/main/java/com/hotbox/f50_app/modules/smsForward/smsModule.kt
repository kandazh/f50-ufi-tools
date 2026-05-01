package com.hotbox.f50_app.modules.smsForward

import android.content.Context
import androidx.core.content.edit
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.SmsInfo
import com.hotbox.f50_app.utils.SmsPoll
import com.hotbox.f50_app.modules.BASE_TAG
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.json.JSONObject

fun Route.smsModule(context: Context) {
    val TAG = "[$BASE_TAG]_smsModule"

    //Get SMS forward method
    get("/api/sms_forward_method") {
        val sharedPrefs =
            context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
        val sms_forward_method = sharedPrefs.getString("hotbox_sms_forward_method", "") ?: ""
        val json = """
        {
            "sms_forward_method": "${sms_forward_method.replace("\"", "\\\"")}"
        }
    """.trimIndent()

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
    }

    //Save SMS forward params - email
    post("/api/sms_forward_mail") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val smtpHost = json.optString("smtp_host", "").trim()
            val smtpPort = json.optString("smtp_port", "465").trim()
            val smtpTo = json.optString("smtp_to", "").trim()
            val smtpUsername = json.optString("smtp_username", "").trim()
            val smtpPassword = json.optString("smtp_password", "").trim()
            val shouldForwardDeviceInfo = json.optString("forward_dev_info", "0").trim()


            if (smtpTo.isEmpty() || smtpHost.isEmpty() || smtpUsername.isEmpty() || smtpPassword.isEmpty()) {
                throw Exception("Missing required parameters")
            }

            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("hotbox_sms_forward_method", "SMTP")
                putString("hotbox_smtp_host", smtpHost)
                putString("hotbox_smtp_port", smtpPort)
                putString("hotbox_smtp_to", smtpTo)
                putString("hotbox_smtp_username", smtpUsername)
                putString("hotbox_smtp_password", smtpPassword)
                putString("hotbox_smtp_forward_device_info", shouldForwardDeviceInfo)
            }

            HotboxLog.d(TAG, "SMTP config saved: $smtpHost:$smtpPort [$smtpUsername]")

            val test_msg = SmsInfo("1145141919810", "UFI-TOOLS TESTmessage", System.currentTimeMillis())
            SmsPoll.forwardByEmail(test_msg, context)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            HotboxLog.d(TAG, "SMTPConfig error:  ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"SMTPConfig error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Read SMTP config
    get("/api/sms_forward_mail") {
        val sharedPrefs =
            context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
        val smtpHost = sharedPrefs.getString("hotbox_smtp_host", "") ?: ""
        val smtpPort = sharedPrefs.getString("hotbox_smtp_port", "") ?: ""
        val smtpTo = sharedPrefs.getString("hotbox_smtp_to", "") ?: ""
        val username = sharedPrefs.getString("hotbox_smtp_username", "") ?: ""
        val password = sharedPrefs.getString("hotbox_smtp_password", "") ?: ""
        val shouldForwardDeviceInfo = sharedPrefs.getString("hotbox_smtp_forward_device_info","0")?: "0"

        val json = """
        {
            "smtp_host": "$smtpHost",
            "smtp_port": "$smtpPort",
            "smtp_to": "$smtpTo",
            "smtp_username": "$username",
            "smtp_password": "$password",
            "forward_dev_info":"$shouldForwardDeviceInfo"
        }
    """.trimIndent()

        call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
    }

    //Save SMS forward params - CURL
    post("/api/sms_forward_curl") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val originalCurl = json.getString("curl_text")

            HotboxLog.d(TAG, "Found {{sms}}: ${originalCurl.contains("{{sms}}")}")
            HotboxLog.d(TAG, "CURL config: $originalCurl")

            if (!originalCurl.contains("{{sms-body}}")) throw Exception("Placeholder not found:  '{{sms-body}}' not found")
            if (!originalCurl.contains("{{sms-time}}")) throw Exception("Placeholder not found:  '{{sms-time}}' not found")
            if (!originalCurl.contains("{{sms-from}}")) throw Exception("Placeholder not found:  '{{sms-from}}' not found")

            // Store to SharedPreferences
            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("hotbox_sms_forward_method", "CURL")
                putString("hotbox_sms_curl", originalCurl)
            }

            // Send test message
            val test_msg =
                SmsInfo("1145141919810", "UFI-TOOLS TESTmessage", System.currentTimeMillis())
            SmsPoll.forwardSmsByCurl(test_msg, context)

            json.put("curl_text", originalCurl)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "curlConfig error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"curlConfig error: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Read SMS forward CURL config
    get("/api/sms_forward_curl") {
        val sharedPrefs =
            context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)

        val curlText = sharedPrefs.getString("hotbox_sms_curl", "") ?: ""

        val json = JSONObject(mapOf("curl_text" to curlText)).toString()

        call.respondText(
            json,
            ContentType.Application.Json,
            HttpStatusCode.OK
        )
    }

    //SMS forward master switch
    post("/api/sms_forward_enabled") {
        try {
            val enable = call.request.queryParameters["enable"]
                ?: throw Exception("query missing enable parameter")
            HotboxLog.d(TAG, "SMS forward enable parameter: $enable")

            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("hotbox_sms_forward_enabled", enable)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error:  ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get SMS forward status
    get("/api/sms_forward_enabled") {
        try {
            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            val str = sharedPrefs.getString("hotbox_sms_forward_enabled", "0") ?: "0"

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"enabled":"$str"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error:  ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Battery status forward master switch
    post("/api/power_status_forward_enabled") {
        try {
            val enable = call.request.queryParameters["enable"]
                ?: throw Exception("query missing enable parameter")
            HotboxLog.d(TAG, "SMS forward enable parameter: $enable")

            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("hotbox_power_status_forward_enabled", enable)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error:  ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get battery info forward status
    get("/api/power_status_forward_enabled") {
        try {
            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            val str = sharedPrefs.getString("hotbox_power_status_forward_enabled", "0") ?: "0"

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"enabled":"$str"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error:  ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //SMS forward blocklist config
    post("/api/sms_forward_blacklist") {
        try {
            val raw = call.receiveText()

            val json = JSONObject(raw)

            if (!json.has("phone")) throw Exception("Missing phone parameter")
            if (!json.has("keywords")) throw Exception("Missing keywords parameter")

            val phone = json.optString("phone")
            val keywords = json.optString("keywords")

            if (!phone.matches(Regex("^[0-9\\n]*$"))) {
                throw Exception("phone parameter invalid")
            }

            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("hotbox_sms_forward_blacklist_phone", phone)
                putString("hotbox_sms_forward_blacklist_keywords", keywords)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Get SMS forward blocklist
    get("/api/sms_forward_blacklist") {
        try {
            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            val keywords = sharedPrefs.getString("hotbox_sms_forward_blacklist_keywords", "") ?: ""
            val phone = sharedPrefs.getString("hotbox_sms_forward_blacklist_phone", "") ?: ""

            val json = JSONObject().apply {
                put("keywords", keywords)
                put("phone", phone)
            }

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                json.toString(),
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Request error:  ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Request error"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Save SMS forward params - DingTalkwebhook
    post("/api/sms_forward_dingtalk") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val webhookUrl = json.optString("webhook_url", "").trim()
            val shouldForwardDeviceInfo = json.optString("forward_dev_info", "0").trim()
            val secret = json.optString("secret", "").trim()

            if (webhookUrl.isEmpty()) {
                throw Exception("Missing required parameters：webhook_url")
            }

            // Store to SharedPreferences
            val sharedPrefs =
                context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)
            sharedPrefs.edit(commit = true) {
                putString("hotbox_sms_forward_method", "DINGTALK")
                putString("hotbox_dingtalk_webhook", webhookUrl)
                putString("hotbox_dingtalk_secret", secret)
                putString("hotbox_dingtalk_forward_device_info",shouldForwardDeviceInfo)
            }

            HotboxLog.d(TAG, "DingTalk config saved: $webhookUrl")

            // Send test message
            val test_msg =
                SmsInfo("1145141919810", "UFI-TOOLS TESTmessage", System.currentTimeMillis())
            SmsPoll.forwardSmsByDingTalk(test_msg, context)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "DingTalk config error: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"DingTalk config error: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    //Read SMS forward DingTalk config
    get("/api/sms_forward_dingtalk") {
        val sharedPrefs =
            context.getSharedPreferences("Hotbox_ZTE_store", Context.MODE_PRIVATE)

        val webhookUrl = sharedPrefs.getString("hotbox_dingtalk_webhook", "") ?: ""
        val secret = sharedPrefs.getString("hotbox_dingtalk_secret", "") ?: ""
        val shouldForwardDeviceInfo = sharedPrefs.getString("hotbox_dingtalk_forward_device_info","0")?: "0"

        val json = """
        {
            "webhook_url": "$webhookUrl",
            "secret": "$secret",
            "forward_dev_info":"$shouldForwardDeviceInfo"
        }
    """.trimIndent()

        call.response.headers.append("Access-Control-Allow-Origin", "*")
        call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
    }

}