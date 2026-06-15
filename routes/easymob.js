// routes/easymob.js — EasyMOB isolado, seguro e observável
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const router = express.Router();
const ROOT = path.join(__dirname, '..');
const EASY_ROOT = path.join(ROOT, 'easymob');
const EASY_RPA = path.join(EASY_ROOT, 'rpa');
const LOG_PATH = path.join(EASY_ROOT, 'logs', 'execucao.log');
const SINGLE_FLAG = path.join(EASY_ROOT, 'run_single.flag');
const USER_CFG = path.join(ROOT, 'userconfig.json');
const LIVE_SHOT = path.join(EASY_ROOT, 'screenshots', 'live.png');

let easyProc = null;
let easyStatus = 'idle';
let easyLog = [];
let singleTimer = null;
let singlePlan = null;

function pythonBin() { return process.env.EASYMOB_PYTHON || process.env.PYTHON || 'python'; }
function readJson(file, fallback = {}) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback; } catch { return fallback; } }
function pick(...vals) { for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return ''; }
function boolValue(value, def = false) {
  if (value === undefined || value === null || value === '') return def;
  if (typeof value === 'boolean') return value;
  return ['1','true','yes','sim','s','on'].includes(String(value).toLowerCase());
}
function ensureDirs() {
  fs.mkdirSync(path.join(EASY_ROOT, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(EASY_ROOT, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(EASY_ROOT, 'reports'), { recursive: true });
}
function latestReport() {
  const dir = path.join(EASY_ROOT, 'reports');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /^report_.*\.json$/i.test(f)).map(f => path.join(dir, f));
  if (!files.length) return null;
  files.sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  try { return JSON.parse(fs.readFileSync(files[0], 'utf-8')); } catch { return null; }
}

function safeEnvFromBody(body = {}) {
  const cfg = readJson(USER_CFG, {});
  const env = {
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    EASYMOB_MODE: pick(body.easyMode, body.mode, cfg.easyMode, process.env.EASYMOB_MODE, 'real'),
    EASYMOB_SITE_LOGIN: pick(body.easySiteLogin, body.siteLogin, cfg.easySiteLogin, process.env.EASYMOB_SITE_LOGIN, 'https://easymob.metadados.com.br/Account/LoginColaborador'),
    EASYMOB_ACCESS_KEY: pick(body.easyAccessKey, body.accessKey, cfg.easyAccessKey, process.env.EASYMOB_ACCESS_KEY),
    EASYMOB_USERNAME: pick(body.easyUser, body.username, cfg.easyUser, process.env.EASYMOB_USERNAME),
    EASYMOB_PASSWORD: pick(body.easyPass, body.password, cfg.easyPass, process.env.EASYMOB_PASSWORD),
    EASYMOB_HEADLESS_DEFAULT: String(boolValue(body.headless, boolValue(cfg.easyHeadless, false))),
    EASYMOB_DRY_RUN: String(boolValue(body.easyDryRun ?? body.dryRun, boolValue(cfg.easyDryRun ?? cfg.dryRun, true))),
    EASYMOB_CONFIRM_REAL: String(boolValue(body.confirmReal, false)),
    EASYMOB_CONFIRM_CUSTOM_TIME: String(boolValue(body.confirmCustomTime, false)),
    EASYMOB_HORARIOS: pick(body.easyTimes, body.times, cfg.easyTimes, process.env.EASYMOB_HORARIOS, '08:00,12:00,13:00,17:00'),
    EASYMOB_JANELA_RETRY_MINUTOS: pick(body.easyRetryMinutes, body.retryMinutes, cfg.easyRetryMinutes, process.env.EASYMOB_JANELA_RETRY_MINUTOS, '20'),
    EASYMOB_DUPLICATE_TOLERANCE_MINUTES: pick(body.easyDuplicateToleranceMinutes, body.duplicateToleranceMinutes, cfg.easyDuplicateToleranceMinutes, process.env.EASYMOB_DUPLICATE_TOLERANCE_MINUTES, '10'),
    EASYMOB_DAILY_TARGET_MINUTES: pick(body.easyDailyTargetMinutes, cfg.easyDailyTargetMinutes, process.env.EASYMOB_DAILY_TARGET_MINUTES, '480'),
    EASYMOB_LUNCH_MINUTES: pick(body.easyLunchMinutes, cfg.easyLunchMinutes, process.env.EASYMOB_LUNCH_MINUTES, '60'),
    EASYMOB_SCREENSHOT_POLICY: pick(body.easyScreenshotPolicy, cfg.easyScreenshotPolicy, process.env.EASYMOB_SCREENSHOT_POLICY, 'error'),
    EASYMOB_LIVE_PREVIEW: String(boolValue(body.easyLivePreview, boolValue(cfg.easyLivePreview, false))),
    EASYMOB_KEEP_LAST_SCREENSHOTS: pick(body.easyKeepLastScreenshots, cfg.easyKeepLastScreenshots, process.env.EASYMOB_KEEP_LAST_SCREENSHOTS, '10'),
    EASYMOB_KEEP_BROWSER_OPEN: String(boolValue(body.keepOpen, boolValue(cfg.easyKeepBrowserOpen, false))),
  };

  const selectorMap = [
    ['EASYMOB_SEL_ACCESS_KEY', body.selAccessKey || cfg.easySelAccessKey],
    ['EASYMOB_SEL_USERNAME', body.selUsername || cfg.easySelUsername],
    ['EASYMOB_SEL_PASSWORD', body.selPassword || cfg.easySelPassword],
    ['EASYMOB_BTN_LOGIN', body.btnLogin || cfg.easyBtnLogin],
    ['EASYMOB_BTN_REGISTER', body.btnRegister || cfg.easyBtnRegister],
    ['EASYMOB_BTN_CONSULT', body.btnConsult || cfg.easyBtnConsult],
  ];
  for (const [k, v] of selectorMap) if (v && String(v).trim()) env[k] = String(v).trim();
  return env;
}

function pushLog(line) {
  easyLog.push(line);
  if (easyLog.length > 1500) easyLog = easyLog.slice(-1500);
  process.stdout.write(line);
}

function spawnEasy(args = [], envAdd = {}) {
  if (easyStatus === 'running') throw new Error('EasyMOB já está em execução. Cancele ou aguarde finalizar.');
  ensureDirs();
  easyLog = [];
  easyStatus = 'running';
  const env = { ...process.env, ...envAdd };
  easyProc = spawn(pythonBin(), ['runner.py', ...args], { cwd: EASY_RPA, env });
  easyProc.stdout.on('data', d => pushLog(d.toString()));
  easyProc.stderr.on('data', d => pushLog('[ERR] ' + d.toString()));
  easyProc.on('close', code => { easyStatus = code === 0 ? 'done' : 'error'; easyProc = null; });
  return easyProc;
}

function argsFromBody(body = {}, mode = 'run') {
  const args = [];
  if (boolValue(body.headless, true)) args.push('--headless');
  if (boolValue(body.demo, false)) args.push('--demo');
  if (boolValue(body.pause, false)) args.push('--pause');
  const slowmo = Number(body.slowmo || body.easySlowmo || 700);
  args.push('--slowmo', String(Number.isFinite(slowmo) ? slowmo : 700));
  if (mode === 'test-login') args.push('--test-login');
  if (mode === 'plan') args.push('--plan-only');
  if (body.targetTime && mode !== 'test-login') args.push('--target', String(body.targetTime));
  return args;
}

function clearLogFile() { try { fs.writeFileSync(LOG_PATH, '', 'utf-8'); } catch {} }

router.get('/status', (req, res) => { const rep = latestReport(); res.json({ status: easyStatus, singlePlan, latestReport: rep?.plan_after_wait || rep?.plan || null, report: rep || null }); });
router.get('/log', (req, res) => {
  let fileLog = '';
  try { if (fs.existsSync(LOG_PATH)) fileLog = fs.readFileSync(LOG_PATH, 'utf-8'); } catch {}
  res.json({ status: easyStatus, log: easyLog, fileLog, singlePlan, latestReport: latestReport() });
});
router.get('/screenshot', (req, res) => {
  if (!fs.existsSync(LIVE_SHOT)) return res.status(204).end();
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  fs.createReadStream(LIVE_SHOT).pipe(res);
});

router.post('/test-login', (req, res) => {
  try {
    clearLogFile();
    const env = safeEnvFromBody({ ...req.body, easyDryRun: true, dryRun: true });
    spawnEasy(argsFromBody(req.body, 'test-login'), env);
    res.json({ ok: true, message: 'Teste de login iniciado. Não grava ponto.' });
  } catch (e) { easyStatus = 'error'; res.status(500).json({ error: e.message }); }
});

router.post('/plan', (req, res) => {
  try {
    clearLogFile();
    const env = safeEnvFromBody({ ...req.body, easyDryRun: true, dryRun: true });
    spawnEasy(argsFromBody(req.body, 'plan'), env);
    res.json({ ok: true, message: 'Consulta/plano EasyMOB iniciada. Não grava ponto.' });
  } catch (e) { easyStatus = 'error'; res.status(500).json({ error: e.message }); }
});

router.post('/run', (req, res) => {
  try {
    clearLogFile();
    const env = safeEnvFromBody(req.body);
    spawnEasy(argsFromBody(req.body, 'run'), env);
    res.json({ ok: true, message: boolValue(req.body.easyDryRun ?? req.body.dryRun, true) ? 'Execução em TESTE iniciada. Não grava ponto.' : 'Execução REAL iniciada após confirmação explícita.' });
  } catch (e) { easyStatus = 'error'; res.status(500).json({ error: e.message }); }
});

router.post('/schedule', (req, res) => {
  try {
    const target = String(req.body.targetTime || '').trim();
    if (!/^\d{2}:\d{2}$/.test(target)) return res.status(400).json({ error: 'Informe o horário único em HH:MM.' });
    const [hh, mm] = target.split(':').map(Number);
    const now = new Date();
    let when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    if (when <= now) when.setDate(when.getDate() + 1);
    const delay = when.getTime() - now.getTime();
    if (singleTimer) clearTimeout(singleTimer);
    fs.writeFileSync(SINGLE_FLAG, target, 'utf-8');
    const payload = { ...req.body, targetTime: target };
    singlePlan = {
      targetTime: target,
      scheduledFor: when.toISOString(),
      mode: boolValue(payload.easyDryRun ?? payload.dryRun, true) ? 'TESTE / NÃO GRAVA' : 'REAL / PODE GRAVAR',
      behavior: 'No horário, o robô consultará as marcações do dia, calculará a próxima ação e só registrará se permitido pelas regras.',
      headless: boolValue(payload.headless, true),
      createdAt: new Date().toISOString(),
    };
    singleTimer = setTimeout(() => {
      try {
        const env = safeEnvFromBody(payload);
        spawnEasy(argsFromBody(payload, 'run'), env);
      } catch (e) { pushLog(`[ERR] Falha ao executar agendamento EasyMOB: ${e.message}\n`); }
    }, delay);
    res.json({ ok: true, singlePlan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cancel', (req, res) => {
  if (easyProc) { easyProc.kill('SIGTERM'); easyProc = null; easyStatus = 'idle'; }
  if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
  try { if (fs.existsSync(SINGLE_FLAG)) fs.unlinkSync(SINGLE_FLAG); } catch {}
  singlePlan = null;
  res.json({ ok: true });
});

module.exports = router;
