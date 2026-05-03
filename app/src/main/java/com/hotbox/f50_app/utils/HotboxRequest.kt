package com.hotbox.f50_app.utils
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.io.File
class HotboxRequest {
    companion object {
        private val client = OkHttpClient()

        fun postJson(url: String, json: String): Response {
            val mediaType = "application/json; charset=utf-8".toMediaType()
            val body = json.toRequestBody(mediaType)

            val request = Request.Builder()
                .url(url)
                .post(body)
                .build()

            return client.newCall(request).execute()
        }

        fun getTextFromUrl(url: String): String? {
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            return try {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        println("Request failed with code: ${response.code}")
                        return null
                    }
                    response.body?.string()
                }
            } catch (e: Exception) {
                println("Request exception: ${e.message}")
                null
            }
        }

        fun downloadFile(
            url: String,
            outputFile: File,
            onProgress: (percent: Int) -> Unit
        ): String? {
            val request = Request.Builder().url(url).build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    HotboxLog.d("UFI_TOOLS_LOG", "Download failed: ${response.code}")
                    return null
                }

                val body: ResponseBody? = response.body
                if (body == null) {
                    HotboxLog.d("UFI_TOOLS_LOG", "Empty response body")
                    return null
                }

                val contentLength = body.contentLength()
                if (contentLength <= 0) {
                    HotboxLog.d("UFI_TOOLS_LOG", "Invalid content length")
                    return null
                }

                var inputStream: InputStream? = null
                var outputStream: OutputStream? = null

                try {
                    inputStream = body.byteStream()
                    outputStream = FileOutputStream(outputFile)

                    val buffer = ByteArray(8 * 1024)
                    var bytesRead: Int
                    var totalBytesRead = 0L
                    var lastProgress = 0

                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        outputStream.write(buffer, 0, bytesRead)
                        totalBytesRead += bytesRead

                        val progress = (100 * totalBytesRead / contentLength).toInt()
                        if (progress != lastProgress) {
                            lastProgress = progress
                            onProgress(progress)
                        }
                    }

                    outputStream.flush()
                    HotboxLog.d("UFI_TOOLS_LOG", "Download complete: ${outputFile.absolutePath}")
                    return outputFile.absolutePath

                } catch (e: Exception) {
                    e.printStackTrace()
                    return null
                } finally {
                    inputStream?.close()
                    outputStream?.close()
                }
            }
        }
    }
}