import argparse
import os
from datetime import datetime
from main import run, test_login, log
from approval import check_approval_flag, log_approval_status, remove_approval_flag
from control import SINGLE_RUN_FLAG

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--slowmo", type=int, default=700)
    ap.add_argument("--pause", action="store_true")
    ap.add_argument("--test-login", action="store_true", help="Executa apenas o teste de login.")
    ap.add_argument("--single-run", action="store_true", help="Usa run_single.flag para execução única.")
    ap.add_argument("--target", default="", help="Horário alvo HH:MM sem depender de flag.")
    ap.add_argument("--plan-only", action="store_true", help="Consulta marcações e calcula a próxima ação sem registrar.")
    ap.add_argument("--watchdog", action="store_true", help="Execução recorrente segura: consulta regra atual sem depender de flag diária.")
    args = ap.parse_args()

    if args.test_login:
        test_login(slow_mo=args.slowmo, headless=args.headless)
    elif args.watchdog:
        enabled = str(os.getenv("EASYMOB_WATCHDOG_ENABLED", "false")).lower() in ("1", "true", "yes", "sim", "s", "on")
        if not enabled:
            log("WATCHDOG: desabilitado. Defina EASYMOB_WATCHDOG_ENABLED=true para permitir execução automática recorrente.")
            raise SystemExit(0)
        if datetime.now().weekday() >= 5 and str(os.getenv("EASYMOB_BUSINESS_DAYS_ONLY", "true")).lower() not in ("0", "false", "no", "nao", "não"):
            log("WATCHDOG: fim de semana. Encerrando sem ação.")
            raise SystemExit(0)
        log("WATCHDOG: ciclo iniciado. O robô vai consultar a regra atual e só agir se houver ação permitida.")
        run(demo=args.demo or (not args.headless), headless=args.headless, slow_mo=args.slowmo, pause=args.pause)
    elif args.plan_only:
        target = args.target.strip() or None
        run(demo=args.demo or (not args.headless), headless=args.headless, slow_mo=args.slowmo, pause=args.pause, single_run_time=target, plan_only=True)
    elif args.target:
        run(demo=args.demo or (not args.headless), headless=args.headless, slow_mo=args.slowmo, pause=args.pause, single_run_time=args.target.strip())
    elif args.single_run:
        if SINGLE_RUN_FLAG.exists():
            target_time = SINGLE_RUN_FLAG.read_text(encoding="utf-8").strip()
            log(f"EXECUÇÃO ÚNICA FORÇADA: agendada para {target_time}. Removendo flag.")
            SINGLE_RUN_FLAG.unlink()
            run(demo=args.demo or (not args.headless), headless=args.headless, slow_mo=args.slowmo, pause=args.pause, single_run_time=target_time)
        else:
            log("AVISO: --single-run ativado, mas a flag de agendamento único não foi encontrada.")
    else:
        if not check_approval_flag():
            log_approval_status("EXECUÇÃO BLOQUEADA: flag de aprovação diária não encontrada.")
            raise SystemExit(0)
        log_approval_status("EXECUÇÃO APROVADA: flag de aprovação diária encontrada.")
        remove_approval_flag()
        run(demo=args.demo or (not args.headless), headless=args.headless, slow_mo=args.slowmo, pause=args.pause)
