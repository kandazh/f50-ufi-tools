const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const isDebug = process.argv.includes('--debug');
const inputDir = path.resolve(__dirname, 'public');
const outputDir = path.resolve(__dirname, '../src/main/assets/');

// Assemble index.html from template + partials
function assembleHTML(templatePath, publicDir) {
    let html = fs.readFileSync(templatePath, 'utf8');
    html = html.replace(/<!--#include\s+([\w\-\/\.]+)\s*-->/g, (match, filePath) => {
        const fullPath = path.join(publicDir, filePath);
        if (fs.existsSync(fullPath)) {
            console.log(`📦 Including partial: ${filePath}`);
            return fs.readFileSync(fullPath, 'utf8');
        }
        console.warn(`⚠️ Partial not found: ${fullPath}`);
        return match;
    });
    return html;
}

const templatePath = path.join(inputDir, 'index.html.template');
if (fs.existsSync(templatePath)) {
    const assembled = assembleHTML(templatePath, inputDir);
    fs.writeFileSync(path.join(inputDir, 'index.html'), assembled, 'utf8');
    console.log('✔️ Assembled index.html from template + partials');
}
const obfuscateJsFiles = ['requests.js']

const obfuscateOptions = {
    compact: true,
    controlFlowFlattening: !isDebug,
    controlFlowFlatteningThreshold: 0.4,
    deadCodeInjection: !isDebug,
    deadCodeInjectionThreshold: 0.3,
    // disableConsoleOutput: !isDebug,
    stringArray: true,
    stringArrayThreshold: 0.8,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
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
        // Skip template and views partials (already assembled into index.html)
        if (entry === 'index.html.template' || entry === 'views' || entry.endsWith('.old')) return;

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