package com.minikano.f50_sms

import android.content.Context
import com.minikano.f50_sms.modules.mainModule
import com.minikano.f50_sms.utils.KanoLog
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import java.util.concurrent.atomic.AtomicBoolean

class KanoWebServer(private val context: Context, port: Int, private val proxyServerIp: String) {

    companion object {
        private val running = AtomicBoolean(false)
    }

    private val server = embeddedServer(CIO, port = port, host = "0.0.0.0") {
        mainModule(context, proxyServerIp)
    }

    fun start() {
        if (!running.compareAndSet(false, true)) {
            throw IllegalStateException("Web server is already running.")
        }
        try {
            server.start(wait = false)
        } catch (e: Exception) {
            running.set(false)
            throw e
        }
    }

    fun stop() {
        try {
            server.stop(1000, 2000)
        } finally {
            running.set(false)
        }
    }
}
