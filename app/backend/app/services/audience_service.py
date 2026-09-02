from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from uuid import UUID


DATA_FILE = Path("/app/data/audience-events.jsonl")
RETENTION_DAYS = 365
_lock = Lock()
_last_prune_at: datetime | None = None
BLOCKED_PREFIXES = ("/admin", "/login", "/auth", "/forgot-password", "/update-password")


def _clean_path(value: str) -> str:
    path = (value or "/").split("?", 1)[0].split("#", 1)[0][:240]
    return path if path.startswith("/") else "/"


def _clean_device(value: object) -> str:
    device = str(value or "desktop").lower()
    return device if device in {"desktop", "tablet", "mobile"} else "desktop"


def _clean_session(value: object) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return ""


def _prune_expired_events(now: datetime, *, force: bool = False) -> None:
    """Remove raw audience events older than the published 12-month limit."""
    global _last_prune_at
    if not force and _last_prune_at and now - _last_prune_at < timedelta(days=1):
        return
    _last_prune_at = now
    if not DATA_FILE.exists():
        return

    cutoff = now - timedelta(days=RETENTION_DAYS)
    kept: list[str] = []
    for line in DATA_FILE.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
            recorded_at = datetime.fromisoformat(str(event["at"]))
            if recorded_at.tzinfo is None:
                recorded_at = recorded_at.replace(tzinfo=timezone.utc)
            if recorded_at >= cutoff:
                kept.append(json.dumps(event, ensure_ascii=False))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            continue

    content = "\n".join(kept)
    DATA_FILE.write_text(f"{content}\n" if content else "", encoding="utf-8")


def record_event(payload: dict) -> bool:
    path = _clean_path(str(payload.get("path", "/")))
    if path.startswith(BLOCKED_PREFIXES):
        return False
    event_type = str(payload.get("event_type", "page_view"))
    if event_type not in {"page_view", "error"}:
        event_type = "page_view"
    event = {
        "at": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "path": path,
        "device": _clean_device(payload.get("device", "desktop")),
        "session": _clean_session(payload.get("session", "")),
    }
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        _prune_expired_events(datetime.now(timezone.utc))
        with DATA_FILE.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False) + "\n")
    return True


def summary(days: int) -> dict:
    days = days if days in {7, 30, 90} else 30
    since = datetime.now(timezone.utc) - timedelta(days=days)
    events: list[dict] = []
    if DATA_FILE.exists():
        with _lock:
            _prune_expired_events(datetime.now(timezone.utc))
            for line in DATA_FILE.read_text(encoding="utf-8").splitlines():
                try:
                    event = json.loads(line)
                    if datetime.fromisoformat(event["at"]) >= since:
                        events.append(event)
                except (ValueError, KeyError, json.JSONDecodeError):
                    continue
    views = [event for event in events if event.get("event_type") == "page_view"]
    daily = Counter(event["at"][:10] for event in views)
    paths = Counter(event.get("path", "/") for event in views)
    devices = Counter(event.get("device", "desktop") for event in views)
    sessions = {event.get("session") for event in views if event.get("session")}
    trend = []
    for offset in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=offset)).date().isoformat()
        trend.append({"date": day, "views": daily.get(day, 0)})
    return {
        "days": days,
        "views": len(views),
        "visitors": len(sessions),
        "errors": sum(1 for event in events if event.get("event_type") == "error"),
        "trend": trend,
        "top_pages": [{"path": path, "views": count} for path, count in paths.most_common(12)],
        "devices": [{"device": name, "views": count} for name, count in devices.most_common()],
        "privacy": "Aucune adresse IP ni donnée nominative n’est enregistrée.",
    }
