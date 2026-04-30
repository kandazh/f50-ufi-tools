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
     * Add scheduled task (time + daily repeat)
     * Params: id, time (HH:mm:ss or yyyy-MM-dd HH:mm:ss), repeatDaily (optional, default true)
     */
    post("/api/add_task") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val id = json.optString("id", "").trim()
            val time = json.optString("time", "").trim()
            val repeatDaily = json.optBoolean("repeatDaily", true)
            val actionJson = json.optJSONObject("action")?:  throw Exception("Please provide action")

            // Convert JSONObject to Map<String, String>
            val paramsMap = mutableMapOf<String, String>()
            val keys = actionJson.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                paramsMap[key] = actionJson.optString(key)
            }

            if (id.isEmpty() || time.isEmpty()) throw Exception("Incomplete parameters")

            TaskSchedulerManager.get()?.addTask(System.currentTimeMillis() ,id, time, repeatDaily, paramsMap)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "Failed to add task: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Failed to add task: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * Delete scheduled task
     * Parameter: id
     */
    post("/api/remove_task") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val id = json.optString("id", "").trim()
            if (id.isEmpty()) throw Exception("Parameter id cannot be empty")

            TaskSchedulerManager.get()?.removeTask(id)

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"removed"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d(TAG, "Failed to delete task: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Failed to delete task: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * Delete all tasks
     */
    post("/api/clear_task") {
        try {

            val scheduler = TaskSchedulerManager.get()
                ?: throw IllegalStateException("Task scheduler not initialized")

            call.response.headers.append("Access-Control-Allow-Origin", "*")

            scheduler.clearAllTasks()

            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"result":"success"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )

        } catch (e: Exception) {
            KanoLog.d("[$BASE_TAG]_pluginsModule", "Error clearing scheduled tasks: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Error clearing scheduled tasks: ${e.message}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * Get task list
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
            KanoLog.d(TAG, "Failed to get task list: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Failed to get task list"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    /**
     * Get single task details by ID
     */
    get("/api/get_task") {
        val id = call.request.queryParameters["id"]
        if (id.isNullOrBlank()) {
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Missing task ID"}""",
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
                    """{"error":"Task not found"}""",
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
            KanoLog.d(TAG, "Failed to get task: ${e.message}")
            call.response.headers.append("Access-Control-Allow-Origin", "*")
            call.respondText(
                """{"error":"Failed to get task"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

}
