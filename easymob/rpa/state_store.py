import json
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
STATE_PATH = DATA_DIR / "state.json"
JOURNAL_PATH = DATA_DIR / "journal.jsonl"
PENDING_PATH = DATA_DIR / "pending-actions.json"


def _ensure():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _read_json(path, fallback):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    return fallback


def default_state():
    now = datetime.now()
    return {
        "updatedAt": _now(),
        "today": now.strftime("%Y-%m-%d"),
        "week": now.strftime("%G-W%V"),
        "month": now.strftime("%Y-%m"),
        "easymob": {"marksToday": [], "nextAction": None, "plannedTime": None, "lastExecution": None, "watchdog": {"status": "idle"}},
        "service": {"lastStatus": "idle", "period": None, "summary": None},
        "portalRh": {"lastStatus": "idle", "period": None, "summary": None},
        "channel": {"lastStatus": "idle", "period": None, "blockingPendencies": []},
        "pending": [],
    }


def read_state():
    _ensure()
    state = default_state()
    state.update(_read_json(STATE_PATH, {}))
    return state


def update_state(**patch):
    _ensure()
    state = read_state()
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(state.get(key), dict):
            merged = dict(state[key])
            merged.update(value)
            state[key] = merged
        else:
            state[key] = value
    state["updatedAt"] = _now()
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return state


def append_journal(event):
    _ensure()
    payload = {"at": _now(), "severity": event.get("severity", "info"), **(event or {})}
    with JOURNAL_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return payload


def read_pending():
    _ensure()
    value = _read_json(PENDING_PATH, [])
    return value if isinstance(value, list) else []


def add_pending(item):
    pending = read_pending()
    entry = {"id": f"{int(datetime.now().timestamp()*1000)}", "createdAt": _now(), "status": "open", "severity": "warning", **(item or {})}
    pending.append(entry)
    PENDING_PATH.write_text(json.dumps(pending, ensure_ascii=False, indent=2), encoding="utf-8")
    update_state(pending=pending)
    return entry
