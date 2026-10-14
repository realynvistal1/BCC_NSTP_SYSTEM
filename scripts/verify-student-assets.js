const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const studentViews = fs.readdirSync(path.join(root, 'views/student'))
  .filter(name => name.endsWith('.html'))
  .map(name => `views/student/${name}`);
const views = [...studentViews, 'views/auth/student-login.html', 'views/auth/enrollment.html'];
const missing = [];
for (const view of views) {
  const html = fs.readFileSync(path.join(root, view), 'utf8');
  const styles = [...html.matchAll(/href=["'](\/assets\/css\/[^"']+)["']/g)].map(match => match[1]);
  if (view.startsWith('views/student/') && !styles.some(url => url.startsWith('/assets/css/student-design.css?'))) {
    missing.push(`${view}: student design stylesheet link`);
  }
  for (const url of styles) {
    const file = path.join(root, 'public', url.split('?')[0].slice('/assets/'.length));
    if (!fs.existsSync(file)) missing.push(`${view}: ${url}`);
  }
}
if (missing.length) {
  console.error('Student UI assets are missing. Deploy public/css together with views.\n' + missing.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: local stylesheets exist for all ${views.length} student and enrollment pages.`);
}
