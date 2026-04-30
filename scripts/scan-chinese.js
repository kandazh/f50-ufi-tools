/**
 * scan-chinese.js - Scan project for remaining Chinese characters
 * 
 * Usage: node scripts/scan-chinese.js [--verbose]
 * 
 * Scans all text files in the project and reports any lines containing Chinese characters.
 * Skips: node_modules, .git, locale files (zh.json, ja.json), User_Doc.md, binary files
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const verbose = process.argv.includes('--verbose');

// Only scan these text file extensions
const TEXT_EXTS = [
  '.kt', '.java', '.js', '.html', '.css', '.json', '.xml',
  '.sh', '.md', '.txt', '.yml', '.yaml', '.toml', '.kts',
  '.pro', '.conf', '.go', '.ts', '.jsx', '.tsx', '.properties'
];

// Skip these directories/files entirely
const SKIP_NAMES = ['node_modules', '.git', 'pnpm-lock.yaml', 'User_Doc.md', 'User_Doc.assets', 'scripts'];

// Skip these path patterns (if any files should be excluded)
const SKIP_PATHS = [];

// Chinese Unicode range
const CHINESE_REGEX = /[\u4e00-\u9fff]/;

function walk(dir) {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_NAMES.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(walk(full));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTS.includes(ext)) continue;
        const normalized = full.replace(/\\/g, '/');
        if (SKIP_PATHS.some(sp => normalized.includes(sp))) continue;
        results.push(full);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

const files = walk(root);
let totalFound = 0;
let filesWithChinese = [];

for (const f of files) {
  try {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n');
    let hits = [];
    lines.forEach((l, i) => {
      if (CHINESE_REGEX.test(l)) {
        hits.push({ line: i + 1, text: l.trimEnd().substring(0, 200) });
      }
    });
    if (hits.length > 0) {
      filesWithChinese.push({ file: path.relative(root, f), count: hits.length, hits });
      totalFound += hits.length;
    }
  } catch (e) { /* skip unreadable files */ }
}

// Output results
if (filesWithChinese.length === 0) {
  console.log('\n✅ No Chinese characters found in any text files!');
} else {
  for (const f of filesWithChinese) {
    console.log(`\n=== ${f.file} (${f.count} lines) ===`);
    const show = verbose ? f.hits : f.hits.slice(0, 10);
    show.forEach(h => console.log(`  L${h.line}: ${h.text}`));
    if (!verbose && f.hits.length > 10) {
      console.log(`  ... and ${f.hits.length - 10} more`);
    }
  }
  console.log('\n\n=== SUMMARY ===');
  console.log(`Files with Chinese: ${filesWithChinese.length}`);
  console.log(`Total lines with Chinese: ${totalFound}`);
  process.exit(1); // Non-zero exit for CI usage
}
