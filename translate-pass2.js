const fs = require('fs');
const path = require('path');

const dictionary = {
  "//tap逻辑": "//tap logic",
  "// 输入文本": "// Input text",
  "//继续检测result": "//Continue checking result",
  "// cat 读取 XML 内容": "// cat reads XML content",
  "// Timeout回调": "// Timeout callback",
  "// Start线程读输出": "// Start thread to read output",
  "// 最多等待 timeoutMs 毫秒": "// Wait max timeoutMs milliseconds",
  "adb device 执行状态：": "adb device execution status: ",
  "//网络adb": "//Network ADB",
  "ADB_WIFI自StartExecution successful": "ADB_WIFI auto-start execution successful",
  "ADB_WIFI执行错误: ": "ADB_WIFI execution error: ",
  "//samba开关关闭了，立马拉起": "//Samba switch closed, restart immediately",
  "// 如果是追加模式且目标文件已存在，则直接返回该文件，避免干扰可执行 文件的运行": "// If append mode and target file exists, return it directly to avoid interfering with executable",
  "} // 通知 Compose 更新 UI": "} // Notify Compose to update UI",
  "//说明可能是第一次Start": "//Possibly first start",
  "// 是否包含 \\r": "// Whether contains \\r",
  "// 返回状态码": "// Return status code",
  "// 表示Request failed": "// Indicates request failed",
  "// Timeout杀掉进程": "// Timeout kills the process",
  "failed(Adb与Shell方式执行不成功)，请恢复出厂后，重新安装再试<br>Failed to enable advanced features (resultAdb and resultShell execution unsuccessful)": "failed (ADB and Shell execution unsuccessful), please factory reset and reinstall<br>Failed to enable advanced features (resultAdb and resultShell execution unsuccessful)",
  "failed(Adb与Shell方式执行不成功)，请打开网络ADB后再试<br>Failed to enable advanced features (resultAdb and resultShell execution unsuccessful)": "failed (ADB and Shell execution unsuccessful), please enable network ADB and retry<br>Failed to enable advanced features (resultAdb and resultShell execution unsuccessful)",
  "failed(配置文件没有更改或不存在)，请将Device恢复出厂设置后，重新安装再试<br>Failed to enable advanced features (conf not changed or does not exist),please reset your device to factory": "failed (config file not changed or does not exist), please factory reset and reinstall<br>Failed to enable advanced features (conf not changed or does not exist), please reset your device to factory",
  "failed(配置文件没有更改或不存在)，请打开网络ADB后再试<br>Failed to enable advanced features (conf not changed or does not exist),please enable ADB": "failed (config file not changed or does not exist), please enable network ADB and retry<br>Failed to enable advanced features (conf not changed or does not exist), please enable ADB",
  "// 开关组": "// Switch group",
  "// Copy assets 中的所有文件": "// Copy all files from assets",
  "Set token出错：": "Set token error: ",
  "//保存sh": "//Save shell script",
  "执行：": "Executing: ",
  "//SELinux状态": "//SELinux status",
  "//usbDevice树以及接口状态": "//USB device tree and interface status",
  "没有找到Placeholder": "Placeholder not found: ",
  "query 缺少 enable 参数": "query missing enable parameter",
  "短信转发 enable parameter": "SMS forward enable parameter",
  "//获取电量信息转发状态": "//Get battery info forward status",
  "钉钉Config error: ": "DingTalk config error: ",
  "// Application 或 Activity Start时调用一次初始化：": "// Call once to initialize when Application or Activity starts:",
  "//Activate network ADB等": "//Activate network ADB etc.",
  "// 每 5 分钟": "// Every 5 minutes",
  "//避免任务在已停止调度器中执 行": "//Avoid task executing in stopped scheduler",
  "SMBcommand错误：": "SMB command error: ",
  "SMB command执行完成": "SMB command execution complete",
  "//CPU温度": "//CPU temperature",
  "// 顺便获取 Type-C host/gadget 模式": "// Also get Type-C host/gadget mode",
  "//如果是gadget模式，从另一个地方获取速度": "//If gadget mode, get speed from another source",
  "// 构建 JSON": "// Build JSON",
  "//连接数": "//Connection count",
  "// 其他状态": "// Other states",
  "// 第4列是状态 hex": "// 4th column is state hex",
  "// 直接取固定位置比 split 更省CPU": "// Direct fixed position is more CPU efficient than split",
  "// 但为稳妥仍用轻量 split": "// But still use lightweight split for safety",
  "// 读掉表头": "// Skip header line",
  "// 过滤空行": "// Filter empty lines",
  "// 无Permission / 读取failed": "// No permission / read failed",
  "AT command must start with \"AT\" 开头": "AT command must start with 'AT'",
  "Respond为空": "Response is empty",
  "// 打印异常可以帮你 debug": "// Print exception for debugging",
  "// 正常按钮": "// Normal button",
  "// 激活按钮（更亮、更饱和、更实）": "// Active button (brighter, more saturated, more solid)",
  "// 禁用按钮（去饱和、更透明）": "// Disabled button (desaturated, more transparent)",
  "// 修改 :root 中的 CSS 变量": "// Modify CSS variables in :root",
  "//针对Safari -webkit-backdrop-filter 不支持css变量 进行修复": "//Fix for Safari -webkit-backdrop-filter not supporting CSS variables",
  "//去除已存在的style": "//Remove existing styles",
  "// 强制 GPU 图层": "// Force GPU layer",
  "//保存到localStorage": "//Save to localStorage",
  "//读取颜色数据": "//Read color data",
  "// 从云端拉取主题数据": "// Fetch theme data from server",
  "云端主题拉取数据failed：": "Server theme fetch failed: ",
  "# 清除 iptables mark 规则": "# Clear iptables mark rules",
  "# 更强力地清除 tc filter 和 class": "# More forcefully clear tc filter and class",
  "# ========= 参数解析 =========": "# ========= Parameter parsing ========="
};

// Sort dictionary keys by length (longest first) for greedy matching
const sortedKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);

function hasChinese(str) {
  return /[\u4e00-\u9fff]/.test(str);
}

function translateLine(line) {
  if (!hasChinese(line)) return line;
  let result = line;
  for (const key of sortedKeys) {
    if (result.includes(key)) {
      result = result.split(key).join(dictionary[key]);
    }
  }
  return result;
}

const root = __dirname;
const kotlinBase = path.join(root, 'app/src/main/java/com/minikano/f50_sms');
const files = [
  path.join(kotlinBase, 'utils/ShellKano.kt'),
  path.join(kotlinBase, 'utils/KanoUtils.kt'),
  path.join(kotlinBase, 'modules/advanced/advancedToolsModule.kt'),
  path.join(kotlinBase, 'utils/SmsPoll.kt'),
  path.join(kotlinBase, 'MainActivity.kt'),
  path.join(kotlinBase, 'ADBService.kt'),
  path.join(kotlinBase, 'modules/config/configModule.kt'),
  path.join(kotlinBase, 'modules/ota/otaModule.kt'),
  path.join(kotlinBase, 'modules/deviceInfo/baseDeviceInfoModule.kt'),
  path.join(kotlinBase, 'modules/smsForward/smsModule.kt'),
  path.join(kotlinBase, 'modules/theme/themeModule.kt'),
  path.join(kotlinBase, 'modules/scheduledTask/scheduledTaskModule.kt'),
  path.join(kotlinBase, 'WebService.kt'),
  path.join(kotlinBase, 'BootReceiver.kt'),
  path.join(kotlinBase, 'utils/WakeLock.kt'),
  path.join(kotlinBase, 'utils/TaskScheduler.kt'),
  path.join(kotlinBase, 'utils/SmbThrottledRunner.kt'),
  path.join(kotlinBase, 'utils/UniqueDeviceIDManager.kt'),
  path.join(kotlinBase, 'utils/DeviceInfo.kt'),
  path.join(kotlinBase, 'utils/KanoDingTalk.kt'),
  path.join(kotlinBase, 'utils/IPManager.kt'),
  path.join(kotlinBase, 'utils/KanoCURL.kt'),
  path.join(kotlinBase, 'utils/KanoSMTP.kt'),
  path.join(kotlinBase, 'utils/PassHash.kt'),
  path.join(kotlinBase, 'modules/adb/adbModule.kt'),
  path.join(kotlinBase, 'modules/at/atModule.kt'),
  path.join(kotlinBase, 'modules/plugins/pluginsModule.kt'),
  path.join(kotlinBase, 'modules/reverseProxyModule.kt'),
  path.join(kotlinBase, 'modules/anyProxy/anyProxyModule.kt'),
  path.join(kotlinBase, 'utils/kanoGoformRequest.kt'),
  path.join(root, 'app/frontEnd/build.js'),
  path.join(root, 'app/src/main/assets/script/theme.js'),
  path.join(root, 'app/src/main/assets/shell/traffic_limit_bak.sh'),
];

let totalChanged = 0;
let remaining = 0;

for (const filePath of files) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let fileChanged = false;
  let count = 0;

  const newLines = lines.map((line) => {
    if (!hasChinese(line)) return line;
    const translated = translateLine(line);
    if (translated !== line) { fileChanged = true; count++; }
    if (hasChinese(translated)) remaining++;
    return translated;
  });

  if (fileChanged) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    totalChanged += count;
    console.log(`FIXED: ${path.relative(root, filePath)} (${count} lines)`);
  }
}

console.log(`\nTotal lines fixed: ${totalChanged}`);
console.log(`Remaining Chinese lines: ${remaining}`);
