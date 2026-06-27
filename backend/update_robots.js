const fs = require('fs');
const path = require('path');

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
      results.push(fullPath);
    }
  }
  return results;
}

const baseDir = process.cwd();
const files = walk(baseDir);
let updatedCount = 0;

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('<meta name="robots"') || content.includes("<meta name='robots'")) {
    continue;
  }

  const lower = content.toLowerCase();
  const headIndex = lower.indexOf('<head>');
  if (headIndex === -1) {
    continue;
  }

  let insertPos = lower.indexOf('<meta name="viewport"', headIndex);
  if (insertPos === -1) insertPos = lower.indexOf('<meta charset="utf-8"', headIndex);
  if (insertPos === -1) insertPos = lower.indexOf('<meta charset=', headIndex);

  if (insertPos !== -1) {
    const endTag = content.indexOf('>', insertPos);
    if (endTag !== -1) insertPos = endTag + 1;
  } else {
    insertPos = headIndex + '<head>'.length;
  }

  const tag = '\n    <meta name="robots" content="noindex, nofollow, noimageindex">';
  content = content.slice(0, insertPos) + tag + content.slice(insertPos);
  fs.writeFileSync(filePath, content, 'utf8');
  updatedCount += 1;
  console.log('Updated', filePath.replace(baseDir + path.sep, ''));
}

const robotsPath = path.join(baseDir, 'public', 'robots.txt');
fs.writeFileSync(robotsPath, 'User-agent: *\nDisallow: /\n', 'utf8');
console.log('Created', robotsPath.replace(baseDir + path.sep, ''));
console.log('Total updated HTML files:', updatedCount);
