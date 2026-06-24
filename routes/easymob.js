// routes/easymob.js — EasyMOB isolado, seguro e observável
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const stateStore = require('../lib/stateStore');
const { buildDailyPlan, buildOperationalMode } = require('../lib/easymobDailyPlan');

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
  const operationalMode = buildOperationalMode({ ...cfg, ...body, easyRealApprovalUntil: body.easyRealApprovalUntil || cfg.easyRealApprovalUntil || body.confirmRealUntil });
  const dryRun = !operationalMode.willWrite;
  const env = {
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    EASYMOB_MODE: pick(body.easyMode, body.mode, cfg.easyMode, process.env.EASYMOB_MODE, 'real'),
    EASYMOB_SITE_LOGIN: pick(body.easySiteLogin, body.siteLogin, cfg.easySiteLogin, process.env.EASYMOB_SITE_LOGIN, 'https://easymob.metadados.com.br/Account/LoginColaborador'),
    EASYMOB_ACCESS_KEY: pick(body.easyAccessKey, body.accessKey, cfg.easyAccessKey, process.env.EASYMOB_ACCESS_KEY),
    EASYMOB_USERNAME: pick(body.easyUser, body.username, cfg.easyUser, process.env.EASYMOB_USERNAME),
    EASYMOB_PASSWORD: pick(body.easyPass, body.password, cfg.easyPass, process.env.EASYMOB_PASSWORD),
    EASYMOB_HEADLESS_DEFAULT: String(boolValue(body.headless, boolValue(cfg.easyHeadless, false))),
    EASYMOB_DRY_RUN: String(dryRun),
    EASYMOB_EXECUTION_MODE: operationalMode.executionMode,
    EASYMOB_ENVIRONMENT_MODE: operationalMode.environmentMode,
    EASYMOB_CONFIRM_REAL: String(operationalMode.willWrite && boolValue(body.confirmReal, false)),
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

function marksFromReport(rep) {
  const plans = [rep?.plan_after_register, rep?.plan_after_wait, rep?.plan].filter(Boolean);
  for (const plan of plans) if (Array.isArray(plan.marks)) return plan.marks;
  return [];
}
function configFromBody(body = {}) {
  const cfg = readJson(USER_CFG, {});
  return {
    times: pick(body.easyTimes, body.times, cfg.easyTimes, process.env.EASYMOB_HORARIOS, '08:00,12:00,13:00,17:00'),
    dailyTargetMinutes: pick(body.easyDailyTargetMinutes, cfg.easyDailyTargetMinutes, process.env.EASYMOB_DAILY_TARGET_MINUTES, '480'),
    lunchMinutes: pick(body.easyLunchMinutes, cfg.easyLunchMinutes, process.env.EASYMOB_LUNCH_MINUTES, '60'),
    duplicateToleranceMinutes: pick(body.easyDuplicateToleranceMinutes, body.duplicateToleranceMinutes, cfg.easyDuplicateToleranceMinutes, process.env.EASYMOB_DUPLICATE_TOLERANCE_MINUTES, '10'),
    easyMode: pick(body.easyMode, body.mode, cfg.easyMode, process.env.EASYMOB_MODE, 'real'),
    easyDryRun: boolValue(body.easyDryRun ?? body.dryRun, boolValue(cfg.easyDryRun ?? cfg.dryRun, true)),
    easyRealApprovalUntil: pick(body.easyRealApprovalUntil, body.confirmRealUntil, cfg.easyRealApprovalUntil, ''),
    easyRealApproval: boolValue(body.easyRealApproval ?? body.confirmReal, boolValue(cfg.easyRealApproval, false)),
  };
}
function persistDailyPlan(dailyPlan, source = 'api') {
  const dayEntry = stateStore.defaultDayEntry(dailyPlan.date);
  const state = stateStore.readState();
  const monthly = { ...(state.monthly || {}), days: { ...((state.monthly || {}).days || {}) } };
  monthly.days[dailyPlan.date] = { ...dayEntry, ...(monthly.days[dailyPlan.date] || {}), date: dailyPlan.date, marks: dailyPlan.marks, planned: dailyPlan.nextDue, status: dailyPlan.status, pendencies: dailyPlan.blockingReason ? [dailyPlan.blockingReason] : [] };
  stateStore.updateState({ monthly, easymob: { dailyPlan, operationalMode: dailyPlan.operationalMode, lastPlan: { ...(dailyPlan || {}), source }, marksToday: dailyPlan.marks || [], nextAction: dailyPlan.nextAction || null, plannedTime: dailyPlan.nextDue || null, dayStatus: dailyPlan.status, lastExecution: { status: 'plan_ready', source, finishedAt: new Date().toISOString() } } });
}
function spawnEasy(args = [], envAdd = {}) {
  if (easyStatus === 'running') throw new Error('EasyMOB já está em execução. Cancele ou aguarde finalizar.');
  ensureDirs();
  easyLog = [];
  easyStatus = 'running';
  stateStore.updateState({ easymob: { lastExecution: { status: 'running', startedAt: new Date().toISOString(), args }, watchdog: { status: args.includes('--watchdog') ? 'running' : 'manual' } } });
  const env = { ...process.env, ...envAdd };
  easyProc = spawn(pythonBin(), ['runner.py', ...args], { cwd: EASY_RPA, env });
  easyProc.stdout.on('data', d => pushLog(d.toString()));
  easyProc.stderr.on('data', d => pushLog('[ERR] ' + d.toString()));
  easyProc.on('close', code => { easyStatus = code === 0 ? 'done' : 'error'; const rep = latestReport(); const plan = rep?.plan_after_register || rep?.plan_after_wait || rep?.plan || null; const op = buildOperationalMode({ easyMode: envAdd.EASYMOB_ENVIRONMENT_MODE || envAdd.EASYMOB_MODE, easyDryRun: envAdd.EASYMOB_DRY_RUN !== 'false', confirmReal: envAdd.EASYMOB_CONFIRM_REAL === 'true' }); const dailyPlan = buildDailyPlan({ marks: marksFromReport(rep), config: { ...configFromBody({}), easyDryRun: envAdd.EASYMOB_DRY_RUN !== 'false', easyMode: envAdd.EASYMOB_MODE }, operationalMode: op }); persistDailyPlan(dailyPlan, args.includes('--watchdog') ? 'watchdog' : 'runner'); stateStore.updateState({ easymob: { nextAction: dailyPlan.nextAction || plan?.action || null, plannedTime: dailyPlan.nextDue || plan?.next_due || plan?.target_time || null, lastExecution: { status: easyStatus, finishedAt: new Date().toISOString(), reportStatus: rep?.status || null, environmentMode: op.environmentMode, executionMode: op.executionMode, willWrite: op.willWrite }, watchdog: { status: args.includes('--watchdog') ? easyStatus : 'idle' } } }); stateStore.appendJournal({ module: 'easymob', action: 'daily_plan_updated', mode: op.executionMode, status: easyStatus, severity: code === 0 ? 'info' : 'warning', reason: dailyPlan.recommendation, marksBefore: dailyPlan.marks, calculatedTime: dailyPlan.nextDue, willWrite: op.willWrite, environmentMode: op.environmentMode }); easyProc = null; });
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

router.get('/status', (req, res) => { const rep = latestReport(); res.json({ status: easyStatus, singlePlan, latestReport: rep?.plan_after_register || rep?.plan_after_wait || rep?.plan || null, report: rep || null, state: stateStore.readState().easymob }); });
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


router.post('/daily-plan', (req, res) => {
  try {
    const cfg = configFromBody(req.body || {});
    const state = stateStore.readState();
    const rep = latestReport();
    const marks = Array.isArray(req.body?.marks) ? req.body.marks : (marksFromReport(rep).length ? marksFromReport(rep) : (state.easymob?.marksToday || []));
    const operationalMode = buildOperationalMode({ ...cfg, ...req.body });
    const dailyPlan = buildDailyPlan({ marks, config: cfg, operationalMode });
    persistDailyPlan(dailyPlan, req.body?.source || 'daily-plan');
    stateStore.appendJournal({ module: 'easymob', action: 'daily_plan_calculated', mode: operationalMode.executionMode, status: dailyPlan.status, severity: dailyPlan.blockingReason ? 'warning' : 'info', reason: dailyPlan.recommendation, marksBefore: dailyPlan.marks, calculatedTime: dailyPlan.nextDue, willWrite: operationalMode.willWrite, environmentMode: operationalMode.environmentMode });
    res.json({ ok: true, dailyPlan, operationalMode });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    const op = buildOperationalMode(req.body);
    if (op.executionMode === 'real' && !op.willWrite) return res.status(403).json({ error: op.reason, operationalMode: op });
    spawnEasy(argsFromBody(req.body, 'run'), env);
    res.json({ ok: true, operationalMode: op, message: op.willWrite ? 'Execução REAL iniciada após autorização diária; reconsulta antes/depois.' : 'Execução em TESTE iniciada. Não grava ponto.' });
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
      mode: buildOperationalMode(payload).willWrite ? 'REAL / GRAVA se plano permitir' : 'TESTE / NÃO GRAVA',
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
