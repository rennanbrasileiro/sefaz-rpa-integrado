// lib/timeHelpers.js
function isHHMM(s) { return /^(\d{1,2}):(\d{2})$/.test(String(s||'').trim()); }

function timeToMinutes(s) {
  s = String(s||'').trim();
  if(!isHHMM(s)) return null;
  const [h,m] = s.split(':').map(Number);
  if(h<0||h>23||m<0||m>59) return null;
  return h*60+m;
}

function minutesToTime(t) {
  t = Math.max(0, Math.min(1439, Math.round(t)));
  return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
}

function minutesToDuration(m) {
  m = Math.round(Math.abs(m));
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

/**
 * Parseia texto bruto do portal de ponto ou do Service.
 * Aceita múltiplos formatos:
 *  1. "Data: 29/01/2026, Horas Trabalhadas no Dia: 08:02"  (portal de ponto)
 *  2. "Data do Realizado: 27/03/2026, Total de Realizado Lançado: 7:55 - Total Registrado em Batidas de Ponto: 07:55" (Service)
 *  3. "Data: 27/03/2026, Horas Trabalhadas no Dia: 7:55" (misto)
 */
function parseHorasLog(raw) {
  const map = new Map();
  const text = raw || '';

  // Padrão 1: portal de ponto padrão
  const re1 = /Data:\s*(\d{2}\/\d{2}\/\d{4}),\s*Horas Trabalhadas no Dia:\s*(\d{1,2}:\d{2})/g;
  for(const m of text.matchAll(re1)) {
    const min = timeToMinutes(m[2]);
    if(min !== null) map.set(m[1], (map.get(m[1])||0) + min);
  }

  // Padrão 2: Service "Total Registrado em Batidas de Ponto"
  if(!map.size) {
    const re2 = /Data do Realizado:\s*(\d{2}\/\d{2}\/\d{4}),.*?Total Registrado em Batidas de Ponto:\s*(\d{1,2}:\d{2})/g;
    for(const m of text.matchAll(re2)) {
      const min = timeToMinutes(m[2]);
      if(min !== null) map.set(m[1], (map.get(m[1])||0) + min);
    }
  }

  // Padrão 3: Service "Total de Realizado Lançado"
  if(!map.size) {
    const re3 = /Data do Realizado:\s*(\d{2}\/\d{2}\/\d{4}),\s*Total de Realizado Lançado:\s*(\d{1,2}:\d{2})/g;
    for(const m of text.matchAll(re3)) {
      const min = timeToMinutes(m[2]);
      if(min !== null) map.set(m[1], (map.get(m[1])||0) + min);
    }
  }

  return map;
}

/**
 * Calcula saldo e gera linhas de schedule.
 * Quando fixedMin=0 e baseStart=08:00, aplica pausa de almoço (12:00-13:00)
 * gerando blocos manhã e tarde corretamente.
 * @param {string} raw - texto bruto
 * @param {string} baseStart - hora de início (default '08:00')  
 * @param {string} fixed - horas fixas já apontadas (default '06:00')
 */
function calcSaldoFromLog(raw, baseStart='08:00', fixed='06:00') {
  const bsMin  = timeToMinutes(baseStart) ?? 480;  // 08:00
  const fixMin = timeToMinutes(fixed) ?? 0;

  const map = parseHorasLog(raw);
  if(!map.size) return [];

  return [...map.entries()]
    .sort((a,b)=>{ 
      const p=s=>{const[d,m,y]=s.split('/').map(Number);return new Date(y,m-1,d);}; 
      return p(a[0])-p(b[0]); 
    })
    .map(([date, workedMin]) => {
      const saldo = Math.max(0, workedMin - fixMin);

      // Se fixedMin=0 (horas apontadas=00:00), calcula início/fim com almoço
      let horaInicio, horaFim;
      if(fixMin === 0) {
        // Aplica pausa almoço (12:00–13:00 = 60min) se o dia for >= 7h
        const ALMOCO_MIN  = 12*60; // 12:00
        const ALMOCO_DUR  = 60;    // 1h
        // Manhã: bsMin até 12:00
        const manha = ALMOCO_MIN - bsMin;
        // Total do dia inclui o almoço no cálculo do término
        horaInicio = minutesToTime(bsMin);
        horaFim    = minutesToTime(bsMin + workedMin + (workedMin >= manha ? ALMOCO_DUR : 0));
      } else {
        horaInicio = minutesToTime(bsMin);
        horaFim    = minutesToTime(bsMin + saldo);
      }

      return {
        data: date,
        trabalhado: minutesToDuration(workedMin),
        saldo:      minutesToDuration(saldo),
        horaInicio,
        horaFim,
        duracao:    minutesToDuration(saldo || workedMin),
      };
    });
}

/**
 * Distribui minutos entre N projetos.
 * Quando baseStartMin fornecido, aplica pausa de almoço automaticamente.
 */
function distribuirHoras(totalMin, projectValues, baseStartMin=null) {
  const n = projectValues.length; if(!n) return [];
  const per = Math.floor(totalMin/n), rem = totalMin - per*n;

  const ALMOCO_INICIO = 12*60; // 12:00
  const ALMOCO_FIM    = 13*60; // 13:00

  let cursor = baseStartMin;
  return projectValues.map((pv, i) => {
    const mins = per + (i < rem ? 1 : 0);
    let hi = null, hf = null;
    if(cursor !== null) {
      hi = minutesToTime(cursor);
      let end = cursor + mins;
      // Pula o intervalo de almoço se passar por ele
      if(cursor < ALMOCO_INICIO && end > ALMOCO_INICIO) {
        end += (ALMOCO_FIM - ALMOCO_INICIO);
      } else if(cursor >= ALMOCO_INICIO && cursor < ALMOCO_FIM) {
        cursor = ALMOCO_FIM; // começa depois do almoço
        hi = minutesToTime(cursor);
        end = cursor + mins;
      }
      hf = minutesToTime(end);
      cursor = end;
      // Se o próximo começa dentro do almoço, pula para 13h
      if(cursor > ALMOCO_INICIO && cursor < ALMOCO_FIM) cursor = ALMOCO_FIM;
    }
    return { projectValue: pv, duracao: minutesToDuration(mins), horaInicio: hi, horaFim: hf };
  });
}

module.exports = { isHHMM, timeToMinutes, minutesToTime, minutesToDuration, parseHorasLog, calcSaldoFromLog, distribuirHoras };
