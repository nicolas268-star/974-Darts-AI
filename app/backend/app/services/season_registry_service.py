from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from app.services.nakka_sync_agent import collect_nakka_snapshot, validate_source_url
from app.services.calendar_service import list_events, upsert_event

STATE_PATH = Path(os.getenv("SEASON_REGISTRY_STATE_PATH", "/app/data/season_registry.json"))
_lock = threading.Lock()

DEFAULT_SEASONS = [
    {
        "key": "2026", "label": "Championnat 2026", "status": "HISTORICAL",
        "nakkaLeagueId": "lg_QqGB_7154",
        "sourceUrl": "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154",
        "dbSeasonId": None, "eloPolicy": "CAREER_CONTINUITY", "active": False,
    },
    {
        "key": "2026-2027", "label": "Championnat 2026–2027", "status": "PREPARING",
        "nakkaLeagueId": "lg_EUoR_6095",
        "sourceUrl": "https://n01darts.com/n01/league/portal.php?lgid=lg_EUoR_6095",
        "dbSeasonId": None, "eloPolicy": "CAREER_CONTINUITY", "active": True,
        "teamAliases": {
            "PDC A": {"canonical": "PDC Neige", "display": "PDC A"},
            "PDC B": {"canonical": "PDC Fournaise", "display": "PDC B"},
        },
    },
]

def _now() -> str:
    return datetime.now(UTC).isoformat()

def _empty() -> dict[str, Any]:
    return {"version": 1, "seasons": [dict(item) for item in DEFAULT_SEASONS], "lastAutomaticScanAt": None}

def _load_unlocked() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return _empty()
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty()
    if not isinstance(data, dict) or not isinstance(data.get("seasons"), list):
        return _empty()
    by_key = {str(item.get("key")): item for item in data["seasons"]}
    for default in DEFAULT_SEASONS:
        if default["key"] not in by_key:
            data["seasons"].append(dict(default))
        else:
            for field, value in default.items():
                by_key[default["key"]].setdefault(field, value)
    return data

def _write_unlocked(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".season-registry-", suffix=".json", dir=STATE_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(state, stream, ensure_ascii=False, indent=2)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def public_seasons() -> dict[str, Any]:
    with _lock: state = _load_unlocked()
    seasons = [{key: item.get(key) for key in ("key", "label", "status", "dbSeasonId", "active", "eloPolicy", "leagueTitle", "eventCount", "lastScanAt")} for item in state["seasons"]]
    return {"seasons": seasons, "defaultSeason": next((item["key"] for item in seasons if item.get("active")), "2026")}

def registry_status() -> dict[str, Any]:
    with _lock: return _load_unlocked()

def scan_season(key: str, automatic: bool = False) -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        season = next((item for item in state["seasons"] if item.get("key") == key), None)
    if season is None: raise ValueError("Saison inconnue.")
    url = validate_source_url(str(season["sourceUrl"]))
    try:
        snapshot = collect_nakka_snapshot(url, deep=False, max_deep_events=0)
        update = {
            "lastScanAt": _now(), "lastScanStatus": snapshot.get("status"),
            "lastError": None, "leagueTitle": snapshot.get("leagueTitle"),
            "eventCount": snapshot.get("eventCount", 0), "snapshotHash": snapshot.get("snapshotHash"),
            "events": snapshot.get("events", []),
        }
        if snapshot.get("eventCount", 0) > 0 and season.get("status") == "PREPARING":
            update["status"] = "ENTRIES_OPEN"
    except Exception as exc:
        update = {"lastScanAt": _now(), "lastScanStatus": "ERROR", "lastError": str(exc)[:300]}
    with _lock:
        state = _load_unlocked()
        for item in state["seasons"]:
            if item.get("key") == key: item.update(update)
        if automatic: state["lastAutomaticScanAt"] = _now()
        _write_unlocked(state)
        return next(item for item in state["seasons"] if item.get("key") == key)

def scan_active() -> dict[str, Any]:
    with _lock: keys = [item["key"] for item in _load_unlocked()["seasons"] if item.get("active")]
    return {"results": [scan_season(key, automatic=True) for key in keys], "scanned": len(keys)}

def _event_date(value: Any) -> str | None:
    compact = str(value or "").strip()
    if compact.isdigit() and len(compact) in {8, 12, 14} and compact.startswith("20"):
        try: return datetime.strptime(compact[:8], "%Y%m%d").date().isoformat()
        except ValueError: pass
    if isinstance(value, (int, float)):
        numeric = float(value)
        if numeric > 10_000_000_000: numeric /= 1000
        try: return datetime.fromtimestamp(numeric, UTC).date().isoformat()
        except (ValueError, OSError, OverflowError): return None
    text = compact
    if not text: return None
    if text.isdigit(): return _event_date(int(text))
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%Y"):
        try: return datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError: pass
    return None

def _alias_details(label: str, aliases: dict[str, Any]) -> tuple[str, list[str]]:
    title, links = label, []
    for current, config in aliases.items():
        canonical = str((config or {}).get("canonical") or "")
        if current.casefold() in title.casefold():
            links.append(f"{current} est le nom 2026–2027 de {canonical}")
    return title, links

def calendar_preview(key: str) -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        season = next((item for item in state["seasons"] if item.get("key") == key), None)
    if season is None: raise ValueError("Saison inconnue.")
    aliases = season.get("teamAliases") or {}
    calendar = list_events()["events"]
    rows = []
    for event in season.get("events") or []:
        event_date = _event_date((event.get("sourceMeta") or {}).get("eventDate"))
        title, links = _alias_details(str(event.get("label") or event.get("id")), aliases)
        source_url = str(event.get("url") or "")
        duplicate = next((item for item in calendar if source_url and item.get("source_url") == source_url), None)
        rows.append({
            "id": event.get("id"), "title": title, "startDate": event_date,
            "sourceUrl": source_url, "status": "ALREADY_IMPORTED" if duplicate else ("READY" if event_date else "DATE_REQUIRED"),
            "aliasLinks": links, "calendarEventId": duplicate.get("id") if duplicate else None,
        })
    return {"season": {"key": season["key"], "label": season["label"]}, "events": rows, "summary": {"total": len(rows), "ready": sum(r["status"] == "READY" for r in rows), "duplicates": sum(r["status"] == "ALREADY_IMPORTED" for r in rows), "dateRequired": sum(r["status"] == "DATE_REQUIRED" for r in rows)}}

def import_calendar(key: str, confirmed: bool, user_id: str | None) -> dict[str, Any]:
    if not confirmed: raise ValueError("La confirmation explicite est obligatoire.")
    preview = calendar_preview(key)
    created, skipped, incomplete = [], [], []
    for row in preview["events"]:
        if row["status"] == "ALREADY_IMPORTED": skipped.append(row["id"]); continue
        if row["status"] != "READY": incomplete.append(row["id"]); continue
        description = f"Championnat 2026–2027 · Import Nakka {row['id']}."
        if row["aliasLinks"]: description += " Rattachement historique : " + "; ".join(row["aliasLinks"]) + "."
        result = upsert_event({"title": row["title"], "event_type": "CHAMPIONSHIP", "start_date": row["startDate"], "start_time": None, "end_date": None, "location": "La Réunion", "address": None, "description": description, "source_url": row["sourceUrl"], "status": "SCHEDULED"}, user_id)
        created.append(result["event"])
    return {"created": created, "createdCount": len(created), "skippedIds": skipped, "skippedCount": len(skipped), "incompleteIds": incomplete, "incompleteCount": len(incomplete)}
