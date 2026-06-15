// rpa.js  (original — não modificado)
require("dotenv").config();
const { chromium } = require("playwright");

const fs = require("fs");
const path = require("path");

const BASE_NEW =
  "https://sefazpe.jexperts.com.br/channel/apontamento.do?action=novoApontamento";

const USER = process.env.SEFAZ_USER;
const PASS = process.env.SEFAZ_PASS;

if (!USER || !PASS) {
  console.error("❌ Faltou SEFAZ_USER ou SEFAZ_PASS no .env.");
  process.exit(1);
}

const PROJECTS = [
  { value: "204", label: "CSN - Evolução - REDESIM: Interrupção Temp, End Estrangeiro, Renúncia de Contador e Registro dos IPs" },
  { value: "86", label: "DEF - Novo Modelo de Monitoramento do Simples Nacional (PROFISCO 2019)" },
  { value: "126", label: "DEF - Sustentação" },
  { value: "38", label: "DMI - Integração e Calculo Automático da DMI com o portal único do comercio exterior (PROFISCO 2019)" },
  { value: "290", label: "GAF - Modernização do GAF" },
  { value: "149", label: "GAF - Sustentação" },
  { value: "254", label: "GDE - Integração com sistemas clientes externos e internos" },
  { value: "191", label: "GIF - Desenvolver o Sistema de Gestão de Incentivos Fiscais - Parte 3 (PROFISCO 2019)" },
  { value: "199", label: "GPF - Evolução - Emissão de DAE, Apropriação de Pagamentos e Novo Recálculo" },
  { value: "245", label: "GCD - Autodeclaração de ITCMD pelo contibuinte" },
  { value: "124", label: "GSN - Sustentação" },
  { value: "293", label: "MariIA " },
  { value: "309", label: "DEF DEF -  Evolução - Fase de implantação do monitoramento do SN" },
  { value: "221", label: "CAT CAT - Evolução - Desburocratizar fluxo do processo" },
  { value: "312", label: "TAT TAT - Pauta de Julgamento Painel de Dados e PUSH de Informações" },
  { value: "127", label: "GAE GAE - Sustentação" },
  { value: "171", label: "GTU - Gestão de Transferências da União" },
  { value: "303", label: "GTU GTU - Evolução - Cadastro do Instrumento, Ingresso e Estorno de Recursos, Execução da Despesa e Extratos" },
];
const PROJECT_BY_VALUE = new Map(PROJECTS.map((p) => [p.value, p.label]));

const ACTIVITY_TYPES = [
  { value: "-1", label: "Nenhum tipo de atividade relacionado" },
  { value: "5", label: "2 -  Reunião" },
  { value: "6", label: "3 -  Horas Abonadas pela SEFAZ" },
  { value: "16", label: "16 -  Integração" },
  { value: "18", label: "21 -  Análise" },
  { value: "20", label: "23 -  Revisão de Código" },
  { value: "21", label: "24 -  Testes" },
  { value: "22", label: "26 -  Implementação" },
  { value: "24", label: "28 -  Implantação" },
  { value: "35", label: "40 -  Gerência de Projetos" },
  { value: "36", label: "46 -  Suporte ao Desenvolvimento" },
  { value: "37", label: "47 -  Suporte Técnico" },
  { value: "58", label: "92 -  Apresentações / Eventos / Cursos / Treinamentos" },
  { value: "141", label: "184 -  Montar pacotes de homologação dos usuários" },
];
const ACTIVITY_BY_VALUE = new Map(ACTIVITY_TYPES.map((a) => [a.value, a.label]));

function envStr(name, def = "") {
  const v = process.env[name];
  return v === undefined || v === null || String(v).trim() === "" ? def : String(v).trim();
}
function envBool(name, def = false) {
  const v = envStr(name, "");
  if (!v) return def;
  return ["1", "true", "yes", "y", "sim", "on"].includes(v.toLowerCase());
}
function envNum(name, def) {
  const v = envStr(name, "");
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function parseCsv(str) {
  return (str || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function isHHMM(s) {
  return /^(\d{1,2}):(\d{2})$/.test(String(s || "").trim());
}
function timeToMinutes(timeStr) {
  const s = String(timeStr || "").trim();
  if (!isHHMM(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const PROJECT_VALUES = parseCsv(envStr("SEFAZ_PROJECT_VALUES", envStr("SEFAZ_PROJECT_VALUE", "86")));
if (!PROJECT_VALUES.length) { console.error("❌ SEFAZ_PROJECT_VALUES vazio."); process.exit(1); }
const invalidProjects = PROJECT_VALUES.filter((v) => !PROJECT_BY_VALUE.has(v));
if (invalidProjects.length) {
  console.error("❌ Projetos inválidos em SEFAZ_PROJECT_VALUES:", invalidProjects.join(", "));
  process.exit(1);
}

const USE_TIME_RANGE = envBool("SEFAZ_USE_TIME_RANGE", false);
const WORKDAY_START = envStr("SEFAZ_WORKDAY_START", "08:00");
const WORKDAY_END = envStr("SEFAZ_WORKDAY_END", "17:00");
const DEFAULT_ACTIVITY_VALUE = envStr("SEFAZ_ACTIVITY_VALUE", "35");
function activityForProject(projectValue) { return envStr(`SEFAZ_ACTIVITY_VALUE_${projectValue}`, DEFAULT_ACTIVITY_VALUE); }
const DEFAULT_DURACAO = envStr("SEFAZ_DURACAO", "02:00");
const DEFAULT_HORA_INICIO = envStr("SEFAZ_HORA_INICIO", "");
const DEFAULT_HORA_FIM = envStr("SEFAZ_HORA_FIM", "");
function duracaoForProject(value) { return envStr(`SEFAZ_DURACAO_${value}`, DEFAULT_DURACAO); }
function horaInicioForProject(value) { return envStr(`SEFAZ_HORA_INICIO_${value}`, DEFAULT_HORA_INICIO); }
function horaFimForProject(value) { return envStr(`SEFAZ_HORA_FIM_${value}`, DEFAULT_HORA_FIM); }

function calculateTimeRanges() {
  const startMinutes = timeToMinutes(WORKDAY_START);
  const endMinutes = timeToMinutes(WORKDAY_END);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    throw new Error(`WORKDAY inválido: ${WORKDAY_START} - ${WORKDAY_END}`);
  }
  const totalMinutes = endMinutes - startMinutes;
  const numProjects = PROJECT_VALUES.length;
  const minutesPerProject = Math.floor(totalMinutes / numProjects);
  const ranges = [];
  let currentStart = startMinutes;
  for (let i = 0; i < numProjects; i++) {
    const isLast = i === numProjects - 1;
    const currentEnd = isLast ? endMinutes : currentStart + minutesPerProject;
    ranges.push({ projectValue: PROJECT_VALUES[i], horaInicio: minutesToTime(currentStart), horaFim: minutesToTime(currentEnd) });
    currentStart = currentEnd;
  }
  return ranges;
}

const DEFAULT_COMENTARIO = envStr("SEFAZ_COMENTARIO", "Organização dos indicadores do projeto; cerimônia diária com o time e gestores; acompanhamento da evolução técnica e métricas de desempenho; facilitação das cerimônias; remoção de impedimentos; treinamento e capacitação do time; comunicação constante com gestores; promoção da cultura ágil; mediação de conflitos; incentivo ao feedback contínuo; colaboração no planejamento de entregas.");
function commentForProject(value) { return envStr(`SEFAZ_COMENTARIO_${value}`, DEFAULT_COMENTARIO); }

const SCHEDULE_CSV = envStr("SEFAZ_SCHEDULE_CSV", "");
const DRY_RUN = envBool("SEFAZ_DRY_RUN", false);

const TIMING = {
  slowMo: envNum("SEFAZ_SLOWMO", 250),
  stepPauseMs: envNum("SEFAZ_STEP_PAUSE", 700),
  afterSaveWaitMs: envNum("SEFAZ_AFTER_SAVE", 2000),
  betweenProjectsMs: envNum("SEFAZ_BETWEEN_PROJECTS", 1200),
  betweenDaysMs: envNum("SEFAZ_BETWEEN_DAYS", 1800),
  afterFillCommentsPauseMs: envNum("SEFAZ_AFTER_COMMENTS_PAUSE", 700),
};

const TZ = envStr("SEFAZ_TZ", "America/Recife");
const DATE_MODE = envStr("SEFAZ_DATE_MODE", "set").toLowerCase();
const DATE_SOURCE = envStr("SEFAZ_DATE_SOURCE", "daily").toLowerCase();
const START = envStr("SEFAZ_START", "01/12/2025");
const END = envStr("SEFAZ_END", "auto");
const DATES_LIST = parseCsv(envStr("SEFAZ_DATES", ""));
const WEEKDAYS_ONLY = envBool("SEFAZ_WEEKDAYS_ONLY", true);
const EXCLUDE_DATES = new Set(parseCsv(envStr("SEFAZ_EXCLUDE_DATES", "")));
const HOLIDAYS = new Set(parseCsv(envStr("SEFAZ_HOLIDAYS", "")));
const SKIP_HOLIDAYS = envBool("SEFAZ_SKIP_HOLIDAYS", false);
const STOP_IF_EMPTY_DATES = envBool("SEFAZ_STOP_IF_NO_DATES", true);

function parseBRDate(ddmmyyyy) { const [dd, mm, yyyy] = ddmmyyyy.split("/").map(Number); return new Date(yyyy, mm - 1, dd); }
function formatBRDate(d) { const dd = String(d.getDate()).padStart(2, "0"); const mm = String(d.getMonth() + 1).padStart(2, "0"); const yyyy = d.getFullYear(); return `${dd}/${mm}/${yyyy}`; }
function isWeekday(d) { const wd = d.getDay(); return wd >= 1 && wd <= 5; }

function todayTZ(_page) {
  // Resolve diretamente em Node.js — não precisa de página aberta
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric"
  });
  return fmt.format(new Date());
}

function buildDateRange(startStr, endStr) {
  const start = parseBRDate(startStr);
  const end = parseBRDate(endStr);
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { out.push(formatBRDate(d)); }
  return out;
}

function filterDates(dates) {
  const out = [];
  for (const s of dates) {
    const d = parseBRDate(s);
    if (WEEKDAYS_ONLY && !isWeekday(d)) continue;
    if (EXCLUDE_DATES.has(s)) continue;
    if (SKIP_HOLIDAYS && HOLIDAYS.has(s)) continue;
    out.push(s);
  }
  return out;
}

async function resolveDates(page) {
  const today = todayTZ(page);
  if (DATE_SOURCE === "daily") return filterDates([today]);
  if (DATE_SOURCE === "list") return filterDates(DATES_LIST);
  if (DATE_SOURCE === "range" || DATE_SOURCE === "backfill") {
    const end = END === "auto" ? today : END;
    return filterDates(buildDateRange(START, end));
  }
  console.warn(`⚠️ DATE_SOURCE inválido (${DATE_SOURCE}). Usando daily.`);
  return filterDates([today]);
}

function normalizeHeader(h) { return String(h || "").trim().toLowerCase().replace(/\s+/g, "_"); }

function parseScheduleCsv(csvText) {
  const rawLines = (csvText || "").split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  if (lines.length < 1) return { mode: null, rows: [] };
  const firstParts = lines[0].split(",").map((s) => s.trim());
  const firstNorm = firstParts.map(normalizeHeader);
  const looksLikeHeader = firstNorm.includes("data") && (firstNorm.includes("duracao") || (firstNorm.includes("hora_inicio") && firstNorm.includes("hora_fim")) || (firstNorm.includes("hora_inicio") && firstNorm.includes("hora_final")) || (firstNorm.includes("hora_inicio") && firstNorm.includes("hora_termino")));
  let headers = null;
  let startIdx = 0;
  if (looksLikeHeader) { headers = firstNorm; startIdx = 1; }
  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => (s || "").trim());
    if (!parts.length) continue;
    if (headers) {
      const obj = {};
      for (let c = 0; c < headers.length; c++) { obj[headers[c]] = parts[c] ?? ""; }
      rows.push(obj);
    } else {
      const data = parts[0]; const duracao = parts[1];
      if (data && duracao) rows.push({ data, duracao });
    }
  }
  const hasTimeRange = rows.some((r) => r.data && (r.hora_inicio || r.horaInicio) && (r.hora_fim || r.horaFim));
  const hasDuracao = rows.some((r) => r.data && (r.duracao || r.duração || r["duração"]));
  let mode = null;
  if (hasTimeRange) mode = "timerange";
  else if (hasDuracao) mode = "duracao";
  else mode = "duracao";
  const normRows = rows.map((r) => {
    const data = r.data || r.Data || r.DATA;
    const projeto = r.projeto || r.project || r.proj || r.project_value || r.projetos || "";
    const duracao = r.duracao || r["duração"] || r.duração || "";
    const hora_inicio = r.hora_inicio || r.horainicio || r.horaInicio || "";
    const hora_fim = r.hora_fim || r.horafim || r.horaFim || "";
    return { data, projeto, duracao, hora_inicio, hora_fim };
  });
  return { mode, rows: normRows.filter((r) => r.data) };
}

function loadScheduleFromEnv() {
  if (!SCHEDULE_CSV) return null;
  const full = path.isAbsolute(SCHEDULE_CSV) ? SCHEDULE_CSV : path.join(process.cwd(), SCHEDULE_CSV);
  if (!fs.existsSync(full)) throw new Error(`Arquivo de agenda não encontrado: ${full}`);
  const csv = fs.readFileSync(full, "utf-8");
  const parsed = parseScheduleCsv(csv);
  if (!parsed.rows.length) throw new Error(`Agenda vazia ou inválida em: ${full}`);
  const datas = filterDates(parsed.rows.map((r) => r.data));
  const allowed = new Set(datas);
  const filteredRows = parsed.rows.filter((r) => allowed.has(r.data));
  if (!filteredRows.length) throw new Error("Agenda foi totalmente filtrada. Verifique filtros do .env e o schedule.csv.");
  const duracaoByDate = new Map();
  const duracaoByKey = new Map();
  const timeRangeByKey = new Map();
  if (parsed.mode === "duracao") {
    const rowsByDate = new Map();
    for (const r of filteredRows) {
      if (!r.data || !r.duracao) continue;
      if (!isHHMM(r.duracao)) throw new Error(`CSV duração inválida em ${r.data}: "${r.duracao}" (use HH:MM)`);
      if (!rowsByDate.has(r.data)) rowsByDate.set(r.data, []);
      rowsByDate.get(r.data).push(r);
    }

    for (const [data, rowsOfDate] of rowsByDate.entries()) {
      const allWithoutProject = rowsOfDate.every((r) => !String(r.projeto || "").trim());

      // Compatibilidade com CSV antigo/colado manualmente:
      // data,duracao com várias linhas da mesma data significa uma duração por projeto,
      // seguindo a ordem de SEFAZ_PROJECT_VALUES.
      if (allWithoutProject && rowsOfDate.length > 1) {
        if (rowsOfDate.length > PROJECT_VALUES.length) {
          throw new Error(`CSV tem ${rowsOfDate.length} durações em ${data}, mas só ${PROJECT_VALUES.length} projetos configurados.`);
        }
        rowsOfDate.forEach((r, idx) => {
          const pv = PROJECT_VALUES[idx];
          if (!pv) return;
          duracaoByKey.set(`${data}|${pv}`, r.duracao);
        });
        console.log(`ℹ️ CSV sem coluna projeto em ${data}: atribuí ${rowsOfDate.length} durações pela ordem dos projetos.`);
        continue;
      }

      for (const r of rowsOfDate) {
        const proj = String(r.projeto || "").trim();
        if (proj) duracaoByKey.set(`${r.data}|${proj}`, r.duracao);
        else duracaoByDate.set(r.data, r.duracao);
      }
    }
  }
  if (parsed.mode === "timerange") {
    for (const r of filteredRows) {
      const data = r.data; const proj = String(r.projeto || "").trim();
      const hi = String(r.hora_inicio || "").trim(); const hf = String(r.hora_fim || "").trim();
      if (!data || !hi || !hf) continue;
      if (!isHHMM(hi) || !isHHMM(hf)) throw new Error(`CSV horário inválido em ${data}: "${hi}" -> "${hf}" (use HH:MM)`);
      const key = proj ? `${data}|${proj}` : data;
      timeRangeByKey.set(key, { horaInicio: hi, horaFim: hf });
    }
  }
  // Importante: em agenda por projeto existem várias linhas com a mesma data.
  // A execução precisa processar cada dia uma única vez e, dentro do dia, percorrer os projetos.
  const finalDates = [...new Set(filteredRows.map((r) => r.data))];
  return { file: full, mode: parsed.mode, dates: finalDates, duracaoByDate, duracaoByKey, timeRangeByKey };
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function step(label, ms = TIMING.stepPauseMs) { console.log(`▶ ${label}`); await sleep(ms); }

async function fillAdfsIfShown(page) {
  // Aguarda até 10s para o botão ADFS aparecer
  const adfsBtn = page.locator('[data-cy="button-adfs-loginPage"], a:has-text("ADFS"), a:has-text("Entrar com ADFS"), button:has-text("ADFS")');
  for(let i=0;i<5;i++){
    if(await adfsBtn.first().isVisible({timeout:2000}).catch(()=>false)){
      await step("Clicar em 'Entrar com ADFS-SEFAZPE'..."); 
      await adfsBtn.first().click({timeout:10000});
      console.log("✅ Clicou no botão ADFS.");
      break;
    }
    await sleep(1000);
  }
  await step("Aguardando tela do ADFS/Microsoft..."); 
  await page.waitForLoadState("domcontentloaded",{timeout:30000}).catch(()=>{});
  await sleep(1500);
  const email = page.locator('input[type="email"], input[name="loginfmt"], input[name="UserName"], #userNameInput');
  if (await email.count()) {
    await step("Preencher usuário no ADFS..."); await email.first().fill(USER);
    const nextBtn = page.locator('input[type="submit"], button[type="submit"], #next, #idSIButton9').first();
    if (await nextBtn.count()) await nextBtn.click();
  }
  await page.waitForLoadState("domcontentloaded");
  const pass = page.locator('input[type="password"], input[name="Password"], #passwordInput');
  if (await pass.count()) {
    await step("Preencher senha no ADFS..."); await pass.first().fill(PASS);
    const submit = page.locator('input[type="submit"], button[type="submit"], #submitButton, #idSIButton9').first();
    if (await submit.count()) await submit.click();
  }
  await page.waitForLoadState("domcontentloaded");
  const stayYes = page.locator('#idSIButton9:has-text("Yes"), #idSIButton9:has-text("Sim"), button:has-text("Sim"), button:has-text("Yes")');
  if (await stayYes.count()) { await step("Confirmar 'Continuar conectado' (se aparecer)..."); await stayYes.first().click(); }
}

async function ensureOnForm(page) {
  await step("Ir para novo apontamento..."); await page.goto(BASE_NEW, { waitUntil: "domcontentloaded" });
  await fillAdfsIfShown(page);
  await step("Aguardar carregar o Channel pós-login..."); await page.waitForLoadState("networkidle");
  const acessarExtrato = page.locator("#acessarExtrato");
  if (await acessarExtrato.count()) { await step("Clicar em [acessar extrato de horas...]"); await acessarExtrato.click(); await page.waitForLoadState("networkidle"); }
  const incluirNovo = page.locator("#incluirNovoApontamento");
  if (await incluirNovo.count()) { await step("Clicar em [incluir novo apontamento...]"); await incluirNovo.click(); await page.waitForLoadState("networkidle"); }
  await page.locator("#apontamento\\.projetosSelecionado").waitFor({ state: "visible", timeout: 30000 });
}

async function setOrValidateDate(page, expectedDate) {
  if (DATE_MODE === "skip") { await step("Pular data (DATE_MODE=skip)..."); return; }
  await step(`Data alvo = ${expectedDate} (DATE_MODE=${DATE_MODE})...`);

  const candidates = [
    'input[name="data"]',
    '#data',
    '#apontamento\\.data',
    'input[name="apontamento.data"]',
    'input[id*="data" i]',
  ];

  let dataInput = null;
  for (const selector of candidates) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await loc.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      if (await loc.isVisible().catch(() => false)) { dataInput = loc; break; }
    }
  }
  if (!dataInput) throw new Error("Campo de data não encontrado no formulário de apontamento.");

  const current = (await dataInput.inputValue()).trim();
  console.log("🗓 Data no campo antes:", current);

  if (DATE_MODE === "validate") {
    if (current !== expectedDate) throw new Error(`Data inválida. Esperado "${expectedDate}" e veio "${current}".`);
    return;
  }

  if (current !== expectedDate) {
    await step(`Ajustar data para ${expectedDate}...`);
    await dataInput.click({ clickCount: 3 }).catch(() => {});
    await dataInput.press("Control+A").catch(() => {});
    await dataInput.fill(expectedDate);

    // Alguns datepickers/máscaras do Channel não reagem só ao fill().
    // Força os eventos que atualizam o estado interno antes de salvar.
    await dataInput.evaluate((el, value) => {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur",   { bubbles: true }));
    }, expectedDate);

    await dataInput.press("Tab").catch(() => {});
    await sleep(250);
  }

  const after = (await dataInput.inputValue()).trim();
  console.log("🗓 Data no campo depois:", after);
  if (after !== expectedDate) throw new Error(`Falha ao ajustar data. Esperado "${expectedDate}" e ficou "${after}".`);
}

async function selectProject(page, projectValue) {
  await step(`Selecionar projeto ${projectValue} -> ${PROJECT_BY_VALUE.get(projectValue)}...`);
  const projectSelect = page.locator("#apontamento\\.projetosSelecionado");
  await projectSelect.selectOption({ value: projectValue });
  await step("Aguardar carregamento das atividades do projeto..."); await page.waitForLoadState("networkidle");
}

async function selectActivityType(page, activityValue) {
  const label = ACTIVITY_BY_VALUE.get(activityValue) || "Tipo desconhecido";
  await step(`Selecionar Tipo de Atividade: ${activityValue} -> ${label}...`);
  const sel = page.locator("#apontamento\\.idTipoAtividadeProjeto");
  if (!(await sel.count())) { console.log("⚠️ Select de Tipo de Atividade não encontrado. Seguindo sem selecionar."); return; }
  await sel.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(() => { const el = document.getElementById("apontamento.idTipoAtividadeProjeto"); return el && el.options && el.options.length > 1; }, { timeout: 15000 }).catch(() => {});
  const hasOpt = await sel.locator(`option[value="${activityValue}"]`).count();
  if (!hasOpt) { console.log(`⚠️ Tipo de Atividade value=${activityValue} não existe nas opções.`); return; }
  await sel.selectOption({ value: activityValue }); await page.waitForLoadState("networkidle");
}

async function fillDuracao(page, duracao) {
  await step(`Preencher duração: ${duracao}...`); await page.locator("#apontamento\\.duracao").fill(duracao);
}

async function fillTimeRange(page, horaInicio, horaFim) {
  await step(`Preencher hora início: ${horaInicio} | hora fim: ${horaFim}...`);
  const inicioInput = page.locator('input[name="apontamento.horaInicio"]');
  const fimInput = page.locator('input[name="apontamento.horaFim"]');
  if (await inicioInput.count()) { await inicioInput.fill(horaInicio); } else { await page.locator("#apontamento\\.horaInicio").fill(horaInicio); }
  if (await fimInput.count()) { await fimInput.fill(horaFim); } else { await page.locator("#apontamento\\.horaFim").fill(horaFim); }
}

async function fillComentarios(page, comentario) {
  await step("Preencher comentários (sem clicar/toggle)...");
  const filledByTinymce = await page.evaluate((txt) => {
    try {
      const ed = window.tinyMCE?.get("apontamento.comentario") || (window.tinyMCE?.editors?.length ? window.tinyMCE.editors[0] : null);
      if (!ed) return false; ed.setContent(txt); return true;
    } catch { return false; }
  }, comentario);
  if (!filledByTinymce) {
    const ta = page.locator('textarea[name="apontamento.comentario"]');
    await ta.waitFor({ state: "attached", timeout: 15000 }); await ta.fill(comentario);
  }
  const confirmation = await page.evaluate(() => {
    try {
      const ed = window.tinyMCE?.get("apontamento.comentario") || (window.tinyMCE?.editors?.length ? window.tinyMCE.editors[0] : null);
      if (ed) { const text = (ed.getContent({ format: "text" }) || "").trim(); return { mode: "TinyMCE", len: text.length, preview: text.slice(0, 160) }; }
    } catch {}
    const ta = document.querySelector('textarea[name="apontamento.comentario"]');
    const v = (ta?.value || "").trim(); return { mode: "textarea", len: v.length, preview: v.slice(0, 160) };
  });
  console.log(`📝 Comentário confirmado (${confirmation.mode}) [${confirmation.len} chars]:`, confirmation.preview);
  await sleep(TIMING.afterFillCommentsPauseMs);
}

async function clickSalvar(page) {
  if (DRY_RUN) { console.log("🧪 DRY RUN ativo: não vou clicar em Salvar."); return; }
  await step("Clicar em Salvar...");
  const salvarBtn = page.locator('input[name="btnSalvar"][value="Salvar"]');
  await salvarBtn.click();
  await step("Aguardar pós-salvar...", TIMING.afterSaveWaitMs); await page.waitForLoadState("networkidle");
  console.log("✅ Salvo (clique executado).");
}

function getTimeRangeOverrideFor(schedule, dateStr, projectValue) {
  if (!schedule) return null; if (schedule.mode !== "timerange") return null;
  const keyWithProject = `${dateStr}|${projectValue}`;
  if (schedule.timeRangeByKey.has(keyWithProject)) return schedule.timeRangeByKey.get(keyWithProject);
  if (schedule.timeRangeByKey.has(dateStr)) return schedule.timeRangeByKey.get(dateStr);
  return null;
}

function getDuracaoOverrideFor(schedule, dateStr, projectValue) {
  if (!schedule) return null;
  if (schedule.mode !== "duracao") return null;
  const keyWithProject = `${dateStr}|${projectValue}`;
  if (schedule.duracaoByKey?.has(keyWithProject)) return schedule.duracaoByKey.get(keyWithProject);
  if (schedule.duracaoByDate?.has(dateStr)) return schedule.duracaoByDate.get(dateStr);
  return null;
}

async function runForDate(page, dateStr, schedule) {
  console.log("\n====================================");
  console.log(`📅 PROCESSANDO DATA: ${dateStr}`);
  console.log("====================================");
  let timeRanges = [];
  if (USE_TIME_RANGE) {
    const allHaveCustom = PROJECT_VALUES.every((pv) => {
      const sch = getTimeRangeOverrideFor(schedule, dateStr, pv);
      if (sch) return true;
      const ini = horaInicioForProject(pv); const fim = horaFimForProject(pv);
      return ini && fim;
    });
    if (!allHaveCustom) {
      timeRanges = calculateTimeRanges();
      console.log("\n⏰ Distribuição automática de horários (fallback):");
      for (const tr of timeRanges) console.log(`  ${tr.projectValue} (${PROJECT_BY_VALUE.get(tr.projectValue)}): ${tr.horaInicio} - ${tr.horaFim}`);
    } else { console.log("\n⏰ Horários serão obtidos via CSV e/ou .env (sem distribuição automática)."); }
  }
  for (let i = 0; i < PROJECT_VALUES.length; i++) {
    const pv = PROJECT_VALUES[i]; const act = activityForProject(pv);
    console.log(`\n➡️ Projeto ${pv} (${PROJECT_BY_VALUE.get(pv)}) na data ${dateStr} | Atividade ${act} (${ACTIVITY_BY_VALUE.get(act) || "?"})`);
    await ensureOnForm(page);
    await selectProject(page, pv); await selectActivityType(page, act); await setOrValidateDate(page, dateStr);
    if (USE_TIME_RANGE) {
      const sch = getTimeRangeOverrideFor(schedule, dateStr, pv);
      if (sch) { await fillTimeRange(page, sch.horaInicio, sch.horaFim); }
      else {
        const customInicio = horaInicioForProject(pv); const customFim = horaFimForProject(pv);
        if (customInicio && customFim) { await fillTimeRange(page, customInicio, customFim); }
        else {
          const tr = timeRanges[i];
          if (!tr) throw new Error(`Sem horário para projeto ${pv} em ${dateStr}.`);
          await fillTimeRange(page, tr.horaInicio, tr.horaFim);
        }
      }
    } else {
      const durFromSchedule = getDuracaoOverrideFor(schedule, dateStr, pv);
      const durToUse = durFromSchedule || duracaoForProject(pv);
      await fillDuracao(page, durToUse);
    }
    await fillComentarios(page, commentForProject(pv)); await clickSalvar(page);
    await sleep(TIMING.betweenProjectsMs);
  }
  await sleep(TIMING.betweenDaysMs);
}

async function launchBrowserRPA() {
  const chromePath = process.env.CHROME_PATH || undefined;
  const base = {
    headless: false,
    slowMo: TIMING.slowMo,
    args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
  };
  
  // 1. CHROME_PATH explícito no .env
  if (chromePath) {
    console.log("🌐 Usando Chrome:", chromePath);
    return chromium.launch({ ...base, executablePath: chromePath });
  }
  
  // 2. Chrome instalado no sistema (mais confiável no Windows)
  try {
    const b = await chromium.launch({ ...base, channel: "chrome" });
    console.log("🌐 Chrome do sistema encontrado.");
    return b;
  } catch (_) {}

  // 3. MSEdge como alternativa
  try {
    const b = await chromium.launch({ ...base, channel: "msedge" });
    console.log("🌐 Microsoft Edge encontrado.");
    return b;
  } catch (_) {}

  // 4. Playwright Chromium baixado
  try {
    const b = await chromium.launch(base);
    console.log("🌐 Playwright Chromium encontrado.");
    return b;
  } catch (e) {
    const msg = [
      "❌ NENHUM BROWSER ENCONTRADO!",
      "",
      "Para corrigir, escolha UMA das opções:",
      "",
      "OPÇÃO A — Chrome já instalado (mais fácil):",
      "  Adicione no .env:",
      '  CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      "",
      "OPÇÃO B — Baixar Playwright Chromium:",
      "  (se tiver acesso à internet)",
      "  npx playwright install chromium",
      "",
      "OPÇÃO C — Edge já instalado:",
      "  (automático se o Edge estiver no caminho padrão)",
      "",
      "Erro original: " + e.message,
    ].join("\n");
    throw new Error(msg);
  }
}

(async () => {
  const browser = await launchBrowserRPA();
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  global.__rpaPage = page;
  try {
    console.log("🧾 CONFIG:");
    console.log(" - Projetos:", PROJECT_VALUES.map(v => `${v}(${PROJECT_BY_VALUE.get(v)})`).join(" | "));
    console.log(` - Atividade padrão: ${DEFAULT_ACTIVITY_VALUE} (${ACTIVITY_BY_VALUE.get(DEFAULT_ACTIVITY_VALUE) || "?"})`);
    console.log(` - DRY_RUN=${DRY_RUN}`);
    console.log(` - TZ=${TZ}`);
    console.log(` - DATE_SOURCE=${DATE_SOURCE} | START=${START} | END=${END}`);
    console.log(` - WEEKDAYS_ONLY=${WEEKDAYS_ONLY}`);
    console.log(` - EXCLUDE_DATES=${Array.from(EXCLUDE_DATES).join(", ") || "(nenhum)"}`);
    console.log(` - DATE_MODE=${DATE_MODE}`);
    console.log(` - USE_TIME_RANGE=${USE_TIME_RANGE}`);
    if (USE_TIME_RANGE) console.log(` - WORKDAY: ${WORKDAY_START} - ${WORKDAY_END}`);
    console.log(` - SCHEDULE_CSV=${SCHEDULE_CSV || "(não usado)"}`);
    const schedule = loadScheduleFromEnv();
    let dates = [];
    if (schedule) {
      dates = schedule.dates;
      console.log(`\n📆 Agenda CSV ativa: ${schedule.file}`);
      console.log(` - Modo detectado no CSV: ${schedule.mode}`);
    } else { dates = await resolveDates(page); }
    if (!dates.length) {
      console.log("⚠️ Nenhuma data para processar após filtros.");
      if (STOP_IF_EMPTY_DATES) { console.log("Encerrando (SEFAZ_STOP_IF_NO_DATES=true)."); return; }
    }
    console.log("\n📆 Datas finais para processar:"); console.log(dates.join(", "));
    for (const d of dates) { await runForDate(page, d, schedule); }
    console.log("\n🏁 Concluído."); await sleep(4000);
  } catch (err) { console.error("\n❌ Erro:", err?.message || err); await sleep(8000); }
  finally {
    global.__rpaPage = null;
    await browser.close();
  }
})();
