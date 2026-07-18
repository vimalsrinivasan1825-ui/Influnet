const fs = require('fs');
const path = require('path');

const dir = 'apps/landing/src/components/landing';

function processDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Replace href="/login"
      content = content.replace(/href="\/login"/g, "href={`${process.env.NEXT_PUBLIC_APP_URL}/login`}");
      // Replace href="/signup..."
      content = content.replace(/href="\/signup([^"]*)"/g, "href={`${process.env.NEXT_PUBLIC_APP_URL}/signup$1`}");
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir(dir);
console.log('Fixed hrefs');
