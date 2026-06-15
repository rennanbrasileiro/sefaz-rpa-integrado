from pathlib import Path
import os

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SIMULADO_LOGIN = PROJECT_ROOT / "simulado" / "login.html"


def env(name: str, default: str = "") -> str:
    value = os.getenv(name)
    if value is None or str(value).strip() == "":
        return default
    return str(value).strip()


def env_bool(name: str, default: bool = False) -> bool:
    raw = env(name, "")
    if raw == "":
        return default
    return raw.lower() in ("1", "true", "yes", "sim", "s", "on")


def env_int(name: str, default: int) -> int:
    try:
        return int(env(name, str(default)) or str(default))
    except Exception:
        return default

MODE = env("EASYMOB_MODE", "real").lower()
SITE_LOGIN = env("EASYMOB_SITE_LOGIN", "https://easymob.metadados.com.br/Account/LoginColaborador")
if MODE in ("simulado", "local") and not os.getenv("EASYMOB_SITE_LOGIN"):
    SITE_LOGIN = SIMULADO_LOGIN.as_uri()

ACCESS_KEY = env("EASYMOB_ACCESS_KEY")
USERNAME = env("EASYMOB_USERNAME")
PASSWORD = env("EASYMOB_PASSWORD")

DRY_RUN = env_bool("EASYMOB_DRY_RUN", True)
CONFIRM_REAL = env_bool("EASYMOB_CONFIRM_REAL", False)
CONFIRM_CUSTOM_TIME = env_bool("EASYMOB_CONFIRM_CUSTOM_TIME", False)
WATCHDOG_ENABLED = env_bool("EASYMOB_WATCHDOG_ENABLED", False)
DEFAULT_HEADLESS = env_bool("EASYMOB_HEADLESS_DEFAULT", False)

HORARIOS = [x.strip() for x in env("EASYMOB_HORARIOS", "08:00,12:00,13:00,17:00").split(',') if x.strip()]
JANELA_RETRY_MINUTOS = env_int("EASYMOB_JANELA_RETRY_MINUTOS", 20)
DUPLICATE_TOLERANCE_MINUTES = env_int("EASYMOB_DUPLICATE_TOLERANCE_MINUTES", 10)
DAILY_TARGET_MINUTES = env_int("EASYMOB_DAILY_TARGET_MINUTES", 480)
LUNCH_MINUTES = env_int("EASYMOB_LUNCH_MINUTES", 60)

# Capturas: por padrão não grava histórico de imagens. live sobrescreve live.png; error grava só erro; diagnostic/all grava etapas.
SCREENSHOT_POLICY = env("EASYMOB_SCREENSHOT_POLICY", "error").lower()  # none|live|error|diagnostic|all
LIVE_PREVIEW = env_bool("EASYMOB_LIVE_PREVIEW", False)
KEEP_LAST_SCREENSHOTS = env_int("EASYMOB_KEEP_LAST_SCREENSHOTS", 10)
KEEP_BROWSER_OPEN = env_bool("EASYMOB_KEEP_BROWSER_OPEN", False)

# Seletores configuráveis. Nunca deixe vazio: a rota só envia override se o usuário preencher.
SEL_ACCESS_KEY = env("EASYMOB_SEL_ACCESS_KEY", "#chave,#local,input[name='chave'],input[name='local'],input[id*='chave' i],input[id*='local' i]")
SEL_USERNAME = env("EASYMOB_SEL_USERNAME", "#usuario,input[name='usuario'],input[id*='usuario' i],input[name='username'],input[type='text']")
SEL_PASSWORD = env("EASYMOB_SEL_PASSWORD", "#senha,input[name='senha'],input[id*='senha' i],input[name='password'],input[type='password']")
SEL_BTN_LOGIN = env("EASYMOB_BTN_LOGIN", "#btnLogin,#btnEntrar,input[value*='Entrar'],input[value*='Acessar'],button:has-text('Entrar'),button:has-text('Acessar'),input[type='submit'],button[type='submit']")
SEL_BTN_REGISTER = env("EASYMOB_BTN_REGISTER", "#btnRegistrar,input[value*='Registrar'],input[value*='Bater'],button:has-text('Registrar'),button:has-text('Bater'),button:has-text('Ponto')")
SEL_BTN_CONSULT = env("EASYMOB_BTN_CONSULT", "#btnConsultar,input[value*='Consultar'],button:has-text('Consultar'),button:has-text('Marcações'),button:has-text('Marcacoes')")
