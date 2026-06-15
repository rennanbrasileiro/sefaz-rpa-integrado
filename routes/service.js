// routes/service.js — Service Datainfo com reconexão robusta
const { sleep, launchBrowser } = require('./helpers');

const SERVICE_BASE   = 'https://service.datainfo.inf.br/apex/r/data1p/service';
const URL_LOGIN      = `${SERVICE_BASE}/login`;
const URL_CONSULTA   = `${SERVICE_BASE}/consulta-do-lan%C3%A7amento-do-realizado`;
const URL_LANCAMENTO = `${SERVICE_BASE}/lan%C3%A7amento-de-realizado?clear=30`;

function maskUser(user = '') {
  const s = String(user || '');
  if (s.length <= 3) return '***';
  return `${s.slice(0, 3)}***`;
}

async function waitSettled(page, ms = 1200) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await sleep(ms);
}

async function isVisible(page, selector, timeout = 1500) {
  return page.locator(selector).first().isVisible({ timeout }).catch(() => false);
}

async function forceFill(locator, value) {
  await locator.click().catch(() => {});
  await locator.fill('').catch(() => {});
  await locator.fill(value).catch(() => {});
  await locator.evaluate((el, val) => {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, val); else el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur',   { bubbles: true }));
  }, value).catch(() => {});
  await locator.press('Tab').catch(() => {});
}

async function fillFirstAvailable(page, selectors, value, label) {
  for (const s of selectors) {
    const el = page.locator(s).first();
    if (await el.isVisible({ timeout: 1800 }).catch(() => false)) {
      await forceFill(el, value);
      console.log(`📅 ${label}: preencheu ${s} = ${value}`);
      return true;
    }
  }
  return false;
}

async function clickFirstAvailable(page, selectors, label) {
  for (const s of selectors) {
    const el = page.locator(s).first();
    if (await el.isVisible({ timeout: 1800 }).catch(() => false)) {
      await el.click().catch(async () => { await el.dispatchEvent('click').catch(() => {}); });
      console.log(`🖱️ ${label}: clicou ${s}`);
      await waitSettled(page, 1000);
      return true;
    }
  }
  return false;
}

async function clickTextLike(page, words, label) {
  const clicked = await page.evaluate((needles) => {
    const norm = (s) => String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
    const ns = needles.map(norm);
    const els = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="submit"],.t-Button,.a-Button'));
    for (const el of els) {
      const text = norm(el.innerText || el.textContent || el.value || el.getAttribute('title') || el.getAttribute('aria-label') || '');
      if (!text) continue;
      if (ns.every((n) => text.includes(n))) {
        el.click();
        return text;
      }
    }
    return '';
  }, words).catch(() => '');
  if (clicked) {
    console.log(`🖱️ ${label}: clicou por texto "${clicked}"`);
    await waitSettled(page, 1200);
    return true;
  }
  return false;
}

async function serviceLogin(page, user, pass, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`🔐 Service: login tentativa ${attempt}/${retries} (${maskUser(user)})...`);

    await page.goto(URL_LOGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitSettled(page, 1200);

    const logged = await page.locator('.t-Header, #t_Header, .t-PageBody').first()
      .isVisible({ timeout: 2000 }).catch(() => false);
    if (logged && !page.url().includes('login')) {
      console.log('✅ Sessão já ativa.');
      return true;
    }

    const uFld = page.locator('#P9999_USERNAME, input[name="P9999_USERNAME"], input[type="text"]').first();
    const hasFld = await uFld.isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasFld) {
      console.log(`⚠️ Campo de login não apareceu (tentativa ${attempt})`);
      await sleep(2500);
      continue;
    }

    await forceFill(uFld, user);
    const pFld = page.locator('#P9999_PASSWORD, input[name="P9999_PASSWORD"], input[type="password"]').first();
    await forceFill(pFld, pass);

    const saveUser = page.locator('input[type="checkbox"][name*="save"], input[type="checkbox"][id*="save"], input[type="checkbox"][id*="lembrar"]').first();
    if (await saveUser.count()) await saveUser.check().catch(() => {});

    const clicked = await clickFirstAvailable(page, ['#Conectar', 'button:has-text("Conectar")', 'button:has-text("Entrar")', 'input[type="submit"]'], 'Login');
    if (!clicked) await pFld.press('Enter').catch(() => {});

    await waitSettled(page, 2200);
    const nowUrl = page.url();
    console.log(`🔐 URL após login: ${nowUrl}`);

    if (!nowUrl.includes('login')) {
      console.log('✅ Login OK!');
      return true;
    }

    const errEl = page.locator('.t-Body-alert, .apex-error-header, [role="alert"]').first();
    if (await errEl.count()) {
      const errTxt = await errEl.textContent().catch(() => '');
      if (errTxt) console.log(`⚠️ Erro exibido: ${errTxt.trim()}`);
    }
    await sleep(2000);
  }
  throw new Error(`Falha no login do Service após ${retries} tentativas. Verifique usuário e senha.`);
}

async function pageLooksLikeConsulta(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase();
    const hasConsultaText = text.includes('consulta') && (text.includes('realizado') || text.includes('lançamento') || text.includes('lancamento'));
    const hasReport = !!document.querySelector('.a-IRR, .a-IRR-table, .a-IRR-reportView, .t-Report, table');
    const hasDate = !!document.querySelector('input[id*="DATA"], input[name*="DATA"], input[id*="DAT_"], a-date-picker input');
    return hasConsultaText || (hasReport && hasDate);
  }).catch(() => false);
}

async function navigateToConsultaFromHome(page) {
  const candidates = [
    ['consulta', 'realizado'],
    ['consulta', 'lancamento', 'realizado'],
    ['consulta', 'lançamento', 'realizado'],
    ['realizado'],
  ];
  for (const words of candidates) {
    if (await clickTextLike(page, words, 'Menu consulta realizado')) {
      if (await pageLooksLikeConsulta(page)) return true;
    }
  }
  return false;
}

async function serviceGoto(page, url, user, pass, expected = null) {
  for (let i = 0; i < 3; i++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitSettled(page, 1200);

    const nowUrl = page.url();
    if (nowUrl.includes('login')) {
      console.log(`⚠️ Redirecionado para login, reconectando... (tentativa ${i + 1})`);
      await serviceLogin(page, user, pass);
      continue;
    }

    if (!expected || await expected(page)) {
      console.log(`✅ Na página: ${page.url()}`);
      return true;
    }

    console.log('⚠️ URL abriu, mas a tela esperada ainda não apareceu. Tentando pelo menu...');
    if (await navigateToConsultaFromHome(page)) return true;
  }
  throw new Error('Não conseguiu acessar a página esperada após reconexões. Verifique se o menu/URL do Service mudou.');
}

async function fillConsultaPeriodo(page, dataInicio, dataFim) {
  const inicioSelectors = [
    '#P_DATA_INICIO', '#P_DAT_INICIO', '#P_DT_INICIO', '#P_DATAINI', '#P_DATA_INICIAL',
    'input[name="P_DATA_INICIO"]', 'input[name*="DATA_INICIO"]', 'input[name*="DAT_INICIO"]',
    'input[id*="DATA_INICIO"]', 'input[id*="DAT_INICIO"]',
    'a-date-picker[id*="INICIO"] input', 'a-date-picker[id*="INI"] input',
    'input[placeholder*="Início" i]', 'input[placeholder*="inicio" i]', 'input[aria-label*="Início" i]',
  ];
  const fimSelectors = [
    '#P_DATA_FIM', '#P_DAT_FIM', '#P_DT_FIM', '#P_DATAFIM', '#P_DATA_FINAL',
    'input[name="P_DATA_FIM"]', 'input[name*="DATA_FIM"]', 'input[name*="DAT_FIM"]',
    'input[id*="DATA_FIM"]', 'input[id*="DAT_FIM"]',
    'a-date-picker[id*="FIM"] input', 'a-date-picker[id*="FINAL"] input',
    'input[placeholder*="Fim" i]', 'input[placeholder*="final" i]', 'input[aria-label*="Fim" i]',
  ];

  let filledInicio = false;
  let filledFim = false;
  if (dataInicio) filledInicio = await fillFirstAvailable(page, inicioSelectors, dataInicio, 'Data início');
  if (dataFim) filledFim = await fillFirstAvailable(page, fimSelectors, dataFim, 'Data fim');

  // Fallback: se a tela só tiver dois date pickers sem ID previsível.
  if ((!filledInicio || !filledFim) && (dataInicio || dataFim)) {
    const generic = page.locator('a-date-picker input, input[id*="DATA"], input[name*="DATA"], input[id*="DAT_"]');
    const count = await generic.count().catch(() => 0);
    if (!filledInicio && dataInicio && count >= 1) { await forceFill(generic.nth(0), dataInicio); filledInicio = true; console.log('📅 Data início preenchida por fallback genérico'); }
    if (!filledFim && dataFim && count >= 2) { await forceFill(generic.nth(1), dataFim); filledFim = true; console.log('📅 Data fim preenchida por fallback genérico'); }
  }

  await waitSettled(page, 500);
  return { filledInicio, filledFim };
}

async function pesquisarConsulta(page) {
  const clicked = await clickFirstAvailable(page, [
    'button:has-text("Pesquisar")', 'button:has-text("Buscar")', 'button:has-text("Filtrar")',
    'button:has-text("Aplicar")', '.t-Button:has-text("Pesquisar")', '.t-Button:has-text("Buscar")',
    'input[type="submit"][value*="Pesquisar" i]', 'input[type="submit"][value*="Buscar" i]',
    'button[type="submit"]', 'input[type="submit"]',
  ], 'Pesquisar');

  if (!clicked) {
    await clickTextLike(page, ['pesquisar'], 'Pesquisar') ||
    await clickTextLike(page, ['buscar'], 'Buscar') ||
    await clickTextLike(page, ['filtrar'], 'Filtrar');
  }
  await waitSettled(page, 2200);
}

async function extractConsultaRows(page) {
  return page.evaluate(() => {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const results = [];
    const seen = new Set();
    const selectors = [
      '.a-IRR-table tbody tr',
      '.a-IRR-reportView tbody tr',
      'table.t-Report-report tbody tr',
      '.t-Report tbody tr',
      'table tbody tr',
    ];

    function pushRow(obj) {
      const vals = Object.values(obj).map(norm).filter(Boolean);
      if (!vals.length) return;
      const key = vals.join('|');
      if (seen.has(key)) return;
      seen.add(key);
      results.push(obj);
    }

    for (const sel of selectors) {
      const trs = Array.from(document.querySelectorAll(sel));
      if (!trs.length) continue;
      for (const tr of trs) {
        if (tr.closest('thead')) continue;
        const tds = Array.from(tr.querySelectorAll('td'));
        if (tds.length < 2) continue;
        const table = tr.closest('table');
        const ths = table ? Array.from(table.querySelectorAll('thead th')) : [];
        const obj = {};
        if (ths.length >= tds.length) {
          ths.forEach((th, i) => {
            if (!tds[i]) return;
            const k = norm(th.innerText || th.textContent) || `col${i}`;
            obj[k] = norm(tds[i].innerText || tds[i].textContent);
          });
        } else {
          tds.forEach((td, i) => { obj[`col${i}`] = norm(td.innerText || td.textContent); });
        }
        pushRow(obj);
      }
      if (results.length) break;
    }
    return results;
  });
}

// ─── CONSULTAR REALIZADO ──────────────────────────────────────────────────────
async function fetchRealizado(req, res) {
  const { serviceUser, servicePass, dataInicio, dataFim } = req.body;
  if (!serviceUser || !servicePass) {
    return res.status(400).json({ error: 'Credenciais do Service obrigatórias.' });
  }

  let browser = null;
  let page = null;
  try {
    browser = await launchBrowser({ headless: false, slowMo: 150 });
    const ctx  = await browser.newContext({ viewport: null });
    page = await ctx.newPage();
    global.__rpaPage = page;

    await serviceLogin(page, serviceUser, servicePass);

    console.log('📋 Acessando consulta de realizado...');
    await serviceGoto(page, URL_CONSULTA, serviceUser, servicePass, pageLooksLikeConsulta);

    const filled = await fillConsultaPeriodo(page, dataInicio, dataFim);
    if ((dataInicio && !filled.filledInicio) || (dataFim && !filled.filledFim)) {
      console.log('⚠️ Nem todos os campos de período foram identificados. A tela pode ter mudado; seguindo para tentar pesquisar/extrair.');
    }

    await pesquisarConsulta(page);
    const rows = await extractConsultaRows(page);
    console.log(`📋 ${rows.length} registros encontrados.`);

    const currentUrl = page.url();
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    global.__rpaPage = null;
    await browser.close();

    res.json({
      ok: true,
      rows,
      total: rows.length,
      currentUrl,
      screenshotBase64: screenshot.toString('base64'),
    });
  } catch (e) {
    console.error('❌ Service consulta:', e.message);
    let screenshotBase64 = null;
    let currentUrl = null;
    try {
      if (page) {
        currentUrl = page.url();
        const sc = await page.screenshot({ type: 'png', fullPage: false }).catch(() => null);
        if (sc) screenshotBase64 = sc.toString('base64');
      }
    } catch (_) {}
    global.__rpaPage = null;
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: e.message, currentUrl, screenshotBase64 });
  }
}

// ─── LANÇAR NO SERVICE ────────────────────────────────────────────────────────
async function lancarRealizado(req, res) {
  const {
    serviceUser, servicePass,
    data, horaInicio = '08:00', horaFim = '12:00',
    descricao = '', conclusao = 99,
    projeto = 'PJ11734', atividade = '397703',
    tipoEsforco = '1', tipoAtividade = '1',
  } = req.body;

  if (!serviceUser || !servicePass) return res.status(400).json({ error: 'Credenciais obrigatórias.' });
  if (!data) return res.status(400).json({ error: 'Data obrigatória.' });

  let browser = null;
  try {
    browser = await launchBrowser({ headless: false, slowMo: 250 });
    const ctx  = await browser.newContext({ viewport: null });
    const page = await ctx.newPage();
    global.__rpaPage = page;

    // Login
    await serviceLogin(page, serviceUser, servicePass);

    // Navegar ao formulário
    console.log('📝 Acessando formulário de lançamento...');
    await serviceGoto(page, URL_LANCAMENTO, serviceUser, servicePass);
    await sleep(2000);

    // ── Data ──────────────────────────────────────────────────────────────────
    console.log(`📝 Data: ${data}`);
    const dateFld = page.locator(
      'a-date-picker[id="P30_DAT_ESFORCO_TELA"] input, input[name="P30_DAT_ESFORCO_TELA"], #P30_DAT_ESFORCO_TELA'
    ).first();
    if (await dateFld.isVisible({ timeout: 10000 }).catch(() => false)) {
      await dateFld.click(); await dateFld.fill(''); await dateFld.fill(data);
      await dateFld.press('Tab');
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(1200);
    }

    // ── Projeto ───────────────────────────────────────────────────────────────
    console.log(`📝 Projeto: ${projeto}`);
    const projSel = page.locator('#P30_PROJETO');
    if (await projSel.isVisible({ timeout: 8000 }).catch(() => false)) {
      await projSel.selectOption({ value: projeto });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await sleep(1000);
    }

    // ── Atividade ─────────────────────────────────────────────────────────────
    console.log(`📝 Atividade: ${atividade}`);
    const atSel = page.locator('#P30_SEQ_ORDEM_SERVICO');
    if (await atSel.isVisible({ timeout: 8000 }).catch(() => false)) {
      const hasOpt = await atSel.locator(`option[value="${atividade}"]`).count();
      if (hasOpt) {
        await atSel.selectOption({ value: atividade });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await sleep(800);
      } else {
        console.log(`⚠️ Atividade ${atividade} não encontrada nas opções`);
      }
    }

    // ── Hora Início ───────────────────────────────────────────────────────────
    console.log(`📝 Hora Início: ${horaInicio}, Término: ${horaFim}`);
    const hiFld = page.locator('#P30_HOR_INICIO');
    if (await hiFld.count()) { await hiFld.click(); await hiFld.fill(horaInicio); await sleep(300); }

    const hfFld = page.locator('#P30_HOR_TERMINO');
    if (await hfFld.count()) { await hfFld.click(); await hfFld.fill(horaFim); await sleep(300); }

    // ── Conclusão ─────────────────────────────────────────────────────────────
    const cEl = page.locator('#P30_PER_CONCLUI');
    if (await cEl.count() && !await cEl.isDisabled().catch(() => true)) {
      await cEl.fill(String(conclusao));
    }

    // ── Tipo Esforço ──────────────────────────────────────────────────────────
    const teEl = page.locator('#P30_TIP_ESFORCO');
    if (await teEl.count()) await teEl.selectOption({ value: tipoEsforco }).catch(() => {});

    // ── Tipo Atividade ────────────────────────────────────────────────────────
    const taEl = page.locator('#P30_TIP_ORDEM_SERVICO');
    if (await taEl.count() && !await taEl.isDisabled().catch(() => true)) {
      await taEl.selectOption({ value: tipoAtividade }).catch(() => {});
    }

    // ── Descrição ─────────────────────────────────────────────────────────────
    if (descricao) {
      const desEl = page.locator('#P30_DES_ESFORCO');
      if (await desEl.count()) await desEl.fill(descricao.substring(0, 500));
    }

    await sleep(1000);
    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    global.__rpaPage = null;
    await browser.close();
    res.json({ ok: true, horaInicio, horaFim, screenshotBase64: screenshot.toString('base64') });
  } catch (e) {
    console.error('❌ Service lançar:', e.message);
    global.__rpaPage = null;
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: e.message });
  }
}

module.exports = { fetchRealizado, lancarRealizado };
