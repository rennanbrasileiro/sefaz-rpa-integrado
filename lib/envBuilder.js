// lib/envBuilder.js
const { DEFAULT_COMENTARIO } = require('./config');

function buildEnvContent(cfg) {
  const {
    user='', pass='', projects=[], hourMode='duracao', useTimeRange=false,
    dateSource='daily', startDate='', endDate='', datesList=[],
    weekdaysOnly=true, excludeDates=[], tz='America/Recife', dryRun=false,
    scheduleRows=[], serviceUser='', servicePass='', useService=false,
    chromePath='',
  } = cfg;

  const pvs = projects.map(p=>p.value).join(',');
  const defAct = projects[0]?.activityValue||'35';
  const defCmt = projects[0]?.comentario||DEFAULT_COMENTARIO;
  const L = (...ls)=>ls.join('\n');

  return L(
    '# Gerado pela interface SEFAZ RPA UI',
    '',
    '# ── CREDENCIAIS JEXPERTS ──────────────────',
    `SEFAZ_USER=${user}`,
    `SEFAZ_PASS=${pass}`,
    '',
    '# ── CREDENCIAIS SERVICE (Datainfo) ────────',
    `SERVICE_USER=${serviceUser||user.split('@')[0]}`,
    `SERVICE_PASS=${servicePass||pass}`,
    `SEFAZ_USE_SERVICE=${useService}`,
    '',
    chromePath ? `CHROME_PATH=${chromePath}` : '# CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '',
    '# ── PROJETOS ───────────────────────────────',
    `SEFAZ_PROJECT_VALUES=${pvs}`,
    '',
    '# ── DURAÇÃO / HORÁRIOS ─────────────────────',
    `SEFAZ_USE_TIME_RANGE=${useTimeRange}`,
    ...projects.flatMap(p=>useTimeRange
      ? [p.horaInicio?`SEFAZ_HORA_INICIO_${p.value}=${p.horaInicio}`:'', p.horaFim?`SEFAZ_HORA_FIM_${p.value}=${p.horaFim}`:'']
      : [p.duracao?`SEFAZ_DURACAO_${p.value}=${p.duracao}`:'']
    ).filter(Boolean),
    '',
    scheduleRows?.length ? 'SEFAZ_SCHEDULE_CSV=schedule.csv' : '# SEFAZ_SCHEDULE_CSV=schedule.csv',
    '',
    '# ── ATIVIDADES ─────────────────────────────',
    `SEFAZ_ACTIVITY_VALUE=${defAct}`,
    ...projects.filter(p=>p.activityValue&&p.activityValue!==defAct).map(p=>`SEFAZ_ACTIVITY_VALUE_${p.value}=${p.activityValue}`),
    '',
    '# ── COMENTÁRIOS ────────────────────────────',
    `SEFAZ_COMENTARIO=${defCmt}`,
    ...projects.filter(p=>p.comentario&&p.comentario!==defCmt).map(p=>`SEFAZ_COMENTARIO_${p.value}=${p.comentario}`),
    '',
    '# ── DATAS ──────────────────────────────────',
    `SEFAZ_TZ=${tz}`,
    `SEFAZ_DATE_SOURCE=${dateSource}`,
    (dateSource==='range'||dateSource==='backfill') ? `SEFAZ_START=${startDate}\nSEFAZ_END=${endDate||'auto'}` : '',
    dateSource==='list'&&datesList.length ? `SEFAZ_DATES=${datesList.join(',')}` : '',
    `SEFAZ_WEEKDAYS_ONLY=${weekdaysOnly}`,
    excludeDates.length ? `SEFAZ_EXCLUDE_DATES=${excludeDates.join(',')}` : '',
    'SEFAZ_DATE_MODE=set',
    '',
    '# ── EXECUÇÃO ────────────────────────────────',
    `SEFAZ_DRY_RUN=${dryRun}`,
    '',
  ).split('\n').filter(l=>l!==undefined).join('\n');
}

function buildScheduleCsv(rows, mode='duracao') {
  if(!rows?.length) return null;
  if(mode==='timerange') {
    const ls=['data,hora_inicio,hora_fim,duracao'];
    for(const r of rows) ls.push(`${r.data},${r.horaInicio||''},${r.horaFim||''},${r.duracao||''}`);
    return ls.join('\n');
  }
  const ls=['data,duracao'];
  for(const r of rows) ls.push(`${r.data},${r.duracao}`);
  return ls.join('\n');
}

module.exports = { buildEnvContent, buildScheduleCsv };
