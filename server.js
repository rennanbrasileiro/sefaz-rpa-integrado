// server.js — SEFAZ RPA Integrado
const express = require('express');
const path = require('path');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3131;
const ROOT = __dirname;

function openUrl(url) {
  if (String(process.env.AUTO_OPEN_UI || 'true').toLowerCase() === 'false') return;
  try {
    const platform = process.platform;
    if (platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    else if (platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch (_) {}
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'public')));
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
