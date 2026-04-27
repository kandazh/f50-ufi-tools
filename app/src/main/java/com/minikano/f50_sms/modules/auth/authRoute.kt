package com.minikano.f50_sms.modules.auth

import android.content.Context
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.route

fun Route.authenticatedRoute(context: Context, block: Route.() -> Unit) {
    route("") {
        intercept(ApplicationCallPipeline.Plugins) {
            if (!KanoAuth.checkAuth(call, context)) {
                call.respond(HttpStatusCode.Unauthorized)
                finish() // 阻止后续处理
            }
        }
        block()
    }
}
