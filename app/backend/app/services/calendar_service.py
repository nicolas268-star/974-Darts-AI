from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


STATE_PATH = Path(os.getenv("CALENDAR_STATE_PATH", "/app/data/calendar_events.json"))
_state_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_state() -> dict[str, Any]:
    return {"version": 1, "events": []}


def _load_unlocked() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return _empty_state()
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty_state()
    if not isinstance(data, dict) or not isinstance(data.get("events"), list):
        return _empty_state()
    return data


def _write_unlocked(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(
        prefix=".calendar-", suffix=".json", dir=STATE_PATH.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(state, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def list_events() -> dict[str, Any]:
    with _state_lock:
        state = _load_unlocked()
    events = sorted(
        state["events"],
        key=lambda event: (
            event.get("start_date", ""),
            event.get("start_time") or "",
            event.get("title", ""),
        ),
    )
    return {"events": events, "count": len(events)}


def upsert_event(payload: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    with _state_lock:
        state = _load_unlocked()
        event_id = payload.get("id") or str(uuid4())
        existing = next(
            (item for item in state["events"] if item.get("id") == event_id), None
        )
        timestamp = _now()
        event = {
            **(existing or {}),
            **payload,
            "id": event_id,
            "created_at": (existing or {}).get("created_at", timestamp),
            "updated_at": timestamp,
            "updated_by": user_id,
        }
        state["events"] = [
            event if item.get("id") == event_id else item for item in state["events"]
        ]
        if existing is None:
            state["events"].append(event)
        _write_unlocked(state)
    return {"event": event, "created": existing is None}


def delete_event(event_id: str) -> dict[str, Any]:
    with _state_lock:
        state = _load_unlocked()
        before = len(state["events"])
        state["events"] = [
            event for event in state["events"] if event.get("id") != event_id
        ]
        deleted = len(state["events"]) != before
        if deleted:
            _write_unlocked(state)
    return {"deleted": deleted, "id": event_id}
