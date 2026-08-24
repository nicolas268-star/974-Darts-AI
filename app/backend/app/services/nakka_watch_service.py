from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.services.nakka_direct_import import analyze_direct_event, validate_direct_event_url


STATE_PATH = Path(os.getenv("NAKKA_WATCH_STATE_PATH", "/app/data/nakka_watch_state.json"))
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(UTC)


def _empty() -> dict[str, Any]:
    return {"version": 1, "watches": [], "history": []}


def _load_unlocked() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return _empty()
    try:
        value = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return _empty()
    return value if isinstance(value, dict) else _empty()


def _write_unlocked(value: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".nakka-watch-", suffix=".json", dir=STATE_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _event_moment(event_date: str, event_time: str | None) -> datetime:
    parsed_date = date.fromisoformat(event_date)
    parsed_time = time.fromisoformat(event_time or "09:00")
    # La Réunion is UTC+4 all year.
    local = datetime.combine(parsed_date, parsed_time)
    return (local - timedelta(hours=4)).replace(tzinfo=UTC)


def _next_check(watch: dict[str, Any], now: datetime | None = None) -> datetime | None:
    if not watch.get("active", True) or watch.get("status") == "COMPLETED":
        return None
    current = now or _now()
    event = _event_moment(watch["eventDate"], watch.get("eventTime"))
    candidates = [
        event - timedelta(days=7),
        event - timedelta(days=1),
        event - timedelta(hours=3),
        event + timedelta(hours=1),
        event + timedelta(hours=6),
        event + timedelta(days=1),
    ]
    completed = set(watch.get("completedSlots") or [])
    for moment in candidates:
        key = moment.isoformat()
        if key not in completed:
            return moment
    # During the event, retry every hour until the final +1 day control.
    if event - timedelta(hours=3) <= current <= event + timedelta(days=1):
        return current + timedelta(hours=1)
    return None


def _public_state(state: dict[str, Any]) -> dict[str, Any]:
    watches = []
    now = _now()
    for item in state.get("watches") or []:
        watch = dict(item)
        next_check = _next_check(watch, now)
        watch["nextCheckAt"] = next_check.isoformat() if next_check else None
        watches.append(watch)
    return {"version": 1, "watches": watches, "history": list(state.get("history") or [])[-50:]}


def load_watch_state() -> dict[str, Any]:
    with _lock:
        return _public_state(_load_unlocked())


def upsert_watch(payload: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    canonical_url, source_id = validate_direct_event_url(payload["source_url"])
    # Validate date early.
    _event_moment(payload["event_date"], payload.get("event_time"))
    with _lock:
        state = _load_unlocked()
        watch_id = payload.get("id") or str(uuid4())
        existing = next((x for x in state["watches"] if x.get("id") == watch_id), None)
        timestamp = _now().isoformat()
        watch = {
            **(existing or {}),
            "id": watch_id,
            "title": payload["title"].strip(),
            "season": int(payload["season"]),
            "sourceUrl": canonical_url,
            "sourceId": source_id,
            "eventDate": payload["event_date"],
            "eventTime": payload.get("event_time") or "09:00",
            "active": bool(payload.get("active", True)),
            "status": (existing or {}).get("status", "SCHEDULED"),
            "lastCheckAt": (existing or {}).get("lastCheckAt"),
            "lastSnapshotHash": (existing or {}).get("lastSnapshotHash"),
            "lastSummary": (existing or {}).get("lastSummary"),
            "attentionRequired": bool((existing or {}).get("attentionRequired", False)),
            "completedSlots": list((existing or {}).get("completedSlots") or []),
            "createdAt": (existing or {}).get("createdAt", timestamp),
            "updatedAt": timestamp,
            "updatedBy": user_id,
        }
        state["watches"] = [watch if x.get("id") == watch_id else x for x in state["watches"]]
        if existing is None:
            state["watches"].append(watch)
        _write_unlocked(state)
        return _public_state(state)


def delete_watch(watch_id: str) -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        before = len(state["watches"])
        state["watches"] = [x for x in state["watches"] if x.get("id") != watch_id]
        if len(state["watches"]) == before:
            raise ValueError("Surveillance introuvable.")
        _write_unlocked(state)
        return _public_state(state)


def acknowledge_watch(watch_id: str) -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        watch = next((x for x in state["watches"] if x.get("id") == watch_id), None)
        if not watch:
            raise ValueError("Surveillance introuvable.")
        watch["attentionRequired"] = False
        watch["updatedAt"] = _now().isoformat()
        _write_unlocked(state)
        return _public_state(state)


def run_watch(watch_id: str, *, automatic: bool) -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        watch = next((dict(x) for x in state["watches"] if x.get("id") == watch_id), None)
    if not watch:
        raise ValueError("Surveillance introuvable.")

    preview_state = analyze_direct_event(watch["sourceUrl"], watch["season"], [])
    preview = preview_state.get("lastPreview") or {}
    snapshot = preview.get("snapshotHash")
    changed = bool(watch.get("lastSnapshotHash") and snapshot != watch.get("lastSnapshotHash"))
    first_capture = not watch.get("lastSnapshotHash")
    summary = preview.get("summary") or {}
    participants_ready = int(summary.get("participants") or 0) > 0
    matches_ready = int(summary.get("matches") or 0) > 0
    # La première collecte établit une référence silencieuse : une liste
    # provisoire de joueurs ne doit pas déclencher une fausse alerte.
    attention = changed or preview.get("status") == "READY"
    now = _now()

    with _lock:
        state = _load_unlocked()
        target = next((x for x in state["watches"] if x.get("id") == watch_id), None)
        if not target:
            raise ValueError("Surveillance introuvable.")
        target.update({
            "lastCheckAt": now.isoformat(),
            "lastSnapshotHash": snapshot,
            "lastSummary": summary,
            "lastPreviewStatus": preview.get("status"),
            "attentionRequired": attention,
            "status": "REVIEW_REQUIRED" if attention else "MONITORING",
        })
        due = _next_check(target, now)
        if automatic and due and due <= now:
            slots = set(target.get("completedSlots") or [])
            slots.add(due.isoformat())
            target["completedSlots"] = sorted(slots)
        entry = {
            "id": str(uuid4()), "watchId": watch_id, "title": target["title"],
            "checkedAt": now.isoformat(), "automatic": automatic, "changed": changed,
            "participants": int(summary.get("participants") or 0),
            "matches": int(summary.get("matches") or 0), "status": preview.get("status"),
        }
        state.setdefault("history", []).append(entry)
        state["history"] = state["history"][-100:]
        _write_unlocked(state)
        return _public_state(state)


def run_due_watches() -> int:
    state = load_watch_state()
    now = _now()
    due = [x for x in state["watches"] if x.get("nextCheckAt") and datetime.fromisoformat(x["nextCheckAt"]) <= now]
    for watch in due:
        try:
            run_watch(watch["id"], automatic=True)
        except Exception:
            # One failing Nakka page must not stop other monitored events.
            continue
    return len(due)
