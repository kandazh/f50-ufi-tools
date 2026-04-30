/**
 * translate-batch.js - Batch translate all files with Chinese text
 * 
 * Usage: node scripts/translate-batch.js <dictionary-folder>
 * 
 * Expects dictionary JSON files in the dictionary folder, named after the target file.
 * Example: for "app/src/main/assets/shell/zreq.go", the dictionary file would be:
 *   <dictionary-folder>/zreq.go.json
 * 
 * Or use a single "all.json" file with file-keyed entries:
 * {
 *   "app/src/main/assets/shell/zreq.go": {
 *     "replacements": [...]
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node translate-batch.js <dictionary-folder-or-json>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const dictArg = path.resolve(args[0]);

let fileDicts = {};

if (fs.statSync(dictArg).isFile()) {
  // Single JSON with all files
  fileDicts = JSON.parse(fs.readFileSync(dictArg, 'utf8'));
} else {
  // Folder of dictionaries
  const files = fs.readdirSync(dictArg);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const targetName = f.replace('.json', '');
    const content = JSON.parse(fs.readFileSync(path.join(dictArg, f), 'utf8'));
    // Find the actual file path
    fileDicts[targetName] = content;
  }
}

let totalFiles = 0;
let totalReplacements = 0;

for (const [filePath, dict] of Object.entries(fileDicts)) {
  const fullPath = path.resolve(root, filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`⚠️  File not found: ${filePath}`);
    continue;
  }

  const replacements = dict.replacements || [];
  if (replacements.length === 0) continue;

  let content = fs.readFileSync(fullPath, 'utf8');
  let count = 0;

  for (const { old: oldStr, new: newStr } of replacements) {
    if (content.includes(oldStr)) {
      content = content.split(oldStr).join(newStr);
      count++;
    }
  }

  if (count > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ ${filePath}: ${count} replacements applied`);
    totalFiles++;
    totalReplacements += count;
  }
}

console.log(`\n=== Done: ${totalReplacements} replacements across ${totalFiles} files ===`);
