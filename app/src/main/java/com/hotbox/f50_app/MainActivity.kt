package com.hotbox.f50_app

import android.app.ActivityManager
import android.app.AppOpsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.MutableLiveData
import androidx.compose.runtime.livedata.observeAsState
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.hotbox.f50_app.configs.AppMeta
import com.hotbox.f50_app.utils.DeviceModelChecker
import com.hotbox.f50_app.utils.HotboxLog
import com.hotbox.f50_app.utils.HotboxUtils
import com.hotbox.f50_app.utils.ShellHotbox
import com.hotbox.f50_app.utils.UniqueDeviceIDManager
import com.hotbox.f50_app.utils.WakeLock
import com.hotbox.f50_app.utils.getBooleanCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.system.exitProcess
import androidx.core.content.edit
import com.hotbox.f50_app.configs.AppMeta.updateIsDefaultOrWeakToken

class MainActivity : ComponentActivity() {
    companion object {
        const val REQUEST_CODE_NOTIFICATION = 114514
        const val REQUEST_CODE_SMS = 1919810
    }
    private val port = 2333
    private val PREFS_NAME = "kano_ZTE_store"
    private val PREF_GATEWAY_IP = "gateway_ip"
    private val PREF_LOGIN_TOKEN = "login_token"
    private val PREF_TOKEN_ENABLED = "login_token_enabled"
    private val PREF_AUTO_IP_ENABLED = "auto_ip_enabled"
    private val PREF_ISDEBUG = "hotbox_is_debug"
    private val PREF_WAKELOCK = "wakeLock"
    private val serverStatusLiveData = MutableLiveData<Boolean>()
    private val SERVER_INTENT = "com.hotbox.f50_app.SERVER_STATUS_CHANGED"
    private val UI_INTENT = "com.hotbox.f50_app.UI_STATUS_CHANGED"
    fun hasUsageAccessPermission(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppMeta.init(this)
        UniqueDeviceIDManager.init(this)
        val context = this
        val intent = getIntent()
        val isSilentStart = intent.getBooleanExtra("silent",false)

        //First launch init SharedPreferences
        HotboxUtils.initSharedPerfs(context)

        // Call setContent DIRECTLY in onCreate (not inside a coroutine) to ensure
        // LocalLifecycleOwner is properly provided by ComponentActivity.
        setContent {
            // Screen state: "loading", "not_ufi", "unsupported", "main"
            var screenState by remember { mutableStateOf("loading") }

            // Run async checks via LaunchedEffect (safe Compose-aware coroutine)
            LaunchedEffect(Unit) {
                UniqueDeviceIDManager.init(applicationContext)

                val isNotUFI = withContext(Dispatchers.IO) { DeviceModelChecker.checkIsNotUFI(applicationContext) }
                if (isNotUFI) {
                    Toast.makeText(applicationContext, "This app can only be used on portable WiFi devices. For phones, download the phone version. Exiting...", Toast.LENGTH_LONG).show()
                    screenState = "not_ufi"
                    delay(4600)
                    (context as? MainActivity)?.finishAffinity()
                    return@LaunchedEffect
                }

                val isUnSupportDevice = withContext(Dispatchers.IO) { DeviceModelChecker.checkBlackList(applicationContext) }
                if (isUnSupportDevice) {
                    Toast.makeText(applicationContext, "This device is not supported, exiting...", Toast.LENGTH_LONG).show()
                    screenState = "unsupported"
                    delay(4600)
                    (context as? MainActivity)?.finishAffinity()
                    return@LaunchedEffect
                }

                // Device is valid — set up the main UI
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                requestNotificationPermissionIfNeeded()

                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                    val batteryIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    batteryIntent.data = Uri.parse("package:${context.packageName}")
                    context.startActivity(batteryIntent)
                }

                if (!hasUsageAccessPermission(context)) {
                    val usageIntent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                    usageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(usageIntent)
                }

                HotboxUtils.adaptIPChange(context)

                if (!isServiceRunning(WebService::class.java)) {
                    startForegroundService(Intent(context, WebService::class.java))
                }
                if (!isServiceRunning(ADBService::class.java)) {
                    startForegroundService(Intent(context, ADBService::class.java))
                }

                registerReceiver(
                    serverStatusReceiver, IntentFilter(SERVER_INTENT),
                    Context.RECEIVER_EXPORTED
                )

                val sf = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                AppMeta.setIsEnableLog(context, sf.getBooleanCompat(PREF_ISDEBUG, false))

                runADB()

                if (isSilentStart) {
                    Toast.makeText(context, "UFI-TOOLSSilent start complete", Toast.LENGTH_SHORT).show()
                    moveTaskToBack(true)
                }

                screenState = "main"
            }

            when (screenState) {
                "loading" -> {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            CircularProgressIndicator()
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("Loading data...", fontSize = 16.sp)
                        }
                    }
                }
                "not_ufi" -> {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            repeat(10) {
                                Text("Can only be installed on portable WiFi devices!!!", fontSize = 16.sp)
                            }
                        }
                    }
                }
                "unsupported" -> {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        elevation = CardDefaults.cardElevation(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("Device id:${UniqueDeviceIDManager.getUUID()}", fontSize = 14.sp)
                            repeat(4) {
                                Text("Unsupported device!!", fontSize = 20.sp)
                                Text("Unsupported device！！", fontSize = 20.sp)
                            }
                            Text("Auto exit in 3 seconds!!", fontSize = 20.sp)
                            Text("Auto exit in 3 seconds！！", fontSize = 20.sp)
                        }
                    }
                }
                "main" -> {
                    val versionName = remember {
                        context.packageManager.getPackageInfo(context.packageName, 0).versionName
                    }
                    MainContent(
                        context = context,
                        versionName = versionName ?: "unknown",
                        serverStatusLiveData = serverStatusLiveData,
                        isSilentStart = isSilentStart
                    )
                }
            }
        }

    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                REQUEST_CODE_NOTIFICATION
            )
        } else {
            requestSmsPermissionIfNeeded()
        }
    }

    private fun requestSmsPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_SMS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(android.Manifest.permission.READ_SMS),
                REQUEST_CODE_SMS
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == REQUEST_CODE_NOTIFICATION) {
            requestSmsPermissionIfNeeded()
        }
        if (requestCode == REQUEST_CODE_SMS) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                HotboxLog.d("Permission", "SMS permission granted")
            } else {
                HotboxLog.d("Permission", "SMS permission denied")
            }
        }
    }

    fun runADB() {
        //Network ADB
        //adb setprop service.adb.tcp.port 5555
        Thread {
            try {
                ShellHotbox.runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                ShellHotbox.runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                HotboxLog.d("UFI_TOOLS_LOG", "Network ADB debug execution successful")
            } catch (e: Exception) {
                try {
                    ShellHotbox.runShellCommand("/system/bin/setprop service.adb.tcp.port 5555")
                    ShellHotbox.runShellCommand("/system/bin/setprop persist.service.adb.tcp.port 5555")
                    HotboxLog.d("UFI_TOOLS_LOG", "Network ADB debug execution successful")
                } catch (e: Exception) {
                    HotboxLog.d("UFI_TOOLS_LOG", "Network ADB debug error: ${e.message}")
                }
            }
        }.start()
    }

    private val serverStatusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action
            if (action == SERVER_INTENT) {
                val isRunning = intent.getBooleanExtra("status", false) ?: false
                HotboxLog.d("UFI_TOOLS_LOG", "isServerRunning is $isRunning")
                serverStatusLiveData.postValue(isRunning)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(serverStatusReceiver)
    }

    fun isServiceRunning(serviceClass: Class<*>): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (service in manager.getRunningServices(Int.MAX_VALUE)) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }
}

@Composable
fun MainContent(
    context: MainActivity,
    versionName: String,
    serverStatusLiveData: MutableLiveData<Boolean>,
    isSilentStart: Boolean
) {
    val sharedPrefs = remember {
        context.getSharedPreferences("kano_ZTE_store", Context.MODE_PRIVATE)
    }

    val isServerRunning by serverStatusLiveData.observeAsState(false)
    var gatewayIp by remember {
        mutableStateOf(
            sharedPrefs.getString("gateway_ip", "192.168.0.1:8080") ?: "192.168.0.1:8080"
        )
    }

    var loginToken by remember {
        mutableStateOf(
            sharedPrefs.getString("login_token", "admin") ?: "admin"
        )
    }

    var loginTokenInput by remember { mutableStateOf("") }

    var isTokenEnabled by remember {
        mutableStateOf(
            sharedPrefs.getString("login_token_enabled", true.toString()) ?: true.toString()
        )
    }
    var isAutoIpEnabled by remember {
        mutableStateOf(
            sharedPrefs.getString("auto_ip_enabled", true.toString()) ?: true.toString()
        )
    }

    var isDebugLog by remember {
        mutableStateOf(sharedPrefs.getBooleanCompat("hotbox_is_debug", false))
    }

    var wakeLock by remember {
        mutableStateOf(sharedPrefs.getString("wakeLock", "lock") ?: "lock")
    }

    if (isServerRunning) {
        ServerUI(
            serverAddress = "https://${gatewayIp.substringBefore(":")}:2333",
            gatewayIp,
            versionName = versionName,
            onStopServer = {
                context.sendBroadcast(Intent("com.hotbox.f50_app.UI_STATUS_CHANGED").putExtra("status", false))
                Toast.makeText(context, "Stoping...", Toast.LENGTH_SHORT).show()
                gatewayIp = sharedPrefs.getString("gateway_ip", "192.168.0.1:8080") ?: "192.168.0.1:8080"
                loginToken = sharedPrefs.getString("login_token", "admin") ?: "admin"
                isTokenEnabled = sharedPrefs.getString("login_token_enabled", true.toString()) ?: true.toString()
                isAutoIpEnabled = sharedPrefs.getString("auto_ip_enabled", true.toString()) ?: true.toString()
                isDebugLog = sharedPrefs.getBooleanCompat("hotbox_is_debug", false)
                wakeLock = sharedPrefs.getString("wakeLock", "lock") ?: "lock"
                HotboxLog.d("UFI_TOOLS_LOG", "user touched stop btn")
            }
        )
    } else {
        InputUI(
            gatewayIp = gatewayIp,
            onGatewayIpChange = { gatewayIp = it },
            loginToken = loginTokenInput,
            versionName = versionName,
            onLoginTokenChange = { loginTokenInput = it.ifBlank { "" } },
            isTokenEnabled = isTokenEnabled == true.toString(),
            isAutoCheckIp = isAutoIpEnabled == true.toString(),
            isDebug = isDebugLog == true,
            isWkLock = wakeLock == "lock",
            onTokenEnableChange = { isTokenEnabled = it.toString() },
            onAutoCheckIpChange = {
                isAutoIpEnabled = it.toString()
                if (it.toString() == true.toString()) {
                    HotboxUtils.adaptIPChange(context, true) { newIp ->
                        gatewayIp = newIp
                    }
                }
            },
            onDebugChange = {
                AppMeta.setIsEnableLog(sharedPrefs, it)
                isDebugLog = it
            },
            onIsWkLockChange = {
                wakeLock = if (it) "lock" else "unlock"
            },
            onConfirm = {
                if (loginTokenInput.isNotBlank()) {
                    sharedPrefs.edit(commit = true) {
                        putString("login_token", HotboxUtils.sha256Hex(loginTokenInput.ifBlank { "admin" }))
                        AppMeta.updateIsDefaultOrWeakToken(context, HotboxUtils.isWeakToken(loginTokenInput.ifBlank { "admin" }))
                    }
                }

                sharedPrefs.edit(commit = true) {
                    putString("gateway_ip", gatewayIp)
                    putString("login_token_enabled", isTokenEnabled)
                    putString("auto_ip_enabled", isAutoIpEnabled)
                    putString("wakeLock", wakeLock)
                }
                if (wakeLock != "lock") {
                    WakeLock.releaseWakeLock()
                } else {
                    WakeLock.execWakeLock(context.getSystemService(Context.POWER_SERVICE) as PowerManager)
                }
                context.sendBroadcast(Intent("com.hotbox.f50_app.UI_STATUS_CHANGED").putExtra("status", true))
                HotboxLog.d("UFI_TOOLS_LOG", "user touched start btn")
                context.runADB()
            }
        )
    }
}

@Composable
fun InputUI(
    gatewayIp: String,
    onGatewayIpChange: (String) -> Unit,
    loginToken: String,
    onLoginTokenChange: (String) -> Unit,
    onConfirm: () -> Unit,
    versionName: String,
    isTokenEnabled: Boolean,
    isAutoCheckIp: Boolean,
    isDebug:Boolean,
    isWkLock:Boolean,
    onTokenEnableChange: (Boolean) -> Unit,
    onAutoCheckIpChange: (Boolean) -> Unit,
    onDebugChange:(Boolean) -> Unit,
    onIsWkLockChange:(Boolean) -> Unit
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Card(
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(8.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .wrapContentHeight()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Title
                Text(
                    text = "Service stopped\nService has stopped",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Router management IP\nRouter management IP",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = gatewayIp,
                    onValueChange = onGatewayIpChange,
                    enabled = !isAutoCheckIp,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("e.g. 192.168.0.1") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Login Token (default: admin)\nLogin Token (default: admin)",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = loginToken,
                    onValueChange = onLoginTokenChange,
                    enabled = isTokenEnabled,
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Not Change/Not Change") }
                )
                Spacer(modifier = Modifier.height(6.dp))
                // Switch group
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Auto IP\nAuto IP",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isAutoCheckIp,
                            onCheckedChange = onAutoCheckIpChange
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Login Token\nLogin Token",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isTokenEnabled,
                            onCheckedChange = onTokenEnableChange
                        )
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Debug logs\nDebug logs",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isDebug,
                            onCheckedChange = onDebugChange
                        )
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Wake Lock\nWake Lock",fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = isWkLock,
                            onCheckedChange = onIsWkLockChange
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Button(
                    onClick = onConfirm,
                    modifier = Modifier
                        .fillMaxWidth(0.5f)
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Start/Start", textAlign = TextAlign.Center)
                }
                Spacer(modifier = Modifier.height(10.dp))
                HyperlinkText(
                    fullText = "Created by Hotbox with ❤️ ver: $versionName",
                    linkText = "Hotbox",
                    fontSize = 12.sp,
                    "https://github.com/kanoqwq",
                    modifier = Modifier.fillMaxWidth()
                )
                HyperlinkText(
                    "View source code on Github(Hotbox)",
                    "Github(Hotbox)",
                    fontSize = 12.sp,
                    "https://github.com/kanoqwq/F50-SMS",
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
fun ServerUI(
    serverAddress: String,
    gatewayIP: String,
    onStopServer: () -> Unit,
    versionName: String
) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Card(
            shape = RoundedCornerShape(16.dp), // rounded corners
            elevation = CardDefaults.cardElevation(8.dp), // Shadow
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp) // Margin
                .wrapContentHeight()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Server is running\nServer is running",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                HyperlinkText(
                    "Frontend link/Link: $serverAddress",
                    serverAddress,
                    fontSize = 16.sp,
                    url = serverAddress,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(16.dp))
                HyperlinkText(
                    "Gateway/Gateway: $gatewayIP",
                    gatewayIP,
                    fontSize = 16.sp,
                    url = "http://$gatewayIP",
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(20.dp))
                Text("Click to stop the service and change the gateway and password (default: admin)\nClick to stop the service and change the gateway and password (default: admin)",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(20.dp))
                Button(onClick = onStopServer) {
                    Text("Stop Server/Stop Server")
                }
                Spacer(modifier = Modifier.height(32.dp))
                HyperlinkText(
                    fullText = "Created by Hotbox with ❤️ ver: $versionName",
                    linkText = "Hotbox",
                    fontSize = 12.sp,
                    "https://github.com/kanoqwq",
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(10.dp))
                HyperlinkText(
                    "View source code on Github(Hotbox)",
                    "Github(Hotbox)",
                    fontSize = 12.sp,
                    "https://github.com/kanoqwq/F50-SMS",
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}

@Composable
fun HyperlinkText(
    fullText: String,
    linkText: String,
    fontSize: TextUnit,
    url: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    val annotatedText = buildAnnotatedString {
        append(fullText)

        val startIndex = fullText.indexOf(linkText)
        val endIndex = startIndex + linkText.length

        if (startIndex >= 0) {
            addStyle(
                style = SpanStyle(
                    color = Color(0xFF1E88E5),
                    textDecoration = TextDecoration.Underline,
                    fontSize = fontSize
                ),
                start = startIndex,
                end = endIndex,
            )

            addStringAnnotation(
                tag = "URL",
                annotation = url,
                start = startIndex,
                end = endIndex
            )
        }
    }

    ClickableText(
        text = annotatedText,
        modifier = modifier.fillMaxWidth(),
        style = TextStyle(
            fontSize = fontSize,
            textAlign = TextAlign.Center
        ),
        onClick = { offset ->
            annotatedText.getStringAnnotations("URL", offset, offset)
                .firstOrNull()?.let {
                    try {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it.item)))
                    } catch (e: Exception) {
                        Toast.makeText(context, "Failed to open link", Toast.LENGTH_SHORT).show()
                    }
                }
        }
    )
}