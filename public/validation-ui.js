// validation-ui.js — painel de auditoria operacional injetado sem substituir o front existente
(function(){
  function byId(id){ return document.getElementById(id); }
  function esc(s){ return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
  function statusClass(status){ return status === 'ok' ? 'ok' : status === 'error' ? 'danger' : status === 'warn' ? 'warn' : 'info'; }
  function injectStyle(){
    if(byId('validationStyle')) return;
    const style=document.createElement('style');
    style.id='validationStyle';
    style.textContent='.validation-section{margin-top:16px}.validation-section h3{margin:0 0 10px;color:#cbd5e1;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.validation-check{border:1px solid var(--line);background:#0b1018;border-radius:12px;padding:12px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:6px 10px}.validation-check>b{color:var(--text)}.validation-check>span{font-family:var(--mono);font-size:11px;text-transform:uppercase;border:1px solid var(--line);border-radius:999px;padding:3px 8px;height:max-content}.validation-check>p{grid-column:1/-1;margin:0;color:#cbd5e1;line-height:1.45}.validation-check>small{grid-column:1/-1;color:var(--muted);line-height:1.45}.validation-check.ok{border-color:rgba(22,209,154,.35)}.validation-check.ok>span{color:#a7f3d0;border-color:rgba(22,209,154,.35)}.validation-check.warn{border-color:rgba(245,158,11,.42)}.validation-check.warn>span{color:#fde68a;border-color:rgba(245,158,11,.42)}.validation-check.danger{border-color:rgba(239,68,68,.45)}.validation-check.danger>span{color:#fecaca;border-color:rgba(239,68,68,.45)}.validation-check.info>span{color:#bfdbfe;border-color:rgba(96,165,250,.35)}';
    document.head.appendChild(style);
  }
  async function getValidation(){
    const r = await fetch('/api/validation', { headers:{'Content-Type':'application/json'} });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  function ensurePanel(){
    injectStyle();
    const diag = byId('panel-diagnostic');
    if(!diag || byId('validationPanel')) return;
    const card = document.createElement('div');
    card.className = 'card module-card';
    card.id = 'validationPanel';
    card.innerHTML = '<div class="module-head"><div><span class="eyebrow">Validação operacional</span><h2>Auditoria dos fluxos</h2></div><span id="validationBadge" class="badge">aguardando</span></div><div class="alert">Valida EasyMOB, estado, plano de 4 janelas, logs, Agendador Windows, credenciais auxiliares e bloqueios antes de Channel REAL.</div><div class="row" style="margin-top:12px"><button class="btn primary" id="validationRunBtn">Validar todos os fluxos</button><button class="btn" id="validationCopyBtn">Copiar resumo</button></div><div id="validationResult" class="summary-box" style="margin-top:14px">Clique em validar.</div>';
    diag.appendChild(card);
    byId('validationRunBtn').onclick = renderValidation;
    byId('validationCopyBtn').onclick = copyValidation;
  }
  let lastValidationText = '';
  function renderChecks(data){
    const groups = {};
    (data.checks || []).forEach(c => { (groups[c.section] ||= []).push(c); });
    const header = '<div class="metric-row"><div><span>Status</span><b>'+esc(data.status||'--')+'</b></div><div><span>OK</span><b>'+esc(data.score)+'/'+esc(data.total)+'</b></div><div><span>Alertas</span><b>'+esc(data.warnings||0)+'</b></div><div><span>Erros</span><b>'+esc(data.errors||0)+'</b></div></div>';
    const body = Object.entries(groups).map(([section, items]) => '<div class="validation-section"><h3>'+esc(section)+'</h3>'+items.map(c => '<div class="validation-check '+statusClass(c.status)+'"><b>'+esc(c.title)+'</b><span>'+esc(c.status)+'</span><p>'+esc(c.detail)+'</p>'+(c.action?'<small>'+esc(c.action)+'</small>':'')+'</div>').join('')+'</div>').join('');
    return header + body;
  }
  async function renderValidation(){
    ensurePanel();
    const box = byId('validationResult'), badge = byId('validationBadge');
    if(box) box.innerHTML = '<div class="alert warn">Validando fluxos...</div>';
    try{
      const data = await getValidation();
      if(badge){ badge.textContent = data.status === 'ok' ? 'validado' : data.status; badge.className = 'badge '+statusClass(data.status); }
      if(box) box.innerHTML = renderChecks(data);
      lastValidationText = (data.checks||[]).map(c => '['+c.section+'] '+c.status.toUpperCase()+' - '+c.title+' - '+c.detail+(c.action?' | '+c.action:'')).join('\n');
    }catch(e){
      if(badge){ badge.textContent='erro'; badge.className='badge danger'; }
      if(box) box.innerHTML = '<div class="alert danger">Erro na validação: '+esc(e.message)+'</div>';
      lastValidationText = 'Erro na validação: '+e.message;
    }
  }
  async function copyValidation(){
    if(!lastValidationText) await renderValidation();
    try{ await navigator.clipboard.writeText(lastValidationText || ''); if(window.toast) toast('Resumo da validação copiado.'); }catch{ console.log(lastValidationText); }
  }
  window.renderValidation = renderValidation;
  window.copyValidation = copyValidation;
  document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { ensurePanel(); renderValidation().catch(()=>{}); }, 900); });
})();
