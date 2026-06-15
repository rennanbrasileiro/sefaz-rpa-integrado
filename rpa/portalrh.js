// rpa/portalrh.js — Portal RH isolado e seguro
// Este módulo não é Channel. Ele só abre/consulta o Portal RH quando URL/seletores forem configurados.
// Por padrão opera em DRY RUN e registra evidências para validação sem envio real.
require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const stateStore = require('../lib/stateStore');

const ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'logs');
const SHOT_DIR = path.join(ROOT, 'screenshots', 'portalrh');
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(SHOT_DIR, { recursive: true });

function env(name, def = '') { const v = process.env[name]; return v === undefined || v === null || String(v).trim() === '' ? def : String(v).trim(); }
function envBool(name, def = false) { const v = env(name, ''); if (!v) return def; return ['1','true','yes','sim','s','on'].includes(v.toLowerCase()); }
function log(msg) { const line = `${new Date().toISOString().slice(0,19)} - ${msg}`; fs.appendFileSync(path.join(LOG_DIR, 'portalrh.log'), line + '\n', 'utf-8'); console.log(line); }

const USER = env('PORTALRH_USER');
const PASS = env('PORTALRH_PASS');
const URL = env('PORTALRH_URL');
const REPORT_URL = env('PORTALRH_REPORT_URL', URL);
const DRY_RUN = envBool('PORTALRH_DRY_RUN', true);
const SLOWMO = Number(env('PORTALRH_SLOWMO', '250')) || 250;
const SCREENSHOT_POLICY = env('PORTALRH_SCREENSHOT_POLICY', 'error').toLowerCase();
function currentMonthPeriod() { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; return { dataInicio: env('PORTALRH_START', fmt(first)), dataFim: env('PORTALRH_END', fmt(last)), month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` }; }
const LIVE_SHOT = path.join(SHOT_DIR, 'live.png');

const SEL_USER = env('PORTALRH_USER_SELECTOR', "input[type='email'],input[name*='user' i],input[id*='user' i],input[name*='login' i],input[id*='login' i]");
const SEL_PASS = env('PORTALRH_PASS_SELECTOR', "input[type='password'],input[name*='pass' i],input[id*='pass' i],input[name*='senha' i],input[id*='senha' i]");
const SEL_BTN = env('PORTALRH_LOGIN_BUTTON_SELECTOR', "button[type='submit'],input[type='submit'],button:has-text('Entrar'),button:has-text('Acessar'),input[value*='Entrar']");

function splitSelectors(s) { return String(s || '').split(',').map(x => x.trim()).filter(Boolean); }
async function firstVisible(page, selectors, timeout = 1500) {
  for (const sel of splitSelectors(selectors)) {
    try { const loc = page.locator(sel).first(); if (await loc.isVisible({ timeout }).catch(() => false)) return { loc, sel }; }
    catch (e) { log(`AVISO: seletor ignorado ${sel}: ${e.message}`); }
  }
  return null;
}
async function fillFirst(page, selectors, value, label, required = true) {
  const found = await firstVisible(page, selectors);
  if (!found) { if (required) throw new Error(`Campo não encontrado: ${label}`); log(`AVISO: campo opcional não encontrado: ${label}`); return false; }
  await found.loc.fill(value || ''); log(`Preencheu ${label} via ${found.sel}`); return true;
}
async function clickFirst(page, selectors, label, required = true) {
  const found = await firstVisible(page, selectors);
  if (!found) { if (required) throw new Error(`Botão não encontrado: ${label}`); log(`AVISO: botão opcional não encontrado: ${label}`); return false; }
  await found.loc.click(); log(`Clicou ${label} via ${found.sel}`); return true;
}
async function shot(page, label, error = false) {
  const shouldLive = ['live','diagnostic','all'].includes(SCREENSHOT_POLICY) || error;
  const shouldDetail = ['diagnostic','all'].includes(SCREENSHOT_POLICY) || (error && SCREENSHOT_POLICY !== 'none');
  if (!shouldLive && !shouldDetail) return;
  if (shouldLive) await page.screenshot({ path: LIVE_SHOT, fullPage: true }).catch(() => null);
  if (shouldDetail) {
    const file = path.join(SHOT_DIR, `${new Date().toISOString().replace(/[:.]/g,'-')}_${label}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => null);
    log(`Screenshot ${label}: ${file}`);
  }
}

async function launchBrowser() {
  const base = { headless: false, slowMo: SLOWMO, args: ['--start-maximized', '--no-sandbox'] };
  const chromePath = env('CHROME_PATH');
  if (chromePath) return chromium.launch({ ...base, executablePath: chromePath });
  try { return await chromium.launch({ ...base, channel: 'chrome' }); } catch (_) {}
  try { return await chromium.launch({ ...base, channel: 'msedge' }); } catch (_) {}
  return chromium.launch(base);
}

(async () => {
  log('Portal RH iniciado em módulo separado.');
  log(`DRY_RUN=${DRY_RUN}`);
  const period = currentMonthPeriod();
  stateStore.updateState({ portalRh: { lastStatus: 'running', period } });
  if (!URL) {
    log('Portal RH não executado: PORTALRH_URL não configurada. Informe a URL no painel antes de validar este módulo.');
    process.exit(0);
  }
  if (!USER || !PASS) {
    log('Portal RH não executado: usuário/senha não informados.');
    process.exit(1);
  }
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: null });
  global.__rpaPage = page;
  try {
    log(`Abrindo Portal RH: ${URL}`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await shot(page, '01_aberto');

    await fillFirst(page, SEL_USER, USER, 'usuário Portal RH', false);
    await fillFirst(page, SEL_PASS, PASS, 'senha Portal RH', false);
    await shot(page, '02_login_preenchido');
    await clickFirst(page, SEL_BTN, 'Entrar Portal RH', false);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await shot(page, '03_pos_login');

    if (REPORT_URL && REPORT_URL !== URL) {
      log(`Abrindo relatório/consolidado Portal RH: ${REPORT_URL}`);
      await page.goto(REPORT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await shot(page, '04_relatorio');
    }

    const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const out = path.join(LOG_DIR, 'portalrh_ultimo_relatorio.txt');
    fs.writeFileSync(out, body.slice(0, 20000), 'utf-8');
    log(`Texto do Portal RH salvo em: ${out}`);
    const summary = { textLength: body.length, reportPath: out };
    stateStore.updateState({ portalRh: { lastStatus: 'success', period, summary } });
    stateStore.appendJournal({ module: 'portalrh', action: 'consulta_espelho_saldo', mode: DRY_RUN ? 'dry-run' : 'real', status: 'success', reason: 'Consulta de frequência/espelho/saldo', severity: 'info' });
    log('Portal RH concluído. Nenhuma ação de envio foi executada por este módulo.');
  } catch (e) {
    stateStore.updateState({ portalRh: { lastStatus: 'error', period, error: e.message } });
    stateStore.appendJournal({ module: 'portalrh', action: 'consulta_espelho_saldo', mode: DRY_RUN ? 'dry-run' : 'real', status: 'failed', error: e.message, severity: 'error', nextRecommendedAction: 'Conferir URL/seletores do Portal RH antes de acerto.' });
    log(`Erro Portal RH: ${e.message}`);
    await shot(page, 'erro', true).catch(() => {});
    process.exitCode = 1;
  } finally {
    global.__rpaPage = null;
    await browser.close();
  }
})();
