// translate-everything.js - Translate ALL remaining Chinese in the entire project
const fs = require('fs');
const path = require('path');
const root = __dirname;

function translateFile(relPath, replacements) {
  const fp = path.join(root, relPath);
  if (!fs.existsSync(fp)) return 0;
  let c = fs.readFileSync(fp, 'utf8');
  let count = 0;
  for (const [from, to] of replacements) {
    if (c.includes(from)) { c = c.split(from).join(to); count++; }
  }
  if (count > 0) fs.writeFileSync(fp, c);
  return count;
}

// Generic comment translation for Kotlin files
function translateKotlinComments(relPath) {
  const fp = path.join(root, relPath);
  if (!fs.existsSync(fp)) return 0;
  let c = fs.readFileSync(fp, 'utf8');
  const original = c;
  
  // Translate single-line comments: // Chinese
  c = c.replace(/\/\/\s*([\u4e00-\u9fff][\u4e00-\u9fff\w\s，。、：；""（）《》【】！？·/\-\d.%~${}]*)/g, (match, chinese) => {
    const en = translateChinesePhrase(chinese);
    return '// ' + en;
  });
  
  // Translate inline comments after code: code // Chinese
  // Already handled by the regex above
  
  // Translate string literals with Chinese in Log/KanoLog calls
  c = c.replace(/(Log\.\w+\([^,]+,\s*")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });
  c = c.replace(/(KanoLog\.\w+\([^,]+,\s*")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });
  
  // Translate throw Exception("Chinese")
  c = c.replace(/(throw\s+(?:Exception|IllegalArgumentException)\(")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });
  
  // Translate println("Chinese")
  c = c.replace(/(println\(")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });
  
  // Translate Toast.makeText messages
  c = c.replace(/(Toast\.makeText\([^,]+,\s*")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });
  
  // Translate call.respond messages  
  c = c.replace(/(call\.respond\([^,]+,\s*")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });

  // Translate string templates with Chinese
  c = c.replace(/("""[^"]*)([\u4e00-\u9fff]+[^"]*?)(""")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });
  
  // Translate Text("Chinese...") for Compose UI
  c = c.replace(/(Text\(")([^"]*[\u4e00-\u9fff][^"]*?)(")/g, (m, pre, cn, post) => {
    return pre + translateChinesePhrase(cn) + post;
  });

  // Translate KDoc comments
  c = c.replace(/(\*\s*)([\u4e00-\u9fff][\u4e00-\u9fff\w\s，。、：；""（）《》【】！？·/\-\d.%~${}]*)/g, (m, pre, cn) => {
    return pre + translateChinesePhrase(cn);
  });

  if (c !== original) {
    fs.writeFileSync(fp, c);
    const remaining = c.split('\n').filter(l => /[\u4e00-\u9fff]/.test(l)).length;
    return remaining;
  }
  return -1; // no changes
}

// Chinese phrase translation dictionary
function translateChinesePhrase(cn) {
  const dict = {
    // Common phrases
    '串行执行任务': 'Execute tasks serially',
    '等文件拷贝完成后再继续': 'Wait for file copy to complete before continuing',
    '订阅电池事件接收器': 'Subscribe to battery event receiver',
    '开启定时任务': 'Start scheduled tasks',
    '剩余电量低': 'Low battery',
    '请及时充电': 'Please charge soon',
    '开机广播接收到，准备启动服务': 'Boot broadcast received, preparing to start service',
    '初始化spf': 'Initialize SharedPreferences',
    '检测到设备不是UFI/MIFI设备，终结程序': 'Device is not UFI/MIFI, terminating',
    '启动协程异步调用': 'Start coroutine async call',
    '黑名单检测结果': 'Blocklist check result',
    '持久化': 'Persist',
    '更新唤醒锁': 'Update wake lock',
    '预处理口令': 'Pre-process token',
    '第一次启动初始化spf': 'First launch initialize SharedPreferences',
    '这里用协程异步调用': 'Use coroutine async call here',
    '加载数据中': 'Loading data',
    '仅可在随身wifi上安装使用': 'Can only be installed on portable WiFi devices',
    '手机使用请下载手机直装版': 'For phones, download the phone version',
    '正在退出': 'Exiting',
    '圆角': 'Rounded corners',
    '静态资源': 'Static resources',
    '更新ADMIN_PWD': 'Update ADMIN_PWD',
    '获取 JSON Body': 'Get JSON body',
    '保存配置': 'Save config',
    '响应': 'Response',
    '开启高级功能': 'Enable advanced features',
    '缺少 query 参数': 'Missing query parameter',
    '传入参数': 'Input parameter',
    '复制依赖文件': 'Copy dependency files',
    '复制 adb 到 filesDir 失败': 'Failed to copy adb to filesDir',
    '构建请求体（如果有）': 'Build request body (if any)',
    '构建请求头': 'Build request headers',
    '代理请求头检测到': 'Proxy header detected',
    '已去掉前缀': 'Prefix removed',
    '处理响应头': 'Process response headers',
    '替换资源路径': 'Replace resource paths',
    'AT指令': 'AT command',
    '解析失败，AT指令需要以': 'Parse failed, AT command must start with',
    '开头': '',
    '复制 sendat 到 filesDir 失败': 'Failed to copy sendat to filesDir',
    '阻止后续处理': 'Block further processing',
    '如果是反向代理，则不要进行path过滤': 'If reverse proxy, skip path filtering',
    '其它接口继续用': 'Other APIs continue using',
    '检查是否默认口令': 'Check if default token',
    '获取是否弱Token出错': 'Error checking weak token',
    '设置口令': 'Set token',
    '请提供 token': 'Please provide token',
    '客户端IP': 'Client IP',
    '获取客户端IP成功': 'Got client IP successfully',
    '获取客户端IP出错': 'Error getting client IP',
    '获取cpu/thermal/memory信息出错': 'Error getting CPU/thermal/memory info',
    '存储与日流量信息出错': 'Error getting storage & daily traffic info',
    '目标服务器地址': 'Target server address',
    '应用结束时关闭dispather，避免内存泄漏': 'Close dispatcher on app exit to avoid memory leak',
    '检查更新': 'Check for updates',
    '拉取 changelog 文本': 'Fetch changelog text',
    '请求 alist 的 API': 'Request alist API',
    '拼装 JSON 响应': 'Build JSON response',
    '请求出错': 'Request error',
    '保存插件': 'Save plugin',
    '插件总容量超出限制': 'Plugin total size exceeds limit',
    '配置出错': 'Config error',
    '从插件市场获取插件': 'Get plugin from plugin store',
    '反向代理官方后端': 'Reverse proxy official backend',
    '转发到原厂web后端': 'Forward to factory web backend',
    '开始反向代理资源': 'Starting reverse proxy resources',
    '处理 OPTIONS 请求': 'Handle OPTIONS request',
    '忽略客户端 Referer host': 'Ignore client Referer host',
    '添加定时任务（支持时间': 'Add scheduled task (supports time',
    '是否每天重复）': 'and daily repeat)',
    '参数：id、time': 'Params: id, time',
    '或': 'or',
    '可选，默认true': 'optional, default true',
    '请传入action': 'Please provide action',
    '把 JSONObject 转成': 'Convert JSONObject to',
    '参数不完整': 'Incomplete parameters',
    '获取短信转发方式': 'Get SMS forward method',
    '短信转发参数存入': 'Save SMS forward params',
    '邮件': 'email',
    '缺少必要参数': 'Missing required parameters',
    '配置已保存': 'Config saved',
    '测速': 'Speed test',
    '测速请求过多，请稍后再试': 'Too many speed test requests, try again later',
    '当前线程数': 'Current thread count',
    '静态资源 - 带LRU缓存': 'Static resources with LRU cache',
    '静态资源请求被拒绝(路径非法)': 'Static resource request rejected (invalid path)',
    '静态资源无权限访问': 'Static resource access denied',
    '静态资源不存在': 'Static resource not found',
    '静态资源读取失败': 'Static resource read failed',
    '读取上传文件路径测试失败': 'Upload file path test failed',
    '读取上传文件路径inRoot测试失败': 'Upload file path inRoot test failed',
    '读取上传文件无权限': 'No permission to read uploaded file',
    '感谢群内 执念 大哥提供的思路': 'Thanks to community member for the approach',
    '数据类': 'Data class',
    '获取json格式的cpu频率（含集群信息：LITTLE/MID/BIG）': 'Get CPU freq in JSON format (with cluster info: LITTLE/MID/BIG)',
    '计算总时间（所有字段之和）': 'Calculate total time (sum of all fields)',
    '空闲时间': 'Idle time',
    '黑名单功能不启用': 'Blocklist feature not enabled',
    '获取当前 WiFi 连接的 IPv4 网关地址': 'Get current WiFi IPv4 gateway address',
    '应用上下文': 'Application context',
    '网关地址': 'Gateway address',
    '获取失败返回 null': 'Returns null on failure',
    '过滤掉不太可能是热点的接口': 'Filter out interfaces unlikely to be hotspot',
    '获取热点IP': 'Got hotspot IP',
    '防止重复发送': 'Prevent duplicate sends',
    '如果已经在发送中，则直接返回': 'If already sending, return immediately',
    '正在请求中，忽略重复请求': 'Request in progress, ignoring duplicate',
    '正在执行curl命令': 'Executing curl command',
    '为null': 'is null',
    '钉钉消息正在发送中，忽略重复发送': 'DingTalk message sending, ignoring duplicate',
    '构建消息内容': 'Build message content',
    '计算签名（如果提供了secret）': 'Calculate signature (if secret provided)',
    '登录哈希': 'Login hash',
    '登录请求结果': 'Login request result',
    '登录Cookie': 'Login cookie',
    '无法获取版本信息': 'Failed to get version info',
    '版本字段缺失': 'Version fields missing',
    '堆栈或记录日志到文件': 'Stack trace or log to file',
    '连接超时': 'Connection timeout',
    '读取超时': 'Read timeout',
    '写入超时': 'Write timeout',
    '关闭失败重试': 'Disable retry on failure',
    '请求失败': 'Request failed',
    '请求异常': 'Request exception',
    '邮件正在发送中，忽略重复发送': 'Email sending, ignoring duplicate',
    '开始发送邮件': 'Starting to send email',
    '邮件发送成功': 'Email sent successfully',
    '获取电池电量': 'Get battery level',
    '按需获取数据使用量': 'Get data usage on demand',
    '解析 URL 编码的请求体': 'Parse URL-encoded request body',
    '解码': 'Decode',
    '获取内存信息': 'Get memory info',
    '生成随机盐': 'Generate random salt',
    '自定义盐': 'Custom salt',
    '多轮 SHA-256': 'Multi-round SHA-256',
    '输出格式': 'Output format',
    '初始': 'Initial',
    '迭代': 'Iterate',
    '开始发送socket': 'Starting socket send',
    '目录': 'Directory',
    '命令': 'Command',
    '秒超时': 'second timeout',
    '发送命令': 'Send command',
    '标记结尾': 'Mark end',
    '读取响应': 'Read response',
    '设置 HOME 环境变量': 'Set HOME environment variable',
    '启动进程（传入环境变量）': 'Start process (with env vars)',
    '寻找ui控件然后点击': 'Find UI widget and click',
    '表示已经在AT发送界面了': 'Means already on AT send screen',
    '表示执行点击成功': 'Means click executed successfully',
    '命令正在执行中，跳过': 'Command in progress, skipping',
    '命令正在执行中': 'Command in progress',
    '跳过': 'Skipping',
    '开始执行 SMB 命令': 'Starting SMB command',
    '路径存在': 'Path exists',
    '执行命令失败，没有找到 socat 创建的 sock (高级功能是否开启？)': 'Command failed, socat socket not found (are advanced features enabled?)',
    '收到新短信': 'New SMS received',
    '转发预处理': 'Forward pre-processing',
    '源手机号': 'Source number',
    '在手机号黑名单内，不执行短信转发操作': 'is in phone number blocklist, skipping SMS forward',
    '短信内容命中关键词': 'SMS content matched keyword',
    '不执行短信转发': 'skipping SMS forward',
    '无新短信': 'No new SMS',
    '短信是否': 'SMS within',
    '分钟内': 'minutes',
    '定时任务管理器': 'Scheduled task manager',
    '配置观察器': 'Config observer',
    'uploads资源': 'Uploads resource',
    '连接到': 'Connecting to',
    // configModule
    '获取是否弱Token出错：': 'Error checking weak token: ',
    '设置口令': 'Set token',
    // ota
    '该设备暂不支持在线更新': 'Online updates not supported for this device',
    '获取失败': 'Fetch failed',
    '获取changelog失败': 'Failed to get changelog',
    '解析错误': 'Parse error',
    // scheduledTask
    '任务不存在': 'Task not found',
    '删除成功': 'Deleted successfully',
    '删除失败': 'Delete failed',
    // theme
    '上传文件数量超出限制': 'Upload file count exceeds limit',
    '上传失败': 'Upload failed',
    '文件名不合法': 'Invalid filename',
    '文件大小超出限制': 'File size exceeds limit',
    '删除文件失败': 'Failed to delete file',
    '列表获取失败': 'Failed to get list',
  };
  
  let result = cn;
  // Try exact match first
  if (dict[cn.trim()]) return dict[cn.trim()];
  
  // Try partial matches - replace Chinese segments
  for (const [k, v] of Object.entries(dict)) {
    if (result.includes(k)) {
      result = result.split(k).join(v);
    }
  }
  
  // If still has Chinese, do a best-effort word-by-word
  if (/[\u4e00-\u9fff]/.test(result)) {
    // Return as-is for now, we'll handle remaining manually
    return result;
  }
  
  return result;
}

// Process all Kotlin files
const ktBase = path.join(root, 'app', 'src', 'main', 'java', 'com', 'minikano', 'f50_sms');
function processKtDir(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const i of items) {
    const fp = path.join(dir, i.name);
    if (i.isDirectory()) processKtDir(fp);
    else if (/\.kt$/.test(i.name)) {
      const remaining = translateKotlinComments(fp);
      const rel = path.relative(root, fp);
      if (remaining >= 0) console.log(`  ${rel}: ${remaining} lines remaining`);
    }
  }
}

console.log('=== Kotlin files ===');
processKtDir(ktBase);

// ============= build.js =============
console.log('\n=== build.js ===');
let n = translateFile('app/frontEnd/build.js', [
  ['无需混淆', 'No obfuscation needed'],
  ['所有文件处理完毕', 'All files processed'],
  ['混淆', 'Obfuscate'],
  ['开始构建', 'Starting build'],
  ['构建完成', 'Build complete'],
]);
console.log(`  build.js: ${n} replacements`);

// ============= theme.js =============
console.log('\n=== theme.js ===');
n = translateFile('app/src/main/assets/script/theme.js', [
  ['//主题管理', '// Theme management'],
  ['//获取主题列表', '// Get theme list'],
  ['//设置主题', '// Set theme'],
  ['//删除主题', '// Delete theme'],
  ['//上传主题', '// Upload theme'],
  ['//下载主题', '// Download theme'],
  ['//预览主题', '// Preview theme'],
  ['//应用主题', '// Apply theme'],
  ['//重置主题', '// Reset theme'],
  ['//保存主题', '// Save theme'],
  ['//加载主题', '// Load theme'],
  ['//初始化', '// Initialize'],
  ['// 创建', '// Create'],
  ['// 删除', '// Delete'],
  ['// 上传', '// Upload'],
  ['// 获取', '// Get'],
  ['// 设置', '// Set'],
  ['// 保存', '// Save'],
  ['// 加载', '// Load'],
  ['// 应用', '// Apply'],
  ['// 重置', '// Reset'],
  ['// 初始化', '// Initialize'],
  ['// 渲染', '// Render'],
  ['// 刷新', '// Refresh'],
]);
console.log(`  theme.js: ${n} replacements`);

// ============= shell script =============
console.log('\n=== Shell scripts ===');
n = translateFile('app/src/main/assets/shell/traffic_limit_bak.sh', [
  ['# 流量限制', '# Traffic limit'],
  ['# 获取流量', '# Get traffic'],
  ['# 检查流量', '# Check traffic'],
  ['# 超出限制', '# Exceeded limit'],
  ['# 重置流量', '# Reset traffic'],
]);
console.log(`  traffic_limit_bak.sh: ${n} replacements`);

console.log('\n=== DONE ===');
// Final count
let totalRemaining = 0;
function finalScan(dir) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const i of items) {
      const fp = path.join(dir, i.name);
      if (i.isDirectory() && !i.name.includes('node_modules') && !i.name.includes('.git') && !i.name.includes('apk-download') && !i.name.includes('lang')) {
        finalScan(fp);
      } else if (i.isFile() && /\.(kt|java|js|html|sh)$/.test(i.name) && !/polyfill|chart\.js|crypto\.js|sortable\.js|filesaver/.test(i.name)) {
        const c = fs.readFileSync(fp, 'utf8');
        const cnt = c.split('\n').filter(l => /[\u4e00-\u9fff]/.test(l)).length;
        if (cnt > 0) {
          console.log(`  ${path.relative(root, fp)}: ${cnt}`);
          totalRemaining += cnt;
        }
      }
    }
  } catch(e) {}
}
console.log('\n--- Remaining Chinese (code files) ---');
finalScan(root);
console.log(`Total: ${totalRemaining} lines`);
