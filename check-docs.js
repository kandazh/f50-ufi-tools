const fs = require('fs');
const path = require('path');

// For documentation files, we'll do a full-content rewrite approach
// Read each file, translate line by line using regex-based approach

const root = __dirname;

// Function to translate a markdown file's Chinese content
function translateDocFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  // Count Chinese lines before
  const lines = content.split('\n');
  const chineseLines = lines.filter(l => /[\u4e00-\u9fff]/.test(l)).length;
  console.log(`${path.relative(root, filePath)}: ${chineseLines} lines with Chinese`);
}

translateDocFile(path.join(root, 'API_Doc.md'));
translateDocFile(path.join(root, 'README.md'));
translateDocFile(path.join(root, 'User_Doc.md'));
