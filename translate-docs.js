const fs = require('fs');
const path = require('path');

// Comprehensive dictionary for documentation files
const dictionary = {
  // Common table headers
  "方法": "Method",
  "路径": "Path",
  "描述": "Description",
  "参数简要": "Parameters",
  "是否认证": "Auth Required",
  "参数（简述）": "Parameters (Brief)",
  "备注": "Notes",
  "认证": "Auth",
  "版本类型": "Version Type",
  "部署方式": "Deployment",
  "适用设备": "Target Devices",
  "功能支持": "Features",
  "典型用途": "Typical Use",
  "类别": "Category",
  "插件名称": "Plugin Name",
  "功能说明": "Description",
  "说明": "Description",
  
  // Common short words
  "是": "Yes",
  "否": "No",
  "无": "None",
  "无参数": "No parameters",
  
  // API Doc specific
  "写在前面": "Preface",
  "本API文档适用于": "This API documentation applies to",
  "版本": "version",
  "本文档中所有": "All",
  "请求体(除官方API外)均为": "request bodies (except official APIs) are in",
  "格式": "format",
  "请求参数均为": "request parameters are",
  "参数": "parameters",
  "请求签名规则": "Request Signature Rules",
  "签名机制起到如下作用：": "The signature mechanism serves the following purposes:",
  "防止请求被伪造（如跨站、重放等）": "Prevents request forgery (e.g., cross-site, replay attacks)",
  "服务器可验证": "Server can verify whether",
  "是否有效、是否与": "is valid and matches",
  "匹配": "match",
  "简单的"认证 + 防篡改"方式": "Simple 'authentication + tamper-proof' approach",
  "添加请求头": "Adding Request Headers",
  "每个请求都会自动附加两个自定义请求头：": "Each request automatically appends two custom request headers:",
  "当前时间戳（毫秒，": "Current timestamp (milliseconds,",
  "用于验证请求合法性的签名字符串": "Signature string for request validation",
  "密码进过sha256后的字符串（小写）": "SHA256 hash of the password (lowercase)",
  "签名计算逻辑": "Signature Calculation Logic",
  "签名的核心公式如下：": "The core signature formula is:",
  "具体步骤如下：": "Steps are as follows:",
  "构造原始数据：": "Construct raw data:",
  "时间戳": "timestamp",
  "请求方法，如": "Request method, e.g.,",
  "全大写": "uppercase",
  "请求路径（不包含 query 参数），如": "Request path (without query parameters), e.g.,",
  "即当前毫秒时间戳": "current millisecond timestamp",
  "使用 HMAC-MD5 进行第一步加密：": "Use HMAC-MD5 for the first encryption step:",
  "密钥固定为：": "Fixed secret key:",
  "将 HMAC 值二分为两部分：": "Split the HMAC value into two halves:",
  "前半部分的字节": "First half of the bytes",
  "后半部分的字节": "Second half of the bytes",
  "各部分再做 SHA256：": "SHA256 each part:",
  "连接并最终 SHA256：": "Concatenate and final SHA256:",
  "使用示例": "Usage Example",
  "假设请求为：": "Assuming the request is:",
  "内部处理流程如下：": "Internal processing flow:",
  "提取方法：": "Extract method: ",
  "提取路径：": "Extract path: ",
  "获取当前时间戳：例如": "Get current timestamp: e.g.,",
  "构造签名原始数据：": "Construct signature raw data:",
  "使用上述算法生成签名，并添加请求头：": "Generate signature using the above algorithm and add request headers:",
  "计算后的SHA256哈希": "calculated SHA256 hash",
  "代码参考：": "Code reference: ",
  "示例": "Examples",
  "注：本文提到的POST接口请求体格式均为JSON": "Note: All POST request bodies mentioned here are in JSON format",
  "请求均为Query或无参数": "requests use Query or no parameters",
  "请求示例": "Request Example",
  "返回：": "Returns:",
  "请求实例": "Request Example",
  
  // ADB Module
  "获取网络 ADB 自启状态": "Get network ADB auto-start status",
  "设置网络 ADB 自启状态": "Set network ADB auto-start status",
  "获取网络 ADB 是否已启动": "Check if network ADB is running",
  
  // Advanced Tools Module
  "高级功能模块": "Advanced Tools Module",
  "更改 Samba 分享地址为根目录": "Change Samba share path to root directory",
  "开启或关闭": "enable or disable",
  "判断是否存在 ttyd 服务": "Check if TTYD service exists",
  "端口号": "port number",
  "启动一键进入工程模式 + 执行脚本": "Launch one-click engineering mode + execute script",
  "发送指令到 Root Shell Socket 执行": "Send command to Root Shell Socket for execution",
  
  // Any Proxy Module
  "反向代理模块": "Reverse Proxy Module",
  "反向代理接口": "Reverse proxy endpoint",
  "用于将客户端请求转发到指定的目标地址，并返回其响应结果。路径格式为：": "Used to forward client requests to a specified target address and return its response. Path format:",
  "请求方式支持：": "Supported request methods: ",
  "请求体（如 POST 的 JSON）将会原样转发给目标地址。": "Request body (e.g., POST JSON) will be forwarded as-is to the target address.",
  "注意：": "Notes:",
  "该接口也需要进行auth验证": "This endpoint also requires auth verification",
  "为了避免UFI-TOOLS authToken和需要转发头部冲突，代理验证token时可以以": "To avoid conflicts between UFI-TOOLS authToken and forwarded headers, proxy authentication can use",
  "携带token进行验证(见下表)": "to carry the token for verification (see table below)",
  "为了避免内网服务暴露在外网，反向代理接口默认会阻止以此方式访问内网地址": "To prevent internal network services from being exposed externally, the reverse proxy blocks access to internal addresses by default",
  "该接口固定超时时间为30秒，超过时间到了会截断输出并返回不完整的数据。": "This endpoint has a fixed timeout of 30 seconds; when exceeded, output is truncated and incomplete data is returned.",
  "可自定义的请求头（自动转发）：": "Customizable Request Headers (auto-forwarded):",
  "默认会自动转发": "By default, will automatically forward",
  "常规安全请求头": "standard safe request headers",
  "如": "such as",
  "想要手动注入敏感头（如": "To manually inject sensitive headers (such as",
  "）时，使用": "), use",
  "前缀": "prefix",
  "自定义头部名": "Custom Header Name",
  "实际转发为": "Actually Forwarded As",
  "响应处理：": "Response Handling:",
  "普通响应：按原格式返回（含状态码、Content-Type）。": "Normal response: returned in original format (with status code, Content-Type).",
  "会自动将": "will automatically rewrite",
  "开头的资源路径（如": "resource paths starting with",
  "）改写为代理路径，确保前端页面可正常加载资源。": ") to proxy paths, ensuring frontend pages can load resources correctly.",
  "会被代理为：": "Will be proxied as:",
  
  // AT Module
  "指令模块": "Command Module",
  "执行 AT 指令并返回结果": "Execute AT command and return result",
  "必填": "required",
  "卡槽号（默认0）": "SIM slot (default 0)",
  
  // Base Device Info Module
  "设备基础信息模块": "Base Device Info Module",
  "获取基础设备信息（电量、IP、CPU、内存、存储等）": "Get basic device info (battery, IP, CPU, memory, storage, etc.)",
  "获取应用版本号与设备型号": "Get app version and device model",
  "获取是否启用登录验证（token）": "Check if login verification (token) is enabled",
  
  // OTA Module
  "你的": "The",
  "是一个完整的 OTA（Over-The-Air）更新模块，使用 Ktor 搭建后端 Web 服务，运行在 Android 环境中（比如嵌入式设备或手机），功能齐全、逻辑严密，涵盖以下主要接口功能：": "is a complete OTA (Over-The-Air) update module, built with Ktor backend web service, running in Android environment (e.g., embedded devices or phones), with comprehensive features covering the following API endpoints:",
  "模块": "Module",
  "拉取 changelog 和文件列表": "Fetch changelog and file list",
  "调用 Alist 接口获取 OTA 包信息": "Calls Alist API to get OTA package info",
  "开始下载 APK 文件": "Start downloading APK file",
  "后台线程下载，支持状态查询": "Background thread download, supports status query",
  "查询下载进度与状态": "Query download progress and status",
  "下载状态、百分比、错误信息": "Download status, percentage, error info",
  "安装已下载的 APK 文件": "Install downloaded APK file",
  "使用 socat（root）或 ADB（非 root）": "Uses socat (root) or ADB (non-root)",
  
  // Plugins Module
  "插件模块": "Plugins Module",
  "设置自定义头部文本": "Set custom header text",
  "限制1145KB": "limit 1145KB",
  "获取自定义头部文本": "Get custom header text",
  
  // SMS Forward Module
  "短信转发模块": "SMS Forward Module",
  "获取当前短信转发方式": "Get current SMS forward method",
  "配置邮件方式的短信转发": "Configure email SMS forwarding",
  "获取邮件转发配置": "Get email forward configuration",
  "配置 curl 方式的转发": "Configure CURL forwarding",
  "需包含": "must contain",
  "获取 curl 转发配置": "Get CURL forward configuration",
  "配置钉钉webhook方式的转发": "Configure DingTalk webhook forwarding",
  "为可选的加签密钥": "is an optional signing secret",
  "获取钉钉webhook转发配置": "Get DingTalk webhook forward configuration",
  "设置短信转发总开关": "Set SMS forward master switch",
  "参数：": "Parameter: ",
  "字符串": "string",
  "获取短信转发开关状态": "Get SMS forward switch status",
  
  // Speedtest Module
  "网路测速模块": "Speedtest Module",
  "下载测速数据（限流）": "Download speed test data (rate-limited)",
  "块数量": "chunk count",
  "可选": "optional",
  
  // Theme Module
  "主题模块": "Theme Module",
  "上传图片，返回图片访问 URL": "Upload image, return image access URL",
  "表单，图片文件": "form, image file",
  "删除图片": "Delete image",
  "要删除的文件名": "filename to delete",
  "保存主题配置": "Save theme configuration",
  "主题配置字段（如": "Theme config fields (e.g.,",
  "等）": "etc.)",
  "获取当前主题配置": "Get current theme configuration",
  "其他说明：": "Additional Notes:",
  "上传的图片保存到": "Uploaded images are saved to",
  "目录，URL 为": "directory, accessible via URL",
  "可静态访问。": "for static access.",
  
  // ReverseProxy Module
  "反向代理官方WEB模块": "Official Web Reverse Proxy Module",
  "反代 官方WEB API": "Proxy official Web API",
  "请求路径 + 查询参数 + 请求体": "Request path + query params + request body",
  "不需要单独认证": "No separate auth needed",
  "全部": "All",
  "详细说明": "Details",
  "路径规则": "Path Rules",
  "所有以": "All requests starting with",
  "开头的请求都会被代理转发。": "will be proxied and forwarded.",
  "目标服务器地址": "Target Server Address",
  "通过参数": "Via parameter",
  "指定（形如": "specified (format:",
  "），请求转发到": "), requests forwarded to",
  "请求头转发": "Request Header Forwarding",
  "除": "Except",
  "以外，所有请求头都会转发给目标服务器，且会强制设置": "all request headers are forwarded to the target server, and",
  "为目标服务器地址。": "is forced to the target server address.",
  "请求方法支持": "Supported Request Methods",
  "支持 GET、POST、PUT、OPTIONS 方法转发。": "Supports GET, POST, PUT, OPTIONS method forwarding.",
  "请求体转发": "Request Body Forwarding",
  "请求体会被读取并写入代理请求。": "request bodies are read and written to the proxy request.",
  "响应头处理": "Response Header Handling",
  "会将目标服务器返回的": "Will rename the target server's returned",
  "头改名为": "header to",
  "并转发回客户端。": "and forward it back to the client.",
  "自动添加 CORS 相关响应头，允许跨域。": "Automatically adds CORS-related response headers to allow cross-origin requests.",
  "异常处理": "Error Handling",
  "捕获所有异常，返回 500 错误及异常信息。": "Catches all exceptions, returns 500 error with exception info.",
  
  // README specific
  "一款面向某兴随身WIFI（F50/U30 Air）的多功能管理与扩展工具": "A multi-functional management and extension tool for ZTE portable WiFi devices (F50/U30 Air)",
  "支持远程管理、信号监控、系统控制、插件扩展等丰富功能": "Supports remote management, signal monitoring, system control, plugin extensions, and more",
  "同时也提供其他某兴展锐Android手机/平板支持": "Also provides support for other ZTE Unisoc Android phones/tablets",
  "使用说明": "User Guide",
  "通用安装教程：": "Universal installation tutorial: ",
  "模块版本（畅行60 / 云电脑）安装教程：": "Module version (ChangXing60 / Cloud PC) installation tutorial: ",
  "B站视频": "Video Tutorial",
  "版本区分": "Version Differences",
  "提供": "provides",
  "与": "and",
  "完整版本": "Full Version",
  "两种使用形态，满足不同场景需求：": "two usage forms to meet different scenario requirements:",
  "仅需安装在手机上": "Only needs to be installed on phone",
  "手机端连接MIFI/UFI设备": "Phone connects to MIFI/UFI device",
  "精简功能集": "Simplified feature set",
  "无需安装到随身WiFi": "No need to install on portable WiFi",
  "可远程控制随身WiFi": "Can remotely control portable WiFi",
  "手机控制随身WiFi设备，轻量远程管理": "Phone controls portable WiFi device, lightweight remote management",
  "安装在目标设备（随身WiFi / 平板 / 路由）": "Install on target device (portable WiFi / tablet / router)",
  "随身WIFI（U30 Air/F50 等）": "Portable WiFi (U30 Air/F50, etc.)",
  "全功能支持": "Full feature support",
  "插件商店完整可用": "Full plugin store available",
  "可开启高级功能": "Can enable advanced features",
  "深度系统管理与插件扩展，完全控制目标机器": "Deep system management and plugin extensions, full control of target device",
  "PE版适合普通用户快速使用；完整版为进阶用户或发烧友设计。": "PE version is for casual users; Full version is for advanced users and enthusiasts.",
  "如何知道自己的设备是否支持UFI-TOOLS？": "How to know if your device supports UFI-TOOLS?",
  "只要你是某兴随身WiFi，紫光平台，Android系统，就可以尝试使用UFI-TOOLS进行设备管理。": "As long as you have a ZTE portable WiFi with Unisoc platform and Android OS, you can try UFI-TOOLS for device management.",
  "直接下载PE版本连接设备进行尝试。": "Download the PE version directly and try connecting to your device.",
  "项目简介": "Project Overview",
  "是为": "is built for",
  "某兴": "ZTE",
  "展锐 / 紫光平台设备": "Unisoc platform devices",
  "打造的全能系统管理与扩展框架。": "as an all-in-one system management and extension framework.",
  "支持在": "Supports running on",
  "便携路由器、手机、平板": "portable routers, phones, tablets",
  "等多种设备上运行，可通过": "and various devices, deployable via",
  "等方式部署。": "and other methods.",
  "适配设备：": "Compatible devices: ",
  "某兴 F50、U30 Air、畅行60、远航60系列、某兴云电脑平板等": "ZTE F50, U30 Air, ChangXing60, YuanHang60 series, ZTE Cloud PC tablet, etc.",
  "模块化插件系统": "Modular plugin system",
  "支持远程网页控制与设备集群管理": "Supports remote web control and device cluster management",
  "可作为后台服务运行，支持开机自启": "Can run as background service with auto-start on boot",
  "核心功能模块": "Core Features",
  "系统与设备控制": "System & Device Control",
  "一键开启高级功能，获取系统最高权限（Root 级控制）": "One-click enable advanced features for highest system privileges (Root-level control)",
  "性能模式切换 / CPU 核心控制 / 电池定量停充": "Performance mode switching / CPU core control / Battery charge limit",
  "调试自动启用": "debug auto-enable",
  "网络 USB 调试自动启动": "Network USB debug auto-start",
  "支持": "Supports",
  "文件共享 / 指示灯控制 / OTA 更新": "File sharing / LED control / OTA updates",
  "开机自启脚本与后台服务": "Boot scripts and background services",
  "网络与信号管理": "Network & Signal Management",
  "免重启锁频段 / 锁小区": "Lock band / Lock cell without restart",
  "即时生效": "takes effect immediately",
  "网络模式切换": "Network mode switching",
  "实时监测：": "Real-time monitoring: ",
  "等信号、频段，速率等指标": "and other signal, band, rate indicators",
  "内网测速": "LAN speed test",
  "与实时速率图表可视化": "with real-time rate chart visualization",
  "通信与命令功能": "Communication & Commands",
  "短信发送、接收与": "SMS send, receive and",
  "自动转发": "auto-forward",
  "内置": "Built-in",
  "命令终端": "command terminal",
  "支持自定义命令交互": "supports custom command interaction",
  "远程 SSH 管理": "remote SSH management",
  "与命令行访问（需开启高级功能）": "and command-line access (requires advanced features)",
  "提供轻量": "Provides lightweight",
  "控制台": "console",
  "支持局域网 / 穿透远控": "supports LAN / tunneling remote control",
  "插件商店系统": "Plugin Store",
  "插件商店": "Plugin Store",
  "可在线下载、安装多种功能插件。": "allows online download and installation of various plugins.",
  "插件服务器已收录常用组件，涵盖系统扩展、AI、网络、自动化等领域：": "The plugin server includes common components covering system extensions, AI, networking, automation and more:",
  "系统安全": "System Security",
  "广告过滤、DNS 管理": "Ad filtering, DNS management",
  "状态监控": "Status Monitoring",
  "流量状态卡片": "Data usage status card",
  "实时显示设备流量与速率": "Real-time device data usage and rate display",
  "智能应用": "Smart Apps",
  "智能监控信息展示": "Smart monitoring information display",
  "远程访问": "Remote Access",
  "提供远程命令行访问入口": "Provides remote command-line access",
  "系统控制": "System Control",
  "核心控制": "Core Control",
  "动态管理核心启停": "Dynamic core start/stop management",
  "外观自定义": "Appearance Customization",
  "主题布局编辑": "Theme layout editor",
  "自定义界面主题与排版": "Custom interface themes and layout",
  "电源管理": "Power Management",
  "电池定量停充": "Battery charge limit",
  "延长电池寿命，智能控制充电阈值": "Extend battery life, smart charge threshold control",
  "网络支持": "Network Support",
  "校园网 VPN 支持": "Campus VPN support",
  "自动化": "Automation",
  "定时任务": "Scheduled Tasks",
  "定时推送与脚本任务": "Scheduled push and script tasks",
  "远程互联": "Remote Networking",
  "异地组网": "Cross-location networking",
  "多设备跨地域组网互通": "Multi-device cross-region networking",
  "插件系统模块化设计，以上仅展示部分插件，未来将持续扩展更多功能。": "Plugin system is modular; above shows only partial plugins. More features will be added in the future.",
  "高级功能": "Advanced Features",
  "开启"高级功能"后可解锁系统特权功能：": "Enabling 'Advanced Features' unlocks system privileges:",
  "获取设备最高系统权限": "Obtain highest system privileges",
  "访问隐藏接口与底层管理模块": "Access hidden interfaces and low-level management modules",
  "解锁全部插件商店插件": "Unlock all plugin store plugins",
  "启用极速更新通道（更新零等待）": "Enable fast update channel (zero-wait updates)",
  "支持远程SSH访问、文件推送、系统级调试": "Supports remote SSH access, file push, system-level debugging",
  "平台兼容性": "Platform Compatibility",
  "支持以下设备及运行方式：": "Supports the following devices and deployment methods:",
  "模块安装": "Module installation",
  "适合手机/平板": "suitable for phones/tablets",
  "一键安装 / 投屏安装": "One-click install / Screen-cast install",
  "推荐，适合随身WiFi": "recommended, suitable for portable WiFi",
  "适配机型：": "Compatible models:",
  "某兴畅行60 / 远航60 / 畅行60Plus": "ZTE ChangXing60 / YuanHang60 / ChangXing60Plus",
  "某兴云电脑平板（W200DS系列）": "ZTE Cloud PC Tablet (W200DS series)",
  "以及其他紫光 CPU + 某兴 MyOS 13 系统设备（理论兼容）": "And other Unisoc CPU + ZTE MyOS 13 devices (theoretically compatible)",
  "远程管理与网页控制": "Remote Management & Web Control",
  "内置轻量级 Web Server，可通过浏览器访问控制界面": "Built-in lightweight Web Server, accessible via browser",
  "设备状态卡片": "Device status cards",
  "实时性能监控": "Real-time performance monitoring",
  "网络控制与调试": "Network control and debugging",
  "默认访问地址：": "Default access URL: ",
  "设备IP": "device-IP",
  "项目特点与优势": "Project Highlights",
  "模块化设计：核心 + 插件架构，灵活扩展": "Modular design: core + plugin architecture, flexible extension",
  "免重启锁频段 / 锁小区：调试更高效": "Lock band/cell without restart: more efficient debugging",
  "实时可视化监控：信号、CPU、温度、内存、速率": "Real-time visual monitoring: signal, CPU, temperature, memory, speed",
  "高级功能：一键获取系统权限、为极客用户定制提供专属功能": "Advanced features: one-click system privileges, exclusive functions for power users",
  "多平台支持：手机 / 平板 / 随身WiFi 全面兼容": "Multi-platform support: phones / tablets / portable WiFi fully compatible",
  "极速更新机制：自动保持最新版本": "Fast update mechanism: automatically stays up-to-date",
  "双端控制：浏览器操作支持移动端与PC端": "Dual-platform control: browser interface supports mobile and PC",
  "异地组网：通过 EasyTier 轻松实现远程互联": "Cross-location networking: easily achieve remote connectivity via EasyTier",
  "猫猫插件：智能访问互联网（需额外配置）": "Cat plugin: Smart internet access (requires additional configuration)",
  "注意事项": "Notes",
  "部分功能依赖于具体设备型号或系统版本。": "Some features depend on specific device model or system version.",
  "插件商店部分插件需启用「高级功能」后才能使用。": "Some plugin store plugins require 'Advanced Features' to be enabled.",
  "使用高级功能前，请备份重要数据。": "Before using advanced features, please backup important data.",
  "项目测试环境：": "Test environment: ",
  "畅行60（Rooted） / 畅行60Plus（Rooted） / 远航60（Rooted） / 云电脑平板（Rooted）": "ChangXing60 (Rooted) / ChangXing60Plus (Rooted) / YuanHang60 (Rooted) / Cloud PC Tablet (Rooted)",
};

// Sort by key length (longest first)
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
const files = [
  path.join(root, 'API_Doc.md'),
  path.join(root, 'README.md'),
  path.join(root, 'User_Doc.md'),
];

let totalChanged = 0;
let remaining = 0;

for (const filePath of files) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let fileChanged = false;
  let count = 0;
  let fileRemaining = 0;

  const newLines = lines.map(line => {
    if (!hasChinese(line)) return line;
    const translated = translateLine(line);
    if (translated !== line) { fileChanged = true; count++; }
    if (hasChinese(translated)) fileRemaining++;
    return translated;
  });

  if (fileChanged) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    totalChanged += count;
    console.log(`TRANSLATED: ${path.relative(root, filePath)} (${count} lines changed, ${fileRemaining} remaining)`);
  }
  remaining += fileRemaining;
}

console.log(`\nTotal lines translated: ${totalChanged}`);
console.log(`Total remaining: ${remaining}`);
