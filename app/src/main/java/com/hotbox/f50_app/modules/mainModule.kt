package com.hotbox.f50_app.modules

import android.content.Context
import com.hotbox.f50_app.modules.adb.adbModule
import com.hotbox.f50_app.modules.advanced.advancedToolsModule
import com.hotbox.f50_app.modules.at.anyProxyModule
import com.hotbox.f50_app.modules.at.atModule
import com.hotbox.f50_app.modules.auth.authenticatedRoute
import com.hotbox.f50_app.modules.config.configModule
import com.hotbox.f50_app.modules.deviceInfo.baseDeviceInfoModule
import com.hotbox.f50_app.modules.ota.otaModule
import com.hotbox.f50_app.modules.plugins.pluginsModule
import com.hotbox.f50_app.modules.scheduledTask.scheduledTaskModule
import com.hotbox.f50_app.modules.smsForward.smsModule
import com.hotbox.f50_app.modules.speedtest.SpeedTestDispatchers
import com.hotbox.f50_app.modules.speedtest.speedTestModule
import com.hotbox.f50_app.modules.theme.themeModule
import com.hotbox.f50_app.utils.ClientActivityTracker
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.install
import io.ktor.server.plugins.defaultheaders.DefaultHeaders
import io.ktor.server.routing.routing


const val BASE_TAG = "UFI_TOOLS_LOG"
const val PREFS_NAME = "Hotbox_ZTE_store"

fun Application.mainModule(context: Context, proxyServerIp: String) {
    install(DefaultHeaders)
    val targetServerIP = proxyServerIp  // Target server address
    val TAG = "[$BASE_TAG]_reverseProxyModule"

    // Track client activity — mark active on every request
    intercept(io.ktor.server.application.ApplicationCallPipeline.Plugins) {
        ClientActivityTracker.markActive()
    }

    routing {
        // Static resources
        staticFileModule(context)

        authenticatedRoute(context) {

            configModule(context)

            anyProxyModule(context)

            reverseProxyModule(targetServerIP)

            baseDeviceInfoModule(context)

            adbModule(context)

            atModule(context)

            advancedToolsModule(context, targetServerIP)

            speedTestModule(context)

            otaModule(context)

            smsModule(context)

            scheduledTaskModule(context)
        }

        themeModule(context)
        pluginsModule(context)

    }

    //Close dispatcher on exit to avoid memory leak
    environment.monitor.subscribe(ApplicationStopped) {
        SpeedTestDispatchers.close()
    }
}