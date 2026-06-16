// routes/validation.js — auditoria operacional dos fluxos 1.1.0
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const stateStore = require('../lib/stateStore');
const { buildDailyPlan } = require('../lib/easymobDailyPlan');

const router = express.Router();
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AUTO_CFG = path.join(DATA_DIR, 'automation.json');
const USER_CFG = path.join(ROOT, 'userconfig.json');

function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback; } catch { return fallback; }
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function add(list, section, status, title, detail = '', action = '') {
  list.push({ section, status, title, detail, action });
}
function isOk(status) { return status === 'ok' || status === 'info'; }
function hhmm(raw) {
  const m = /(\d{1,2}:\d{2})(?::\d{2})?/.exec(String(raw || ''));
  return m ? m[1].padStart(5, '0') : '';
}
function todayMarks(state) {
  const e = state.easymob || {};
  const plan = e.dailyPlan || e.lastPlan || {};
  const marks = e.marksToday?.length ? e.marksToday : (plan.marks || []);
  return Array.isArray(marks) ? marks : [];
}
function readAutomationLogTail() {
  const file = path.join(ROOT, 'logs', 'automation.log');
  try { return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8').split(/\r?\n/).slice(-80).join('\n') : ''; } catch { return ''; }
}
function readEasyLogTail() {
  const dir = path.join(ROOT, 'easymob', 'logs');
  try {
    if (!fs.existsSync(dir)) return '';
    const files = fs.readdirSync(dir).filter(f => /\.log$/i.test(f)).map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    if (!files.length) return '';
    return fs.readFileSync(path.join(dir, files[0].f), 'utf-8').split(/\r?\n/).slice(-120).join('\n');
  } catch { return ''; }
}
function schedulerStatus() {
  const taskName = 'SEFAZ RPA EasyMOB Watchdog';
  const payload = { taskName, installed: false, status: process.platform === 'win32' ? 'NotFound' : 'Unsupported', command: `schtasks.exe /Query /TN "${taskName}" /FO LIST /V`, stdout: '', stderr: '', exitCode: null };
  if (process.platform !== 'win32') { payload.stderr = 'Validação de tarefa Windows disponível apenas no Windows.'; payload.exitCode = -1; return payload; }
  const result = spawnSync('schtasks.exe', ['/Query', '/TN', taskName, '/FO', 'LIST', '/V'], { encoding: 'utf-8' });
  payload.stdout = String(result.stdout || '');
  payload.stderr = String(result.stderr || '');
  payload.exitCode = result.status ?? 0;
  payload.installed = result.status === 0;
  payload.status = payload.installed ? 'Installed' : 'NotFound';
  return payload;
}

function validateAll() {
  const state = stateStore.readState();
  const pending = stateStore.readPending().filter(p => p.status !== 'closed');
  const userCfg = readJson(USER_CFG, {});
  const autoCfg = readJson(AUTO_CFG, {});
  const checks = [];
  const e = state.easymob || {};
  const routine = e.routine || {};
  const marks = todayMarks(state);
  const markTimes = marks.map(hhmm).filter(Boolean);
  const op = e.operationalMode || e.dailyPlan?.operationalMode || {};
  const builtPlan = buildDailyPlan({ marks, config: { date: state.today, easyTimes: routine.times || userCfg.easyTimes || ['08:00','12:00','13:00','17:00'], easyDailyTargetMinutes: userCfg.easyDailyTargetMinutes || 480, easyLunchMinutes: userCfg.easyLunchMinutes || 60, easyDuplicateToleranceMinutes: userCfg.easyDuplicateToleranceMinutes || 10 }, operationalMode: op });

  add(checks, 'EasyMOB', marks.length >= 4 ? 'ok' : marks.length ? 'warn' : 'error', 'Marcações do dia', marks.length ? `${marks.length} marcação(ões): ${markTimes.join(' · ')}` : 'Nenhuma marcação de hoje no estado central.', 'Consultar EasyMOB em TESTE para atualizar o dia.');
  add(checks, 'EasyMOB', builtPlan.timeline?.length === 4 ? 'ok' : 'error', 'Plano diário de 4 janelas', `${builtPlan.status || '--'} · próxima=${builtPlan.nextAction || '--'} · horário=${builtPlan.nextDue || '--'}`, 'O painel deve usar dailyPlan/timeline normalizado, não o lastPlan bruto do runner.');
  add(checks, 'EasyMOB', marks.length >= 4 && builtPlan.status === 'completed' ? 'ok' : (marks.length >= 4 ? 'error' : 'info'), 'Conclusão do dia', marks.length >= 4 ? `Esperado: completed/none. Atual: ${builtPlan.status}/${builtPlan.nextAction}` : 'Dia ainda não possui 4 marcações.', 'Quando houver 4 marcações, bloquear nova gravação e mostrar Próxima ação: Nenhuma.');
  add(checks, 'EasyMOB', routine.dryRun === false ? 'warn' : 'ok', 'Modo da rotina', routine.dryRun === false ? 'Rotina está em REAL. Correto se houver autorização diária e monitoramento.' : 'Rotina em TESTE.', 'REAL deve expirar diariamente e só gravar se o plano permitir.');
  add(checks, 'EasyMOB', op.executionMode === 'real' && op.willWrite && marks.length >= 4 ? 'warn' : 'ok', 'Gravação e dia concluído', `execution=${op.executionMode || routine.mode || '--'} · willWrite=${op.willWrite === true}`, 'Mesmo com REAL autorizado, o front deve mostrar NÃO GRAVA quando o dia já está concluído.');

  const easyLog = readEasyLogTail();
  add(checks, 'Logs', easyLog ? 'ok' : 'warn', 'Log EasyMOB', easyLog ? 'Log encontrado.' : 'Nenhum log EasyMOB encontrado.', 'Executar consulta/teste para gerar log.');
  add(checks, 'Logs', /Registro confirmado pela reconsulta/i.test(easyLog) ? 'ok' : 'info', 'Confirmação pós-registro', /Registro confirmado pela reconsulta/i.test(easyLog) ? 'Último log confirma reconsulta após registro.' : 'Sem confirmação recente no último log lido.', 'Em REAL, sempre reconsultar antes/depois do clique.');
  add(checks, 'Logs', /Não vou registrar duplicidade|Dia já possui quatro/i.test(easyLog) ? 'ok' : 'info', 'Antiduplicidade', /Não vou registrar duplicidade|Dia já possui quatro/i.test(easyLog) ? 'Último log mostra bloqueio de duplicidade/dia completo.' : 'Sem evidência recente de bloqueio antiduplicidade.', 'Depois de 4 marcações, qualquer ciclo deve consultar e não registrar.');

  const scheduler = schedulerStatus();
  add(checks, 'Windows', exists('scripts/run_easymob_watchdog.bat') ? 'ok' : 'error', 'run_easymob_watchdog.bat', exists('scripts/run_easymob_watchdog.bat') ? 'Arquivo encontrado.' : 'Arquivo ausente.', 'Restaurar script BAT do watchdog.');
  add(checks, 'Windows', exists('scripts/install_easymob_watchdog.ps1') ? 'ok' : 'error', 'install_easymob_watchdog.ps1', exists('scripts/install_easymob_watchdog.ps1') ? 'Arquivo encontrado.' : 'Arquivo ausente.', 'Restaurar instalador do Agendador.');
  add(checks, 'Windows', scheduler.installed ? 'ok' : 'warn', 'Tarefa do Agendador', `${scheduler.status} · exitCode=${scheduler.exitCode}`, 'Instalar tarefa pelo painel ou executar scripts/install_easymob_watchdog.ps1 como usuário com permissão.');

  add(checks, 'Configuração', userCfg.easyUser && userCfg.easyPass && userCfg.easyAccessKey ? 'ok' : 'warn', 'Credenciais EasyMOB', userCfg.easyUser && userCfg.easyPass && userCfg.easyAccessKey ? 'Credenciais salvas.' : 'Credenciais EasyMOB incompletas.', 'Preencher Configurações > EasyMOB e salvar.');
  add(checks, 'Configuração', userCfg.easyHeadless === false || userCfg.easyLivePreview === true ? 'ok' : 'info', 'Observabilidade visual', userCfg.easyHeadless === false ? 'Navegador visível configurado.' : (userCfg.easyLivePreview === true ? 'Live preview ligado.' : 'Headless/sem live preview.'), 'Para acompanhar, usar navegador visível ou live preview.');
  add(checks, 'Channel', pending.length ? 'warn' : 'ok', 'Pendências abertas', pending.length ? `${pending.length} pendência(s) aberta(s).` : 'Sem pendências abertas.', 'Resolver pendências antes de Channel REAL.');
  add(checks, 'Service/Portal RH', userCfg.serviceUser || userCfg.rhUser ? 'info' : 'warn', 'Credenciais auxiliares', `Service=${userCfg.serviceUser ? 'ok' : 'pendente'} · PortalRH=${userCfg.rhUser ? 'ok' : 'pendente'}`, 'Preencher quando for usar conferência/fechamento.');

  const score = checks.filter(c => c.status === 'ok').length;
  const errors = checks.filter(c => c.status === 'error').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const status = errors ? 'error' : warnings ? 'warn' : 'ok';
  return { ok: !errors, status, score, total: checks.length, errors, warnings, generatedAt: new Date().toISOString(), stateToday: state.today, checks, scheduler, automationLogTail: readAutomationLogTail(), easyLogTail: easyLog };
}

router.get('/', (_req, res) => res.json(validateAll()));
router.post('/run', (_req, res) => res.json(validateAll()));

module.exports = router;
