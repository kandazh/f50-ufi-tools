package com.hotbox.f50_app.modules.theme

import android.content.Context
import androidx.core.content.edit
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.modules.auth.authenticatedRoute
import com.hotbox.f50_app.utils.HotboxLog
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.defaultForFilePath
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.http.content.streamProvider
import io.ktor.server.application.call
import io.ktor.server.request.path
import io.ktor.server.request.receiveMultipart
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.util.UUID

@Serializable
data class ThemeConfig(
    val backgroundEnabled: String = "false",
    val backgroundUrl: String = "",
    val textColor: String = "rgba(255, 255, 255, 1)",
    val textColorPer: String = "100",
    val themeColor: String = "201",
    val colorPer: String = "67",
    val saturationPer: String = "100",
    val brightPer: String = "21",
    val opacityPer: String = "21",
    val blurSwitch: String = "true",
    val overlaySwitch: String = "true"
)

val jsonFull = Json {
    encodeDefaults = true
    prettyPrint = false
    ignoreUnknownKeys = true
}

fun Route.themeModule(context: Context) {
    val TAG = "[$BASE_TAG]_themeModule"
    val uploadRoot = File(context.filesDir, "uploads")
    
    get("/api/uploads/{...}") {
        val relativePath = (call.parameters["..."]
        ?: call.request.path().removePrefix("/api/uploads/"))
        .trim('/')

        HotboxLog.d(TAG, "uploads resource relativePath: $relativePath")

        if (relativePath.isBlank() || relativePath.startsWith("/") || relativePath.contains('\u0000')) {
            HotboxLog.e(TAG, "Upload path test failed: $relativePath")
            call.respondText("403 Forbidden", status = HttpStatusCode.Forbidden)
            return@get
        }

        val targetFile = File(uploadRoot, relativePath)
        HotboxLog.d(TAG, "uploads resource targetFile: $targetFile")

        val baseCanonical = uploadRoot.canonicalFile
        val targetCanonical = File(uploadRoot, relativePath).canonicalFile

        val inRoot = targetCanonical.path == baseCanonical.path ||
                targetCanonical.path.startsWith(baseCanonical.path + File.separator)

        if (!inRoot) {
            HotboxLog.e(TAG, "Upload path inRoot test failed: $relativePath")
            call.respondText("403 Forbidden", status = HttpStatusCode.Forbidden)
            return@get
        }

        try {
            if (!targetFile.exists() || !targetFile.isFile) {
                call.respondText("404 Not Found", status = HttpStatusCode.NotFound)
                return@get
            }

            call.respondFile(targetFile)
        } catch (e: SecurityException) {
            HotboxLog.e(TAG, "No permission for uploaded file: $relativePath", e)
            call.respondText("403 Forbidden", status = HttpStatusCode.Forbidden)
        } catch (e: FileNotFoundException) {
            val rootCause = generateSequence<Throwable>(e) { it.cause }.last()
            val isAccessDenied = rootCause.message?.contains("EACCES", ignoreCase = true) == true
            if (isAccessDenied) {
                HotboxLog.e(TAG, "No permission for uploaded file(EACCES): $relativePath", e)
                call.respondText("403 Forbidden", status = HttpStatusCode.Forbidden)
            } else {
                HotboxLog.e(TAG, "Upload file not found: $relativePath", e)
                call.respondText("404 Not Found", status = HttpStatusCode.NotFound)
            }
        } catch (e: Exception) {
            HotboxLog.e(TAG, "Failed to read uploaded file: $relativePath", e)
            call.respondText("500 Internal Server Error", status = HttpStatusCode.InternalServerError)
        }
    }

    authenticatedRoute(context) {
        //Upload file (streaming)
        post("/api/upload_img") {
            try {
                val multipart = call.receiveMultipart()
                var fileName: String? = null

                multipart.forEachPart { part ->
                    when (part) {
                        is PartData.FileItem -> {
                            val originalFileName = part.originalFileName ?: "file"
                            val ext = originalFileName.substringAfterLast('.', "unknown").lowercase()
                            fileName = "${UUID.randomUUID()}.$ext"

                            val uploadDir = File(context.filesDir, "uploads")
                            if (!uploadDir.exists()) uploadDir.mkdirs()

                            val targetFile = File(uploadDir, fileName!!)

                            part.streamProvider().use { input ->
                                targetFile.outputStream().use { output ->
                                    input.copyTo(output)
                                }
                            }
                        }
                        else -> {}
                    }
                    part.dispose()
                }

                if (fileName != null) {
                    call.response.headers.append("Access-Control-Allow-Origin", "*")
                    val fileUrl = "/uploads/$fileName"

                    call.respondText(
                        """{"url":"$fileUrl"}""",
                        ContentType.Application.Json,
                        HttpStatusCode.OK
                    )
                } else {
                    throw Exception("File upload failed")
                }

            } catch (e: Exception) {
                HotboxLog.d(TAG, "Upload file error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"Upload file error: ${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        //Delete image
        post("/api/delete_img") {
            try {
                val body = call.receiveText()
                val json = JSONObject(body)

                val fileName = json.optString("file_name").trim()
                if (fileName.isBlank() || fileName.contains("..") || fileName.startsWith("/")) {
                    call.respondText(
                        """{"error":"Illegal filename"}""",
                        ContentType.Application.Json,
                        HttpStatusCode.Forbidden
                    )
                    return@post
                }

                val baseDir = File(context.filesDir, "uploads")
                val target = File(baseDir, fileName)

                val baseCanonical = baseDir.canonicalPath.trimEnd(File.separatorChar)
                val targetCanonical = target.canonicalPath
                val inCanonicalRoot = targetCanonical == baseCanonical ||
                        targetCanonical.startsWith("$baseCanonical${File.separator}")

                val baseAbsolute = baseDir.absolutePath.trimEnd(File.separatorChar)
                val targetAbsolute = target.absolutePath
                val inAbsoluteRoot = targetAbsolute == baseAbsolute ||
                        targetAbsolute.startsWith("$baseAbsolute${File.separator}")

                if (!inCanonicalRoot && !inAbsoluteRoot) {
                    call.respondText(
                        """{"error":"Illegal path"}""",
                        ContentType.Application.Json,
                        HttpStatusCode.Forbidden
                    )
                    return@post
                }

                if (target.exists() && target.isFile) {
                    target.delete()
                }


                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":"success"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } catch (e: Exception) {
                HotboxLog.d(TAG, "Delete error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"Delete error: ${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        //Delete all files under uploads
        @Serializable
        data class DeleteAllUploadsResp(
            val result: String,
            val deleted_list: Map<String, Boolean>
        )
        post("/api/delete_all_uploads_data") {
            try {
                val result = mutableMapOf<String, Boolean>()
                val baseDir = File(context.filesDir, "uploads")
                val files = baseDir.listFiles()
                if (files != null && files.isNotEmpty()) {
                    files.forEach { file ->
                        if(file.isFile){
                            try{
                                if(file.delete())
                                    result[file.name] = true
                                else {
                                    HotboxLog.d(TAG,"Delete file: ${file.name}failed")
                                    result[file.name] = false
                                }
                            } catch (e: Exception){
                                HotboxLog.e(TAG,"Delete file: ${file.name}failed",e)
                                result[file.name] = false
                            }
                        }
                    }
                }
                val payload = DeleteAllUploadsResp(
                    result = "success",
                    deleted_list = result
                )

                call.respondText(
                    Json.encodeToString(payload),
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } catch (e: Exception) {
                HotboxLog.d(TAG, "Delete error: ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"Delete error: ${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }

        //Save theme
        post("/api/set_theme") {
            try {
                val body = call.receiveText()
                val json = JSONObject(body)

                val config = ThemeConfig(
                    backgroundEnabled = json.optString("backgroundEnabled", "false").trim(),
                    backgroundUrl = json.optString("backgroundUrl", "").trim(),
                    textColor = json.optString("textColor", "rgba(255, 255, 255, 1)").trim(),
                    textColorPer = json.optString("textColorPer", "100").trim(),
                    themeColor = json.optString("themeColor", "201").trim(),
                    colorPer = json.optString("colorPer", "67").trim(),
                    saturationPer = json.optString("saturationPer", "100").trim(),
                    brightPer = json.optString("brightPer", "21").trim(),
                    opacityPer = json.optString("opacityPer", "21").trim(),
                    blurSwitch = json.optString("blurSwitch", "true").trim(),
                    overlaySwitch = json.optString("overlaySwitch", "true").trim()
                )

                val jsonStore = jsonFull.encodeToString(config)

                val sharedPref =
                    context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
                sharedPref.edit(commit = true) {
                    putString("hotbox_theme", jsonStore)
                }

                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"result":"success"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.OK
                )

            } catch (e: Exception) {
                HotboxLog.d(TAG, "Config error:  ${e.message}")
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"Config error: ${e.message}"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
            }
        }
    }

    //Read theme
    get("/api/get_theme") {
        try {
            val sharedPref = context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
            val hotbox_theme = sharedPref.getString("hotbox_theme", null)
            val json = try {
                hotbox_theme?.let { JSONObject(it) }
            } catch (e: Exception) {
                null
            }

            HotboxLog.d(TAG, "Read SharedPreferences: $hotbox_theme")

            val config = if (json != null && json.length() > 0) {
                ThemeConfig(
                    backgroundEnabled = json.optString("backgroundEnabled", "false").trim(),
                    backgroundUrl = json.optString("backgroundUrl", "").trim(),
                    textColor = json.optString("textColor", "rgba(255, 255, 255, 1)").trim(),
                    textColorPer = json.optString("textColorPer", "100").trim(),
                    themeColor = json.optString("themeColor", "201").trim(),
                    colorPer = json.optString("colorPer", "67").trim(),
                    saturationPer = json.optString("saturationPer", "100").trim(),
                    brightPer = json.optString("brightPer", "21").trim(),
                    opacityPer = json.optString("opacityPer", "21").trim(),
                    blurSwitch = json.optString("blurSwitch", "true").trim(),
                    overlaySwitch = json.optString("overlaySwitch", "true").trim()
                )
            } else {
                ThemeConfig()
            }

            val text = jsonFull.encodeToString(config)
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                text,
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error reading theme: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error reading theme"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}
