// routes/helpers.js — utilitários compartilhados
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launchBrowser(opts = {}) {
  const { chromium } = require('playwright');
  const chromePath = process.env.CHROME_PATH || undefined;
  const base = {
    headless: opts.headless ?? false,
    slowMo:   opts.slowMo  ?? 0,
    args:     ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (chromePath && !chromePath.startsWith('http')) {
    console.log('🌐 Chrome:', chromePath);
    return chromium.launch({ ...base, executablePath: chromePath });
  }
  try { const b = await chromium.launch({ ...base, channel: 'chrome' }); console.log('🌐 Chrome (system)'); return b; } catch(_) {}
  try { const b = await chromium.launch({ ...base, channel: 'msedge' }); console.log('🌐 MSEdge'); return b; } catch(_) {}
  try { const b = await chromium.launch(base); console.log('🌐 Playwright Chromium'); return b; } catch(e) {
    throw new Error('❌ Nenhum browser!\nAdicione no .env:\nCHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\n\nErro: ' + e.message);
  }
}

module.exports = { sleep, launchBrowser };
