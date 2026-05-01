package com.minikano.f50_sms

import android.content.Context
import com.minikano.f50_sms.modules.mainModule
import com.minikano.f50_sms.utils.KanoLog
import io.ktor.server.engine.applicationEngineEnvironment
import io.ktor.server.engine.embeddedServer
import io.ktor.server.engine.sslConnector
import io.ktor.server.netty.Netty
import java.security.KeyStore
import java.util.concurrent.atomic.AtomicBoolean

class KanoWebServer(private val context: Context, port: Int, private val proxyServerIp: String) {

    companion object {
        private val running = AtomicBoolean(false)
        private const val KEYSTORE_PASSWORD = "changeit"
        private const val KEY_ALIAS = "ufi-tools"
    }

    private val server = run {
        val keyStore = KeyStore.getInstance("PKCS12").apply {
            context.assets.open("certs/ssl.p12").use { stream ->
                load(stream, KEYSTORE_PASSWORD.toCharArray())
            }
        }

        val environment = applicationEngineEnvironment {
            sslConnector(
                keyStore = keyStore,
                keyAlias = KEY_ALIAS,
                keyStorePassword = { KEYSTORE_PASSWORD.toCharArray() },
                privateKeyPassword = { KEYSTORE_PASSWORD.toCharArray() }
            ) {
                this.port = port
                host = "0.0.0.0"
            }
            module {
                mainModule(context, proxyServerIp)
            }
        }

        embeddedServer(Netty, environment)
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
