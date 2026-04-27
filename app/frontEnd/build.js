const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const isDebug = process.argv.includes('--debug');
const inputDir = path.resolve(__dirname, 'public');
const outputDir = path.resolve(__dirname, '../src/main/assets/');
const obfuscateJsFiles = ['requests.js','main.js']

const obfuscateOptions = {
    compact: true,
    controlFlowFlattening: !isDebug,
    controlFlowFlatteningThreshold: 1.0,
    deadCodeInjection: !isDebug,
    deadCodeInjectionThreshold: 1.0,
    // disableConsoleOutput: !isDebug,
    stringArray: true,
    stringArrayThreshold: 1.0,
    transformObjectKeys: true,
    unicodeEscapeSequence: true,
    renameGlobals: false,
};

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function copyOrObfuscateFile(entryPath, outPath) {
    const sourceCode = fs.readFileSync(entryPath, 'utf8');
    if (isDebug) {
        fs.writeFileSync(outPath, sourceCode, 'utf8');
        console.log(`🔄 Copied (debug): ${entryPath} -> ${outPath}`);
    } else {
        const obfuscatedCode = JavaScriptObfuscator.obfuscate(sourceCode, obfuscateOptions).getObfuscatedCode();
        fs.writeFileSync(outPath, obfuscatedCode, 'utf8');
        console.log(`✔️ Obfuscated: ${entryPath} -> ${outPath}`);
    }
}

// 递归处理目录
function processDirectory(dir, outDir) {
    const entries = fs.readdirSync(dir);

    entries.forEach((entry) => {
        const entryPath = path.join(dir, entry);
        const outPath = path.join(outDir, entry);
        const stat = fs.statSync(entryPath);

        if (stat.isDirectory()) {
            fs.mkdirSync(outPath, { recursive: true });
            processDirectory(entryPath, outPath);
        } else if (stat.isFile()) {
            if (entry.endsWith('.js') && obfuscateJsFiles.includes(entry)) {
                copyOrObfuscateFile(entryPath, outPath);
            } else {
                // 非 JS 文件直接复制
                fs.copyFileSync(entryPath, outPath);
                console.log(`📄 Copied (无需混淆): ${entryPath} -> ${outPath}`);
            }
        }
    });
}

if (isDebug) {
    console.log('[DEBUG] Debug 模式已启用，文件将原样复制，无混淆。');
}

processDirectory(inputDir, outputDir);
console.log('\n✅ 所有文件处理完毕！');