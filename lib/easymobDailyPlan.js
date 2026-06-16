const DEFAULT_TIMES = ['08:00', '12:00', '13:00', '17:00'];

function boolValue(value, def = false) {
  if (value === undefined || value === null || value === '') return def;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'sim', 's', 'on'].includes(String(value).toLowerCase());
}
function parseTime(value) {
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value || '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}
function minutesToHHMM(total) {
  const safe = Math.max(0, Math.round(Number(total) || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
function normalizeMarks(marks = []) {
  return (Array.isArray(marks) ? marks : [])
    .map(mark => {
      const match = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(String(mark || ''));
      if (!match) return null;
      const minutes = parseTime(match[1]);
      if (minutes === null) return null;
      return { raw: match[1].padStart(match[1].length === 4 ? 5 : match[1].length, '0'), minutes };
    })
    .filter(Boolean)
    .sort((a, b) => a.minutes - b.minutes);
}
function normalizeTimes(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  const valid = values.map(v => String(v || '').trim()).filter(v => /^\d{1,2}:\d{2}$/.test(v)).map(v => minutesToHHMM(parseTime(v)));
  return (valid.length >= 4 ? valid.slice(0, 4) : DEFAULT_TIMES).map(v => ({ label: v, minutes: parseTime(v) }));
}
function approvalFrom(input = {}, now = new Date()) {
  const until = input.easyRealApprovalUntil || input.confirmRealUntil || input.realApproval?.validUntil || '';
  const authorizedFlag = boolValue(input.easyRealApproval ?? input.confirmReal ?? input.realApproval?.status === 'authorized', false);
  const revoked = input.realApproval?.status === 'revoked';
  const valid = Boolean(until) && new Date(until).getTime() > now.getTime();
  let status = 'not_authorized';
  if (revoked) status = 'revoked';
  else if (authorizedFlag && valid) status = 'authorized';
  else if (until && !valid) status = 'expired';
  return { status, validUntil: until || '', authorizedAt: input.realApproval?.authorizedAt || input.authorizedAt || '' };
}
function buildOperationalMode(input = {}, now = new Date()) {
  const environmentMode = ['simulado', 'simulated', 'local', 'mock'].includes(String(input.environmentMode || input.easyMode || input.mode || 'real').toLowerCase()) ? 'simulated' : 'real';
  const requestedDryRun = boolValue(input.easyDryRun ?? input.dryRun, true);
  const executionMode = requestedDryRun ? 'test' : 'real';
  const realApproval = approvalFrom(input, now);
  const willWrite = executionMode === 'real' && realApproval.status === 'authorized';
  const reason = executionMode === 'test'
    ? 'Execução em TESTE: consulta o EasyMOB e simula, mas nunca registra ponto.'
    : (willWrite ? 'Execução REAL autorizada hoje: pode registrar somente se o plano permitir.' : `Execução REAL bloqueada: aprovação diária ${realApproval.status}.`);
  return { environmentMode, executionMode, realApproval, willWrite, reason };
}
function duplicateReason(markObjs, toleranceMinutes) {
  for (let i = 1; i < markObjs.length; i += 1) {
    if (Math.abs(markObjs[i].minutes - markObjs[i - 1].minutes) <= toleranceMinutes) {
      return `Duplicidade suspeita entre ${markObjs[i - 1].raw} e ${markObjs[i].raw}.`;
    }
  }
  return null;
}
function step(key, reference, calculated, status, actual, canExecute, op, reason) {
  return { key, referenceTime: reference.label, calculatedTime: minutesToHHMM(calculated ?? reference.minutes), status, actualMark: actual?.raw || null, canExecute: Boolean(canExecute), willWrite: Boolean(canExecute && op?.willWrite), reason };
}
function buildDailyPlan({ marks = [], config = {}, now = new Date(), operationalMode = null } = {}) {
  const op = operationalMode || buildOperationalMode(config, now);
  const times = normalizeTimes(config.times || config.easyTimes || DEFAULT_TIMES);
  const markObjs = normalizeMarks(marks);
  const markValues = markObjs.map(m => m.raw);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const lunchMinutes = Number(config.lunchMinutes || config.easyLunchMinutes || 60);
  const dailyTargetMinutes = Number(config.dailyTargetMinutes || config.easyDailyTargetMinutes || 480);
  const duplicateToleranceMinutes = Number(config.duplicateToleranceMinutes || config.easyDuplicateToleranceMinutes || 10);
  const dup = duplicateReason(markObjs, duplicateToleranceMinutes);
  const date = (config.date || now.toISOString().slice(0, 10));
  const labels = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida_final'];

  if (dup) {
    return { date, marks: markValues, status: 'blocked', currentStep: 'blocked', nextAction: null, nextDue: null, timeline: labels.map((key, i) => step(key, times[i], times[i].minutes, markObjs[i] ? 'done' : 'blocked', markObjs[i], false, op, markObjs[i] ? `Marcação registrada às ${markObjs[i].raw}.` : dup)), blockingReason: dup, recommendation: 'Conferir marcações no EasyMOB/Portal RH antes de qualquer execução REAL.', operationalMode: op };
  }
  if (markObjs.length >= 4) {
    return { date, marks: markValues, status: 'completed', currentStep: 'completed', nextAction: null, nextDue: null, timeline: labels.map((key, i) => step(key, times[i], times[i].minutes, 'done', markObjs[i], false, op, `${key} registrada às ${markObjs[i]?.raw || '--'}.`)), blockingReason: null, recommendation: 'Dia concluído com 4 marcações válidas. Nenhuma nova execução será sugerida.', operationalMode: op };
  }

  const timeline = [];
  let status = 'awaiting_entry';
  let currentStep = 'awaiting_entry';
  let nextAction = 'entrada';
  let nextDue = times[0].label;
  let blockingReason = null;
  let recommendation = `Próxima conferência às ${nextDue}.`;

  const entrada = markObjs[0] || null;
  const saidaAlmoco = markObjs[1] || null;
  const retorno = markObjs[2] || null;
  const entradaReady = nowMinutes >= times[0].minutes;
  timeline.push(step('entrada', times[0], times[0].minutes, entrada ? 'done' : (entradaReady ? 'ready' : 'pending'), entrada, !entrada && entradaReady, op, entrada ? `Entrada já registrada às ${entrada.raw}.` : 'Aguardando marcação de entrada.'));
  if (!entrada) {
    return { date, marks: markValues, status, currentStep, nextAction, nextDue, timeline: completeFuture(timeline, times, op, 1), blockingReason, recommendation, operationalMode: op };
  }

  status = 'in_progress'; currentStep = 'awaiting_lunch_out'; nextAction = 'saida_almoco'; nextDue = times[1].label;
  const lunchOutReady = nowMinutes >= times[1].minutes;
  timeline.push(step('saida_almoco', times[1], times[1].minutes, saidaAlmoco ? 'done' : (lunchOutReady ? 'ready' : 'pending'), saidaAlmoco, !saidaAlmoco && lunchOutReady, op, saidaAlmoco ? `Saída de almoço registrada às ${saidaAlmoco.raw}.` : 'Aguardando horário de saída para almoço.'));
  if (!saidaAlmoco) return { date, marks: markValues, status, currentStep, nextAction, nextDue, timeline: completeFuture(timeline, times, op, 2), blockingReason, recommendation: `Próxima conferência às ${nextDue}.`, operationalMode: op };

  currentStep = 'awaiting_lunch_return'; nextAction = 'retorno_almoco';
  const returnCalc = Math.max(times[2].minutes, saidaAlmoco.minutes + lunchMinutes);
  nextDue = minutesToHHMM(returnCalc);
  const returnReady = nowMinutes >= returnCalc;
  timeline.push(step('retorno_almoco', times[2], returnCalc, retorno ? 'done' : (returnReady ? 'ready' : 'pending'), retorno, !retorno && returnReady, op, retorno ? `Retorno de almoço registrado às ${retorno.raw}.` : `Respeita intervalo mínimo de ${lunchMinutes} min.`));
  if (!retorno) return { date, marks: markValues, status, currentStep, nextAction, nextDue, timeline: completeFuture(timeline, times, op, 3), blockingReason, recommendation: `Aguardar retorno calculado às ${nextDue}.`, operationalMode: op };

  currentStep = 'awaiting_final_out'; nextAction = 'saida_final';
  const morning = Math.max(0, saidaAlmoco.minutes - entrada.minutes);
  const remaining = Math.max(0, dailyTargetMinutes - morning);
  const finalCalc = Math.max(times[3].minutes, retorno.minutes + remaining);
  nextDue = minutesToHHMM(finalCalc);
  const finalReady = nowMinutes >= finalCalc;
  timeline.push(step('saida_final', times[3], finalCalc, finalReady ? 'ready' : 'pending', null, finalReady, op, `Manhã ${minutesToHHMM(morning)}; restante ${minutesToHHMM(remaining)} para meta diária.`));
  return { date, marks: markValues, status, currentStep, nextAction, nextDue, timeline, blockingReason, recommendation: finalReady ? 'Saída final pronta; reconsultar antes de agir.' : `Aguardar saída final calculada às ${nextDue}.`, operationalMode: op };
}
function completeFuture(timeline, times, op, startIndex) {
  const keys = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida_final'];
  for (let i = startIndex; i < keys.length; i += 1) timeline.push(step(keys[i], times[i], times[i].minutes, 'future', null, false, op, i === 2 ? 'Depende da saída de almoço.' : i === 3 ? 'Depende do retorno de almoço e da meta diária.' : 'Depende da etapa anterior.'));
  return timeline;
}

module.exports = { buildOperationalMode, buildDailyPlan, normalizeMarks, DEFAULT_TIMES };
