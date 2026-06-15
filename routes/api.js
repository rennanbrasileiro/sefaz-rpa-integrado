// routes/api.js v3.4
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { spawn } = require('child_process');

const { PROJECTS, ACTIVITY_TYPES, DEFAULT_COMENTARIO } = require('../lib/config');
const { calcSaldoFromLog, distribuirHoras, timeToMinutes } = require('../lib/timeHelpers');
const { buildEnvContent, buildScheduleCsv } = require('../lib/envBuilder');
const { launchBrowser, sleep } = require('./helpers');
const { fetchRealizado, lancarRealizado } = require('./service');
const easymobRouter = require('./easymob');
const automationRouter = require('./automation');
const stateStore = require('../lib/stateStore');

const ROOT = path.join(__dirname, '..');

function minutesToTime(totalMinutes) {
  const safe = Math.max(0, Number(totalMinutes) || 0);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeProjects(projects = []) {
  return (projects || [])
    .map((p) => {
      if (typeof p === 'string' || typeof p === 'number') {
        const value = String(p);
        const found = (PROJECTS || []).find((x) => String(x.value) === value);
        return { value, label: found?.label || value };
      }
      const value = String(p?.value || p?.projeto || p?.project || '').trim();
      if (!value) return null;
      return { value, label: p?.label || p?.nome || p?.name || value };
    })
    .filter(Boolean);
}

function splitMinutesExact(totalMinutes, items = []) {
  const count = items.length;
  if (!count) return [];
  const total = Math.max(0, Number(totalMinutes) || 0);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return items.map((item, index) => ({
    ...item,
    minutos: base + (index < remainder ? 1 : 0),
  }));
}

function getRowProjectValue(row = {}) {
  return String(row.projeto || row.project || row.proj || row.projectValue || row.project_value || '').trim();
}

function scheduleAlreadyByProject(scheduleRows = []) {
  return scheduleRows.some((r) => getRowProjectValue(r));
}

function inferProjectRowsWhenRepeatedByDate(scheduleRows = [], projects = []) {
  const rows = Array.isArray(scheduleRows) ? scheduleRows : [];
  if (!rows.length || !projects.length || scheduleAlreadyByProject(rows)) return rows;

  const grouped = new Map();
  for (const r of rows) {
    const key = r?.data || '';
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  }

  const inferred = [];
  for (const r of rows) {
    const group = grouped.get(r.data) || [];
    if (group.length > 1 && group.length <= projects.length) {
      const idx = group.indexOf(r);
      const p = projects[idx];
      inferred.push({ ...r, projeto: p?.value || '', label: p?.label || p?.value || '' });
    } else {
      inferred.push(r);
    }
  }
  return inferred;
}

function buildExactApontamentoRows(cfg = {}) {
  const projects = normalizeProjects(cfg.projects || cfg.projectValues || []);
  const scheduleRows = inferProjectRowsWhenRepeatedByDate(Array.isArray(cfg.scheduleRows) ? cfg.scheduleRows : [], projects);
  if (!scheduleRows.length) return [];

  // Se a tela já enviou linhas por projeto (Preview Apontamentos), não rateia de novo.
  // Apenas normaliza para preservar exatamente o que foi mostrado ao usuário.
  if (scheduleAlreadyByProject(scheduleRows)) {
    return scheduleRows.map((r) => {
      const projeto = getRowProjectValue(r);
      const found = projects.find((p) => String(p.value) === projeto);
      const duracao = String(r.duracao || r.duração || '').trim();
      const minutos = timeToMinutes(duracao);
      return {
        data: r.data,
        projeto,
        label: r.label || found?.label || projeto,
        duracao,
        horaInicio: r.horaInicio || r.hora_inicio || '',
        horaFim: r.horaFim || r.hora_fim || '',
        minutos: minutos === null ? 0 : minutos,
        perProjMin: minutos === null ? 0 : minutos,
        totalDia: r.totalDia || '',
        totalDiaMin: r.totalDiaMin || null,
      };
    }).filter((r) => r.data && r.projeto && r.duracao);
  }

  if (!projects.length) return [];

  return scheduleRows.flatMap((r) => {
    const totalMin = timeToMinutes(r.duracao || r.duração || '00:00');
    if (totalMin === null || totalMin <= 0) return [];

    const distribuido = splitMinutesExact(totalMin, projects);
    return distribuido.map((p) => ({
      data: r.data,
      projeto: p.value,
      label: p.label,
      duracao: minutesToTime(p.minutos),
      horaInicio: r.horaInicio || r.hora_inicio || '08:00',
      horaFim: r.horaFim || r.hora_fim || '',
      minutos: p.minutos,
      perProjMin: p.minutos,
      totalDia: minutesToTime(totalMin),
      totalDiaMin: totalMin,
    }));
  });
}

function validateExactApontamentoRows(cfg = {}, rows = []) {
  const projects = normalizeProjects(cfg.projects || cfg.projectValues || []);
  const scheduleRows = inferProjectRowsWhenRepeatedByDate(Array.isArray(cfg.scheduleRows) ? cfg.scheduleRows : [], projects);

  // Quando a agenda já veio por projeto, ela já é o plano final de execução.
  // Valida apenas formatos básicos para não duplicar o rateio nem bloquear execução legítima.
  if (scheduleAlreadyByProject(scheduleRows)) {
    for (const r of rows) {
      if (!r.data) throw new Error('Existe linha de apontamento sem data.');
      if (!r.projeto) throw new Error(`Existe linha de apontamento sem projeto na data ${r.data}.`);
      if (timeToMinutes(r.duracao) === null) throw new Error(`Duração inválida na data ${r.data}, projeto ${r.projeto}: ${r.duracao}. Use HH:MM.`);
    }
    return;
  }

  const expectedByDate = new Map();
  for (const r of scheduleRows) {
    const totalMin = timeToMinutes(r.duracao || r.duração || '00:00');
    if (totalMin === null || totalMin <= 0 || !r.data) continue;
    expectedByDate.set(r.data, (expectedByDate.get(r.data) || 0) + totalMin);
  }

  const actualByDate = new Map();
  for (const r of rows) {
    if (!r.data) continue;
    actualByDate.set(r.data, (actualByDate.get(r.data) || 0) + (Number(r.minutos) || 0));
  }

  for (const [data, expected] of expectedByDate.entries()) {
    const actual = actualByDate.get(data) || 0;
    if (actual !== expected) {
      throw new Error(`Total rateado não fecha com o realizado do portal na data ${data}. Esperado ${minutesToTime(expected)}, calculado ${minutesToTime(actual)}.`);
    }
  }
}

function buildScheduleCsvForRpa(cfg = {}) {
  if (!cfg.scheduleRows?.length) return null;

  // Mantém o comportamento original para lançamento por faixa de horário.
  if (cfg.useTimeRange) {
    return buildScheduleCsv(cfg.scheduleRows, 'timerange');
  }

  // Para lançamento por duração, gera uma linha por projeto para não perder minutos no rateio.
  const rows = buildExactApontamentoRows(cfg);
  if (!rows.length) return buildScheduleCsv(cfg.scheduleRows, 'duracao');
  validateExactApontamentoRows(cfg, rows);

  const lines = ['data,projeto,duracao'];
  for (const r of rows) {
    lines.push(`${r.data},${r.projeto},${r.duracao}`);
  }
  return lines.join('\n');
}

router.get('/health', (req, res) => res.json({ ok: true, app: 'SEFAZ RPA Integrado', modules: ['channel', 'service', 'portalrh', 'easymob'] }));
router.get('/state', (_req, res) => res.json({ ok: true, state: stateStore.readState(), pending: stateStore.readPending(), journal: stateStore.readJournal(40) }));

// ═══ CATÁLOGO ═══════════════════════════════════════════════
router.get('/catalog', (req, res) => {
  res.json({ projects: PROJECTS, activityTypes: ACTIVITY_TYPES, defaultComentario: DEFAULT_COMENTARIO });
});

// ═══ CONFIG PERSISTIDA (localStorage via API) ══════════════
const CFG_PATH = path.join(ROOT, 'userconfig.json');
router.get('/config/load', (req, res) => {
  try {
    if (fs.existsSync(CFG_PATH)) return res.json({ ok: true, config: JSON.parse(fs.readFileSync(CFG_PATH, 'utf-8')) });
    res.json({ ok: true, config: null });
  } catch(e) { res.json({ ok: true, config: null }); }
});
router.post('/config/save', (req, res) => {
  try {
    fs.writeFileSync(CFG_PATH, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══ PARSE LOG ════════════════════════════════════════════════
router.post('/parse-log', (req, res) => {
  try {
    const { rawText = '', baseStart = '08:00', fixedHours = '00:00' } = req.body;
    const rows = calcSaldoFromLog(rawText, baseStart, fixedHours);
    if (!rows.length) return res.status(400).json({ error: 'Nenhum padrão encontrado. Cole o texto do portal de ponto ou do Service.' });
    res.json({ rows });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ═══ RATEIO ═════════════════════════════════════════════════
router.post('/distribute', (req, res) => {
  try {
    const { totalHoras = '08:00', projectValues = [], baseStart = null } = req.body;
    const total = timeToMinutes(totalHoras);
    if (!total) return res.status(400).json({ error: 'totalHoras inválido.' });
    if (!projectValues.length) return res.status(400).json({ error: 'Nenhum projeto.' });
    const base = baseStart ? timeToMinutes(baseStart) : null;
    res.json({ distribution: distribuirHoras(total, projectValues, base) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ═══ PREVIEW APONTAMENTOS ════════════════════════════════════
router.post('/preview-apontamentos', (req, res) => {
  try {
    const cfg = req.body;
    // Gera previsão detalhada de apontamentos com rateio exato, sem descartar minutos.
    const rows = buildExactApontamentoRows(cfg);
    validateExactApontamentoRows(cfg, rows);
    res.json({ rows, total: rows.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ═══ PREVIEW .env ════════════════════════════════════════════
router.post('/preview', (req, res) => {
  try {
    const cfg = req.body;
    const envContent = buildEnvContent(cfg);
    const csvContent = cfg.scheduleRows?.length
      ? buildScheduleCsvForRpa(cfg)
      : null;
    res.json({ envContent, csvContent });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ═══ RPA JEXPERTS ════════════════════════════════════════════
let rpaProc = null, rpaLog = [], rpaStatus = 'idle';

router.post('/run', (req, res) => {
  if (rpaStatus === 'running') return res.status(409).json({ error: 'RPA já em execução.' });
  try {
    const cfg = req.body;
    if (!cfg.user || !cfg.pass) {
      return res.status(400).json({ error: 'Channel/JExperts não executado: informe usuário e senha SEFAZ nas Configurações e salve antes de rodar.' });
    }
    if (!Array.isArray(cfg.projects) || !cfg.projects.length) {
      return res.status(400).json({ error: 'Channel/JExperts não executado: adicione ao menos um projeto.' });
    }
    const blockingPendencies = stateStore.readPending().filter(p => p.status !== 'closed' && ['ponto_nao_registrado','janela_perdida','falha_modal','divergencia_easymob_service','divergencia_easymob_portalrh','conferencia_antes_channel'].includes(p.type));
    if (cfg.dryRun === false && blockingPendencies.length) {
      stateStore.updateState({ channel: { lastStatus: 'blocked', blockingPendencies } });
      return res.status(409).json({ error: `Channel REAL bloqueado: existem ${blockingPendencies.length} pendência(s) de ponto no período. Faça conferência antes do fechamento.`, pending: blockingPendencies });
    }
    fs.writeFileSync(path.join(ROOT, '.env'), buildEnvContent(cfg), 'utf-8');
    if (cfg.scheduleRows?.length) {
      const csv = buildScheduleCsvForRpa(cfg);
      if (csv) fs.writeFileSync(path.join(ROOT, 'schedule.csv'), csv, 'utf-8');
    }
    rpaLog = []; rpaStatus = 'running';
    rpaProc = spawn('node', [path.join(ROOT, 'rpa', 'channel.js')], { cwd: ROOT });
    rpaProc.stdout.on('data', d => { const l = d.toString(); rpaLog.push(l); process.stdout.write(l); });
    rpaProc.stderr.on('data', d => { const l = '[ERR] ' + d.toString(); rpaLog.push(l); process.stderr.write(l); });
    rpaProc.on('close', code => { rpaStatus = code === 0 ? 'done' : 'error'; stateStore.updateState({ channel: { lastStatus: rpaStatus, finishedAt: new Date().toISOString() } }); stateStore.appendJournal({ module: 'channel', action: 'run', mode: cfg.dryRun === false ? 'real' : 'dry-run', status: rpaStatus, severity: code === 0 ? 'info' : 'error' }); rpaProc = null; });
    res.json({ ok: true });
  } catch (e) { rpaStatus = 'error'; res.status(500).json({ error: e.message }); }
});

router.post('/cancel', (req, res) => {
  if (rpaProc) { rpaProc.kill('SIGTERM'); rpaStatus = 'idle'; rpaProc = null; }
  res.json({ ok: true });
});

router.get('/log',    (req, res) => res.json({ status: rpaStatus, log: rpaLog }));
router.get('/status', (req, res) => res.json({ status: rpaStatus }));

// ═══ SCREENSHOT ══════════════════════════════════════════════
router.get('/screenshot', async (req, res) => {
  try {
    const page = global.__rpaPage;
    if (!page) return res.status(204).end();
    const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.end(buf);
  } catch (e) { res.status(204).end(); }
});

// ═══ PORTAL RH ═══════════════════════════════════════════════
let rhProc = null, rhLog = [], rhStatus = 'idle';

router.post('/portalrh/run', (req, res) => {
  if (rhStatus === 'running') return res.status(409).json({ error: 'Portal RH já em execução.' });
  const cfg = req.body;
  const envLines = [
    `PORTALRH_USER=${cfg.rhUser || ''}`,
    `PORTALRH_PASS=${cfg.rhPass || ''}`,
    `PORTALRH_TZ=${cfg.tz || 'America/Recife'}`,
    `PORTALRH_DATE_SOURCE=${cfg.dateSource || 'daily'}`,
    `PORTALRH_WEEKDAYS_ONLY=${cfg.weekdaysOnly !== false}`,
    'PORTALRH_DATE_MODE=set',
    cfg.dateSource === 'range' ? `PORTALRH_START=${cfg.startDate || ''}` : '',
    cfg.dateSource === 'range' ? `PORTALRH_END=${cfg.endDate || 'auto'}` : '',
    cfg.dateSource === 'list'  ? `PORTALRH_DATES=${(cfg.datesList || []).join(',')}` : '',
    `PORTALRH_HORAS=${(cfg.horas || ['08:00','12:00','13:00','17:00']).join(',')}`,
    `PORTALRH_MOTIVO_VALUE=${cfg.motivoValue || '0004'}`,
    `PORTALRH_MOTIVO_TEXT=${cfg.motivoText || 'Esquecimento de Registro'}`,
    `PORTALRH_DETALHAMENTO=${cfg.detalhamento || 'Solicito ajuste de ponto por esquecimento de registro.'}`,
    `PORTALRH_URL=${cfg.portalRhUrl || ''}`,
    `PORTALRH_REPORT_URL=${cfg.portalRhReportUrl || ''}`,
    `PORTALRH_USER_SELECTOR=${cfg.portalRhUserSelector || ''}`,
    `PORTALRH_PASS_SELECTOR=${cfg.portalRhPassSelector || ''}`,
    `PORTALRH_LOGIN_BUTTON_SELECTOR=${cfg.portalRhLoginButtonSelector || ''}`,
    `PORTALRH_DRY_RUN=${cfg.dryRun !== false}`,
    `PORTALRH_SCREENSHOT_POLICY=${cfg.portalRhScreenshotPolicy || 'error'}`,
    `PORTALRH_SLOWMO=250`, `PORTALRH_STEP_PAUSE=500`, `PORTALRH_AFTER_SUBMIT=4000`,
  ].filter(Boolean).join('\n');

  const envPath = path.join(ROOT, '.env');
  let existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  existing = existing.split('\n').filter(l => !l.startsWith('PORTALRH_')).join('\n');
  fs.writeFileSync(envPath, existing.trim() + '\n\n' + envLines, 'utf-8');

  rhLog = []; rhStatus = 'running';
  rhProc = spawn('node', [path.join(ROOT, 'rpa', 'portalrh.js')], { cwd: ROOT });
  rhProc.stdout.on('data', d => { const l = d.toString(); rhLog.push(l); process.stdout.write(l); });
  rhProc.stderr.on('data', d => { const l = '[ERR] ' + d.toString(); rhLog.push(l); process.stderr.write(l); });
  rhProc.on('close', code => { rhStatus = code === 0 ? 'done' : 'error'; rhProc = null; });
  res.json({ ok: true });
});

router.post('/portalrh/cancel', (req, res) => {
  if (rhProc) { rhProc.kill('SIGTERM'); rhStatus = 'idle'; rhProc = null; }
  res.json({ ok: true });
});

router.get('/portalrh/log',    (req, res) => res.json({ status: rhStatus, log: rhLog }));
router.get('/portalrh/status', (req, res) => res.json({ status: rhStatus }));

// ═══ SERVICE DATAINFO ════════════════════════════════════════
router.post('/service/fetch-realizado', fetchRealizado);
router.post('/service/lancar',          lancarRealizado);

// ═══ EASYMOB ═════════════════════════════════════════════════
router.use('/easymob', easymobRouter);

// ═══ ORQUESTRADOR / AUTOMAÇÕES ══════════════════════════════
router.use('/automation', automationRouter);

module.exports = router;
