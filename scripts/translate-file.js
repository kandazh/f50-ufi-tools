/**
 * translate-file.js - Apply dictionary-based translation to a single file
 * 
 * Usage: node scripts/translate-file.js <file-path> <dictionary-json-path>
 * 
 * Dictionary format (JSON):
 * {
 *   "replacements": [
 *     { "old": "Chinese text here", "new": "English text here" }
 *   ]
 * }
 * 
 * Each replacement is applied as exact string match (line by line).
 * Replacements are applied in order, so longer/more specific entries should come first.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node translate-file.js <file-path> <dictionary-json-path>');
  process.exit(1);
}

const filePath = path.resolve(args[0]);
const dictPath = path.resolve(args[1]);

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}
if (!fs.existsSync(dictPath)) {
  console.error(`Dictionary not found: ${dictPath}`);
  process.exit(1);
}

const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const replacements = dict.replacements || [];

if (replacements.length === 0) {
  console.error('No replacements found in dictionary.');
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');
let count = 0;

for (const { old: oldStr, new: newStr } of replacements) {
  if (content.includes(oldStr)) {
    content = content.split(oldStr).join(newStr);
    count++;
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`✅ ${path.relative(process.cwd(), filePath)}: ${count} replacements applied`);
