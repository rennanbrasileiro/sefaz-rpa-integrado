const fs = require('fs');
const path = require('path');

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
function defaultState() {
  const d = new Date();
  return {
    updatedAt: nowIso(),
    today: todayIso(),
    week: weekLabel(d),
    month: d.toISOString().slice(0, 7),
    easymob: { marksToday: [], nextAction: null, plannedTime: null, lastExecution: null, watchdog: { status: 'idle' } },
    service: { lastStatus: 'idle', period: null, summary: null },
    portalRh: { lastStatus: 'idle', period: null, summary: null },
    channel: { lastStatus: 'idle', period: null, blockingPendencies: [] },
    pending: [],
  };
}
function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : fallback; } catch { return fallback; }
}
function readState() { ensureDataDir(); return { ...defaultState(), ...readJson(STATE_PATH, {}) }; }
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

module.exports = { DATA_DIR, STATE_PATH, JOURNAL_PATH, PENDING_PATH, readState, updateState, appendJournal, readJournal, readPending, addPending, writePending };
