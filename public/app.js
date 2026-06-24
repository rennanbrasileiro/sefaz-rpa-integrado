let catalog = { projects: [], activityTypes: [] };
let projects = [];
const $ = (id) => document.getElementById(id);
const val = (id) => ($(id)?.value ?? '').trim();
const set = (id, v) => { if ($(id)) $(id).value = v ?? ''; };
const bool = (id) => val(id) === 'true';
const splitCsv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

async function api(url, opts = {}) {
  const r = await fetch('/api' + url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const t = await r.text(); let j = {};
  try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || j.message || j.raw || r.statusText);
  return j;
}
function toast(msg,type='ok'){
  console.log(msg);
  const host=$('toastHost');
  if(!host) return;
  const el=document.createElement('div');
  el.className='toast '+type;
  el.textContent=msg;
  host.appendChild(el);
  setTimeout(()=>{ el.classList.add('hide'); setTimeout(()=>el.remove(),260); },4200);
}
function askConfirm(message,{title='Confirmar ação', ok='Confirmar', danger=true}={}){
  return new Promise(resolve=>{
    const modal=$('confirmModal'), text=$('confirmText'), titleEl=$('confirmTitle'), okBtn=$('confirmOk'), cancelBtn=$('confirmCancel');
    if(!modal||!text||!okBtn||!cancelBtn){ resolve(false); return; }
    titleEl.textContent=title; text.textContent=message; okBtn.textContent=ok;
    okBtn.className='btn '+(danger?'danger':'primary'); modal.classList.remove('hidden');
    const done=(v)=>{ modal.classList.add('hidden'); okBtn.onclick=null; cancelBtn.onclick=null; resolve(v); };
    okBtn.onclick=()=>done(true); cancelBtn.onclick=()=>done(false);
  });
}
function endOfTodayIso(){ const d=new Date(); d.setHours(23,59,59,999); return d.toISOString(); }
function isApprovalValid(until){ return Boolean(until) && new Date(until).getTime() > Date.now(); }
function approvalSummary(until){ return isApprovalValid(until) ? `Autorizado até ${new Date(until).toLocaleString('pt-BR')}` : 'REAL não autorizado hoje'; }
function setBusy(id,busy=true){ const el=$(id); if(el) el.classList.toggle('loading',busy); }
function currentDay(){ return new Date().toISOString().slice(0,10); }
function isStateStale(state){ return !state?.today || state.today !== currentDay() || state.stale === true; }
function hhmmToMin(s){ const m=/^(\d{1,3}):(\d{2})/.exec(String(s||'').trim()); return m?Number(m[1])*60+Number(m[2]):null; }
function minToHHMM(n){ n=Math.max(0,Math.round(Number(n)||0)); return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); }
function json(x){ return JSON.stringify(x,null,2); }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }

function nav(id){
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.nav===id));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+id));
  const title={dashboard:['Visão geral','Módulos separados, fluxo único.'],settings:['Configurações','Credenciais e parâmetros fixos.'],calculator:['Calculadora mensal','Compensação e meta de horas.'],easymob:['1. EasyMOB','Origem diária do ponto.'],service:['2. Service','Consulta do realizado.'],portalrh:['3. Portal RH','Espelho, frequência e acerto.'],channel:['4. Channel','Checklist semanal por projeto.'],automation:['Orquestrador','Automação segura.'],logs:['Logs e tela ao vivo','Acompanhamento das execuções.'],diagnostic:['Diagnóstico','Mapeamento de tela e seletores.'],map:['Mapa dos processos','Como cada módulo se encaixa.']}[id]||['',''];
  $('pageTitle').textContent=title[0]; $('pageSub').textContent=title[1];
}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));
setInterval(()=>{$('clock').textContent=new Date().toLocaleString('pt-BR')},1000);

function config(){ return {
  user:val('user'), pass:val('pass'), chromePath:val('chromePath'), tz:val('tz')||'America/Recife',
  serviceUser:val('serviceUser'), servicePass:val('servicePass'),
  rhUser:val('rhUser'), rhPass:val('rhPass'), portalRhUrl:val('portalRhUrl'), portalRhReportUrl:val('portalRhReportUrl'),
  easyMode:val('easyMode')||'real', easySiteLogin:val('easySiteLogin'), easyAccessKey:val('easyAccessKey'), easyUser:val('easyUser'), easyPass:val('easyPass'),
  easyDryRun:bool('easyDryRun'), easyHeadless:bool('easyHeadless'), easySlowmo:val('easySlowmo')||'700', easyTimes:val('easyTimes')||'08:00,12:00,13:00,17:00', easyRealApproval:bool('easyRealApproval'), easyRealApprovalUntil:bool('easyRealApproval')?endOfTodayIso():'',
  easyDailyTargetMinutes:val('easyDailyTargetMinutes')||'480', easyLunchMinutes:val('easyLunchMinutes')||'60', easyDuplicateToleranceMinutes:val('easyDuplicateToleranceMinutes')||'10', easyRetryMinutes:val('easyRetryMinutes')||'20',
  easyScreenshotPolicy:val('easyScreenshotPolicy')||'error', easyLivePreview:bool('easyLivePreview'), easyKeepLastScreenshots:val('easyKeepLastScreenshots')||'10', easyKeepBrowserOpen:bool('easyKeepBrowserOpen'),
  easyBtnLogin:val('easyBtnLogin'), easyBtnRegister:val('easyBtnRegister'), easyBtnConsult:val('easyBtnConsult'),
  projects, useTimeRange:false, dryRun:true, dateSource:val('dateSource')||'range', startDate:val('startDate'), endDate:val('endDate'), weekdaysOnly:true,
  scheduleRows: parseScheduleText()
};}
function applyConfig(c={}){
  ['user','pass','chromePath','tz','serviceUser','servicePass','rhUser','rhPass','portalRhUrl','portalRhReportUrl','easyMode','easySiteLogin','easyAccessKey','easyUser','easyPass','easySlowmo','easyTimes','easyDailyTargetMinutes','easyLunchMinutes','easyDuplicateToleranceMinutes','easyRetryMinutes','easyScreenshotPolicy','easyKeepLastScreenshots','easyBtnLogin','easyBtnRegister','easyBtnConsult','dateSource','startDate','endDate'].forEach(k=>set(k,c[k]));
  set('easyDryRun',String(c.easyDryRun!==false));
  set('easyRunDry',String(c.easyDryRun!==false));
  set('easyHeadless',String(c.easyHeadless!==true?false:true));
  set('easyRunHeadless',String(c.easyHeadless!==true?false:true));
  set('easyRealApproval',String(isApprovalValid(c.easyRealApprovalUntil)));
  set('easyApprovalStatus',approvalSummary(c.easyRealApprovalUntil));
  set('easyLivePreview',String(c.easyLivePreview===true)); set('easyKeepBrowserOpen',String(c.easyKeepBrowserOpen===true));
  projects=Array.isArray(c.projects)?c.projects:[]; renderProjects();
}
async function saveAll(){ const c=config(); localStorage.setItem('sefazRpaCfg110',JSON.stringify(c)); await api('/config/save',{method:'POST',body:JSON.stringify(c)}); set('easyApprovalStatus',approvalSummary(c.easyRealApprovalUntil)); toast('Configuração salva.'); }
async function loadAll(){ let c=null; try{ const r=await api('/config/load'); c=r.config; }catch{} if(!c) c=JSON.parse(localStorage.getItem('sefazRpaCfg110')||'null'); if(c) applyConfig(c); }

function renderProjectSelect(){ const s=$('projectSelect'); if(!s)return; s.innerHTML='<option value="">Selecione projeto</option>'+catalog.projects.map(p=>`<option value="${p.value}">${p.value} — ${p.label}</option>`).join(''); }
function addProject(){ const pv=val('projectSelect'); if(!pv)return; if(projects.some(p=>String(p.value)===pv))return; const found=catalog.projects.find(p=>String(p.value)===pv)||{value:pv,label:pv}; projects.push({ value:found.value, label:found.label, activityValue:'35', duracao:'02:40', horaInicio:'08:00', horaFim:'10:00', comentario: catalog.defaultComentario || 'Atividades de gestão, acompanhamento e facilitação.' }); renderProjects(); }
function removeProject(i){ projects.splice(i,1); renderProjects(); }
function renderProjects(){ const el=$('projects'); if(!el)return; if(!projects.length){el.innerHTML='<div class="alert warn">Nenhum projeto configurado para o Channel.</div>';return;} el.innerHTML=projects.map((p,i)=>`<div class="project"><div class="title"><div><span class="badge">${p.value}</span> ${p.label||''}</div><button class="btn danger" onclick="removeProject(${i})">remover</button></div><div class="grid4"><div><label>Atividade</label><input value="${p.activityValue||'35'}" onchange="projects[${i}].activityValue=this.value"></div><div><label>Duração padrão</label><input value="${p.duracao||'02:40'}" onchange="projects[${i}].duracao=this.value"></div><div><label>Início</label><input value="${p.horaInicio||'08:00'}" onchange="projects[${i}].horaInicio=this.value"></div><div><label>Fim</label><input value="${p.horaFim||'10:00'}" onchange="projects[${i}].horaFim=this.value"></div></div><label style="margin-top:10px">Comentário</label><textarea onchange="projects[${i}].comentario=this.value">${p.comentario||''}</textarea></div>`).join(''); }
function parseScheduleText(){ const txt=val('scheduleText'); if(!txt)return []; const lines=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); if(!lines.length)return []; const hasHeader=/data/i.test(lines[0]); const start=hasHeader?1:0; const header=hasHeader?lines[0].split(',').map(h=>h.trim().toLowerCase()):['data','duracao']; const rows=[]; for(let i=start;i<lines.length;i++){ const parts=lines[i].split(',').map(x=>x.trim()); const o={}; header.forEach((h,idx)=>o[h]=parts[idx]||''); if(o.data) rows.push({data:o.data, duracao:o.duracao||o['duração']||'', projeto:o.projeto||''}); } return rows; }

function easyBody(extra={}){ const c=config(); return {...c, headless: extra.headless ?? bool('easyRunHeadless'), easyDryRun: extra.easyDryRun ?? bool('easyRunDry'), dryRun: extra.easyDryRun ?? bool('easyRunDry'), targetTime: extra.targetTime ?? val('easyTarget'), confirmCustomTime: extra.confirmCustomTime ?? bool('easyConfirmCustom'), confirmReal: extra.confirmReal ?? false, demo: true, slowmo: val('easySlowmo')||700, ...extra}; }
function todayBody(){ return easyBody({ targetTime: val('todayTarget'), easyDryRun: bool('todayDryRun'), dryRun: bool('todayDryRun'), headless: bool('todayHeadless'), confirmCustomTime: bool('todayConfirmCustom') }); }
async function requireRealConfirmation(b){ const times=splitCsv(b.easyTimes); if(b.targetTime && times.length && !times.includes(b.targetTime) && !b.confirmCustomTime){ const ok=await askConfirm(`O horário manual ${b.targetTime} está fora dos horários de referência (${times.join(', ')}). Permitir somente esta execução manual?`,{title:'Horário fora da rotina',ok:'Permitir manual'}); if(!ok)return false; b.confirmCustomTime=true; } if(!b.easyDryRun){ const approved=isApprovalValid(b.easyRealApprovalUntil); if(!approved){ toast('REAL bloqueado: autorize o dia em Configurações > EasyMOB antes de executar.','danger'); return false; } const ok=await askConfirm('Modo REAL pode registrar ponto. A rotina ainda reconsulta marcações e só grava no horário calculado. Confirmar execução manual REAL?',{title:'Confirmar EasyMOB REAL',ok:'Confirmar REAL'}); if(!ok)return false; b.confirmReal=true; } return true; }

function parseMark(raw){
  const s=String(raw||'');
  const hm=/(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if(!hm) return null;
  const hhmm=`${hm[1].padStart(2,'0')}:${hm[2]}`;
  return { raw:s, time:hm[3]?`${hhmm}:${hm[3]}`:hhmm, hhmm, minutes:hhmmToMin(hhmm) };
}
function markMatchesToday(raw, stateToday){
  const s=String(raw||'');
  const iso=stateToday || currentDay();
  const [y,m,d]=iso.split('-');
  const br=`${d}/${m}/${y}`;
  return !/\d{2}\/\d{2}\/\d{4}/.test(s) || s.includes(br);
}
function normalizeMarksForFront(marks=[], stateToday=currentDay()){
  return (Array.isArray(marks)?marks:[]).filter(x=>markMatchesToday(x,stateToday)).map(parseMark).filter(Boolean).sort((a,b)=>a.minutes-b.minutes);
}
function stepLabel(k){ return {entrada:'Entrada',saida_almoco:'Saída almoço',retorno_almoco:'Retorno almoço',saida_final:'Saída final',none:'Nenhuma'}[k]||k||'--'; }
function statusLabel(s){ return {completed:'concluído',complete:'concluído',done:'feito',ready:'pronto',pending:'pendente',future:'futuro',blocked:'bloqueado',in_progress:'em andamento',awaiting_entry:'aguardando entrada',sem_consulta:'sem consulta'}[String(s||'').toLowerCase()]||s||'--'; }
function badge(text, cls=''){ return `<span class="badge ${cls}">${text}</span>`; }
function effectiveOp(e={}, plan={}){
  const routine=e.routine||{};
  const base=e.operationalMode || plan.operationalMode || {};
  const executionMode = base.executionMode || (routine.dryRun===false?'real':'test');
  const valid = isApprovalValid(base.realApproval?.validUntil || routine.confirmRealUntil);
  const realApproval = base.realApproval || { status: valid?'authorized':'not_authorized', validUntil:routine.confirmRealUntil||'' };
  const status = valid ? 'authorized' : (realApproval.status || 'not_authorized');
  return {
    environmentMode: base.environmentMode || 'real',
    executionMode,
    realApproval:{...realApproval,status,validUntil:realApproval.validUntil||routine.confirmRealUntil||''},
    willWrite:Boolean(executionMode==='real' && status==='authorized'),
    reason: base.reason || (executionMode==='real' ? (valid?'Execução REAL autorizada hoje; grava somente se o plano permitir.':'Execução REAL bloqueada: autorização diária inválida.') : 'Execução em TESTE: consulta o EasyMOB e simula, mas nunca registra ponto.')
  };
}
function normalizePlanForFront(state={}){
  const e=state.easymob||{};
  const routine=e.routine||{};
  const rawPlan=e.dailyPlan || e.lastPlan || {};
  const stateToday=state.today || currentDay();
  const marksRaw = e.marksToday?.length ? e.marksToday : (rawPlan.marks || []);
  const marks = normalizeMarksForFront(marksRaw, stateToday);
  const refs = (routine.times?.length ? routine.times : splitCsv(val('easyTimes'))).slice(0,4);
  while(refs.length<4) refs.push(['08:00','12:00','13:00','17:00'][refs.length]);
  const keys=['entrada','saida_almoco','retorno_almoco','saida_final'];
  const op=effectiveOp(e, rawPlan);
  if(marks.length>=4 || String(e.lastPlan?.status||rawPlan.status||'').toUpperCase()==='COMPLETE'){
    const timeline=keys.map((key,i)=>({key, referenceTime:refs[i], calculatedTime:marks[i]?.hhmm||refs[i], status:'done', actualMark:marks[i]?.raw||marks[i]?.time||'--', canExecute:false, willWrite:false, reason:`${stepLabel(key)} registrada às ${marks[i]?.time||'--'}.`}));
    return { date: stateToday, marks: marks.map(m=>m.raw || m.time), status:'completed', currentStep:'completed', nextAction:'none', nextDue:null, timeline, blockingReason:null, recommendation:'Dia concluído com 4 marcações válidas. Nenhuma nova gravação será sugerida.', operationalMode:{...op, willWrite:false, reason:'Dia concluído: execução real permanece autorizada, mas não há ação pendente para gravar.'}, _marksObjs:marks };
  }
  if(Array.isArray(rawPlan.timeline) && rawPlan.timeline.length){
    return {...rawPlan, marks: marks.length ? marks.map(m=>m.raw||m.time) : (rawPlan.marks||[]), operationalMode: op, _marksObjs:marks};
  }
  const timeline=keys.map((key,i)=>({key,referenceTime:refs[i],calculatedTime:refs[i],status:marks[i]?'done':'future',actualMark:marks[i]?.raw||null,canExecute:false,willWrite:false,reason:marks[i]?`${stepLabel(key)} registrada às ${marks[i].time}.`:'Aguardando consulta do EasyMOB.'}));
  return { date:stateToday, marks:marks.map(m=>m.raw||m.time), status:marks.length?'in_progress':'sem_consulta', currentStep:'sem_consulta', nextAction:e.nextAction||rawPlan.action||null, nextDue:e.plannedTime||rawPlan.next_due||null, timeline, blockingReason:null, recommendation:'Consulte o EasyMOB para recalcular o plano completo.', operationalMode:op, _marksObjs:marks };
}
function modeHtml(op={}, plan={}){
  if(!op) return '<span class="muted">Modo não calculado</span>';
  const done = plan.status === 'completed';
  const env = op.environmentMode === 'simulated' ? badge('AMBIENTE SIMULADO','warn') : badge('AMBIENTE REAL','');
  const exec = op.executionMode === 'real' ? badge('EXECUÇÃO REAL','danger') : badge('EXECUÇÃO TESTE','ok');
  const write = op.willWrite && !done ? badge('GRAVA SE PLANO PERMITIR','danger') : badge(done?'NÃO GRAVA: DIA CONCLUÍDO':'NÃO GRAVA AGORA','ok');
  const appr = op.realApproval?.status === 'authorized' ? badge('REAL AUTORIZADO','ok') : badge('REAL BLOQUEADO','warn');
  return `<div class="mode-row">${env}${exec}${write}${appr}</div><p class="muted compact">${escapeHtml(op.reason||'')}</p>`;
}
function dailyPlanHtml(plan){
  if(!plan) return '<div class="alert warn">Plano diário ainda não calculado.</div>';
  const timeline = Array.isArray(plan.timeline) ? plan.timeline : [];
  const steps = timeline.map(st=>`<div class="timeline-step ${st.status||''}"><div class="step-dot"></div><div><b>${stepLabel(st.key)}</b><small>Ref. ${st.referenceTime||'--'} · Calc. ${st.calculatedTime||'--'}</small><span>${st.actualMark||statusLabel(st.status)}</span><p>${escapeHtml(st.reason||'')}</p>${st.canExecute?'<em>ação atual</em>':''}</div></div>`).join('');
  const marks = (plan._marksObjs?.length ? plan._marksObjs.map(m=>m.time) : (plan.marks || [])).join(' · ') || '--';
  return `<div class="daily-plan"><div class="metric-row"><div><span>Status</span><b>${statusLabel(plan.status)}</b></div><div><span>Próxima ação</span><b>${stepLabel(plan.nextAction)}</b></div><div><span>Horário calculado</span><b>${plan.nextDue||'--'}</b></div><div><span>Marcações</span><b>${(plan.marks||[]).length}</b></div></div><div class="marks-line"><b>Marcações do dia:</b> ${escapeHtml(marks)}</div>${modeHtml(plan.operationalMode, plan)}<div class="timeline">${steps}</div>${plan.blockingReason?`<div class="alert danger">${escapeHtml(plan.blockingReason)}</div>`:`<div class="alert ok">${escapeHtml(plan.recommendation||'Plano diário pronto.')}</div>`}</div>`;
}
function planHtml(p,title='Plano'){
  if(!p)return '<div class="alert warn">Nenhum plano disponível ainda.</div>';
  const normalized = Array.isArray(p.timeline) ? p : null;
  if(normalized) return dailyPlanHtml(normalized);
  const mode = p.dry_run === true || /TESTE/i.test(String(p.mode||'')) ? 'TESTE / NÃO GRAVA' : (p.dry_run === false ? 'REAL / PODE GRAVAR' : (p.mode||''));
  const rows = Object.entries(p).filter(([k,v])=>typeof v!=='object').map(([k,v])=>`<tr><th>${k}</th><td>${escapeHtml(v)}</td></tr>`).join('');
  const marks = Array.isArray(p.marks) && p.marks.length ? `<div class="alert" style="margin-top:10px"><b>Marcações de hoje consideradas:</b><br>${p.marks.map(escapeHtml).join('<br>')}</div>` : '';
  const next = p.next_due ? `<div class="alert ok" style="margin-top:10px"><b>Próximo horário calculado:</b> ${p.next_due}</div>` : '';
  return `<div class="planBox"><div class="big">${title}: ${p.label||p.status||mode||''}</div><p class="muted">${escapeHtml(p.reason||p.behavior||'')}</p>${next}${marks}<table class="table"><tbody>${rows}</tbody></table></div>`;
}
function readableLog(payload){ const fileLog = String(payload?.fileLog || '').trim(); const memLog = Array.isArray(payload?.log) ? payload.log.join('') : String(payload?.log || ''); return fileLog || memLog || ''; }
async function refreshDailyPlan(extra={}){ const b=easyBody({easyDryRun:true,dryRun:true,targetTime:'',...extra}); const r=await api('/easymob/daily-plan',{method:'POST',body:JSON.stringify({...b, source: extra.source||'front'})}); if($('easyPlanBox')) $('easyPlanBox').innerHTML=dailyPlanHtml(r.dailyPlan); if($('easyTimelineBox')) $('easyTimelineBox').innerHTML=dailyPlanHtml(r.dailyPlan); await refreshCentralState(); return r.dailyPlan; }
async function renderEasyPlanBox(id){ const r=await api('/easymob/log'); const p=r.latestReport?.plan_after_wait || r.latestReport?.plan || r.singlePlan; if($(id)) $(id).innerHTML=planHtml(p); return p; }
async function waitEasyFinishedAndRender(ids=['easyPlanBox'], timeoutMs=90000){ const started=Date.now(); let last=null; while(Date.now()-started<timeoutMs){ const r=await api('/easymob/log'); last=r; if($('logEasy')) $('logEasy').textContent=readableLog(r); const p=r.latestReport?.plan_after_register || r.latestReport?.plan_after_wait || r.latestReport?.plan || r.singlePlan; ids.forEach(id=>{ if($(id)) $(id).innerHTML=planHtml(p, r.status==='running'?'Plano em execução':'Plano'); }); if(r.status && r.status!=='running') break; await new Promise(resolve=>setTimeout(resolve,1500)); } await refreshCentralState(); return last; }

async function easyTestLogin(){ await saveAll(); const b=easyBody({easyDryRun:true,dryRun:true,targetTime:''}); await api('/easymob/test-login',{method:'POST',body:JSON.stringify(b)}); toast('Teste de login iniciado. Não grava ponto.'); setTimeout(refreshLogs,800); }
async function easyPlan(){ await saveAll(); const b=easyBody({easyDryRun:true,dryRun:true,targetTime:''}); await refreshDailyPlan({source:'consulta_teste'}); await api('/easymob/plan',{method:'POST',body:JSON.stringify(b)}); toast('Consulta em TESTE iniciada; o painel será atualizado ao finalizar.'); await waitEasyFinishedAndRender(['easyPlanBox','easyTimelineBox'],90000); }
async function easyPlanFromToday(){ await easyPlan(); }
async function easyRun(){ await saveAll(); const b=easyBody(); if(!(await requireRealConfirmation(b)))return; const r=await api('/easymob/run',{method:'POST',body:JSON.stringify(b)}); toast(r.message||'Execução EasyMOB iniciada.'); await waitEasyFinishedAndRender(['easyPlanBox','easyTimelineBox'],120000); }
async function easyRunFromToday(){ await easyRun(); }
async function easyRunReal(){ await saveAll(); const b=easyBody({easyDryRun:false,dryRun:false}); if(!(await requireRealConfirmation(b)))return; const r=await api('/easymob/run',{method:'POST',body:JSON.stringify(b)}); toast(r.message||'Execução REAL EasyMOB iniciada.'); await waitEasyFinishedAndRender(['easyPlanBox','easyTimelineBox'],120000); }
async function easySchedule(){ await saveAll(); const b=easyBody(); if(!b.targetTime){toast('Informe o horário manual em HH:MM.','warn');return;} if(!(await requireRealConfirmation(b)))return; const r=await api('/easymob/schedule',{method:'POST',body:JSON.stringify(b)}); $('easyPlanBox').innerHTML=planHtml(r.singlePlan, 'Agendamento manual criado'); toast('Agendamento manual salvo. Ele consultará o dia antes de agir.'); refreshStatus(); }
async function easyCancel(){ await api('/easymob/cancel',{method:'POST'}); toast('Execução EasyMOB cancelada.'); refreshLogs(); }
async function easyRunFullDayTest(){ await saveAll(); const b=easyBody({easyDryRun:true,dryRun:true,targetTime:''}); await refreshDailyPlan({source:'execucao_teste'}); await api('/easymob/run',{method:'POST',body:JSON.stringify(b)}); toast('Execução da ação atual em TESTE iniciada. Não grava ponto.'); await waitEasyFinishedAndRender(['easyPlanBox','easyTimelineBox'],120000); }
async function easyAuthorizeRealToday(){ const ok=await askConfirm('Autorizar execução REAL automática até 23:59 de hoje? TESTE continua sem gravar; REAL só age se o plano permitir.',{title:'Autorizar REAL hoje',ok:'Autorizar hoje'}); if(!ok)return; setBusy('easyApprovalBox',true); try{ const r=await api('/automation/approval/authorize',{method:'POST',body:JSON.stringify({until:endOfTodayIso()})}); set('easyRealApproval','true'); set('easyApprovalStatus',approvalSummary(r.validUntil)); toast('REAL autorizado até 23:59 de hoje.','warn'); await refreshCentralState(); filterLogs(); }catch(e){ toast('Erro ao autorizar REAL: '+e.message,'danger'); } finally{ setBusy('easyApprovalBox',false); } }
async function easyRevokeReal(){ const ok=await askConfirm('Revogar autorização REAL de hoje? A rotina continuará em TESTE ou ficará bloqueada para gravação real.',{title:'Revogar autorização REAL',ok:'Revogar'}); if(!ok)return; try{ await api('/automation/approval/revoke',{method:'POST'}); set('easyRealApproval','false'); set('easyApprovalStatus','REAL não autorizado hoje'); toast('Autorização REAL revogada.'); await refreshCentralState(); filterLogs(); }catch(e){ toast('Erro ao revogar REAL: '+e.message,'danger'); } }

async function serviceFetch(){ const b={ serviceUser:val('serviceUser'), servicePass:val('servicePass'), dataInicio:val('svcStart'), dataFim:val('svcEnd') }; try{ const r=await api('/service/fetch-realizado',{method:'POST',body:JSON.stringify(b)}); $('svcResult').textContent=json(r); }catch(e){ $('svcResult').textContent='ERRO: '+e.message; } }
async function portalRun(consulta){ const b={...config(), startDate:val('rhStart'), endDate:val('rhEnd'), motivoText:val('rhMotivo'), horas:splitCsv(val('rhHoras')), detalhamento:val('rhDetalhe'), dryRun:true, portalRhMode:consulta?'consulta':'acerto'}; try{ await api('/portalrh/run',{method:'POST',body:JSON.stringify(b)}); nav('logs'); setTimeout(refreshLogs,1000); }catch(e){ $('rhResult').textContent=e.message; } }
async function portalCancel(){ await api('/portalrh/cancel',{method:'POST'}); refreshLogs(); }
async function channelPreview(){ const b=config(); b.scheduleRows=parseScheduleText(); try{ const r=await api('/preview',{method:'POST',body:JSON.stringify(b)}); $('channelResult').textContent=(r.csvContent||'sem CSV')+'\n\n'+(r.envContent||''); }catch(e){ $('channelResult').textContent='ERRO: '+e.message; } }
async function channelRun(dry){ const b=config(); b.scheduleRows=parseScheduleText(); b.dryRun=dry; if(!dry && !(await askConfirm('Channel em modo REAL. Confirme somente após conferir pendências de ponto.',{title:'Confirmar Channel REAL',ok:'Executar REAL'})))return; try{ await api('/run',{method:'POST',body:JSON.stringify(b)}); nav('logs'); setTimeout(refreshLogs,1000); }catch(e){ $('channelResult').textContent=e.message; } }
async function channelCancel(){ await api('/cancel',{method:'POST'}); refreshLogs(); }

function scriptListHtml(scripts={}){ return `<div class="script-list">${Object.entries(scripts).map(([k,v])=>`<span><b>${k}</b><code>${escapeHtml(v)}</code></span>`).join('')}</div>`; }
async function refreshScheduler(){ setBusy('schedulerStatus',true); try{ const r=await api('/automation/windows/status'); if($('schedulerBadge')) $('schedulerBadge').textContent=r.installed?'instalado':r.status; if($('schedulerStatus')) $('schedulerStatus').innerHTML=`<div class="metric-row"><div><span>Tarefa</span><b>${r.taskName||'--'}</b></div><div><span>Status</span><b>${r.status||'--'}</b></div><div><span>Instalada</span><b>${r.installed?'Sim':'Não'}</b></div><div><span>Próximo disparo</span><b>${r.nextRunTime||'--'}</b></div></div><div class="hint">Último resultado: ${r.lastResult||'--'} · ExitCode: ${r.exitCode??'--'} · PowerShell restrito: use os .bat.</div><div class="grid"><div><label>Comando</label><pre class="mini-log">${escapeHtml(r.command||'--')}</pre></div><div><label>Saída / erro</label><pre class="mini-log">${escapeHtml((r.stderr||r.stdout||'').slice(0,1800)||'--')}</pre></div></div>${scriptListHtml(r.scripts||{})}`; }catch(e){ if($('schedulerStatus')) $('schedulerStatus').innerHTML=`<div class="alert danger">${escapeHtml(e.message)}</div>`; } finally{ setBusy('schedulerStatus',false); } }
async function installScheduler(){ setBusy('schedulerStatus',true); const r=await api('/automation/windows/install',{method:'POST'}); toast(r.ok?'Tarefa instalada.':(r.message||'Instalação retornou alerta'), r.ok?'ok':'warn'); await refreshScheduler(); }
async function removeScheduler(){ setBusy('schedulerStatus',true); const r=await api('/automation/windows/uninstall',{method:'POST'}); toast(r.ok?'Tarefa removida.':(r.message||'Remoção retornou alerta'), r.ok?'ok':'warn'); await refreshScheduler(); }
async function testScheduler(){ setBusy('schedulerStatus',true); const r=await api('/automation/windows/test',{method:'POST'}); toast(r.ok?'Teste iniciado.':(r.message||'Teste retornou erro'), r.ok?'ok':'warn'); await refreshScheduler(); }
async function resolvePending(id){ const ok=await askConfirm('Marcar esta pendência como resolvida?',{title:'Resolver pendência',ok:'Resolver',danger:false}); if(!ok)return; await api(`/state/pending/${id}/resolve`,{method:'POST',body:JSON.stringify({resolution:'Resolvida pelo painel operacional.'})}); toast('Pendência marcada como resolvida.'); await refreshCentralState(); filterLogs(); }
async function easyEnableDayRoutine(){
  await saveAll();
  const dryRun = bool('easyDryRun');
  let confirmReal = false;
  const approvalUntil = bool('easyRealApproval') ? endOfTodayIso() : '';
  if(!dryRun){
    if(!isApprovalValid(approvalUntil)){ toast('REAL bloqueado: selecione Autorização REAL hoje em Configurações > EasyMOB.', 'danger'); return; }
    const ok=await askConfirm('Esta rotina poderá registrar ponto automaticamente nos horários calculados pelo EasyMOB até 23:59 de hoje. Confirmar autorização diária?',{title:'Autorizar rotina REAL diária',ok:'Autorizar hoje'});
    if(!ok) return;
    confirmReal = true;
  }
  const cfg={ enabled:true, checkEverySeconds:Number(val('autoInterval')||30), easyMob:{ enabled:true, mode:val('easyMode')||'real', times:splitCsv(val('easyTimes')), windowMinutes:Number(val('easyRetryMinutes')||20), duplicateToleranceMinutes:Number(val('easyDuplicateToleranceMinutes')||10), dryRun, confirmReal, confirmRealUntil: approvalUntil, approvalDaily: confirmReal, headless:bool('easyHeadless'), slowmo:Number(val('easySlowmo')||700), businessDaysOnly:true, watchdog:true }, channel:{enabled:bool('autoChannel'), dryRun:true} };
  await api('/automation/config',{method:'POST',body:JSON.stringify(cfg)});
  await api('/automation/start',{method:'POST'});
  if($('easyAutomationBox')) $('easyAutomationBox').innerHTML=`<div class="alert ok">Rotina ativa em ${cfg.easyMob.dryRun?'TESTE / NÃO GRAVA':'REAL autorizado até 23:59'}. Referências: ${cfg.easyMob.times.join(', ')}.</div>`;
  toast('Rotina diária EasyMOB ativada enquanto o servidor estiver aberto.');
  await refreshCentralState(); refreshStatus();
}
async function saveAutomation(){ const approvalUntil=bool('easyRealApproval')?endOfTodayIso():''; const cfg={enabled:bool('autoEnabled'), checkEverySeconds:Number(val('autoInterval')||30), easyMob:{enabled:bool('autoEasy'), mode:val('easyMode')||'real', times:splitCsv(val('easyTimes')), dryRun:bool('easyDryRun'), confirmReal:!bool('easyDryRun')&&isApprovalValid(approvalUntil), confirmRealUntil:approvalUntil, headless:bool('easyHeadless'), windowMinutes:Number(val('easyRetryMinutes')||20), duplicateToleranceMinutes:Number(val('easyDuplicateToleranceMinutes')||10)}, channel:{enabled:bool('autoChannel'), dryRun:true}}; const r=await api('/automation/config',{method:'POST',body:JSON.stringify(cfg)}); $('autoResult').innerHTML=automationStatusHtml(r.routine||{}, r.config||cfg); toast('Orquestrador configurado.'); await refreshCentralState(); }
async function startAutomation(){ const r=await api('/automation/start',{method:'POST'}); $('autoResult').innerHTML='<div class="alert ok">Orquestrador iniciado.</div>'; refreshStatus(); await refreshCentralState(); }
async function stopAutomation(){ await api('/automation/stop',{method:'POST'}); $('autoResult').innerHTML='<div class="alert warn">Orquestrador parado.</div>'; refreshStatus(); await refreshCentralState(); }
async function refreshAutomation(){ const r=await api('/automation/status'); $('autoResult').innerHTML=automationStatusHtml(r.routine||{}, r.config||{}); }
async function refreshLogs(){ try{ const e=await api('/easymob/log'); $('logEasy').textContent=readableLog(e); const p=e.latestReport?.plan_after_register || e.latestReport?.plan_after_wait || e.latestReport?.plan || e.singlePlan; if(p && $('easyPlanBox')) $('easyPlanBox').innerHTML=planHtml(p); }catch{} try{ const c=await api('/log'); $('logChannel').textContent=(c.log||[]).join(''); }catch{} try{ const p=await api('/portalrh/log'); $('logPortal').textContent=(p.log||[]).join(''); }catch{} try{ const a=await api('/automation/log'); $('logAuto').textContent=(a.fileLog || (a.log||[]).join('\n')); }catch{} await refreshCentralState(); filterLogs(); }
function filterLogs(){ const f=val('logFilter')||'all'; const map={easymob:'logEasy',channel:'logChannel',portal:'logPortal',auto:'logAuto'}; ['logEasy','logChannel','logPortal','logAuto'].forEach(id=>{ const card=$(id)?.closest('.card'); if(card) card.classList.toggle('hidden', f!=='all' && id!==map[f]); }); }
function refreshEasyShot(){ const img=$('shotEasy'); if(img) img.src='/api/easymob/screenshot?t='+Date.now(); }
function refreshChannelShot(){ const img=$('shotChannel'); if(img) img.src='/api/screenshot?t='+Date.now(); }
async function refreshStatus(){ try{ const e=await api('/easymob/status'); $('stEasy').textContent=e.status; }catch{$('stEasy').textContent='off'} try{ const c=await api('/status'); $('stChannel').textContent=c.status; }catch{$('stChannel').textContent='off'} try{ const p=await api('/portalrh/status'); $('stPortal').textContent=p.status; }catch{$('stPortal').textContent='off'} try{ const a=await api('/automation/status'); $('stAuto').textContent=a.running?'running':'idle'; }catch{$('stAuto').textContent='off'} const running=[...document.querySelectorAll('.stat b')].some(x=>/running/i.test(x.textContent)); $('globalDot').className='dot '+(running?'running':''); }
function robotStepLabel(status=''){ const map={running:'robô ativo',cycle_started:'abrindo navegador/consultando',waiting_business_day:'aguardando dia útil',waiting_calculated_time:'aguardando horário calculado',waiting_next_cycle:'aguardando próxima checagem',blocked:'execução bloqueada',idle:'aguardando janela',stopped:'parado',stale_new_day:'novo dia'}; return map[status]||status||'aguardando'; }
function automationStatusHtml(routine={}, cfg={}){ const e=cfg.easyMob||{}; return `<div class="metric-row"><div><span>Orquestrador</span><b>${cfg.enabled?'Ativo':'Parado'}</b></div><div><span>Intervalo</span><b>${cfg.checkEverySeconds||'--'}s</b></div><div><span>EasyMOB</span><b>${routine.enabled?'Ativo':'Inativo'}</b></div><div><span>Modo</span><b>${routine.dryRun===false?'REAL':'TESTE'}</b></div></div><div class="hint">Referências: ${(routine.times||e.times||[]).join(', ')||'--'} · Próxima checagem: ${routine.nextCheck||'--'} · Aprovação REAL: ${approvalSummary(routine.confirmRealUntil||e.confirmRealUntil)}</div>`; }
function monthlyHtml(monthly={}, pending=[]){ const days=Object.values(monthly.days||{}).slice(-7); return `<div class="card module-card"><div class="module-head"><div><span class="eyebrow">Mês</span><h2>Histórico operacional inicial</h2></div><span class="badge">${days.length} dia(s)</span></div><div class="mini-table">${days.map(d=>`<div><b>${d.date}</b><span>${statusLabel(d.status)||'sem_consulta'}</span><span>${(d.marks||[]).map(m=>parseMark(m)?.time||m).join(' · ')||'sem marcações'}</span><span>${d.needsAdjustment?'acerto necessário':'--'}</span></div>`).join('')||'<div class="muted">Sem histórico mensal ainda.</div>'}</div></div>`; }
async function refreshToday(){ toast('Atualizando dia em TESTE.'); await easyPlan(); await refreshCentralState(); filterLogs(); }
function stateSummaryHtml(state = {}, pending = []) { const e = state.easymob || {}; const plan=normalizePlanForFront(state); const service = state.service || {}; const portal = state.portalRh || {}; const channel = state.channel || {}; return `${state.stale ? '<div class="alert warn">Estado desatualizado: plano antigo ocultado. <button class="btn blue" onclick="refreshToday()">Atualizar dia</button></div>' : ''}<div class="state-grid"><div class="state-card"><span>Hoje</span><b>${state.today || '--'}</b><small>Semana ${state.week || '--'} · Mês ${state.month || '--'}</small></div><div class="state-card"><span>Próxima EasyMOB</span><b>${plan.status==='completed'?'dia concluído':stepLabel(plan.nextAction)}</b><small>${plan.nextDue || 'sem horário previsto'}</small></div><div class="state-card"><span>Watchdog</span><b>${e.watchdog?.status || '--'}</b><small>${e.lastExecution?.status || 'sem execução'}</small></div><div class="state-card danger"><span>Pendências</span><b>${pending.length}</b><small>${pending.length ? 'exigem conferência' : 'sem bloqueios abertos'}</small></div></div><div class="state-grid"><div class="state-card"><span>Service</span><b>${service.lastStatus || '--'}</b><small>${service.period?.dataInicio || '--'} até ${service.period?.dataFim || '--'}</small></div><div class="state-card"><span>Portal RH</span><b>${portal.lastStatus || '--'}</b><small>${portal.period?.dataInicio || '--'} até ${portal.period?.dataFim || '--'}</small></div><div class="state-card"><span>Channel</span><b>${channel.lastStatus || '--'}</b><small>${(channel.blockingPendencies || []).length} pendência(s) impeditiva(s)</small></div></div>`; }
function listHtml(items = []){ return items.length ? `<ul class="clean-list">${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<span class="muted">--</span>'; }
function renderEasyMobState(state = {}, easyPending = []){
  const e = state.easymob || {};
  const plan = normalizePlanForFront(state);
  const stale = isStateStale(state);
  const marks = stale ? [] : (plan._marksObjs || normalizeMarksForFront(plan.marks||[], state.today));
  const routine = e.routine || {};
  const watchdog = e.watchdog || {};
  const last = e.lastExecution || {};
  const op = plan.operationalMode || effectiveOp(e, plan);
  const dayDone = plan.status === 'completed' || marks.length >= 4;
  const origin = (e.dailyPlan?.source || e.lastPlan?.source || last.source || watchdog.source || 'estado central');
  if($('easyTodaySummary')) $('easyTodaySummary').innerHTML = `<div class="metric-row"><div><span>Data</span><b>${currentDay()}</b></div><div><span>Marcações</span><b>${marks.length}</b></div><div><span>Status</span><b>${stale?'estado novo':statusLabel(dayDone?'completed':plan.status||e.dayStatus)}</b></div><div><span>Horário</span><b>${dayDone?'--':(plan.nextDue || e.plannedTime || '--')}</b></div></div><div class="marks-line">${stale ? 'Plano antigo ocultado. Consulte o EasyMOB para carregar o dia atual.' : (marks.map(m=>m.time).join(' · ') || 'Nenhuma marcação de hoje carregada.')}</div>`;
  if($('easyAutomationBox')) $('easyAutomationBox').innerHTML = `<div class="metric-row"><div><span>Rotina</span><b>${routine.enabled ? 'Ativa' : 'Parada'}</b></div><div><span>Modo</span><b>${op.executionMode === 'real' ? 'EXECUÇÃO REAL' : 'EXECUÇÃO TESTE'}</b></div><div><span>Referências</span><b>${(routine.times || []).join(', ') || val('easyTimes') || '--'}</b></div><div><span>Próxima checagem</span><b>${routine.nextCheck || '--'}</b></div></div><div class="hint">Execução calculada: ${dayDone?'dia concluído':(plan.nextDue || e.plannedTime || '--')} · ${approvalSummary(op.realApproval?.validUntil || routine.confirmRealUntil)} · Grava: ${op.willWrite && !dayDone ? 'sim, se plano permitir' : 'não'}</div>${watchdog.lastError ? `<div class="hint danger">${escapeHtml(watchdog.lastError)}</div>` : ''}`;
  if($('easyRobotStatus')) $('easyRobotStatus').innerHTML = `<b>Status:</b> ${robotStepLabel(watchdog.status)} · <b>Último ciclo:</b> ${watchdog.lastCycleAt || '--'} · <b>Origem do plano:</b> ${origin}. Backend continua ativo mesmo com navegador externo aberto. <a href="http://localhost:3131" target="_blank" rel="noopener">Abrir painel local</a>`;
  if($('easyApprovalBadge')) $('easyApprovalBadge').textContent = isApprovalValid(op.realApproval?.validUntil || routine.confirmRealUntil)?'autorizada':'bloqueada';
  if($('easyApprovalBox')) $('easyApprovalBox').innerHTML = `<div class="metric-row"><div><span>Status</span><b>${isApprovalValid(op.realApproval?.validUntil || routine.confirmRealUntil)?'Autorizada':'Não autorizada'}</b></div><div><span>Validade</span><b>${(op.realApproval?.validUntil||routine.confirmRealUntil)?new Date(op.realApproval?.validUntil||routine.confirmRealUntil).toLocaleString('pt-BR'):'--'}</b></div><div><span>REAL</span><b>${op.executionMode==='real'?'Selecionado':'TESTE'}</b></div><div><span>Bloqueio</span><b>${dayDone?'dia concluído':(op.executionMode==='real'&&!isApprovalValid(op.realApproval?.validUntil||routine.confirmRealUntil)?'ativo':'--')}</b></div></div>`;
  if($('easyPlanBox')) $('easyPlanBox').innerHTML = !stale ? dailyPlanHtml(plan) : '<div class="alert warn">Plano antigo ocultado. Atualize o dia para calcular as 4 janelas.</div>';
  if($('easyTimelineBox')) $('easyTimelineBox').innerHTML = !stale ? dailyPlanHtml(plan) : '<div class="alert warn">Linha do tempo será exibida após atualizar o dia.</div>';
  if($('easyTechnicalBox')) $('easyTechnicalBox').textContent = json({easymob:e, normalizedPlan:plan});
  if($('easyManualBox')) $('easyManualBox').innerHTML = `Manual é pontual e não altera a rotina. Horário manual atual: ${val('easyTarget') || 'não informado'} · última origem: ${origin}.`;
  if($('easyPendingBox')) $('easyPendingBox').innerHTML = easyPending.length ? easyPending.map(p=>`<div class="pending-item ${p.severity === 'critical' ? 'critical' : ''}"><b>${escapeHtml(p.type || 'pendência')}</b><span>${escapeHtml(p.severity || 'warning')}</span><p>${escapeHtml(p.cause || p.reason || '--')}</p><small>${escapeHtml(p.plannedTime || '--')} · ${escapeHtml(p.recommendation || p.nextRecommendedAction || '--')}</small><div class="action-group"><button class="btn" onclick="nav('logs')">Abrir logs</button><button class="btn primary" onclick="resolvePending('${p.id}')">Marcar resolvida</button></div></div>`).join('') : '<div class="alert ok">Sem pendências EasyMOB abertas.</div>';
}
async function refreshCentralState(){ try{ const r = await api('/state'); const state = r.state || {}; const pending = r.pending || []; if($('stateOverview')) $('stateOverview').innerHTML = stateSummaryHtml(state, pending) + monthlyHtml(state.monthly || {}, pending); renderEasyMobState(state, pending.filter(p=>p.module==='easymob' && p.status!=='closed')); if($('journalSummary')) $('journalSummary').textContent = (r.journal || []).map(e => `${e.at || ''} [${e.module || '-'}] ${e.action || '-'} ${e.status || '-'} ${e.reason || e.error || ''}`).join('\n'); if($('channelPending')) $('channelPending').innerHTML = pending.length ? `<div class="alert warn">${pending.length} pendência(s) aberta(s). Confira Logs/Estado antes do Channel REAL.</div>` : '<div class="alert ok">Sem pendências abertas.</div>'; }catch(e){ if($('stateOverview')) $('stateOverview').innerHTML=`<div class="alert danger">Erro ao ler estado: ${escapeHtml(e.message)}</div>`; } }
function calcMonth(){ const target=hhmmToMin(val('calcTarget'))||0, done=hhmmToMin(val('calcDone'))||0, prev=hhmmToMin(val('calcPrev'))||0, delay=hhmmToMin(val('calcDelay'))||0, days=Number(val('calcDays')||1); const saldo=done+prev-delay-target; const perDay=Math.ceil(Math.abs(saldo)/Math.max(1,days)); const txt=saldo>=0?`Saldo positivo estimado: ${minToHHMM(saldo)}.`:`Déficit estimado: ${minToHHMM(Math.abs(saldo))}. Compensar cerca de ${minToHHMM(perDay)} por dia útil restante.`; $('calcResult').innerHTML=`<div class="alert ${saldo>=0?'ok':'warn'}">${txt}</div>`; }
async function boot(){ try{catalog=await api('/catalog'); renderProjectSelect();}catch(e){console.error(e)} await loadAll(); refreshStatus(); await refreshCentralState(); refreshAutomation().catch(()=>{}); refreshLogs().catch(()=>{}); setInterval(refreshStatus,4000); setInterval(refreshCentralState,5000); setInterval(()=>refreshLogs().catch(()=>{}),10000); refreshScheduler().catch(()=>{}); setInterval(()=>refreshScheduler().catch(()=>{}),30000); }
boot();