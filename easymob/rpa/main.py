import time
import json
import re
import os
from datetime import datetime, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright
from config import (
    SITE_LOGIN, ACCESS_KEY, USERNAME, PASSWORD, MODE, DRY_RUN, CONFIRM_REAL,
    CONFIRM_CUSTOM_TIME, SEL_ACCESS_KEY, SEL_USERNAME, SEL_PASSWORD, SEL_BTN_LOGIN,
    SEL_BTN_REGISTER, SEL_BTN_CONSULT, DEFAULT_HEADLESS, HORARIOS, JANELA_RETRY_MINUTOS,
    DUPLICATE_TOLERANCE_MINUTES, DAILY_TARGET_MINUTES, LUNCH_MINUTES, SCREENSHOT_POLICY,
    LIVE_PREVIEW, KEEP_LAST_SCREENSHOTS, KEEP_BROWSER_OPEN,
)
from jornada import get_horario_alvo_atual
from state_store import append_journal as store_append_journal, add_pending, update_state

ROOT = Path(__file__).resolve().parents[1]
LOGS_DIR = ROOT / "logs"
SHOTS_DIR = ROOT / "screenshots"
REPORTS_DIR = ROOT / "reports"
PROJECT_ROOT = ROOT.parent
DATA_DIR = PROJECT_ROOT / "data"
JOURNAL_PATH = DATA_DIR / "journal.jsonl"
PENDING_PATH = DATA_DIR / "pending-actions.json"
for d in (LOGS_DIR, SHOTS_DIR, REPORTS_DIR, DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)

LIVE_SHOT = SHOTS_DIR / "live.png"


def log(msg: str):
    line = f"{datetime.now().isoformat(timespec='seconds')} - {msg}"
    with (LOGS_DIR / "execucao.log").open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)


def write_report(payload: dict) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = REPORTS_DIR / f"report_{ts}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def append_journal(event: dict):
    """Journal padronizado JSONL, sem credenciais, sincronizado com estado central."""
    try:
        payload = {
            "module": "easymob",
            "action": event.get("action") or event.get("type") or "execution",
            "mode": "teste" if DRY_RUN else "real",
            "plannedTime": event.get("plannedTime") or event.get("target_time"),
            "executedAt": event.get("executedAt") or datetime.now().strftime("%H:%M"),
            "status": event.get("status"),
            "reason": event.get("reason"),
            "marksBefore": event.get("marksBefore"),
            "marksAfter": event.get("marksAfter"),
            "error": event.get("error"),
            "severity": event.get("severity", "info"),
            "nextRecommendedAction": event.get("nextRecommendedAction") or event.get("nextStep"),
            **{k: v for k, v in (event or {}).items() if k not in {"action", "type", "target_time", "status", "reason", "marksBefore", "marksAfter", "error", "severity", "nextRecommendedAction", "nextStep"}},
        }
        store_append_journal(payload)
    except Exception as e:
        log(f"AVISO: não consegui escrever journal: {e!r}")


def register_pending(kind: str, plan: dict = None, reason: str = "", error: str = "", severity: str = "critical"):
    plan = plan or {}
    try:
        return add_pending({
            "type": kind,
            "module": "easymob",
            "severity": severity,
            "cause": reason or error or plan.get("reason"),
            "plannedTime": plan.get("next_due") or plan.get("target_time"),
            "attemptedAt": datetime.now().isoformat(timespec="seconds"),
            "expectedAction": plan.get("action"),
            "recommendation": "Conferir EasyMOB, Service e Portal RH; se necessário, abrir acerto no Portal RH antes do Channel.",
            "marks": plan.get("marks") or [],
            "error": error,
        })
    except Exception as e:
        log(f"AVISO: não consegui registrar pendência: {e!r}")
        return None

def cleanup_screenshots():
    try:
        files = sorted([p for p in SHOTS_DIR.glob("*.png") if p.name != "live.png"], key=lambda p: p.stat().st_mtime, reverse=True)
        for p in files[KEEP_LAST_SCREENSHOTS:]:
            p.unlink(missing_ok=True)
    except Exception:
        pass


def safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", str(value or "step"))[:50]


def snapshot(page, label: str, report: dict = None, force_detail: bool = False, error: bool = False):
    """Captura controlada. Por padrão não cria histórico de imagens.
    - LIVE_PREVIEW ou policy live/all/diagnostic: sobrescreve live.png.
    - policy error: grava detalhe apenas em erro.
    - policy diagnostic/all ou force_detail: grava detalhe da etapa.
    """
    try:
        policy = SCREENSHOT_POLICY
        write_live = LIVE_PREVIEW or policy in ("live", "diagnostic", "all") or error
        write_detail = force_detail or policy in ("diagnostic", "all") or (error and policy in ("error", "diagnostic", "all", "live"))
        if write_live:
            page.screenshot(path=str(LIVE_SHOT), full_page=True)
        if write_detail:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            detail = SHOTS_DIR / f"{ts}_{safe_name(label)}.png"
            page.screenshot(path=str(detail), full_page=True)
            cleanup_screenshots()
            log(f"Screenshot [{label}] salvo em: {detail}")
            if report is not None:
                report.setdefault("screenshots", []).append({"label": label, "path": str(detail), "at": datetime.now().isoformat(timespec="seconds")})
            return detail
    except Exception as e:
        log(f"AVISO: não consegui capturar screenshot [{label}]: {e!r}")
    return None


def split_selectors(selectors: str):
    return [s.strip() for s in str(selectors or "").split(",") if s.strip()]


def first_visible(page, selectors: str, timeout=1600):
    tested = []
    for selector in split_selectors(selectors):
        tested.append(selector)
        try:
            loc = page.locator(selector).first
            if loc.is_visible(timeout=timeout):
                return loc, selector, tested
        except Exception as e:
            log(f"AVISO: seletor ignorado ({selector}): {e.__class__.__name__}")
    return None, None, tested


def fill_first(page, selectors: str, value: str, label: str, required=True):
    loc, selector, tested = first_visible(page, selectors)
    if not loc:
        if required:
            raise RuntimeError(f"Campo não encontrado: {label}. Seletores testados: {tested or selectors}")
        log(f"AVISO: campo opcional não encontrado: {label}")
        return False
    loc.click(timeout=8000)
    loc.fill("", timeout=8000)
    loc.fill(value or "", timeout=8000)
    log(f"Preencheu {label} via {selector}")
    return True


def clickable_text_candidates(page):
    loc = page.locator("button, input[type='button'], input[type='submit'], a, [role='button']")
    out = []
    try:
        count = loc.count()
    except Exception:
        return out
    for i in range(count):
        item = loc.nth(i)
        try:
            if not item.is_visible(timeout=500):
                continue
        except Exception:
            continue
        txt = ""
        val = ""
        title = ""
        try: txt = (item.inner_text(timeout=500) or "").strip()
        except Exception: pass
        try: val = (item.get_attribute("value", timeout=500) or "").strip()
        except Exception: pass
        try: title = (item.get_attribute("title", timeout=500) or "").strip()
        except Exception: pass
        label = " ".join([txt, val, title]).strip()
        if label:
            out.append((item, label))
    return out


def modal_is_visible(page) -> bool:
    for selector in ["#ModalConsultasMarcacoes", ".modal.show", ".modal.fade.in", "[role='dialog']"]:
        try:
            if page.locator(selector).first.is_visible(timeout=500):
                return True
        except Exception:
            pass
    return False


def close_mark_modal(page, report=None, reason="antes_da_acao"):
    """Fecha a modal de consulta de marcações que interceptou o clique no #btnRegistrar.

    Evidência real: em 15/06/2026, o plano ficou READY às 13:02, mas o clique
    em Registrar Ponto foi bloqueado por #ModalConsultasMarcacoes. Esta rotina
    sempre limpa modais/backdrops antes de registrar ou reconsultar.
    """
    if not modal_is_visible(page):
        return False
    log(f"Modal de consulta aberta detectada ({reason}). Fechando antes de continuar.")
    closed = False
    # 1) Tentativa normal pelos controles visíveis.
    candidates = [
        "#ModalConsultasMarcacoes button.close",
        "#ModalConsultasMarcacoes [data-dismiss='modal']",
        "#ModalConsultasMarcacoes input[value*='Fechar']",
        "#ModalConsultasMarcacoes button:has-text('Fechar')",
        ".modal.show button.close",
        ".modal.show [data-dismiss='modal']",
        ".modal.fade.in button.close",
        ".modal.fade.in [data-dismiss='modal']",
    ]
    for selector in candidates:
        try:
            loc = page.locator(selector).first
            if loc.is_visible(timeout=600):
                loc.click(timeout=1500, force=True)
                time.sleep(0.4)
                closed = True
                break
        except Exception:
            pass
    # 2) ESC, compatível com Bootstrap/modal padrão.
    if modal_is_visible(page):
        try:
            page.keyboard.press("Escape")
            time.sleep(0.5)
            closed = True
        except Exception:
            pass
    # 3) Fallback controlado por JS: remove apenas modal/backdrop, sem alterar campos.
    if modal_is_visible(page):
        try:
            page.evaluate("""
                () => {
                  const selectors = ['#ModalConsultasMarcacoes', '.modal.show', '.modal.fade.in', '[role="dialog"]'];
                  for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                      el.classList.remove('in', 'show');
                      el.style.display = 'none';
                      el.setAttribute('aria-hidden', 'true');
                    });
                  }
                  document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                  document.body.classList.remove('modal-open');
                  document.body.style.removeProperty('padding-right');
                }
            """)
            time.sleep(0.5)
            closed = True
        except Exception as e:
            log(f"AVISO: fallback JS para fechar modal falhou: {e!r}")
    if modal_is_visible(page):
        snapshot(page, "modal_ainda_aberta", report, error=True)
        raise RuntimeError("Modal de consulta continuou aberta e bloqueando a ação. Não vou tentar registrar por trás da modal.")
    if closed:
        log("Modal/backdrop fechados com segurança.")
    return closed


def ensure_register_clickable(page, report=None):
    close_mark_modal(page, report, reason="verificacao_pre_registro")
    loc, selector, tested = first_visible(page, SEL_BTN_REGISTER, timeout=1800)
    if not loc:
        raise RuntimeError(f"Botão Registrar Ponto não está visível. Seletores testados: {tested or SEL_BTN_REGISTER}")
    try:
        if not loc.is_enabled(timeout=1000):
            raise RuntimeError(f"Botão Registrar Ponto localizado em {selector}, mas está desabilitado.")
        loc.scroll_into_view_if_needed(timeout=3000)
        box = loc.bounding_box(timeout=1500)
        if not box or box.get("width", 0) <= 0 or box.get("height", 0) <= 0:
            raise RuntimeError(f"Botão Registrar Ponto localizado em {selector}, mas não possui área clicável.")
        log(f"Botão Registrar Ponto pronto para clique via {selector}.")
        return loc, selector
    except Exception:
        snapshot(page, "registrar_nao_clicavel", report, error=True)
        raise


def click_register_safely(page, report=None):
    """Clique real no Registrar Ponto, com fechamento de modal e retry controlado."""
    loc, selector = ensure_register_clickable(page, report)
    try:
        loc.click(timeout=12000)
        log(f"Clicou Registrar Ponto com validação prévia via {selector}")
        return True
    except Exception as first_error:
        log(f"AVISO: clique normal em Registrar falhou. Vou limpar modal/backdrop e tentar mais uma vez. Erro: {first_error!r}")
        close_mark_modal(page, report, reason="retry_registro")
        loc, selector, _ = first_visible(page, SEL_BTN_REGISTER, timeout=1200)
        if loc:
            loc.click(timeout=8000, force=True)
            log(f"Clicou Registrar Ponto com retry/force via {selector}")
            return True
        raise


def click_first(page, selectors: str, label: str, required=True, text_fallbacks=None):
    loc, selector, tested = first_visible(page, selectors)
    if loc:
        loc.click(timeout=12000)
        log(f"Clicou {label} via {selector}")
        return True

    fallbacks = [x.lower() for x in (text_fallbacks or [label, "Entrar", "Acessar", "Registrar", "Consultar"])]
    seen = []
    for item, text in clickable_text_candidates(page):
        seen.append(text)
        low = text.lower()
        if any(f and f in low for f in fallbacks):
            item.click(timeout=12000)
            log(f"Clicou {label} via texto visível: {text}")
            return True

    if required:
        body_preview = ""
        try:
            body_preview = (page.locator("body").inner_text(timeout=1200) or "")[:700]
        except Exception:
            pass
        raise RuntimeError(
            f"Botão não encontrado: {label}. Seletores testados: {tested or selectors}. "
            f"Botões visíveis: {seen[:20]}. Prévia da tela: {body_preview}"
        )
    log(f"AVISO: botão opcional não encontrado: {label}")
    return False


def validate_credentials():
    missing = []
    if not ACCESS_KEY: missing.append("EASYMOB_ACCESS_KEY/chave")
    if not USERNAME: missing.append("EASYMOB_USERNAME/usuário")
    if not PASSWORD: missing.append("EASYMOB_PASSWORD/senha")
    if missing:
        raise RuntimeError("Credenciais EasyMOB ausentes: " + ", ".join(missing))


def page_has_point_screen(page) -> bool:
    for selectors in (SEL_BTN_REGISTER, SEL_BTN_CONSULT):
        for selector in split_selectors(selectors):
            try:
                if page.locator(selector).first.is_visible(timeout=1200):
                    return True
            except Exception:
                pass
    try:
        txt = (page.locator("body").inner_text(timeout=2500) or "").lower()
        return any(w in txt for w in ["registrar ponto", "registrar", "marcação", "marcacao", "ponto", "marcações", "marcacoes"])
    except Exception:
        return False


def open_and_login(page, slow=False, report=None):
    validate_credentials()
    log(f"Abrindo EasyMOB ({MODE}): {SITE_LOGIN}")
    page.goto(SITE_LOGIN, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_load_state("domcontentloaded")
    if slow: time.sleep(0.8)
    snapshot(page, "01_login_aberto", report)

    log("Preenchendo login EasyMOB")
    fill_first(page, SEL_ACCESS_KEY, ACCESS_KEY, "chave/local")
    fill_first(page, SEL_USERNAME, USERNAME, "usuário")
    fill_first(page, SEL_PASSWORD, PASSWORD, "senha")
    if slow: time.sleep(0.8)
    snapshot(page, "02_login_preenchido", report)

    click_first(page, SEL_BTN_LOGIN, "Entrar", text_fallbacks=["entrar", "acessar", "login", "conectar"])
    try:
        page.wait_for_load_state("domcontentloaded", timeout=30000)
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    if slow: time.sleep(1.0)
    snapshot(page, "03_pos_login", report)

    if not page_has_point_screen(page):
        raise RuntimeError("Login executado, mas a tela de registro/consulta de ponto não foi reconhecida. Use Diagnóstico de página para mapear os seletores reais.")
    log("Login EasyMOB concluído e tela de ponto reconhecida.")


def extract_marks(page, report=None):
    marks = []
    try:
        click_first(page, SEL_BTN_CONSULT, "Consultar Marcações", required=False, text_fallbacks=["consultar", "marcações", "marcacoes"])
        time.sleep(1.2)
        snapshot(page, "04_consulta_marcacoes", report)
    except Exception as e:
        log(f"AVISO: não foi possível clicar em consultar: {e!r}")

    selectors = "li, tbody tr, .marcacao-item, [class*='marcacao'], [class*='marcação'], [class*='ponto'], [id*='marcacao'], [id*='marcação']"
    try:
        texts = page.locator(selectors).all_inner_texts()
        for t in texts:
            t = " ".join(t.split())
            if t and re.search(r"\b\d{1,2}:\d{2}\b", t):
                marks.append(t)
    except Exception:
        pass

    if not marks:
        try:
            body = page.locator("body").inner_text(timeout=3000)
            marks = sorted(set(re.findall(r"\b\d{1,2}:\d{2}\b", body)))
        except Exception:
            marks = []
    # A consulta abre uma modal no EasyMOB real. Se ela ficar aberta, bloqueia
    # o clique em Registrar Ponto. Fecha sempre depois de extrair as marcações.
    close_mark_modal(page, report, reason="pos_consulta")
    return list(dict.fromkeys(marks))


def hhmm_to_minutes(value: str):
    try:
        h, m = str(value).strip().split(":")[:2]
        return int(h) * 60 + int(m)
    except Exception:
        return None


def minutes_to_hhmm(value: int):
    value = max(0, int(value))
    return f"{value // 60:02d}:{value % 60:02d}"


def today_date_tokens():
    now = datetime.now()
    return {
        now.strftime("%d/%m/%Y"),
        now.strftime("%-d/%-m/%Y") if os.name != "nt" else now.strftime("%#d/%#m/%Y"),
        now.strftime("%Y-%m-%d"),
    }


def parse_date_token(value: str):
    raw = str(value or "")
    patterns = [
        r"\b(\d{1,2}/\d{1,2}/\d{4})\b",
        r"\b(\d{4}-\d{1,2}-\d{1,2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, raw)
        if not m:
            continue
        token = m.group(1)
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(token, fmt).date()
            except Exception:
                pass
    return None


def parse_times_from_text(value: str):
    out = []
    for match in re.findall(r"\b(\d{1,2}:\d{2})(?::\d{2})?\b", str(value or "")):
        minutes = hhmm_to_minutes(match)
        if minutes is not None:
            hh, mm = match.split(':')[:2]
            out.append((f"{int(hh):02d}:{int(mm):02d}", minutes))
    return out


def filter_marks_for_today(marks):
    """Mantém somente marcações do dia atual.

    O EasyMOB retorna histórico do mês inteiro. A regra de decisão diária NÃO pode
    usar marcações de dias anteriores, senão um 13:00 antigo bloqueia o retorno
    de almoço de hoje.

    Se algum texto vier sem data explícita, só uso como fallback quando não houver
    nenhuma marcação datada de hoje, para não perder compatibilidade com tela/simulado.
    """
    today = datetime.now().date()
    dated_today = []
    undated = []
    ignored_other_days = []

    for mark in marks or []:
        raw = str(mark or "").strip()
        if not raw:
            continue
        d = parse_date_token(raw)
        if d == today:
            dated_today.append(raw)
        elif d is None:
            undated.append(raw)
        else:
            ignored_other_days.append(raw)

    selected = dated_today if dated_today else undated
    return selected, ignored_other_days


def hhmmss_from_minutes(value: int):
    value = max(0, int(value))
    return f"{value // 60:02d}:{value % 60:02d}"


def extract_times_from_marks(marks):
    times = []
    for mark in marks or []:
        for hhmm, minutes in parse_times_from_text(mark):
            times.append((hhmm, minutes, mark))
    # remove duplicados por minuto mantendo ordem cronológica
    seen = set()
    out = []
    for hhmm, mins, raw in sorted(times, key=lambda x: x[1]):
        if mins in seen:
            continue
        seen.add(mins)
        out.append((hhmm, mins, raw))
    return out


def mark_already_done(marks, target_time):
    target = hhmm_to_minutes(target_time)
    if target is None:
        return any(str(target_time) in str(m) for m in marks or [])
    for _, minutes, raw in extract_times_from_marks(marks):
        if abs(minutes - target) <= DUPLICATE_TOLERANCE_MINUTES:
            return True
    return False


def current_minutes():
    now = datetime.now()
    return now.hour * 60 + now.minute


def due_datetime_from_hhmm(hhmm: str):
    mins = hhmm_to_minutes(hhmm)
    if mins is None:
        return None
    now = datetime.now()
    return now.replace(hour=mins // 60, minute=mins % 60, second=0, microsecond=0)


def seconds_until_hhmm(hhmm: str):
    due = due_datetime_from_hhmm(hhmm)
    if not due:
        return None
    return int((due - datetime.now()).total_seconds())


def build_day_plan(marks, target_time=None, single_run=False):
    all_marks = list(marks or [])
    today_marks, ignored_other_days = filter_marks_for_today(all_marks)
    times = extract_times_from_marks(today_marks)
    mins = [m for _, m, _ in times]
    now_min = current_minutes()
    target = target_time or None
    if not target:
        target, retry_end = get_horario_alvo_atual()
    else:
        retry_end = datetime.now() + timedelta(minutes=1)

    configured = HORARIOS[:]
    action = "none"
    label = "Sem ação"
    allowed = False
    reason = "Nenhuma ação necessária agora."
    next_due = None
    status = "NO_ACTION"

    # Jornada calculada somente pelas marcações de HOJE.
    if len(mins) == 0:
        action = "entrada"
        label = "Registrar entrada"
        allowed = True
        status = "READY"
        reason = "Nenhuma marcação encontrada hoje. Próxima ação é entrada."
        next_due = target or (configured[0] if configured else None)
    elif len(mins) == 1:
        action = "saida_almoco"
        label = "Registrar saída para almoço"
        lunch_target = configured[1] if len(configured) > 1 else target
        next_due = lunch_target
        # Se ainda estiver muito antes do alvo de almoço, não bate cedo.
        lunch_min = hhmm_to_minutes(lunch_target) if lunch_target else None
        if lunch_min is not None and now_min + DUPLICATE_TOLERANCE_MINUTES < lunch_min:
            allowed = False
            status = "WAIT_LUNCH_TIME"
            reason = f"Entrada encontrada às {minutes_to_hhmm(mins[0])}. Aguardando horário de saída para almoço: {next_due}."
        else:
            allowed = True
            status = "READY"
            reason = f"Entrada encontrada às {minutes_to_hhmm(mins[0])}; próxima ação é saída para almoço."
    elif len(mins) == 2:
        action = "retorno_almoco"
        label = "Registrar retorno do almoço"
        next_due_min = mins[1] + LUNCH_MINUTES
        next_due = minutes_to_hhmm(next_due_min)
        elapsed_lunch = now_min - mins[1]
        if elapsed_lunch < LUNCH_MINUTES:
            allowed = False
            status = "WAITING_LUNCH_RETURN"
            reason = f"Saída de almoço encontrada às {minutes_to_hhmm(mins[1])}. Intervalo mínimo de {LUNCH_MINUTES} min ainda não completado. Retorno mínimo: {next_due}."
        else:
            allowed = True
            status = "READY"
            reason = f"Saída para almoço às {minutes_to_hhmm(mins[1])}; intervalo mínimo respeitado."
    elif len(mins) == 3:
        morning = max(0, mins[1] - mins[0])
        remaining = max(0, DAILY_TARGET_MINUTES - morning)
        due_min = mins[2] + remaining
        next_due = minutes_to_hhmm(due_min)
        action = "saida_final"
        label = "Registrar saída final"
        if now_min + DUPLICATE_TOLERANCE_MINUTES < due_min:
            allowed = False
            status = "WAIT_FINAL_TIME"
            reason = f"Ainda não fechou a meta diária. Manhã={minutes_to_hhmm(morning)}, restante={minutes_to_hhmm(remaining)}. Saída prevista: {next_due}."
        else:
            allowed = True
            status = "READY"
            reason = f"Meta diária liberada. Saída prevista calculada: {next_due}."
    else:
        status = "COMPLETE"
        action = "none"
        allowed = False
        label = "Dia já possui quatro ou mais marcações"
        reason = "Já existem quatro ou mais marcações hoje. Não vou registrar duplicidade."

    # Importante: a tolerância de duplicidade NÃO pode cancelar a próxima ação só
    # porque existe uma marcação perto do alvo manual/configurado.
    # Exemplo real: almoço saiu às 12:02 e o alvo é 13:00. A ação correta é
    # aguardar/registrar retorno às 13:02, não dizer que 12:02 é “próximo de 13:00”.
    # A proteção contra duplicidade agora vem da quantidade/sequência de marcações
    # de HOJE: quando uma nova marcação aparecer, o plano muda para a próxima etapa
    # ou COMPLETE.

    if single_run and target and target not in configured and not CONFIRM_CUSTOM_TIME:
        status = "NEEDS_CUSTOM_TIME_CONFIRMATION"
        allowed = False
        reason = f"Horário {target} está fora da regra diária {configured}. Confirme execução fora da regra."

    return {
        "now": datetime.now().isoformat(timespec="seconds"),
        "date": datetime.now().strftime("%d/%m/%Y"),
        "target_time": target,
        "retry_until": retry_end.strftime("%H:%M") if retry_end else None,
        "configured_times": configured,
        "daily_target_minutes": DAILY_TARGET_MINUTES,
        "daily_target": minutes_to_hhmm(DAILY_TARGET_MINUTES),
        "lunch_minutes": LUNCH_MINUTES,
        "marks": today_marks,
        "all_marks_count": len(all_marks),
        "ignored_other_days_count": len(ignored_other_days),
        "times": [{"time": hhmm, "minutes": minutes, "raw": raw} for hhmm, minutes, raw in times],
        "action": action,
        "label": label,
        "allowed": allowed,
        "status": status,
        "reason": reason,
        "next_due": next_due,
        "dry_run": DRY_RUN,
        "mode": MODE,
    }

def validate_target(target: str, single_run: bool):
    if not re.match(r"^\d{2}:\d{2}$", target or ""):
        raise RuntimeError(f"Horário alvo inválido: {target}. Use HH:MM.")
    if single_run and target not in HORARIOS and not CONFIRM_CUSTOM_TIME:
        raise RuntimeError(f"Horário {target} está fora da regra diária {HORARIOS}. Confirme explicitamente no painel para executar fora da regra.")
    if not DRY_RUN and not CONFIRM_REAL:
        raise RuntimeError("Execução real bloqueada: EASYMOB_DRY_RUN=false exige confirmação explícita EASYMOB_CONFIRM_REAL=true.")


def launch(p, headless: bool, slow_mo: int):
    kwargs = {"headless": headless, "slow_mo": slow_mo if not headless else 0, "args": ["--start-maximized"]}
    chrome = os.getenv("CHROME_PATH", "").strip()
    if chrome:
        kwargs["executable_path"] = chrome
    return p.chromium.launch(**kwargs)


def test_login(slow_mo: int = 700, headless: bool = True):
    report = {"started_at": datetime.now().isoformat(timespec="seconds"), "type": "test_login", "mode": MODE, "dry_run": True, "steps": [], "status": "UNKNOWN"}
    with sync_playwright() as p:
        browser = launch(p, headless=headless, slow_mo=slow_mo)
        context = browser.new_context(viewport={"width": 1280, "height": 820})
        page = context.new_page()
        try:
            open_and_login(page, slow=not headless, report=report)
            report["status"] = "OK"
            rep = write_report(report)
            log(f"Teste de login OK. Report salvo em: {rep}")
            if not headless and KEEP_BROWSER_OPEN:
                input("Pressione ENTER para fechar o navegador EasyMOB...")
        except Exception as e:
            report["status"] = "NOK"
            report["error"] = repr(e)
            write_report(report)
            log(f"Erro no teste de login EasyMOB: {e!r}")
            snapshot(page, "erro_teste_login", report, error=True)
            raise
        finally:
            context.close()
            browser.close()
            log("Teste de login finalizado.")


def run(demo: bool = True, headless: bool = None, slow_mo: int = 700, pause: bool = False, single_run_time: str = None, plan_only: bool = False):
    if headless is None:
        headless = DEFAULT_HEADLESS

    single_run = bool(single_run_time)
    if single_run_time:
        horario_alvo_str = single_run_time
        log(f"EXECUÇÃO ÚNICA: alvo manual {horario_alvo_str}. A ação será calculada após consulta das marcações.")
    else:
        horario_alvo_str, dt_fim_janela = get_horario_alvo_atual()
        if not horario_alvo_str:
            log("Não é hora de bater o ponto EasyMOB pela regra. Encerrando sem ação.")
            update_state(easymob={"watchdog": {"status": "out_of_window", "lastCycleAt": datetime.now().isoformat(timespec="seconds")}})
            try:
                last_target = HORARIOS[-1] if HORARIOS else None
                last_min = hhmm_to_minutes(last_target) if last_target else None
                if last_min is not None and current_minutes() > last_min + JANELA_RETRY_MINUTOS:
                    register_pending("janela_perdida", {"target_time": last_target, "next_due": last_target, "action": "watchdog"}, "Watchdog executou fora da janela operacional configurada.", severity="warning")
                    append_journal({"action": "watchdog", "status": "missed_window", "plannedTime": last_target, "reason": "Fora da janela operacional; não inventar ponto.", "severity": "warning", "nextRecommendedAction": "Conferir realizado no Service/Portal RH e abrir acerto se necessário."})
            except Exception:
                pass
            return
        log(f"EXECUÇÃO ROTINEIRA: alvo {horario_alvo_str}; ação será calculada após consulta.")

    validate_target(horario_alvo_str, single_run=single_run)
    report = {
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "site_login": SITE_LOGIN,
        "mode": MODE,
        "dry_run": DRY_RUN,
        "target_time": horario_alvo_str,
        "configured_times": HORARIOS,
        "plan_only": plan_only,
        "steps": [],
        "status": "UNKNOWN",
    }

    def step(name, ok=True, extra=None):
        s = {"name": name, "ok": ok, "at": datetime.now().isoformat(timespec="seconds")}
        if extra is not None: s["extra"] = extra
        report["steps"].append(s)

    with sync_playwright() as p:
        browser = launch(p, headless=headless, slow_mo=(slow_mo if (demo and not headless) else 0))
        context = browser.new_context(viewport={"width": 1280, "height": 820})
        page = context.new_page()
        try:
            open_and_login(page, slow=(demo and not headless), report=report)
            step("login")

            marks = extract_marks(page, report=report)
            log("Marcações encontradas na tela: " + (", ".join(marks) if marks else "nenhuma"))
            step("consult_marks", extra={"marks": marks})

            plan = build_day_plan(marks, target_time=horario_alvo_str, single_run=single_run)
            report["plan"] = plan
            update_state(easymob={"marksToday": plan.get("marks") or [], "nextAction": plan.get("action"), "plannedTime": plan.get("next_due") or plan.get("target_time"), "lastPlan": plan, "watchdog": {"status": "cycle", "lastCycleAt": datetime.now().isoformat(timespec="seconds")}})
            log("Marcações consideradas para HOJE: " + (", ".join(plan.get("marks") or []) if plan.get("marks") else "nenhuma"))
            if plan.get("ignored_other_days_count"):
                log(f"Histórico ignorado para decisão de hoje: {plan.get('ignored_other_days_count')} marcações de outros dias.")
            log("Plano calculado: " + json.dumps({k: plan[k] for k in ["status", "action", "label", "allowed", "reason", "next_due", "dry_run"]}, ensure_ascii=False))
            step("plan", extra=plan)

            # Se o agendamento disparar um pouco antes do horário permitido do retorno/final,
            # o próprio robô aguarda e consulta de novo, em vez de encerrar errado.
            if (not plan_only) and (not plan.get("allowed")) and plan.get("next_due") and plan.get("status") in ("WAITING_LUNCH_RETURN", "WAIT_FINAL_TIME", "WAIT_LUNCH_TIME"):
                wait_seconds = seconds_until_hhmm(plan.get("next_due"))
                max_wait = int(os.getenv("EASYMOB_MAX_WAIT_MINUTES", "30")) * 60
                if wait_seconds is not None and 0 < wait_seconds <= max_wait:
                    log(f"Aguardando horário correto ({plan.get('next_due')}) por {wait_seconds}s antes de reconsultar.")
                    time.sleep(wait_seconds + 3)
                    marks = extract_marks(page, report=report)
                    plan = build_day_plan(marks, target_time=horario_alvo_str, single_run=single_run)
                    report["plan_after_wait"] = plan
                    log("Reconsulta após espera. Marcações consideradas para HOJE: " + (", ".join(plan.get("marks") or []) if plan.get("marks") else "nenhuma"))
                    log("Plano após espera: " + json.dumps({k: plan[k] for k in ["status", "action", "label", "allowed", "reason", "next_due", "dry_run"]}, ensure_ascii=False))
                    step("plan_after_wait", extra=plan)
                elif wait_seconds is not None and wait_seconds > max_wait:
                    log(f"Próxima ação calculada para {plan.get('next_due')}, mas está além do limite de espera automática de {max_wait//60} min. Use agendamento.")

            if plan_only:
                report["status"] = "PLAN_ONLY"
                log("PLAN ONLY: nenhuma ação será executada.")
            elif not plan.get("allowed"):
                report["status"] = plan.get("status") or "NO_ACTION"
                log("Nenhum registro será executado: " + plan.get("reason", "sem motivo"))
            elif DRY_RUN:
                log(f"DRY RUN: {plan['label']} agora, mas NÃO cliquei em Registrar.")
                step("dry_run_register_skipped", extra={"target": horario_alvo_str, "plan": plan})
                report["status"] = "DRY_RUN_READY"
            else:
                log(f"MODO REAL: {plan['label']} agora.")
                before_count = len(plan.get("times") or [])
                click_register_safely(page, report=report)
                time.sleep(1.8)
                snapshot(page, "05_pos_registro", report)
                step("register_punch")
                # Confirmação pós-registro: reconsulta e grava evidência textual no report/journal.
                try:
                    marks_after = extract_marks(page, report=report)
                    plan_after = build_day_plan(marks_after, target_time=horario_alvo_str, single_run=single_run)
                    report["marks_after_register"] = marks_after
                    report["plan_after_register"] = plan_after
                    after_count = len(plan_after.get("times") or [])
                    if after_count <= before_count:
                        log("AVISO: registro clicado, mas a reconsulta não mostrou nova marcação. Verifique no EasyMOB/Portal RH.")
                        report["status"] = "OK_NEEDS_CONFIRMATION"
                        register_pending("ponto_nao_registrado", plan, "Registro clicado, mas a nova marcação não apareceu na reconsulta.")
                    else:
                        log("Registro confirmado pela reconsulta das marcações do dia.")
                        report["status"] = "OK"
                    update_state(easymob={"marksToday": plan_after.get("marks") or [], "nextAction": plan_after.get("action"), "plannedTime": plan_after.get("next_due") or plan_after.get("target_time"), "lastExecution": {"status": report.get("status"), "finishedAt": datetime.now().isoformat(timespec="seconds"), "action": plan.get("action")}})
                except Exception as confirm_error:
                    log(f"AVISO: não consegui confirmar o registro por reconsulta: {confirm_error!r}")
                    report["status"] = "OK_NEEDS_CONFIRMATION"
                    register_pending("ponto_nao_registrado", plan, "Falha na confirmação pós-registro.", repr(confirm_error))

            report["finished_at"] = datetime.now().isoformat(timespec="seconds")
            rep_path = write_report(report)
            log(f"Report JSON salvo em: {rep_path}")
            final_plan = report.get("plan_after_register") or report.get("plan_after_wait") or report.get("plan") or {}
            append_journal({
                "action": final_plan.get("action"),
                "status": report.get("status"),
                "target_time": horario_alvo_str,
                "plannedTime": final_plan.get("next_due") or horario_alvo_str,
                "dry_run": DRY_RUN,
                "reason": final_plan.get("reason"),
                "marksBefore": (report.get("plan_after_wait") or report.get("plan") or {}).get("marks"),
                "marksAfter": final_plan.get("marks"),
                "plan": final_plan,
                "report": str(rep_path),
            })
            snapshot(page, "99_final", report)

            if pause and not headless:
                input("Pressione ENTER para fechar o navegador EasyMOB...")
        except Exception as e:
            report["status"] = "NOK"
            report["error"] = repr(e)
            report["finished_at"] = datetime.now().isoformat(timespec="seconds")
            rep_path = write_report(report)
            log(f"Erro EasyMOB: {e!r}")
            log(f"Report JSON salvo em: {rep_path}")
            kind = "falha_modal" if "Modal" in repr(e) or "modal" in repr(e).lower() else "ponto_nao_registrado"
            register_pending(kind, report.get("plan_after_wait") or report.get("plan"), "Falha na execução EasyMOB", repr(e))
            update_state(easymob={"lastExecution": {"status": "failed", "finishedAt": datetime.now().isoformat(timespec="seconds"), "error": repr(e)}})
            append_journal({
                "action": (report.get("plan_after_wait") or report.get("plan") or {}).get("action"),
                "status": "failed",
                "severity": "critical",
                "target_time": horario_alvo_str if 'horario_alvo_str' in locals() else None,
                "dry_run": DRY_RUN,
                "error": repr(e),
                "plan": report.get("plan_after_wait") or report.get("plan"),
                "report": str(rep_path),
                "nextStep": "Conferir EasyMOB/Service/Portal RH e repetir pelo watchdog se ainda estiver dentro da janela.",
            })
            snapshot(page, "erro_execucao", report, error=True)
            raise
        finally:
            context.close()
            browser.close()
            log("Execução EasyMOB finalizada")
