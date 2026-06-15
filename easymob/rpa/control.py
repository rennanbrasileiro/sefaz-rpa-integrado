from pathlib import Path
import sys
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
APPROVAL_FLAG = ROOT / "run_tomorrow.flag"
SINGLE_RUN_FLAG = ROOT / "run_single.flag"

def enable_daily_run():
    APPROVAL_FLAG.touch()
    print(f"SUCESSO: Execução diária HABILITADA. Flag criada em: {APPROVAL_FLAG}")

def disable_daily_run():
    if APPROVAL_FLAG.exists():
        APPROVAL_FLAG.unlink()
        print("SUCESSO: Execução diária DESABILITADA.")
    else:
        print("AVISO: A execução diária já estava desabilitada.")

def schedule_single_run(target_time_str):
    datetime.strptime(target_time_str, "%H:%M")
    SINGLE_RUN_FLAG.write_text(target_time_str, encoding="utf-8")
    print(f"SUCESSO: Agendamento único criado para: {target_time_str}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python control.py enable|disable|schedule HH:MM")
        sys.exit(1)
    cmd = sys.argv[1].lower()
    if cmd == "enable": enable_daily_run()
    elif cmd == "disable": disable_daily_run()
    elif cmd == "schedule":
        if len(sys.argv) < 3:
            print("ERRO: informe HH:MM")
            sys.exit(1)
        schedule_single_run(sys.argv[2])
    else:
        print(f"Comando desconhecido: {cmd}")
        sys.exit(1)
