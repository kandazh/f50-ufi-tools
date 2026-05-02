package com.hotbox.f50_app

import android.content.Context
import com.hotbox.f50_app.modules.mainModule
import com.hotbox.f50_app.utils.HotboxLog
import io.ktor.server.engine.applicationEngineEnvironment
import io.ktor.server.engine.connector
import io.ktor.server.engine.embeddedServer
import io.ktor.server.engine.sslConnector
import io.ktor.server.netty.Netty
import java.security.KeyStore
import java.util.concurrent.atomic.AtomicBoolean

class HotboxWebServer(private val context: Context, port: Int, private val proxyServerIp: String) {

    companion object {
        private val running = AtomicBoolean(false)
        private const val KEYSTORE_PASSWORD = "changeit"
        private const val KEY_ALIAS = "ufi-tools"
        private const val TAG = "UFI_TOOLS_LOG"
        private const val SSL_ENABLED = false // Set to true to enable HTTPS
    }

    private val server = run {
        val environment = applicationEngineEnvironment {
            if (SSL_ENABLED) {
                try {
                    val keyStore = KeyStore.getInstance("PKCS12").apply {
                        context.assets.open("certs/ssl.p12").use { stream ->
                            load(stream, KEYSTORE_PASSWORD.toCharArray())
                        }
                    }
                    val alias = keyStore.aliases().toList().firstOrNull { keyStore.isKeyEntry(it) }
                        ?: KEY_ALIAS
                    sslConnector(
                        keyStore = keyStore,
                        keyAlias = alias,
                        keyStorePassword = { KEYSTORE_PASSWORD.toCharArray() },
                        privateKeyPassword = { KEYSTORE_PASSWORD.toCharArray() }
                    ) {
                        this.port = port
                        host = "0.0.0.0"
                    }
                    HotboxLog.d(TAG, "SSL keystore loaded successfully, alias=$alias")
                } catch (e: Exception) {
                    HotboxLog.e(TAG, "SSL keystore failed: ${e.message}, falling back to HTTP")
                    connector {
                        this.port = port
                        host = "0.0.0.0"
                    }
                }
            } else {
                connector {
                    this.port = port
                    host = "0.0.0.0"
                }
                HotboxLog.d(TAG, "HTTP server on port $port")
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
