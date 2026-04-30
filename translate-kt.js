// translate-kt.js - Properly translate ALL Kotlin/JS/shell files
const fs = require('fs');
const path = require('path');
const root = __dirname;

// Master translation dictionary
const dict = {
  '串行执行任务': 'Execute tasks serially',
  '等文件拷贝完成后再继续': 'Wait for file copy to complete',
  '订阅电池事件接收器': 'Subscribe to battery event receiver',
  '开启定时任务': 'Start scheduled tasks',
  '剩余电量低（10%），请及时充电~': 'Battery low (10%), please charge soon~',
  '剩余电量低': 'Battery low',
  '请及时充电': 'please charge soon',
  '开机广播接收到，准备启动服务': 'Boot broadcast received, starting service',
  '初始化spf': 'Initialize SharedPreferences',
  '检测到设备不是UFI/MIFI设备，终结程序': 'Device is not UFI/MIFI, terminating',
  '启动协程异步调用 suspend 函数': 'Start coroutine to call suspend function',
  '黑名单检测结果：': 'Blocklist check result: ',
  '黑名单检测结果': 'Blocklist check result',
  '持久化': 'Persist',
  '更新唤醒锁': 'Update wake lock',
  '预处理口令': 'Pre-process token',
  '第一次启动初始化spf': 'First launch init SharedPreferences',
  '这里用协程异步调用': 'Use coroutine async call here',
  '加载数据中(Loading)...': 'Loading data...',
  '加载数据中': 'Loading data',
  'App仅可在随身wifi上安装使用，手机使用请下载手机直装版，正在退出...': 'This app can only be used on portable WiFi devices. For phones, download the phone version. Exiting...',
  '圆角': 'rounded corners',
  '静态资源': 'Static resources',
  '更新ADMIN_PWD': 'Update ADMIN_PWD',
  '获取 JSON Body': 'Get JSON body',
  '保存配置': 'Save config',
  '响应': 'Respond',
  '开启高级功能': 'Enable advanced features',
  '缺少 query 参数 enable': 'Missing query parameter: enable',
  '缺少 query 参数 command': 'Missing query parameter: command',
  '缺少 query 参数': 'Missing query parameter',
  'enable 传入参数：': 'enable parameter: ',
  '传入参数：': 'Input parameter: ',
  '传入参数': 'Input parameter',
  '复制依赖文件': 'Copy dependency files',
  '复制 adb 到 filesDir 失败': 'Failed to copy adb to filesDir',
  '复制 sendat 到 filesDir 失败': 'Failed to copy sendat to filesDir',
  '构建请求体（如果有）': 'Build request body (if any)',
  '构建请求头': 'Build request headers',
  '代理请求头检测到': 'Proxy header detected ',
  '已去掉前缀': 'prefix removed',
  '处理响应头': 'Process response headers',
  'HTML 模式，替换资源路径': 'HTML mode, replace resource paths',
  'AT指令': 'AT command',
  'AT_command 传入参数：': 'AT_command parameter: ',
  '解析失败，AT指令需要以 "AT" 开头': 'Parse failed, AT command must start with "AT"',
  '解析失败，AT指令需要以': 'Parse failed, AT command must start with',
  '阻止后续处理': 'Block further processing',
  '如果是反向代理，则不要进行path过滤': 'Skip path filtering for reverse proxy',
  '其它接口继续用 normalizePath 的结果': 'Other APIs use normalizePath result',
  '检查是否默认口令': 'Check if default token',
  '获取是否弱Token出错：': 'Error checking weak token: ',
  '获取是否弱Token出错': 'Error checking weak token',
  '设置口令': 'Set token',
  '请提供 token': 'Please provide token',
  '口令不得小于 6 位': 'Token must be at least 6 chars',
  '口令更改成功': 'Token changed successfully',
  '客户端IP': 'Client IP',
  '获取客户端IP成功: ': 'Got client IP: ',
  '获取客户端IP成功': 'Got client IP',
  '获取客户端IP出错: ': 'Error getting client IP: ',
  '获取客户端IP出错': 'Error getting client IP',
  '获取cpu/thermal/memory信息出错：': 'Error getting CPU/thermal/memory info: ',
  '获取cpu/thermal/memory信息出错': 'Error getting CPU/thermal/memory info',
  '存储与日流量信息出错：': 'Error getting storage & daily data: ',
  '存储与日流量信息出错': 'Error getting storage & daily data',
  '目标服务器地址': 'Target server address',
  '静态资源': 'Static resources',
  '应用结束时关闭dispather，避免内存泄漏': 'Close dispatcher on exit to avoid memory leak',
  '检查更新': 'Check for updates',
  '拉取 changelog 文本': 'Fetch changelog text',
  '请求 alist 的 API': 'Request alist API',
  '拼装 JSON 响应': 'Build JSON response',
  '请求出错：': 'Request error: ',
  '请求出错': 'Request error',
  '保存插件': 'Save plugin',
  '插件总容量超出限制: ': 'Plugin size exceeds limit: ',
  '插件总容量超出限制': 'Plugin size exceeds limit',
  '配置出错：': 'Config error: ',
  '配置出错: ': 'Config error: ',
  '配置出错': 'Config error',
  '从插件市场获取插件': 'Get plugin from store',
  '反向代理官方后端': 'Reverse proxy official backend',
  '转发到原厂web后端': 'Forward to factory web backend',
  '开始反向代理资源...': 'Starting reverse proxy...',
  '开始反向代理资源': 'Starting reverse proxy',
  '处理 OPTIONS 请求': 'Handle OPTIONS request',
  '忽略客户端 Referer host': 'Ignore client Referer host',
  '添加定时任务（支持时间 + 是否每天重复）': 'Add scheduled task (time + daily repeat)',
  '参数：id、time（HH:mm:ss 或 yyyy-MM-dd HH:mm:ss）、repeatDaily（可选，默认true）': 'Params: id, time (HH:mm:ss or yyyy-MM-dd HH:mm:ss), repeatDaily (optional, default true)',
  '请传入action': 'Please provide action',
  '把 JSONObject 转成 Map<String, String>': 'Convert JSONObject to Map<String, String>',
  '参数不完整': 'Incomplete parameters',
  '获取短信转发方式': 'Get SMS forward method',
  '短信转发参数存入-邮件': 'Save SMS forward params - email',
  '短信转发参数存入-CURL': 'Save SMS forward params - CURL',
  '短信转发参数存入-钉钉': 'Save SMS forward params - DingTalk',
  '缺少必要参数': 'Missing required parameters',
  'SMTP配置已保存：': 'SMTP config saved: ',
  'SMTP配置已保存': 'SMTP config saved',
  '消息': 'message',
  '测速': 'Speed test',
  '测速请求过多，请稍后再试': 'Too many speed test requests, try later',
  '当前线程数: ': 'Current thread: ',
  '当前线程数': 'Current thread',
  '静态资源 - 带LRU缓存': 'Static resources with LRU cache',
  '静态资源请求被拒绝(路径非法): ': 'Static resource rejected (invalid path): ',
  '静态资源请求被拒绝(路径非法)': 'Static resource rejected (invalid path)',
  '静态资源无权限访问：': 'Static resource access denied: ',
  '静态资源无权限访问': 'Static resource access denied',
  '静态资源不存在：': 'Static resource not found: ',
  '静态资源不存在': 'Static resource not found',
  '静态资源读取失败：': 'Static resource read failed: ',
  '静态资源读取失败': 'Static resource read failed',
  '读取上传文件路径测试失败: ': 'Upload path test failed: ',
  '读取上传文件路径测试失败': 'Upload path test failed',
  '读取上传文件路径inRoot测试失败: ': 'Upload path inRoot test failed: ',
  '读取上传文件路径inRoot测试失败': 'Upload path inRoot test failed',
  '读取上传文件无权限: ': 'No permission for uploaded file: ',
  '读取上传文件无权限': 'No permission for uploaded file',
  '感谢群内 执念 大哥提供的思路': 'Thanks to community members for the approach',
  '数据类': 'Data class',
  '获取json格式的cpu频率（含集群信息：LITTLE/MID/BIG）': 'Get CPU freq JSON (cluster: LITTLE/MID/BIG)',
  '计算总时间（所有字段之和）': 'Calculate total (sum of all fields)',
  '空闲时间 = idle + iowait (第4列 + 第5列)': 'Idle = idle + iowait (col 4 + col 5)',
  '空闲时间': 'Idle time',
  '黑名单功能不启用': 'Blocklist feature disabled',
  '获取当前 WiFi 连接的 IPv4 网关地址': 'Get current WiFi IPv4 gateway address',
  '@param context 应用上下文': '@param context Application context',
  '@return 网关地址（192.168.0.1），获取失败返回 null': '@return Gateway address (192.168.0.1), null on failure',
  '过滤掉不太可能是热点的接口': 'Filter interfaces unlikely to be hotspot',
  'IPManager 获取热点IP：': 'IPManager got hotspot IP: ',
  '获取热点IP': 'Got hotspot IP',
  '防止重复发送': 'Prevent duplicate sends',
  '如果已经在发送中，则直接返回': 'If already sending, return immediately',
  'curl正在请求中，忽略重复请求': 'CURL request in progress, ignoring duplicate',
  '正在执行curl命令:': 'Executing CURL: ',
  '正在执行curl命令': 'Executing CURL',
  'runShellCommand为null': 'runShellCommand is null',
  '钉钉消息正在发送中，忽略重复发送': 'DingTalk message sending, ignoring duplicate',
  '构建消息内容': 'Build message content',
  '计算签名（如果提供了secret）': 'Calculate signature (if secret provided)',
  '登录哈希：': 'Login hash: ',
  '登录哈希': 'Login hash',
  '登录请求结果：': 'Login result: ',
  '登录请求结果': 'Login result',
  '登录Cookie：': 'Login cookie: ',
  '登录Cookie': 'Login cookie',
  '无法获取版本信息': 'Failed to get version info',
  '版本字段缺失': 'Version fields missing',
  '堆栈或记录日志到文件': 'Stack trace or log to file',
  '连接超时': 'Connection timeout',
  '读取超时': 'Read timeout',
  '写入超时': 'Write timeout',
  '关闭失败重试': 'Disable retry on failure',
  '请求失败，code=': 'Request failed, code=',
  '请求失败': 'Request failed',
  '请求异常: ': 'Request exception: ',
  '请求异常': 'Request exception',
  '邮件正在发送中，忽略重复发送': 'Email sending, ignoring duplicate',
  '开始发送邮件...': 'Sending email...',
  '开始发送邮件': 'Sending email',
  '邮件发送成功': 'Email sent successfully',
  '获取电池电量': 'Get battery level',
  '按需获取数据使用量': 'Get data usage on demand',
  '解析 URL 编码的请求体': 'Parse URL-encoded request body',
  '解码': 'decode',
  '获取内存信息': 'Get memory info',
  '生成随机盐': 'Generate random salt',
  '自定义盐 + 多轮 SHA-256': 'Custom salt + multi-round SHA-256',
  '输出格式：sha256$rounds$<saltB64>$<hashB64>': 'Format: sha256$rounds$<saltB64>$<hashB64>',
  '初始：salt || password': 'Initial: salt || password',
  '迭代：digest || salt': 'Iterate: digest || salt',
  '开始发送socket,目录：': 'Starting socket, dir: ',
  '开始发送socket': 'Starting socket',
  '目录': 'dir',
  '命令:': 'command: ',
  '命令': 'command',
  '秒超时': 's timeout',
  '发送命令': 'Send command',
  '标记结尾': 'Mark end',
  '读取响应': 'Read response',
  '设置 HOME 环境变量': 'Set HOME env var',
  '启动进程（传入环境变量）': 'Start process (with env vars)',
  'adb寻找ui控件然后点击': 'ADB find UI widget and click',
  '1表示已经在AT发送界面了': '1 = already on AT send screen',
  '0表示执行点击成功': '0 = click executed successfully',
  'SMB 命令正在执行中，跳过': 'SMB command in progress, skipping',
  'SMB 命令正在执行中,IP:': 'SMB command in progress, IP: ',
  '跳过': 'skipping',
  '开始执行 SMB 命令,连接到：': 'Starting SMB command, connecting to: ',
  '开始执行 SMB 命令': 'Starting SMB command',
  'SMB路径存在': 'SMB path exists',
  '执行命令失败，没有找到 socat 创建的 sock (高级功能是否开启？)': 'Command failed, socat socket not found (are advanced features enabled?)',
  '收到新短信: ': 'New SMS: ',
  '收到新短信': 'New SMS',
  '转发预处理': 'Forward pre-processing',
  '源手机号': 'Source number',
  '在手机号黑名单内，不执行短信转发操作': 'in phone blocklist, skipping forward',
  '短信内容命中关键词': 'SMS matched keyword',
  '不执行短信转发': 'skipping SMS forward',
  '无新短信，短信是否': 'No new SMS, within ',
  '分钟内：': 'min: ',
  '分钟内': 'min',
  ',短信是否为新：': ', is new: ',
  '短信是否为新': 'is new SMS',
  '定时任务管理器': 'Scheduled task manager',
  '设备上报': 'Device report',
  '准备上报设备信息': 'Preparing to report device info',
  '设备信息上报成功': 'Device info reported',
  '设备信息上报失败': 'Device info report failed',
  '唤醒锁已获取': 'Wake lock acquired',
  '唤醒锁已释放': 'Wake lock released',
  '唤醒锁获取失败': 'Wake lock acquisition failed',
  '无效的唤醒锁状态': 'Invalid wake lock state',
  '获取唯一设备ID': 'Get unique device ID',
  '尝试从文件中读取ID': 'Try reading ID from file',
  '成功从文件中读取ID': 'Read ID from file',
  '无法读取ID文件': 'Cannot read ID file',
  '生成新的ID并保存': 'Generate new ID and save',
  '服务启动成功': 'Service started',
  '服务启动失败': 'Service start failed',
  '服务已在运行': 'Service already running',
  '服务已停止': 'Service stopped',
  '配置文件不存在': 'Config file not found',
  '配置文件读取失败': 'Config file read failed',
  '配置已更新': 'Config updated',
  '开始测速': 'Starting speed test',
  '测速完成': 'Speed test complete',
  '正在下载': 'Downloading',
  '下载完成': 'Download complete',
  '下载失败': 'Download failed',
  '文件不存在': 'File not found',
  '权限不足': 'Insufficient permissions',
  '操作成功': 'Operation successful',
  '操作失败': 'Operation failed',
  '参数错误': 'Invalid parameter',
  '未知错误': 'Unknown error',
  '连接失败': 'Connection failed',
  '超时': 'Timeout',
  '重试': 'Retry',
  '任务已存在': 'Task already exists',
  '任务不存在': 'Task not found',
  '任务已删除': 'Task deleted',
  '任务已更新': 'Task updated',
  '删除成功': 'Deleted',
  '删除失败': 'Delete failed',
  '该设备暂不支持在线更新': 'Online update not supported',
  '获取失败': 'Fetch failed',
  '获取changelog失败': 'Failed to get changelog',
  '解析错误': 'Parse error',
  '上传文件数量超出限制': 'Upload file count exceeds limit',
  '上传失败': 'Upload failed',
  '文件名不合法': 'Invalid filename',
  '文件大小超出限制': 'File size exceeds limit',
  '删除文件失败': 'Delete failed',
  '列表获取失败': 'Failed to get list',
  '无需混淆': 'No obfuscation needed',
  '所有文件处理完毕': 'All files processed',
  '清零当日流量': 'Reset daily data',
  '超出限制': 'Exceeded limit',
  '重置流量': 'Reset traffic',
  '流量限制脚本': 'Traffic limit script',
  '当前日期': 'Current date',
  '当前流量': 'Current traffic',
  '全量配置为': 'Full config: ',
  '首次设定初始校准值': 'First time, set initial calibration value',
  '已超流量，立即断网': 'Exceeded limit, disconnecting',
};

function translateLine(line) {
  let result = line;
  // Sort by key length descending so longer matches take priority
  const sorted = Object.entries(dict).sort((a, b) => b[0].length - a[0].length);
  for (const [cn, en] of sorted) {
    if (result.includes(cn)) {
      result = result.split(cn).join(en);
    }
  }
  return result;
}

function processFile(relPath) {
  const fp = path.join(root, relPath);
  if (!fs.existsSync(fp)) { console.log(`  NOT FOUND: ${relPath}`); return; }
  const original = fs.readFileSync(fp, 'utf8');
  const lines = original.split('\n');
  let changed = false;
  
  for (let i = 0; i < lines.length; i++) {
    if (/[\u4e00-\u9fff]/.test(lines[i])) {
      const translated = translateLine(lines[i]);
      if (translated !== lines[i]) {
        lines[i] = translated;
        changed = true;
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(fp, lines.join('\n'));
  }
  
  const remaining = lines.filter(l => /[\u4e00-\u9fff]/.test(l)).length;
  console.log(`  ${relPath}: ${remaining} remaining`);
}

// Find all Kotlin files
function findFiles(dir, ext) {
  const results = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const i of items) {
      const fp = path.join(dir, i.name);
      if (i.isDirectory()) results.push(...findFiles(fp, ext));
      else if (i.name.endsWith(ext)) results.push(fp);
    }
  } catch(e) {}
  return results;
}

console.log('=== Kotlin files ===');
const ktFiles = findFiles(path.join(root, 'app', 'src', 'main', 'java'), '.kt');
for (const fp of ktFiles) {
  const rel = path.relative(root, fp);
  const c = fs.readFileSync(fp, 'utf8');
  if (/[\u4e00-\u9fff]/.test(c)) {
    processFile(rel);
  }
}

console.log('\n=== Other files ===');
processFile('app/frontEnd/build.js');
processFile('app/src/main/assets/script/theme.js');
processFile('app/src/main/assets/shell/traffic_limit_bak.sh');

console.log('\n=== DONE ===');
