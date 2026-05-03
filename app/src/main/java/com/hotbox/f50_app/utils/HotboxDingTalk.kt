package com.hotbox.f50_app.utils

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.util.Base64
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class HotboxDingTalk(
    private val webhookUrl: String,
    private val secret: String? = null
) {
    // Prevent duplicate sends
    private val isSending = AtomicBoolean(false)

    companion object {
        private val client = OkHttpClient()
    }

    fun sendMessage(content: String) {
        // If already sending, return immediately
        if (!isSending.compareAndSet(false, true)) {
            HotboxLog.w("UFI_TOOLS_LOG_DingTalk", "DingTalk message sending, ignoring duplicate")
            return
        }

        Thread {
            try {
                val mediaType = "application/json; charset=utf-8".toMediaType()
                
                // Build message content
                val messageJson = """
                {
                    "msgtype": "text",
                    "text": {
                        "content": "$content"
                    }
                }
                """.trimIndent()

                // Calculate signature (if secret provided)
                val finalUrl = if (!secret.isNullOrEmpty()) {
                    val timestamp = System.currentTimeMillis()
                    val stringToSign = "$timestamp\n$secret"
                    val hmacSha256 = Mac.getInstance("HmacSHA256")
                    val secretKeySpec = SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")
                    hmacSha256.init(secretKeySpec)
                    val sign = Base64.getEncoder().encodeToString(hmacSha256.doFinal(stringToSign.toByteArray(StandardCharsets.UTF_8)))
                    val encodedSign = URLEncoder.encode(sign, "UTF-8")
                    "$webhookUrl&timestamp=$timestamp&sign=$encodedSign"
                } else {
                    webhookUrl
                }

                val body = messageJson.toRequestBody(mediaType)
                val request = Request.Builder()
                    .url(finalUrl)
                    .post(body)
                    .build()

                HotboxLog.d("UFI_TOOLS_LOG_DingTalk", "Starting to send DingTalk message...")
                val response = client.newCall(request).execute()
                
                if (response.isSuccessful) {
                    HotboxLog.d("UFI_TOOLS_LOG_DingTalk", "DingTalk message sent successfully")
                } else {
                    HotboxLog.e("UFI_TOOLS_LOG_DingTalk", "DingTalk message send failed: ${response.code}")
                }
                
                response.close()
            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG_DingTalk", "DingTalk message send exception: ${e.message}", e)
            } finally {
                isSending.set(false)
            }
        }.start()
    }
} 