package com.minikano.f50_sms.utils

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

class KanoDingTalk(
    private val webhookUrl: String,
    private val secret: String? = null
) {
    // 防止重复发送
    private val isSending = AtomicBoolean(false)

    fun sendMessage(content: String) {
        // 如果已经在发送中，则直接返回
        if (!isSending.compareAndSet(false, true)) {
            KanoLog.w("UFI_TOOLS_LOG_DingTalk", "钉钉消息正在发送中，忽略重复发送")
            return
        }

        Thread {
            try {
                val client = OkHttpClient()
                val mediaType = "application/json; charset=utf-8".toMediaType()
                
                // 构建消息内容
                val messageJson = """
                {
                    "msgtype": "text",
                    "text": {
                        "content": "$content"
                    }
                }
                """.trimIndent()

                // 计算签名（如果提供了secret）
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

                KanoLog.d("UFI_TOOLS_LOG_DingTalk", "开始发送钉钉消息...")
                val response = client.newCall(request).execute()
                
                if (response.isSuccessful) {
                    KanoLog.d("UFI_TOOLS_LOG_DingTalk", "钉钉消息发送成功")
                } else {
                    KanoLog.e("UFI_TOOLS_LOG_DingTalk", "钉钉消息发送失败: ${response.code}")
                }
                
                response.close()
            } catch (e: Exception) {
                KanoLog.e("UFI_TOOLS_LOG_DingTalk", "钉钉消息发送异常: ${e.message}", e)
            } finally {
                isSending.set(false)
            }
        }.start()
    }
} 