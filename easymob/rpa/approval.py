from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPROVAL_FLAG = ROOT / "run_tomorrow.flag"

def check_approval_flag():
    return APPROVAL_FLAG.exists()

def create_approval_flag():
    APPROVAL_FLAG.touch()

def remove_approval_flag():
    if APPROVAL_FLAG.exists():
        APPROVAL_FLAG.unlink()

def log_approval_status(msg: str):
    from main import log
    log(f"STATUS APROVAÇÃO: {msg}")
