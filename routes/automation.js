// routes/automation.js — Orquestrador operacional seguro
// Mantém as automações separadas dos módulos. Por padrão não executa nada sem habilitar.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { buildEnvContent, buildScheduleCsv } = require('../lib/envBuilder');
const { PROJECTS } = require('../lib/config');
const { timeToMinutes } = require('../lib/timeHelpers');
const stateStore = require('../lib/stateStore');

const router = express.Router();
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AUTO_CFG = path.join(DATA_DIR, 'automation.json');
const AUTO_LOG = path.join(ROOT, 'logs', 'automation.log');
const USER_CFG = path.join(ROOT, 'userconfig.json');
const EASY_ROOT = path.join(ROOT, 'easymob');
const EASY_RPA = path.join(EASY_ROOT, 'rpa');
const SINGLE_FLAG = path.join(EASY_ROOT, 'run_single.flag');

let timer = null;
let running = false;
let automationLog = [];
let childProcs = new Set();
let lastRunKeys = new Set();
let lastEasyMobRunAt = new Map();

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(EASY_ROOT, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(EASY_ROOT, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(EASY_ROOT, 'reports'), { recursive: true });
}

function defaultConfig() {
  return {
    enabled: false,
    safeMode: true,
    checkEverySeconds: 120,
    easyMob: {
      enabled: true,
      mode: 'real',
      times: ['08:00', '12:00', '13:00', '17:00'],
      windowMinutes: 20,
      duplicateToleranceMinutes: 10,
      headless: true,
      requireApprovalFlag: false,
      watchdog: true,
      minRetrySeconds: 120,
      businessDaysOnly: true,
      dryRun: true,
      slowmo: 700,
    },
    service: {
      enabled: false,
      checkEveryTwoBusinessDays: true,
      dryRun: true,
    },
    portalRh: {
      enabled: false,
      weeklyCheckDay: 5,
      weeklyCheckTime: '15:30',
      dryRun: true,
    },
    channel: {
      enabled: false,
      weeklyDay: 5,
      weeklyTime: '16:30',
      dryRun: true,
      useSavedConfig: true,
    },
    monthly: {
      targetHours: 168,
      currentHours: 0,
      dailyTargetHours: 8,
    },
  };
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
  } catch (_) { return fallback; }
}

function loadConfig() { ensureDirs(); return mergeConfig(readJson(AUTO_CFG, {})); }
function mergeConfig(cfg = {}) {
  const base = defaultConfig();
  return {
    ...base,
    ...cfg,
    easyMob: { ...base.easyMob, ...(cfg.easyMob || {}) },
    service: { ...base.service, ...(cfg.service || {}) },
    portalRh: { ...base.portalRh, ...(cfg.portalRh || {}) },
    channel: { ...base.channel, ...(cfg.channel || {}) },
    monthly: { ...base.monthly, ...(cfg.monthly || {}) },
  };
}
function saveConfig(cfg) { ensureDirs(); fs.writeFileSync(AUTO_CFG, JSON.stringify(mergeConfig(cfg), null, 2), 'utf-8'); }
function loadUserConfig() { return readJson(USER_CFG, null); }

function log(msg) {
  ensureDirs();
  const line = `${new Date().toISOString().slice(0,19)} - ${msg}`;
  automationLog.push(line + '\n');
  if (automationLog.length > 1200) automationLog = automationLog.slice(-1200);
  fs.appendFileSync(AUTO_LOG, line + '\n', 'utf-8');
  console.log('[AUTO]', line);
}

function minutesToTime(totalMinutes) {
  const safe = Math.max(0, Number(totalMinutes) || 0);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function normalizeProjects(projects = []) {
  return (projects || []).map(p => {
    const value = String(p?.value || p?.projeto || p || '').trim();
    if (!value) return null;
    const found = PROJECTS.find(x => String(x.value) === value);
    return { value, label: p?.label || found?.label || value };
  }).filter(Boolean);
}
function splitMinutesExact(totalMinutes, items = []) {
  const count = items.length;
  if (!count) return [];
  const base = Math.floor(totalMinutes / count);
  const remainder = totalMinutes % count;
  return items.map((item, index) => ({ ...item, minutos: base + (index < remainder ? 1 : 0) }));
}
function getRowProjectValue(row = {}) {
  return String(row.projeto || row.project || row.proj || row.projectValue || row.project_value || '').trim();
}
function scheduleAlreadyByProject(rows = []) { return rows.some(r => getRowProjectValue(r)); }
function inferProjectRowsWhenRepeatedByDate(scheduleRows = [], projects = []) {
  if (!scheduleRows.length || !projects.length || scheduleAlreadyByProject(scheduleRows)) return scheduleRows;
  const grouped = new Map();
  for (const r of scheduleRows) {
    if (!r?.data) continue;
    if (!grouped.has(r.data)) grouped.set(r.data, []);
    grouped.get(r.data).push(r);
  }
  return scheduleRows.map(r => {
    const group = grouped.get(r.data) || [];
    if (group.length > 1 && group.length <= projects.length) {
      const idx = group.indexOf(r);
      const p = projects[idx];
      return { ...r, projeto: p?.value || '', label: p?.label || p?.value || '' };
    }
    return r;
  });
}
function buildScheduleCsvForRpa(cfg = {}) {
  if (!cfg.scheduleRows?.length) return null;
  if (cfg.useTimeRange) return buildScheduleCsv(cfg.scheduleRows, 'timerange');
  const projects = normalizeProjects(cfg.projects || cfg.projectValues || []);
  const rows = inferProjectRowsWhenRepeatedByDate(cfg.scheduleRows || [], projects);
  let finalRows = [];
  if (scheduleAlreadyByProject(rows)) {
    finalRows = rows.map(r => ({ data: r.data, projeto: getRowProjectValue(r), duracao: String(r.duracao || r.duração || '').trim() }))
      .filter(r => r.data && r.projeto && timeToMinutes(r.duracao) !== null);
  } else {
    for (const r of rows) {
      const total = timeToMinutes(r.duracao || r.duração || '00:00');
      if (!total || !projects.length) continue;
      for (const p of splitMinutesExact(total, projects)) finalRows.push({ data: r.data, projeto: p.value, duracao: minutesToTime(p.minutos) });
    }
  }
  if (!finalRows.length) return buildScheduleCsv(cfg.scheduleRows, 'duracao');
  return ['data,projeto,duracao', ...finalRows.map(r => `${r.data},${r.projeto},${r.duracao}`)].join('\n');
}

function isSameMinuteHHMM(hhmm, now = new Date(), windowMinutes = 0) {
  if (!/^\d{2}:\d{2}$/.test(String(hhmm || ''))) return false;
  const [h, m] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return now >= target && now <= new Date(target.getTime() + windowMinutes * 60000);
}
function weekdayNumber(now = new Date()) {
  const d = now.getDay();
  return d === 0 ? 7 : d;
}
function isBusinessDay(now = new Date()) {
  const wd = weekdayNumber(now);
  return wd >= 1 && wd <= 5;
}
function runKey(moduleName, label, now = new Date()) {
  return `${now.toISOString().slice(0,10)}|${moduleName}|${label}`;
}

function nextCheckForTimes(times = [], windowMinutes = 20, now = new Date()) {
  const normalized = (times || []).filter(t => /^\d{2}:\d{2}$/.test(String(t || ''))).sort();
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    if (dayOffset > 0) day.setHours(0, 0, 0, 0);
    if (weekdayNumber(day) > 5) continue;
    for (const hhmm of normalized) {
      const [h, m] = hhmm.split(':').map(Number);
      const candidate = new Date(day);
      candidate.setHours(h, m, 0, 0);
      const end = new Date(candidate.getTime() + Number(windowMinutes || 20) * 60000);
      if (end >= now) return candidate.toISOString();
    }
  }
  return null;
}
function approvalValid(until) {
  return Boolean(until) && new Date(until).getTime() > Date.now();
}
function easyRoutineState(cfg) {
  const easy = cfg.easyMob || {};
  const times = easy.times || ['08:00', '12:00', '13:00', '17:00'];
  return {
    enabled: cfg.enabled !== false && easy.enabled !== false,
    dryRun: easy.dryRun !== false,
    confirmReal: easy.confirmReal === true && approvalValid(easy.confirmRealUntil),
    confirmRealUntil: easy.confirmRealUntil || '',
    approvalDaily: easy.approvalDaily === true,
    times,
    windowMinutes: easy.windowMinutes ?? 20,
    retrySeconds: easy.minRetrySeconds ?? 120,
    businessDaysOnly: easy.businessDaysOnly !== false,
    nextCheck: nextCheckForTimes(times, easy.windowMinutes ?? 20),
    mode: easy.dryRun === false ? 'real' : 'teste',
  };
}
function pythonBin() { return process.env.EASYMOB_PYTHON || process.env.PYTHON || 'python'; }

function spawnTracked(command, args, opts, label) {
  log(`Iniciando ${label}: ${command} ${args.join(' ')}`);
  const proc = spawn(command, args, opts);
  if (String(label || '').toLowerCase().startsWith('easymob')) proc.__moduleName = 'easymob';
  childProcs.add(proc);
  proc.stdout.on('data', d => log(`${label}: ${d.toString('utf8').trimEnd()}`));
  proc.stderr.on('data', d => log(`${label} [ERR]: ${d.toString('utf8').trimEnd()}`));
  proc.on('close', code => { childProcs.delete(proc); log(`${label} finalizado com código ${code}`); });
  return proc;
}

function boolValue(value, def = false) {
  if (value === undefined || value === null || value === '') return def;
  if (typeof value === 'boolean') return value;
  return ['1','true','yes','sim','s','on'].includes(String(value).toLowerCase());
}
function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  return '';
}
function runEasyMobTarget(targetTime, cfg, source = 'scheduler') {
  fs.writeFileSync(SINGLE_FLAG, targetTime, 'utf-8');
  const easy = cfg.easyMob || {};
  const userCfg = loadUserConfig() || {};
  const dryRun = easy.dryRun !== false && userCfg.easyDryRun !== false;
  const critical = stateStore.readPending().filter(p => p.status !== 'closed' && p.severity === 'critical' && p.module === 'easymob');
  const realApproved = easy.confirmReal === true && approvalValid(easy.confirmRealUntil);
  if (!dryRun && !realApproved) {
    const pending = stateStore.addPending({ module: 'easymob', type: 'execucao_real_bloqueada', severity: 'critical', cause: 'Rotina REAL sem autorização diária válida.', plannedTime: targetTime, recommendation: 'Em Configurações > EasyMOB, selecione Autorização REAL hoje e ative novamente a rotina.' });
    stateStore.appendJournal({ module: 'easymob', action: 'real_blocked', mode: 'real', plannedTime: targetTime, status: 'blocked', severity: 'critical', reason: pending.cause, nextRecommendedAction: pending.recommendation });
    stateStore.updateState({ easymob: { lastError: pending.cause, routine: { ...easyRoutineState(cfg), enabled: true }, watchdog: { status: 'blocked', lastCycleAt: new Date().toISOString(), lastError: pending.cause } } });
    log(`EasyMOB REAL bloqueado: ${pending.cause}`);
    return;
  }
  if (!dryRun && critical.length) {
    const reason = `Rotina REAL bloqueada por ${critical.length} pendência(s) crítica(s).`;
    stateStore.appendJournal({ module: 'easymob', action: 'real_blocked', mode: 'real', plannedTime: targetTime, status: 'blocked', severity: 'critical', reason, nextRecommendedAction: 'Resolver pendências antes de automatizar ponto real.' });
    stateStore.updateState({ easymob: { lastError: reason, watchdog: { status: 'blocked', lastCycleAt: new Date().toISOString(), lastError: reason } } });
    log(`EasyMOB REAL bloqueado: ${reason}`);
    return;
  }
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    EASYMOB_MODE: pick(easy.mode, userCfg.easyMode, process.env.EASYMOB_MODE, 'real'),
    EASYMOB_SITE_LOGIN: pick(userCfg.easySiteLogin, process.env.EASYMOB_SITE_LOGIN, 'https://easymob.metadados.com.br/Account/LoginColaborador'),
    EASYMOB_ACCESS_KEY: pick(userCfg.easyAccessKey, process.env.EASYMOB_ACCESS_KEY),
    EASYMOB_USERNAME: pick(userCfg.easyUser, process.env.EASYMOB_USERNAME),
    EASYMOB_PASSWORD: pick(userCfg.easyPass, process.env.EASYMOB_PASSWORD),
    EASYMOB_HORARIOS: (easy.times || ['08:00','12:00','13:00','17:00']).join(','),
    EASYMOB_JANELA_RETRY_MINUTOS: String(easy.windowMinutes ?? 20),
    EASYMOB_DUPLICATE_TOLERANCE_MINUTES: String(easy.duplicateToleranceMinutes ?? 10),
    EASYMOB_DRY_RUN: String(dryRun),
    EASYMOB_CONFIRM_REAL: String(!dryRun && realApproved),
    EASYMOB_CONFIRM_CUSTOM_TIME: 'true',
    EASYMOB_WATCHDOG_ENABLED: 'true',
    EASYMOB_BUSINESS_DAYS_ONLY: String(easy.businessDaysOnly !== false),
    EASYMOB_DAILY_TARGET_MINUTES: pick(userCfg.easyDailyTargetMinutes, process.env.EASYMOB_DAILY_TARGET_MINUTES, '480'),
    EASYMOB_LUNCH_MINUTES: pick(userCfg.easyLunchMinutes, process.env.EASYMOB_LUNCH_MINUTES, '60'),
    EASYMOB_SCREENSHOT_POLICY: pick(userCfg.easyScreenshotPolicy, process.env.EASYMOB_SCREENSHOT_POLICY, 'error'),
    EASYMOB_LIVE_PREVIEW: String(boolValue(userCfg.easyLivePreview, false)),
    EASYMOB_KEEP_LAST_SCREENSHOTS: pick(userCfg.easyKeepLastScreenshots, process.env.EASYMOB_KEEP_LAST_SCREENSHOTS, '10'),
  };
  const args = ['runner.py', '--single-run', '--slowmo', String(easy.slowmo || 700)];
  if (easy.headless !== false) args.push('--headless');
  else args.push('--demo');
  stateStore.updateState({ easymob: { routine: { ...easyRoutineState(cfg), enabled: true }, watchdog: { status: 'cycle_started', lastCycleAt: new Date().toISOString() }, plannedTime: targetTime } });
  stateStore.appendJournal({ module: 'easymob', action: 'consulta_iniciada', mode: dryRun ? 'teste' : 'real', plannedTime: targetTime, status: 'started', severity: 'info', reason: 'Watchdog iniciou conferência no horário de referência; o plano decidirá o horário calculado.' });
  spawnTracked(pythonBin(), args, { cwd: EASY_RPA, env }, `EasyMOB/${source}/${targetTime}${dryRun ? '/dry-run' : '/real'}`);
}

function runChannelFromSavedConfig(cfg) {
  const blockingPendencies = stateStore.readPending().filter(p => p.status !== 'closed' && ['ponto_nao_registrado','janela_perdida','falha_modal','divergencia_easymob_service','divergencia_easymob_portalrh','conferencia_antes_channel'].includes(p.type));
  if (cfg.channel?.dryRun === false && blockingPendencies.length) {
    stateStore.updateState({ channel: { lastStatus: 'blocked', blockingPendencies } });
    log(`Channel semanal bloqueado por ${blockingPendencies.length} pendência(s) de ponto.`);
    return;
  }
  const userCfg = loadUserConfig();
  if (!userCfg) { log('Channel semanal ignorado: userconfig.json ainda não existe.'); return; }
  const finalCfg = { ...userCfg, dryRun: cfg.channel?.dryRun !== false };
  fs.writeFileSync(path.join(ROOT, '.env'), buildEnvContent(finalCfg), 'utf-8');
  const csv = buildScheduleCsvForRpa(finalCfg);
  if (csv) fs.writeFileSync(path.join(ROOT, 'schedule.csv'), csv, 'utf-8');
  spawnTracked('node', [path.join(ROOT, 'rpa', 'channel.js')], { cwd: ROOT, env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '' } }, `Channel/semanal${finalCfg.dryRun ? '/dry-run' : ''}`);
}

function runDueTasks(now = new Date()) {
  const cfg = loadConfig();
  if (!cfg.enabled) return;
  const easy = cfg.easyMob || {};
  if (easy.enabled) {
    if (easy.businessDaysOnly !== false && !isBusinessDay(now)) {
      stateStore.updateState({ easymob: { routine: { ...easyRoutineState(cfg), enabled: true }, watchdog: { status: 'waiting_business_day', lastCycleAt: now.toISOString() } } });
      return;
    }
    // EasyMOB é watchdog: não executa uma única vez e bloqueia o resto do dia.
    // Ele reconsulta dentro da janela, porque a própria regra do Python impede duplicidade.
    // Se a execução falhar, o próximo ciclo tenta novamente enquanto ainda estiver na janela.
    for (const hhmm of easy.times || []) {
      if (isSameMinuteHHMM(hhmm, now, easy.windowMinutes ?? 20)) {
        const key = runKey('easymob', hhmm, now);
        const lastAt = lastEasyMobRunAt.get(key) || 0;
        const minRetryMs = Math.max(30, Number(easy.minRetrySeconds || 120)) * 1000;
        const hasEasyRunning = Array.from(childProcs).some(p => p.__moduleName === 'easymob');
        if (!hasEasyRunning && (now.getTime() - lastAt >= minRetryMs)) {
          lastEasyMobRunAt.set(key, now.getTime());
          runEasyMobTarget(hhmm, cfg);
        }
      }
    }
  }
  stateStore.updateState({ easymob: { routine: { ...easyRoutineState(cfg), enabled: true }, watchdog: { status: Array.from(childProcs).some(p => p.__moduleName === 'easymob') ? 'running' : 'idle', lastCycleAt: now.toISOString() } } });
  const ch = cfg.channel || {};
  if (ch.enabled && weekdayNumber(now) === Number(ch.weeklyDay || 5) && isSameMinuteHHMM(ch.weeklyTime || '16:30', now, 3)) {
    const key = runKey('channel', ch.weeklyTime || '16:30', now);
    if (!lastRunKeys.has(key)) { lastRunKeys.add(key); runChannelFromSavedConfig(cfg); }
  }
}

function startScheduler() {
  if (timer) return;
  const cfg = loadConfig();
  running = true;
  log(`Orquestrador iniciado. enabled=${cfg.enabled}; intervalo=${cfg.checkEverySeconds || 30}s`);
  const routine = easyRoutineState(cfg);
  stateStore.updateState({ easymob: { routine, watchdog: { status: 'running', startedAt: new Date().toISOString(), intervalSeconds: cfg.checkEverySeconds || 30 } } });
  stateStore.appendJournal({ module: 'easymob', action: 'rotina_ativada', mode: routine.dryRun ? 'teste' : 'real', status: 'success', severity: 'info', reason: 'Rotina diária ativada pelo orquestrador.', nextRecommendedAction: routine.dryRun ? 'Validar em TESTE antes de ativar REAL.' : 'Monitorar journal e pendências.' });
  timer = setInterval(() => {
    try { runDueTasks(new Date()); } catch (e) { log(`Erro no ciclo do orquestrador: ${e.message}`); }
  }, Math.max(10, Number(cfg.checkEverySeconds || 30)) * 1000);
}
function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null; running = false;
  log('Orquestrador parado.');
  stateStore.updateState({ easymob: { routine: { ...easyRoutineState(loadConfig()), enabled: false }, watchdog: { status: 'stopped', stoppedAt: new Date().toISOString() } } });
  stateStore.appendJournal({ module: 'easymob', action: 'rotina_parada', mode: 'controle', status: 'success', severity: 'info', reason: 'Rotina diária parada pelo usuário.' });
}

router.get('/status', (_req, res) => {
  const cfg = loadConfig();
  let fileLog = '';
  try { if (fs.existsSync(AUTO_LOG)) fileLog = fs.readFileSync(AUTO_LOG, 'utf-8').split(/\r?\n/).slice(-120).join('\n'); } catch (_) {}
  res.json({ running, config: cfg, routine: easyRoutineState(cfg), activeChildren: childProcs.size, log: automationLog, fileLog });
});
router.get('/log', (_req, res) => {
  let fileLog = '';
  try { if (fs.existsSync(AUTO_LOG)) fileLog = fs.readFileSync(AUTO_LOG, 'utf-8'); } catch (_) {}
  res.json({ ok: true, log: automationLog, fileLog });
});
router.get('/config', (_req, res) => res.json({ ok: true, config: loadConfig() }));
router.post('/config', (req, res) => { const incoming = req.body || {}; if (incoming.easyMob?.dryRun === false && !approvalValid(incoming.easyMob?.confirmRealUntil)) { incoming.easyMob.confirmReal = false; incoming.easyMob.approvalDaily = false; } saveConfig(incoming); const cfg = loadConfig(); const routine = easyRoutineState(cfg); stateStore.updateState({ easymob: { routine } }); stateStore.appendJournal({ module: 'easymob', action: 'rotina_configurada', mode: cfg.easyMob?.dryRun === false ? 'real' : 'teste', status: 'success', severity: 'info', reason: routine.confirmReal ? 'Rotina REAL configurada com autorização diária válida.' : 'Configuração da rotina diária salva.' }); res.json({ ok: true, config: cfg, routine }); });
router.post('/start', (_req, res) => { startScheduler(); res.json({ ok: true, running }); });
router.post('/stop', (_req, res) => { stopScheduler(); res.json({ ok: true, running }); });
router.post('/run-now', (req, res) => {
  const cfg = loadConfig();
  const what = String(req.body?.what || '').toLowerCase();
  const targetTime = String(req.body?.targetTime || '').trim();
  try {
    if (what === 'easymob') runEasyMobTarget(targetTime || new Date().toTimeString().slice(0,5), cfg, 'manual');
    else if (what === 'channel') runChannelFromSavedConfig(cfg);
    else return res.status(400).json({ error: 'Use what=easymob ou what=channel.' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/clear-log', (_req, res) => { automationLog = []; try { fs.writeFileSync(AUTO_LOG, '', 'utf-8'); } catch (_) {} res.json({ ok: true }); });

module.exports = router;
