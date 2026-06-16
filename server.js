// server.js — SEFAZ RPA Integrado
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3131;
const ROOT = __dirname;

function openDetached(command, args) {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch (_) {}
}
function openUrl(url) {
  if (String(process.env.AUTO_OPEN_UI || 'true').toLowerCase() === 'false') return;
  const platform = process.platform;
  if (platform === 'win32') openDetached('cmd', ['/c', 'start', '', url]);
  else if (platform === 'darwin') openDetached('open', [url]);
  else openDetached('xdg-open', [url]);
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.get('/app.js', (_req, res) => {
  try {
    const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf-8');
    const validationJs = fs.existsSync(path.join(ROOT, 'public', 'validation-ui.js')) ? fs.readFileSync(path.join(ROOT, 'public', 'validation-ui.js'), 'utf-8') : '';
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.end(`${appJs}\n\n;${validationJs}`);
  } catch (e) {
    res.status(500).type('text/plain').send(e.message);
  }
});
app.use(express.static(path.join(ROOT, 'public')));
app.use('/api/validation', require('./routes/validation'));
app.use('/api', require('./routes/api'));

// Screenshot ao vivo compartilhado pelos módulos Playwright em Node.
app.get('/api/screenshot', async (_req, res) => {
  try {
    const page = global.__rpaPage;
    if (!page) return res.status(204).end();
    const buf = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.end(buf);
  } catch (_) { res.status(204).end(); }
});

app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║  🚀 SEFAZ RPA Integrado  →  ${url.padEnd(23)}║`);
  console.log(`╚════════════════════════════════════════════════════╝\n`);
  openUrl(url);
});