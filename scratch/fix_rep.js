const fs = require('fs');
let code = fs.readFileSync('Backend/src/routes/repository.js', 'utf8');

const target = `\t\tconst badgeUrl = /api/badge//\r\n\t\tconst badgeMarkdown = [![SetupDoctor Grade]()](https://github.com//)`;
const replacement = `\t\tconst badgeUrl = '/api/badge/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);\r\n\t\tconst badgeMarkdown = '[![SetupDoctor Grade](' + badgeUrl + ')](https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + ')';`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('Backend/src/routes/repository.js', code, 'utf8');
  console.log('Fixed successfully');
} else {
  // Try with \n
  const targetLF = target.replace(/\r\n/g, '\n');
  const replacementLF = replacement.replace(/\r\n/g, '\n');
  if (code.includes(targetLF)) {
    code = code.replace(targetLF, replacementLF);
    fs.writeFileSync('Backend/src/routes/repository.js', code, 'utf8');
    console.log('Fixed LF successfully');
  } else {
    console.log('Not found');
  }
}
