package com.hotbox.f50_app.modules.advanced

import android.content.Context
import com.hotbox.f50_app.modules.BASE_TAG
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.RootShell
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

fun Route.wireguardModule(context: Context) {
    val TAG = "[$BASE_TAG]_wireguardModule"
    val WG_DIR = "/data/adb/wireguard"
    val WG_BIN = "$WG_DIR/wg"
    val WG_CONF_DIR = "$WG_DIR/configs"
    val WG_INTERFACE = "wg0"

    fun getSocketPath(): File = File(context.filesDir, "hotbox_root_shell.sock")

    fun rootExec(command: String, timeoutMs: Long = 15000): String? {
        val socketPath = getSocketPath()
        if (!socketPath.exists()) return null
        return RootShell.sendCommandToSocket(command, socketPath.absolutePath, timeoutMs)
    }

    fun ensureWgBinary(): Boolean {
        // Check if wg binary exists, if not copy from assets
        val check = rootExec("test -x $WG_BIN && echo OK || echo MISSING")
        if (check?.trim() == "OK") return true

        // Try to copy from app assets
        val outFile = HotboxUtils.copyFileToFilesDir(context, "shell/wg")
        if (outFile != null) {
            outFile.setExecutable(true)
            rootExec("mkdir -p $WG_DIR; cp ${outFile.absolutePath} $WG_BIN; chmod 755 $WG_BIN")
            return rootExec("test -x $WG_BIN && echo OK || echo MISSING")?.trim() == "OK"
        }
        return false
    }

    fun isInterfaceUp(): Boolean {
        val result = rootExec("ip link show $WG_INTERFACE 2>/dev/null | grep -c UP")
        return result?.trim() == "1"
    }

    // GET /api/wireguard — status + list configs
    get("/api/wireguard") {
        try {
            val socketPath = getSocketPath()
            if (!socketPath.exists()) {
                call.respondText(
                    """{"error":"Root access required"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.Forbidden
                )
                return@get
            }

            if (!ensureWgBinary()) {
                call.respondText(
                    """{"error":"WireGuard binary not available"}""",
                    ContentType.Application.Json,
                    HttpStatusCode.InternalServerError
                )
                return@get
            }

            val result = JSONObject()

            // Get interface status
            val active = isInterfaceUp()
            result.put("active", active)

            if (active) {
                val wgShow = rootExec("$WG_BIN show $WG_INTERFACE 2>&1") ?: ""
                result.put("status", wgShow.trim())

                // Get transfer stats
                val transfer = rootExec("$WG_BIN show $WG_INTERFACE transfer 2>/dev/null") ?: ""
                result.put("transfer", transfer.trim())

                // Get endpoint
                val endpoints = rootExec("$WG_BIN show $WG_INTERFACE endpoints 2>/dev/null") ?: ""
                result.put("endpoints", endpoints.trim())

                // Get latest handshake
                val handshakes = rootExec("$WG_BIN show $WG_INTERFACE latest-handshakes 2>/dev/null") ?: ""
                result.put("handshakes", handshakes.trim())
            }

            // List saved configs
            val configList = rootExec("ls $WG_CONF_DIR/*.conf 2>/dev/null | xargs -I{} basename {} .conf") ?: ""
            val configs = JSONArray()
            configList.trim().lines().filter { it.isNotBlank() }.forEach { configs.put(it) }
            result.put("configs", configs)

            // Get active config name
            val activeConf = rootExec("cat $WG_DIR/.active 2>/dev/null") ?: ""
            result.put("active_config", activeConf.trim())

            call.respondText(result.toString(), ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Error: ${e.message}")
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    // POST /api/wireguard/genkey — generate a new keypair
    post("/api/wireguard/genkey") {
        try {
            if (!ensureWgBinary()) throw Exception("WireGuard binary not available")

            val privkey = rootExec("$WG_BIN genkey")?.trim()
                ?: throw Exception("Failed to generate private key")
            val pubkey = rootExec("echo '$privkey' | $WG_BIN pubkey")?.trim()
                ?: throw Exception("Failed to derive public key")

            val result = JSONObject()
            result.put("private_key", privkey)
            result.put("public_key", pubkey)

            call.respondText(result.toString(), ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    // POST /api/wireguard/save — save a tunnel configuration
    post("/api/wireguard/save") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)

            val name = json.getString("name").trim()
            if (!name.matches(Regex("^[a-zA-Z0-9_-]{1,15}$"))) {
                throw Exception("Invalid tunnel name: use only letters, numbers, hyphens, underscores (max 15 chars)")
            }

            val privateKey = json.getString("private_key").trim()
            val address = json.getString("address").trim()
            val dns = json.optString("dns", "").trim()
            val mtu = json.optInt("mtu", 1420)

            // Peer config
            val peerPubkey = json.getString("peer_public_key").trim()
            val peerEndpoint = json.getString("peer_endpoint").trim()
            val allowedIps = json.optString("allowed_ips", "0.0.0.0/0, ::/0").trim()
            val peerPresharedKey = json.optString("peer_preshared_key", "").trim()
            val persistentKeepalive = json.optInt("persistent_keepalive", 25)

            // Validate base64 keys (44 chars ending with =)
            val keyRegex = Regex("^[A-Za-z0-9+/]{42,43}=?$")
            if (!keyRegex.matches(privateKey)) throw Exception("Invalid private key format")
            if (!keyRegex.matches(peerPubkey)) throw Exception("Invalid peer public key format")
            if (peerPresharedKey.isNotEmpty() && !keyRegex.matches(peerPresharedKey)) {
                throw Exception("Invalid preshared key format")
            }

            // Validate address (CIDR notation)
            if (!address.matches(Regex("^[0-9a-fA-F.:]+/\\d{1,3}(,\\s*[0-9a-fA-F.:]+/\\d{1,3})*$"))) {
                throw Exception("Invalid address format (expected CIDR, e.g., 10.0.0.2/32)")
            }

            // Validate endpoint
            if (!peerEndpoint.matches(Regex("^[a-zA-Z0-9._-]+:\\d{1,5}$"))) {
                throw Exception("Invalid endpoint format (expected host:port)")
            }

            // Build WireGuard config file
            val config = buildString {
                appendLine("[Interface]")
                appendLine("PrivateKey = $privateKey")
                appendLine("Address = $address")
                if (dns.isNotEmpty()) appendLine("DNS = $dns")
                if (mtu in 1280..9000) appendLine("MTU = $mtu")
                appendLine()
                appendLine("[Peer]")
                appendLine("PublicKey = $peerPubkey")
                if (peerPresharedKey.isNotEmpty()) appendLine("PresharedKey = $peerPresharedKey")
                appendLine("AllowedIPs = $allowedIps")
                appendLine("Endpoint = $peerEndpoint")
                if (persistentKeepalive in 1..600) appendLine("PersistentKeepalive = $persistentKeepalive")
            }

            // Save config file
            val escapedConfig = config.replace("'", "'\\''")
            rootExec("mkdir -p $WG_CONF_DIR; echo '$escapedConfig' > $WG_CONF_DIR/$name.conf; chmod 600 $WG_CONF_DIR/$name.conf")
                ?: throw Exception("Failed to save config")

            // Derive and return public key for sharing
            val pubkey = rootExec("echo '$privateKey' | $WG_BIN pubkey")?.trim() ?: ""

            val result = JSONObject()
            result.put("saved", true)
            result.put("name", name)
            result.put("public_key", pubkey)

            call.respondText(result.toString(), ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Save error: ${e.message}")
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.BadRequest
            )
        }
    }

    // POST /api/wireguard/connect — bring up a tunnel
    post("/api/wireguard/connect") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)
            val name = json.getString("name").trim()

            if (!name.matches(Regex("^[a-zA-Z0-9_-]{1,15}$"))) {
                throw Exception("Invalid tunnel name")
            }

            if (!ensureWgBinary()) throw Exception("WireGuard binary not available")

            // Check if already connected
            if (isInterfaceUp()) {
                // Bring down existing first
                rootExec("ip link set $WG_INTERFACE down 2>/dev/null; ip link del $WG_INTERFACE 2>/dev/null")
                Thread.sleep(500)
            }

            // Read config file
            val configContent = rootExec("cat $WG_CONF_DIR/$name.conf 2>&1")
                ?: throw Exception("Config not found: $name")
            if (configContent.contains("No such file")) {
                throw Exception("Config not found: $name")
            }

            // Parse config for Interface section
            val lines = configContent.lines()
            var address = ""
            var dns = ""
            var mtu = 1420
            var privateKey = ""
            var peerSection = ""
            var inPeer = false

            for (line in lines) {
                val trimmed = line.trim()
                if (trimmed == "[Peer]") { inPeer = true; continue }
                if (trimmed == "[Interface]") { inPeer = false; continue }
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue

                val parts = trimmed.split("=", limit = 2)
                if (parts.size != 2) continue
                val key = parts[0].trim()
                val value = parts[1].trim()

                if (!inPeer) {
                    when (key) {
                        "PrivateKey" -> privateKey = value
                        "Address" -> address = value
                        "DNS" -> dns = value
                        "MTU" -> mtu = value.toIntOrNull() ?: 1420
                    }
                }
            }

            if (privateKey.isEmpty()) throw Exception("No PrivateKey in config")
            if (address.isEmpty()) throw Exception("No Address in config")

            // Parse peer section
            var peerPubkey = ""
            var peerEndpoint = ""
            var allowedIps = "0.0.0.0/0"
            var peerPsk = ""
            var keepalive = 0
            inPeer = false

            for (line in lines) {
                val trimmed = line.trim()
                if (trimmed == "[Peer]") { inPeer = true; continue }
                if (trimmed == "[Interface]") { inPeer = false; continue }
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue
                if (!inPeer) continue

                val parts = trimmed.split("=", limit = 2)
                if (parts.size != 2) continue
                val key = parts[0].trim()
                val value = parts[1].trim()

                when (key) {
                    "PublicKey" -> peerPubkey = value
                    "Endpoint" -> peerEndpoint = value
                    "AllowedIPs" -> allowedIps = value
                    "PresharedKey" -> peerPsk = value
                    "PersistentKeepalive" -> keepalive = value.toIntOrNull() ?: 0
                }
            }

            if (peerPubkey.isEmpty()) throw Exception("No peer PublicKey in config")

            // Build wg set command (uses file for private-key, avoids setconf file issues)
            val pskPart = if (peerPsk.isNotEmpty()) {
                "echo '$peerPsk' > /data/local/tmp/wg_psk; $WG_BIN set $WG_INTERFACE peer $peerPubkey preshared-key /data/local/tmp/wg_psk"
            } else ""

            val keepalivePart = if (keepalive > 0) "persistent-keepalive $keepalive" else ""
            val endpointPart = if (peerEndpoint.isNotEmpty()) "endpoint $peerEndpoint" else ""

            val bringUp = """
                # Create interface
                ip link del $WG_INTERFACE 2>/dev/null
                ip link add $WG_INTERFACE type wireguard
                
                # Write private key to file
                echo '$privateKey' > /data/local/tmp/wg_privkey
                chmod 600 /data/local/tmp/wg_privkey
                
                # Configure via wg set (reliable, no setconf file issues)
                $WG_BIN set $WG_INTERFACE private-key /data/local/tmp/wg_privkey peer $peerPubkey $endpointPart allowed-ips $allowedIps $keepalivePart 2>&1
                ${pskPart}
                
                # Add addresses
                ${address.split(",").joinToString("\n") { "ip addr add ${it.trim()} dev $WG_INTERFACE" }}
                
                # Set MTU and bring up
                ip link set $WG_INTERFACE mtu $mtu
                ip link set $WG_INTERFACE up
                
                # Add routes for allowed IPs (split routing to avoid breaking existing connectivity)
                ip route add 0.0.0.0/1 dev $WG_INTERFACE 2>/dev/null
                ip route add 128.0.0.0/1 dev $WG_INTERFACE 2>/dev/null
                
                # Set DNS if specified
                ${if (dns.isNotEmpty()) "ndc resolver setnetdns $WG_INTERFACE '' ${dns.split(",").joinToString(" ") { it.trim() }} 2>/dev/null" else "# No DNS override"}
                
                # Cleanup temp files
                rm -f /data/local/tmp/wg_privkey /data/local/tmp/wg_psk
                
                # Save active state
                echo '$name' > $WG_DIR/.active
                
                echo "CONNECTED"
            """.trimIndent()

            HotboxLog.d(TAG, "Bringing up WireGuard tunnel: $name")
            val output = rootExec(bringUp, 20000) ?: throw Exception("Root shell timeout")

            if (!output.contains("CONNECTED")) {
                throw Exception("Failed to connect: $output")
            }

            val result = JSONObject()
            result.put("connected", true)
            result.put("name", name)
            result.put("interface", WG_INTERFACE)

            call.respondText(result.toString(), ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            HotboxLog.d(TAG, "Connect error: ${e.message}")
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    // POST /api/wireguard/disconnect — bring down the tunnel
    post("/api/wireguard/disconnect") {
        try {
            val down = """
                ip link set $WG_INTERFACE down 2>/dev/null
                ip link del $WG_INTERFACE 2>/dev/null
                ip route del 0.0.0.0/1 dev $WG_INTERFACE 2>/dev/null
                ip route del 128.0.0.0/1 dev $WG_INTERFACE 2>/dev/null
                rm -f $WG_DIR/.active
                echo "DISCONNECTED"
            """.trimIndent()

            val output = rootExec(down, 10000) ?: throw Exception("Root shell timeout")

            val result = JSONObject()
            result.put("disconnected", true)

            call.respondText(result.toString(), ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    // POST /api/wireguard/delete — delete a saved config
    post("/api/wireguard/delete") {
        try {
            val body = call.receiveText()
            val json = JSONObject(body)
            val name = json.getString("name").trim()

            if (!name.matches(Regex("^[a-zA-Z0-9_-]{1,15}$"))) {
                throw Exception("Invalid tunnel name")
            }

            // If this tunnel is active, disconnect first
            val activeConf = rootExec("cat $WG_DIR/.active 2>/dev/null")?.trim() ?: ""
            if (activeConf == name && isInterfaceUp()) {
                rootExec("ip link set $WG_INTERFACE down; ip link del $WG_INTERFACE; rm -f $WG_DIR/.active")
            }

            rootExec("rm -f $WG_CONF_DIR/$name.conf")

            call.respondText(
                """{"deleted":true,"name":"$name"}""",
                ContentType.Application.Json,
                HttpStatusCode.OK
            )
        } catch (e: Exception) {
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }

    // GET /api/wireguard/config/:name — read a saved config (masks private key)
    get("/api/wireguard/config/{name}") {
        try {
            val name = call.parameters["name"]?.trim() ?: throw Exception("Missing name")
            if (!name.matches(Regex("^[a-zA-Z0-9_-]{1,15}$"))) throw Exception("Invalid name")

            val content = rootExec("cat $WG_CONF_DIR/$name.conf 2>&1")
                ?: throw Exception("Failed to read config")
            if (content.contains("No such file")) throw Exception("Config not found: $name")

            // Parse and return as JSON (mask private key for display)
            val result = JSONObject()
            result.put("name", name)
            result.put("config", content.trim())

            call.respondText(result.toString(), ContentType.Application.Json, HttpStatusCode.OK)
        } catch (e: Exception) {
            call.respondText(
                """{"error":"${e.message?.replace("\"", "\\\"")}"}""",
                ContentType.Application.Json,
                HttpStatusCode.InternalServerError
            )
        }
    }
}
