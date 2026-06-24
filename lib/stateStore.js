const fs = require('fs');
const path = require('path');
const { buildDailyPlan, buildOperationalMode } = require('./easymobDailyPlan');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const JOURNAL_PATH = path.join(DATA_DIR, 'journal.jsonl');
const PENDING_PATH = path.join(DATA_DIR, 'pending-actions.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function weekLabel(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function defaultDayEntry(date = todayIso()) {
  return { date, marks: [], planned: null, realized: null, estimatedBalance: null, status: 'sem_consulta', serviceReflected: false, portalRhReflected: false, channelPosted: false, pendencies: [], needsAdjustment: false };
}
function currentCalendar() {
  const d = new Date();
  return { today: todayIso(), week: weekLabel(d), month: d.toISOString().slice(0, 7) };
}
function defaultState() {
  const cal = currentCalendar();
  return {
    updatedAt: nowIso(),
    today: cal.today,
    week: cal.week,
    month: cal.month,
    stale: false,
    easymob: { marksToday: [], nextAction: null, plannedTime: null, lastExecution: null, lastError: null, lastPlan: null, dailyPlan: null, operationalMode: null, dayStatus: 'sem_consulta', routine: { enabled: false, dryRun: true, times: [], nextCheck: null, waitingUntil: null, confirmRealUntil: '' }, watchdog: { status: 'idle' } },
    service: { lastStatus: 'idle', period: null, summary: null },
    portalRh: { lastStatus: 'idle', period: null, summary: null },
    channel: { lastStatus: 'idle', period: null, blockingPendencies: [] },
    monthly: { days: { [cal.today]: defaultDayEntry(cal.today) }, updatedAt: nowIso() },
    windowsScheduler: { installed: false, status: 'unknown', taskName: 'SEFAZ RPA EasyMOB Watchdog', lastCheckedAt: null },
    pending: [],
  };
}
function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback; } catch { return fallback; }
}
function parseMarkMinutes(raw) {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(raw || ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}
function todayBrFromIso(iso = todayIso()) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function marksForToday(candidates = [], iso = todayIso()) {
  const todayBr = todayBrFromIso(iso);
  return (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .filter(mark => !/\d{2}\/\d{2}\/\d{4}/.test(String(mark)) || String(mark).includes(todayBr))
    .sort((a, b) => (parseMarkMinutes(a) ?? 0) - (parseMarkMinutes(b) ?? 0));
}
function planPriority(plan = {}) {
  if (!plan) return 0;
  const status = String(plan.status || '').toLowerCase();
  if (status === 'completed' || status === 'complete') return 100;
  if (Array.isArray(plan.timeline) && plan.timeline.length >= 4) return 50 + (plan.marks || []).length;
  if (Array.isArray(plan.marks)) return plan.marks.length;
  return 0;
}
function normalizeEasyMobState(state) {
  const e = { ...(state.easymob || {}) };
  const routine = e.routine || {};
  const lastPlan = e.lastPlan || null;
  const rawMarks = marksForToday(e.marksToday?.length ? e.marksToday : (lastPlan?.marks || e.dailyPlan?.marks || []), state.today);
  const op = buildOperationalMode({
    easyMode: routine.mode || lastPlan?.mode || 'real',
    easyDryRun: routine.dryRun !== false,
    dryRun: routine.dryRun !== false,
    confirmReal: routine.confirmReal === true,
    easyRealApprovalUntil: routine.confirmRealUntil || e.operationalMode?.realApproval?.validUntil || '',
    realApproval: e.operationalMode?.realApproval,
  });
  let built = null;
  if (rawMarks.length) {
    built = buildDailyPlan({
      marks: rawMarks,
      config: {
        date: state.today,
        easyTimes: routine.times || lastPlan?.configured_times || ['08:00', '12:00', '13:00', '17:00'],
        easyDailyTargetMinutes: lastPlan?.daily_target_minutes || 480,
        easyLunchMinutes: lastPlan?.lunch_minutes || 60,
        easyDuplicateToleranceMinutes: routine.duplicateToleranceMinutes || 10,
      },
      operationalMode: op,
    });
  }
  const current = e.dailyPlan || null;
  const finalPlan = planPriority(built) >= planPriority(current) ? built : current;
  const marksToday = rawMarks.length ? rawMarks : (Array.isArray(finalPlan?.marks) ? finalPlan.marks : []);
  const dayCompleted = finalPlan?.status === 'completed' || String(lastPlan?.status || '').toUpperCase() === 'COMPLETE' || marksToday.length >= 4;
  const nextAction = dayCompleted ? 'none' : (finalPlan?.nextAction || e.nextAction || lastPlan?.action || null);
  const plannedTime = dayCompleted ? null : (finalPlan?.nextDue || e.plannedTime || lastPlan?.next_due || null);
  const nextEasy = {
    ...e,
    marksToday,
    operationalMode: op,
    dailyPlan: finalPlan || current,
    dayStatus: dayCompleted ? 'completed' : (finalPlan?.status || e.dayStatus || 'sem_consulta'),
    nextAction,
    plannedTime,
    routine,
  };
  if (state.monthly?.days?.[state.today]) {
    state.monthly.days[state.today] = {
      ...state.monthly.days[state.today],
      marks: marksToday,
      status: nextEasy.dayStatus,
      needsAdjustment: false,
      planned: finalPlan || null,
      realized: lastPlan || null,
    };
  }
  state.easymob = nextEasy;
  return state;
}
function freshenState(raw = {}) {
  const base = defaultState();
  const state = { ...base, ...(raw || {}) };
  const cal = currentCalendar();
  const stale = state.today !== cal.today;
  state.today = cal.today; state.week = cal.week; state.month = cal.month;
  state.monthly = { ...(base.monthly || {}), ...(state.monthly || {}) };
  state.monthly.days = { ...((base.monthly || {}).days || {}), ...((state.monthly || {}).days || {}) };
  if (!state.monthly.days[cal.today]) state.monthly.days[cal.today] = defaultDayEntry(cal.today);
  if (stale) {
    const old = state.easymob || {};
    state.stale = true;
    state.staleReason = `Estado operacional reiniciado para ${cal.today}; histórico anterior permanece no journal.`;
    state.easymob = { ...base.easymob, routine: old.routine || base.easymob.routine, watchdog: { ...(old.watchdog || {}), status: 'stale_new_day' }, lastError: 'Estado antigo ocultado: faça consulta EasyMOB de hoje.' };
  } else {
    state.stale = Boolean(state.stale);
    normalizeEasyMobState(state);
  }
  return state;
}
function readState() { ensureDataDir(); return freshenState(readJson(STATE_PATH, {})); }
function writeState(next) {
  ensureDataDir();
  const state = { ...defaultState(), ...(next || {}), updatedAt: nowIso() };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  return state;
}
function updateState(patch = {}) {
  const state = readState();
  const next = { ...state, ...patch };
  for (const key of ['easymob', 'service', 'portalRh', 'channel']) {
    if (patch[key]) next[key] = { ...(state[key] || {}), ...patch[key] };
  }
  return writeState(next);
}
function readPending() {
  ensureDataDir();
  const list = readJson(PENDING_PATH, []);
  return Array.isArray(list) ? list : [];
}
function writePending(list) {
  ensureDataDir();
  fs.writeFileSync(PENDING_PATH, JSON.stringify(list || [], null, 2), 'utf-8');
  updateState({ pending: list || [] });
}
function addPending(item = {}) {
  const pending = readPending();
  const entry = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: nowIso(), status: 'open', severity: 'warning', ...item };
  pending.push(entry);
  writePending(pending);
  return entry;
}
function resolvePending(id, resolution = 'Resolvida pelo operador') {
  const pending = readPending();
  const next = pending.map(item => String(item.id) === String(id) ? { ...item, status: 'closed', resolvedAt: nowIso(), resolution } : item);
  writePending(next);
  appendJournal({ module: 'easymob', action: 'pendencia_resolvida', status: 'closed', severity: 'info', reason: resolution, pendingId: id });
  return next.find(item => String(item.id) === String(id)) || null;
}
function appendJournal(event = {}) {
  ensureDataDir();
  const payload = { at: nowIso(), severity: event.severity || 'info', ...event };
  fs.appendFileSync(JOURNAL_PATH, JSON.stringify(payload) + '\n', 'utf-8');
  return payload;
}
function readJournal(limit = 80) {
  ensureDataDir();
  if (!fs.existsSync(JOURNAL_PATH)) return [];
  return fs.readFileSync(JOURNAL_PATH, 'utf-8').split(/\r?\n/).filter(Boolean).slice(-limit).map(line => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}

module.exports = { DATA_DIR, STATE_PATH, JOURNAL_PATH, PENDING_PATH, readState, updateState, appendJournal, readJournal, readPending, addPending, resolvePending, writePending, defaultDayEntry };