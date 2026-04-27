package com.minikano.f50_sms.modules.scheduledTask

import android.content.Context
import com.minikano.f50_sms.modules.BASE_TAG
import com.minikano.f50_sms.utils.KanoLog
import com.minikano.f50_sms.utils.ShellKano.Companion.PREFS_NAME
import com.minikano.f50_sms.utils.TaskSchedulerManager
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject

@Serializable
private data class TaskInfo(
    val key:Long,
    val id: String,
    val time: String,
    val repeatDaily: Boolean,
    var actionMap: Map<String, String> = emptyMap(),
    val lastRunTimestamp: Long? = null,
    val hasTriggered: Boolean = false
)

fun Route.scheduledTaskModule(context: Context) {
    val TAG = "[$BASE_TAG]_ScheduledTaskModule"

    /**
     * 添加定时任务（支持时间 + 是否每天重复）
     * 参数：id、time（HH:mm:ss 或 yyyy-MM-dd HH:mm:ss）、repeatDaily（可选，默认true）
     */
    post("/api/add_task") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val id = json.optString("id", "").trim()
            val time = json.optString("time", "").trim()
            val repeatDaily = json.optBoolean("repeatDaily", true)
            val actionJson = json.optJSONObject("action")?:  throw Exception("请传入action")

            // 把 JSONObject 转成 Map<String, String>
            val paramsMap = mutableMapOf<String, String>()
            val keys = actionJson.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                paramsMap[key] = actionJson.optString(key)
            }

            if (id.isEmpty() || time.isEmpty()) throw Exception("参数不完整")

            TaskSchedulerManager.get()?.addTask(System.currentTimeMillis() ,id, time, repeatDaily, paramsMap)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "添加任务失败：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"添加任务失败: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * 删除定时任务
     * 参数：id
     */
    post("/api/remove_task") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val id = json.optString("id", "").trim()
            if (id.isEmpty()) throw Exception("参数id不能为空")

            TaskSchedulerManager.get()?.removeTask(id)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"removed"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "删除任务失败：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"删除任务失败: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * 删除全部任务
     */
    post("/api/clear_task") {
        try {

            val scheduler = TaskSchedulerManager.get()
                ?: throw IllegalStateException("任务调度器未初始化")

            call.response.headers.append("Access-Control-Allow-Origin", "*")

            scheduler.clearAllTasks()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d("[$BASE_TAG]_pluginsModule", "清空定时任务出错: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"清空定时任务出错: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * 获取任务列表
     */
    get("/api/list_tasks") {
        try {
            val taskList = TaskSchedulerManager.get()?.listAllTasks()
                ?.sortedBy { it.key }
                ?.map {
                TaskInfo(
                    key = it.key,
                    id = it.id,
                    time = it.time,
                    repeatDaily = it.repeatDaily,
                    lastRunTimestamp = it.lastRunTimestamp,
                    actionMap = it.actionMap,
                    hasTriggered = it.hasTriggered
                )
            } ?: emptyList()

            val result = mapOf("tasks" to taskList)

            val json = Json.encodeToString(result)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)

        } catch (e: Exception) {
            KanoLog.d(TAG, "获取任务列表失败：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取任务列表失败"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * 根据 ID 获取单个任务详情
     */
    get("/api/get_task") {
        val id = call.request.queryParameters["id"]
        if (id.isNullOrBlank()) {
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"缺少任务ID"}""",
                ContentType.Application.Json,
                HttpStatusCode.BadRequest
            )
            return@get
        }

        try {
            val task = TaskSchedulerManager.get()?.getTask(id)

            if (task == null) {
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(
                    """{"error":"任务不存在"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.NotFound
                )
            } else {
                val taskInfo = TaskInfo(
                    key = task.key,
                    id = task.id,
                    time = task.time,
                    repeatDaily = task.repeatDaily,
                    lastRunTimestamp = task.lastRunTimestamp,
                    actionMap = task.actionMap,
                    hasTriggered = task.hasTriggered
                )

                val json = Json.encodeToString(taskInfo)
                call.response.headers.append("Access-Control-Allow-Origin", "*")
                call.respondText(json, ContentType.Application.Json, HttpStatusCode.OK)
            }
        } catch (e: Exception) {
            KanoLog.d(TAG, "获取任务失败：${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"获取任务失败"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

}
