// routes/safeAutomationGuard.js — proteção operacional contra ciclos repetitivos
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const ROOT = path.join(__dirname, '..');
const AUTO_CFG = path.join(ROOT, 'data', 'automation.json');

function readCfg() {
  try { return JSON.parse(fs.readFileSync(AUTO_CFG, 'utf-8')); } catch { return {}; }
}
function writeCfg(cfg) {
  fs.mkdirSync(path.dirname(AUTO_CFG), { recursive: true });
  fs.writeFileSync(AUTO_CFG, JSON.stringify(cfg, null, 2), 'utf-8');
}
function normalize(cfg = {}) {
  const easy = cfg.easyMob || {};
  const interval = Math.max(300, Number(cfg.checkEverySeconds || 300));
  const windowMinutes = Math.min(8, Math.max(3, Number(easy.windowMinutes || 5)));
  const minRetrySeconds = Math.max(900, Number(easy.minRetrySeconds || 900));
  return {
    ...cfg,
    checkEverySeconds: interval,
    easyMob: {
      ...easy,
      windowMinutes,
      minRetrySeconds,
      maxAttemptsPerWindow: 1,
    },
  };
}

router.post('/config', (req, _res, next) => {
  if (!req.body || !req.body.easyMob) return next();
  req.body = normalize(req.body);
  return next();
});

router.post('/start', (_req, _res, next) => {
  const cfg = normalize(readCfg());
  writeCfg(cfg);
  return next();
});

router.get('/guard/status', (_req, res) => {
  const cfg = normalize(readCfg());
  res.json({
    ok: true,
    guard: 'enabled',
    policy: 'evita ciclos repetitivos: intervalo minimo 300s, janela curta, uma tentativa por alvo',
    checkEverySeconds: cfg.checkEverySeconds,
    easyMob: {
      windowMinutes: cfg.easyMob?.windowMinutes,
      minRetrySeconds: cfg.easyMob?.minRetrySeconds,
      maxAttemptsPerWindow: cfg.easyMob?.maxAttemptsPerWindow,
    },
  });
});

module.exports = router;
