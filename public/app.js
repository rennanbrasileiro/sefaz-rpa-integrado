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
  if (!r.ok) throw new Error(j.error || j.raw || r.statusText);
  return j;
}
function toast(msg){ console.log(msg); alert(msg); }
function hhmmToMin(s){ const m=/^(\d{1,3}):(\d{2})$/.exec(String(s||'').trim()); return m?Number(m[1])*60+Number(m[2]):0; }
function minToHHMM(n){ n=Math.max(0,Math.round(Number(n)||0)); return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'); }
function json(x){ return JSON.stringify(x,null,2); }
function nav(id){ document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.nav===id)); document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+id)); const title={dashboard:['Visão geral','Módulos separados, fluxo único.'],settings:['Configurações','Credenciais e parâmetros fixos.'],calculator:['Calculadora mensal','Compensação e meta de horas.'],easymob:['1. EasyMOB','Origem diária do ponto.'],service:['2. Service','Consulta do realizado.'],portalrh:['3. Portal RH','Espelho, frequência e acerto.'],channel:['4. Channel','Fechamento semanal por projeto.'],automation:['Orquestrador','Automação segura.'],logs:['Logs e tela ao vivo','Acompanhamento das execuções.'],diagnostic:['Diagnóstico','Mapeamento de tela e seletores.'],map:['Mapa dos processos','Como cada módulo se encaixa.']}[id]||['','']; $('pageTitle').textContent=title[0]; $('pageSub').textContent=title[1]; }
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.nav)));
setInterval(()=>{$('clock').textContent=new Date().toLocaleString('pt-BR')},1000);
function config(){ return {
  user:val('user'), pass:val('pass'), chromePath:val('chromePath'), tz:val('tz')||'America/Recife',
  serviceUser:val('serviceUser'), servicePass:val('servicePass'),
  rhUser:val('rhUser'), rhPass:val('rhPass'), portalRhUrl:val('portalRhUrl'), portalRhReportUrl:val('portalRhReportUrl'),
  easyMode:val('easyMode'), easySiteLogin:val('easySiteLogin'), easyAccessKey:val('easyAccessKey'), easyUser:val('easyUser'), easyPass:val('easyPass'),
  easyDryRun:bool('easyDryRun'), easyHeadless:bool('easyHeadless'), easySlowmo:val('easySlowmo'), easyTimes:val('easyTimes'),
  easyDailyTargetMinutes:val('easyDailyTargetMinutes'), easyLunchMinutes:val('easyLunchMinutes'), easyDuplicateToleranceMinutes:val('easyDuplicateToleranceMinutes'),
  easyScreenshotPolicy:val('easyScreenshotPolicy'), easyLivePreview:bool('easyLivePreview'), easyKeepLastScreenshots:val('easyKeepLastScreenshots'), easyKeepBrowserOpen:bool('easyKeepBrowserOpen'),
  easyBtnLogin:val('easyBtnLogin'), easyBtnRegister:val('easyBtnRegister'), easyBtnConsult:val('easyBtnConsult'),
  projects, useTimeRange:false, dryRun:true, dateSource:val('dateSource')||'range', startDate:val('startDate'), endDate:val('endDate'), weekdaysOnly:true,
  scheduleRows: parseScheduleText()
};}
function applyConfig(c={}){ ['user','pass','chromePath','tz','serviceUser','servicePass','rhUser','rhPass','portalRhUrl','portalRhReportUrl','easyMode','easySiteLogin','easyAccessKey','easyUser','easyPass','easySlowmo','easyTimes','easyDailyTargetMinutes','easyLunchMinutes','easyDuplicateToleranceMinutes','easyScreenshotPolicy','easyKeepLastScreenshots','easyBtnLogin','easyBtnRegister','easyBtnConsult','dateSource','startDate','endDate'].forEach(k=>set(k,c[k])); set('easyDryRun',String(c.easyDryRun!==false)); set('easyHeadless',String(c.easyHeadless!==true?false:true)); set('easyLivePreview',String(c.easyLivePreview===true)); set('easyKeepBrowserOpen',String(c.easyKeepBrowserOpen===true)); projects=Array.isArray(c.projects)?c.projects:[]; renderProjects(); }
async function saveAll(){ localStorage.setItem('sefazRpaCfg110',JSON.stringify(config())); await api('/config/save',{method:'POST',body:JSON.stringify(config())}); toast('Configuração salva no navegador e no servidor.'); }
async function loadAll(){ let c=null; try{ const r=await api('/config/load'); c=r.config; }catch{} if(!c) c=JSON.parse(localStorage.getItem('sefazRpaCfg110')||'null'); if(c) applyConfig(c); }
function renderProjectSelect(){ const s=$('projectSelect'); if(!s)return; s.innerHTML='<option value="">Selecione projeto</option>'+catalog.projects.map(p=>`<option value="${p.value}">${p.value} — ${p.label}</option>`).join(''); }
function addProject(){ const pv=val('projectSelect'); if(!pv)return; if(projects.some(p=>String(p.value)===pv))return; const found=catalog.projects.find(p=>String(p.value)===pv)||{value:pv,label:pv}; projects.push({ value:found.value, label:found.label, activityValue:'35', duracao:'02:40', horaInicio:'08:00', horaFim:'10:00', comentario: catalog.defaultComentario || 'Atividades de gestão, acompanhamento e facilitação.' }); renderProjects(); }
function removeProject(i){ projects.splice(i,1); renderProjects(); }
function renderProjects(){ const el=$('projects'); if(!el)return; if(!projects.length){el.innerHTML='<div class="alert warn">Nenhum projeto configurado para o Channel.</div>';return;} el.innerHTML=projects.map((p,i)=>`<div class="project"><div class="title"><div><span class="badge">${p.value}</span> ${p.label||''}</div><button class="btn danger" onclick="removeProject(${i})">remover</button></div><div class="grid4"><div><label>Atividade</label><input value="${p.activityValue||'35'}" onchange="projects[${i}].activityValue=this.value"></div><div><label>Duração padrão</label><input value="${p.duracao||'02:40'}" onchange="projects[${i}].duracao=this.value"></div><div><label>Início</label><input value="${p.horaInicio||'08:00'}" onchange="projects[${i}].horaInicio=this.value"></div><div><label>Fim</label><input value="${p.horaFim||'10:00'}" onchange="projects[${i}].horaFim=this.value"></div></div><label style="margin-top:10px">Comentário</label><textarea onchange="projects[${i}].comentario=this.value">${p.comentario||''}</textarea></div>`).join(''); }
function parseScheduleText(){ const txt=val('scheduleText'); if(!txt)return []; const lines=txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); if(!lines.length)return []; const hasHeader=/data/i.test(lines[0]); const start=hasHeader?1:0; const header=hasHeader?lines[0].split(',').map(h=>h.trim().toLowerCase()):['data','duracao']; const rows=[]; for(let i=start;i<lines.length;i++){ const parts=lines[i].split(',').map(x=>x.trim()); const o={}; header.forEach((h,idx)=>o[h]=parts[idx]||''); if(o.data) rows.push({data:o.data, duracao:o.duracao||o['duração']||'', projeto:o.projeto||''}); } return rows; }
function easyBody(extra={}){ const c=config(); return {...c, headless: extra.headless ?? bool('easyRunHeadless'), easyDryRun: extra.easyDryRun ?? bool('easyRunDry'), dryRun: extra.easyDryRun ?? bool('easyRunDry'), targetTime: extra.targetTime ?? val('easyTarget'), confirmCustomTime: extra.confirmCustomTime ?? bool('easyConfirmCustom'), confirmReal: extra.confirmReal ?? false, demo: true, slowmo: val('easySlowmo')||700, ...extra}; }
function todayBody(){ return easyBody({ targetTime: val('todayTarget'), easyDryRun: bool('todayDryRun'), dryRun: bool('todayDryRun'), headless: bool('todayHeadless'), confirmCustomTime: bool('todayConfirmCustom') }); }
function requireRealConfirmation(b){ const times=splitCsv(b.easyTimes); if(b.targetTime && times.length && !times.includes(b.targetTime) && !b.confirmCustomTime){ if(!confirm(`O horário ${b.targetTime} está fora da regra (${times.join(', ')}). Permitir execução fora da regra?`))return false; b.confirmCustomTime=true; } if(!b.easyDryRun){ if(!confirm('ATENÇÃO: modo REAL do EasyMOB pode gravar ponto. Confirma execução real?'))return false; b.confirmReal=true; } return true; }
async function easyTestLogin(){ await saveAll(); const b=easyBody({easyDryRun:true,dryRun:true,targetTime:''}); await api('/easymob/test-login',{method:'POST',body:JSON.stringify(b)}); nav('logs'); setTimeout(refreshLogs,800); }
async function easyPlan(){ await saveAll(); const b=easyBody({easyDryRun:true,dryRun:true}); await api('/easymob/plan',{method:'POST',body:JSON.stringify(b)}); nav('logs'); await waitEasyFinishedAndRender(['easyPlanBox'],90000); }
async function easyPlanFromToday(){ await saveAll(); const b=todayBody(); b.easyDryRun=true; b.dryRun=true; await api('/easymob/plan',{method:'POST',body:JSON.stringify(b)}); nav('logs'); await waitEasyFinishedAndRender(['easyPlanBox'],90000); }
async function easyRun(){ await saveAll(); const b=easyBody(); if(!requireRealConfirmation(b))return; await api('/easymob/run',{method:'POST',body:JSON.stringify(b)}); nav('logs'); await waitEasyFinishedAndRender(['easyPlanBox'],120000); }
async function easyRunFromToday(){ await saveAll(); const b=todayBody(); if(!requireRealConfirmation(b))return; await api('/easymob/run',{method:'POST',body:JSON.stringify(b)}); nav('logs'); await waitEasyFinishedAndRender(['easyPlanBox'],120000); }
async function easySchedule(){ await saveAll(); const b=easyBody(); if(!b.targetTime){toast('Informe o horário único em HH:MM.');return;} if(!requireRealConfirmation(b))return; const r=await api('/easymob/schedule',{method:'POST',body:JSON.stringify(b)}); $('easyPlanBox').innerHTML=planHtml(r.singlePlan, 'Agendamento criado'); toast('Agendamento EasyMOB salvo. Ele consultará o dia antes de agir.'); refreshStatus(); }
async function easyCancel(){ await api('/easymob/cancel',{method:'POST'}); refreshLogs(); }
function planHtml(p,title='Plano'){
  if(!p)return '<div class="alert warn">Nenhum plano disponível ainda.</div>';
  const mode = p.dry_run === true || /TESTE/i.test(String(p.mode||'')) ? 'TESTE / NÃO GRAVA' : (p.dry_run === false ? 'REAL / PODE GRAVAR' : (p.mode||''));
  const rows = Object.entries(p)
    .filter(([k,v])=>typeof v!=='object')
    .map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join('');
  const marks = Array.isArray(p.marks) && p.marks.length ? `<div class="alert" style="margin-top:10px"><b>Marcações de hoje consideradas:</b><br>${p.marks.join('<br>')}</div>` : '';
  const next = p.next_due ? `<div class="alert ok" style="margin-top:10px"><b>Próximo horário calculado:</b> ${p.next_due}</div>` : '';
  return `<div class="planBox"><div class="big">${title}: ${p.label||p.status||p.mode||''}</div><p class="muted">${p.reason||p.behavior||''}</p>${next}${marks}<table class="table"><tbody>${rows}</tbody></table></div>`;
}
function readableLog(payload){
  const fileLog = String(payload?.fileLog || '').trim();
  const memLog = Array.isArray(payload?.log) ? payload.log.join('') : String(payload?.log || '');
  // Evita duplicação visual: o Python grava em arquivo e também passa pelo stdout.
  return fileLog || memLog || '';
}
async function renderEasyPlanBox(id){
  const r=await api('/easymob/log');
  const p=r.latestReport?.plan_after_wait || r.latestReport?.plan || r.singlePlan;
  if($(id)) $(id).innerHTML=planHtml(p);
  return p;
}
async function waitEasyFinishedAndRender(ids=['easyPlanBox'], timeoutMs=90000){
  const started=Date.now();
  let last=null;
  while(Date.now()-started<timeoutMs){
    const r=await api('/easymob/log');
    last=r;
    if($('logEasy')) $('logEasy').textContent=readableLog(r);
    const p=r.latestReport?.plan_after_wait || r.latestReport?.plan || r.singlePlan;
    ids.forEach(id=>{ if($(id)) $(id).innerHTML=planHtml(p, r.status==='running'?'Plano em execução':'Plano'); });
    if(r.status && r.status!=='running') break;
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  await refreshLogs();
  for(const id of ids) await renderEasyPlanBox(id);
  return last;
}
async function serviceFetch(){ const b={ serviceUser:val('serviceUser'), servicePass:val('servicePass'), dataInicio:val('svcStart'), dataFim:val('svcEnd') }; try{ const r=await api('/service/fetch-realizado',{method:'POST',body:JSON.stringify(b)}); $('svcResult').textContent=json(r); }catch(e){ $('svcResult').textContent='ERRO: '+e.message; } }
async function portalRun(consulta){ const b={...config(), startDate:val('rhStart'), endDate:val('rhEnd'), motivoText:val('rhMotivo'), horas:splitCsv(val('rhHoras')), detalhamento:val('rhDetalhe'), dryRun:true, portalRhMode:consulta?'consulta':'acerto'}; try{ await api('/portalrh/run',{method:'POST',body:JSON.stringify(b)}); nav('logs'); setTimeout(refreshLogs,1000); }catch(e){ $('rhResult').textContent=e.message; } }
async function portalCancel(){ await api('/portalrh/cancel',{method:'POST'}); refreshLogs(); }
async function channelPreview(){ const b=config(); b.scheduleRows=parseScheduleText(); try{ const r=await api('/preview',{method:'POST',body:JSON.stringify(b)}); $('channelResult').textContent=(r.csvContent||'sem CSV')+'\n\n'+(r.envContent||''); }catch(e){ $('channelResult').textContent='ERRO: '+e.message; } }
async function channelRun(dry){ const b=config(); b.scheduleRows=parseScheduleText(); b.dryRun=dry; if(!dry && !confirm('ATENÇÃO: Channel em modo REAL. Confirma?'))return; try{ await api('/run',{method:'POST',body:JSON.stringify(b)}); nav('logs'); setTimeout(refreshLogs,1000); }catch(e){ $('channelResult').textContent=e.message; } }
async function channelCancel(){ await api('/cancel',{method:'POST'}); refreshLogs(); }
async function easyEnableDayRoutine(){
  await saveAll();
  const dryRun = bool('easyDryRun');
  let confirmReal = false;
  if(!dryRun){
    if(!confirm('ATENÇÃO: Esta rotina poderá registrar ponto automaticamente nos horários calculados pelo EasyMOB. Confirma autorização REAL explícita?')) return;
    confirmReal = true;
  }
  const cfg={
    enabled:true,
    checkEverySeconds:Number(val('autoInterval')||30),
    easyMob:{
      enabled:true,
      times:splitCsv(val('easyTimes')),
      windowMinutes:Number(val('easyRetryMinutes')||20),
      duplicateToleranceMinutes:Number(val('easyDuplicateToleranceMinutes')||10),
      dryRun,
      confirmReal,
      headless:bool('easyHeadless'),
      slowmo:Number(val('easySlowmo')||700),
      businessDaysOnly:true,
      watchdog:true
    },
    channel:{enabled:bool('autoChannel'), dryRun:true}
  };
  const r=await api('/automation/config',{method:'POST',body:JSON.stringify(cfg)});
  await api('/automation/start',{method:'POST'});
  if($('easyAutomationBox')) $('easyAutomationBox').innerHTML=planHtml({label:'Rotina diária ativada', mode: cfg.easyMob.dryRun?'TESTE / NÃO GRAVA':'REAL / PODE GRAVAR', behavior:`O orquestrador vai checar ${cfg.easyMob.times.join(', ')} em dias úteis, consultar o EasyMOB antes de agir e respeitar as regras. Ele roda enquanto o npm start estiver aberto.`}, 'Automação');
  toast('Rotina diária EasyMOB ativada enquanto o servidor estiver aberto.');
  refreshStatus();
}
async function easyRunFullDayTest(){
  await saveAll();
  const b=easyBody({easyDryRun:true,dryRun:true,targetTime:''});
  await api('/easymob/run',{method:'POST',body:JSON.stringify(b)});
  nav('logs');
  await waitEasyFinishedAndRender(['easyPlanBox'],120000);
}
async function saveAutomation(){ const cfg={enabled:bool('autoEnabled'), checkEverySeconds:Number(val('autoInterval')||30), easyMob:{enabled:bool('autoEasy'), times:splitCsv(val('easyTimes')), dryRun:bool('easyDryRun'), headless:bool('easyHeadless')}, channel:{enabled:bool('autoChannel'), dryRun:true}}; const r=await api('/automation/config',{method:'POST',body:JSON.stringify(cfg)}); $('autoResult').innerHTML='<pre class="log" style="height:160px">'+json(r)+'</pre>'; }
async function startAutomation(){ const r=await api('/automation/start',{method:'POST'}); $('autoResult').innerHTML='<div class="alert ok">Orquestrador iniciado.</div>'; refreshStatus(); }
async function stopAutomation(){ await api('/automation/stop',{method:'POST'}); $('autoResult').innerHTML='<div class="alert warn">Orquestrador parado.</div>'; refreshStatus(); }
async function refreshAutomation(){ const r=await api('/automation/status'); $('autoResult').innerHTML='<pre class="log" style="height:220px">'+json(r)+'</pre>'; }
async function refreshLogs(){ try{ const e=await api('/easymob/log'); $('logEasy').textContent=readableLog(e); const p=e.latestReport?.plan_after_register || e.latestReport?.plan_after_wait || e.latestReport?.plan || e.singlePlan; if(p){ if($('easyPlanBox')) $('easyPlanBox').innerHTML=planHtml(p);  } }catch{} try{ const c=await api('/log'); $('logChannel').textContent=(c.log||[]).join(''); }catch{} try{ const p=await api('/portalrh/log'); $('logPortal').textContent=(p.log||[]).join(''); }catch{} try{ const a=await api('/automation/log'); $('logAuto').textContent=(a.fileLog || (a.log||[]).join('\n')); }catch{} await refreshCentralState(); }
function refreshEasyShot(){ const img=$('shotEasy'); img.src='/api/easymob/screenshot?t='+Date.now(); }
function refreshChannelShot(){ const img=$('shotChannel'); img.src='/api/screenshot?t='+Date.now(); }
async function refreshStatus(){ try{ const e=await api('/easymob/status'); $('stEasy').textContent=e.status; }catch{$('stEasy').textContent='off'} try{ const c=await api('/status'); $('stChannel').textContent=c.status; }catch{$('stChannel').textContent='off'} try{ const p=await api('/portalrh/status'); $('stPortal').textContent=p.status; }catch{$('stPortal').textContent='off'} try{ const a=await api('/automation/status'); $('stAuto').textContent=a.running?'running':'idle'; }catch{$('stAuto').textContent='off'} const running=[...document.querySelectorAll('.stat b')].some(x=>/running/i.test(x.textContent)); $('globalDot').className='dot '+(running?'running':''); }
async function boot(){ try{catalog=await api('/catalog'); renderProjectSelect();}catch(e){console.error(e)} await loadAll(); refreshStatus(); await refreshCentralState(); setInterval(refreshStatus,5000); setInterval(refreshCentralState,10000); }

function stateSummaryHtml(state = {}, pending = []) {
  const e = state.easymob || {};
  const service = state.service || {};
  const portal = state.portalRh || {};
  const channel = state.channel || {};
  return `<div class="state-grid"><div class="state-card"><span>Hoje</span><b>${state.today || '--'}</b><small>Semana ${state.week || '--'} · Mês ${state.month || '--'}</small></div><div class="state-card"><span>Próxima EasyMOB</span><b>${e.nextAction || '--'}</b><small>${e.plannedTime || 'sem horário previsto'}</small></div><div class="state-card"><span>Watchdog</span><b>${e.watchdog?.status || '--'}</b><small>${e.lastExecution?.status || 'sem execução'}</small></div><div class="state-card danger"><span>Pendências</span><b>${pending.length}</b><small>${pending.length ? 'exigem conferência' : 'sem bloqueios abertos'}</small></div></div><div class="state-grid"><div class="state-card"><span>Service</span><b>${service.lastStatus || '--'}</b><small>${service.period?.dataInicio || '--'} até ${service.period?.dataFim || '--'}</small></div><div class="state-card"><span>Portal RH</span><b>${portal.lastStatus || '--'}</b><small>${portal.period?.dataInicio || '--'} até ${portal.period?.dataFim || '--'}</small></div><div class="state-card"><span>Channel</span><b>${channel.lastStatus || '--'}</b><small>${(channel.blockingPendencies || []).length} pendência(s) impeditiva(s)</small></div></div>`;
}

function listHtml(items = []){ return items.length ? `<ul class="clean-list">${items.map(x=>`<li>${x}</li>`).join('')}</ul>` : '<span class="muted">--</span>'; }
function renderEasyMobState(state = {}, easyPending = []){
  const e = state.easymob || {};
  const plan = e.lastPlan || {};
  const marks = e.marksToday || plan.marks || [];
  const routine = e.routine || {};
  const watchdog = e.watchdog || {};
  const last = e.lastExecution || {};
  const mode = routine.dryRun === false ? 'REAL / PODE GRAVAR' : 'TESTE / NÃO GRAVA';
  if($('easyTodaySummary')) $('easyTodaySummary').innerHTML = `<div class="state-grid"><div class="state-card"><span>Data</span><b>${state.today || plan.date || '--'}</b><small>${marks.length} marcação(ões) hoje</small></div><div class="state-card"><span>Marcações</span><b>${marks.length}</b><small>${marks.join(' · ') || 'nenhuma'}</small></div><div class="state-card"><span>Próxima ação</span><b>${e.nextAction || plan.action || '--'}</b><small>${e.plannedTime || plan.next_due || 'sem horário'}</small></div><div class="state-card"><span>Status</span><b>${plan.status || last.status || '--'}</b><small>${plan.allowed === true ? 'permitido' : plan.allowed === false ? 'aguardando/bloqueado' : 'sem plano'}</small></div></div>`;
  if($('easyAutomationBox')) $('easyAutomationBox').innerHTML = `<div class="state-grid"><div class="state-card"><span>Rotina</span><b>${routine.enabled ? 'ativa' : 'parada'}</b><small>${watchdog.status || 'idle'}</small></div><div class="state-card"><span>Modo</span><b>${mode}</b><small>${routine.confirmReal ? 'REAL autorizado' : 'sem autorização real'}</small></div><div class="state-card"><span>Horários referência</span><b>${(routine.times || []).join(', ') || val('easyTimes') || '--'}</b><small>conferência, não ponto cego</small></div><div class="state-card"><span>Próxima checagem</span><b>${routine.nextCheck || '--'}</b><small>último ciclo: ${watchdog.lastCycleAt || '--'}</small></div></div><div class="alert" style="margin-top:12px"><b>Próxima execução calculada:</b> ${e.plannedTime || plan.next_due || '--'} · <b>Grava?</b> ${routine.dryRun === false ? 'somente se plano permitido e REAL autorizado' : 'não, TESTE'}</div>${watchdog.lastError ? `<div class="alert danger" style="margin-top:12px">${watchdog.lastError}</div>` : ''}`;
  if($('easyPlanBox') && plan.action) $('easyPlanBox').innerHTML = planHtml(plan, 'Plano calculado');
  if($('easyPendingBox')) $('easyPendingBox').innerHTML = easyPending.length ? easyPending.map(p=>`<div class="alert ${p.severity === 'critical' ? 'danger' : 'warn'}" style="margin-bottom:10px"><b>${p.type || 'pendência'}</b> · ${p.severity || 'warning'}<br>Motivo: ${p.cause || p.reason || '--'}<br>Horário: ${p.plannedTime || '--'}<br>Recomendação: ${p.recommendation || p.nextRecommendedAction || '--'}</div>`).join('') : '<div class="alert ok">Sem pendências EasyMOB abertas.</div>';
}
async function refreshCentralState(){
  try{
    const r = await api('/state');
    const state = r.state || {}; const pending = r.pending || [];
    if($('stateOverview')) $('stateOverview').innerHTML = stateSummaryHtml(state, pending);
    renderEasyMobState(state, pending.filter(p=>p.module==='easymob'));
    if($('journalSummary')) $('journalSummary').textContent = (r.journal || []).map(e => `${e.at || ''} [${e.module || '-'}] ${e.action || '-'} ${e.status || '-'} ${e.reason || e.error || ''}`).join('\n');
    if($('channelPending')) $('channelPending').innerHTML = pending.length ? `<div class="alert warn">${pending.length} pendência(s) aberta(s). Execução REAL do Channel deve aguardar conferência.</div>` : '<div class="alert ok">Sem pendências impeditivas abertas.</div>';
  }catch(e){ console.warn('state unavailable', e); }
}
function calcMonth(){
  const target=hhmmToMin(val('calcTarget')), done=hhmmToMin(val('calcDone')), prev=hhmmToMin(val('calcPrev')), current=hhmmToMin(val('calcCurrent')), days=Number(val('calcDays')||0), daily=hhmmToMin(val('calcDaily'));
  const delay=hhmmToMin(val('calcDelay')), missed=Number(val('calcMissed')||0);
  const balance=done+prev+current-target;
  const remaining=Math.max(0,target-done-prev-current+(missed*daily)+delay);
  const perDay=days>0?Math.ceil(remaining/days):0;
  const lunchIn=hhmmToMin(val('calcLunchIn')), todayDone=Math.max(0,hhmmToMin(val('calcLunchOut'))-hhmmToMin(val('calcIn')));
  const todayRemaining=Math.max(0,daily-todayDone+delay+(missed?daily:0));
  const exitForecast=lunchIn?minToHHMM(lunchIn+todayRemaining):'--:--';
  $('calcResult').innerHTML=`<div class="grid4"><div class="stat"><b>${minToHHMM(Math.abs(balance))}</b><span>${balance>=0?'saldo positivo':'saldo negativo'}</span></div><div class="stat"><b>${minToHHMM(remaining)}</b><span>restante ajustado</span></div><div class="stat"><b>${minToHHMM(perDay)}</b><span>média diária necessária</span></div><div class="stat"><b>${exitForecast}</b><span>previsão de saída hoje</span></div></div><div class="alert" style="margin-top:12px">Impacto considerado: atraso ${minToHHMM(delay)} e ${missed} ponto(s) perdido(s). Use dados manuais até o Portal RH fornecer extração automática.</div>`;
}

boot();
