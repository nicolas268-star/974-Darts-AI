from __future__ import annotations

import json
import os
import tempfile
import threading
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

STATE_PATH = Path(os.getenv("PLAYER_TRANSFER_STATE_PATH", "/app/data/player_transfers.json"))
_lock = threading.Lock()

def _now() -> str: return datetime.now(timezone.utc).isoformat()
def _empty() -> dict[str, Any]: return {"version": 1, "transfers": []}

def _normalized_name(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(character for character in text if not unicodedata.combining(character))
    return "".join(character for character in text.casefold() if character.isalnum())

def _load_unlocked() -> dict[str, Any]:
    if not STATE_PATH.exists(): return _empty()
    try: data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return _empty()
    return data if isinstance(data, dict) and isinstance(data.get("transfers"), list) else _empty()

def _write_unlocked(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".player-transfers-", suffix=".json", dir=STATE_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(state, stream, ensure_ascii=False, indent=2); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def _db_rows(db: Any, table: str, fields: str) -> list[dict[str, Any]]:
    return list(getattr(db.table(table).select(fields).execute(), "data", None) or [])

def player_directory(db: Any) -> list[dict[str, Any]]:
    players = _db_rows(db, "players", "id,display_name,team_id")
    teams = {str(row.get("id")): row for row in _db_rows(db, "teams", "id,name,club_id")}
    clubs = {str(row.get("id")): row for row in _db_rows(db, "clubs", "id,name")}
    result = []
    for player in players:
        team = teams.get(str(player.get("team_id")))
        club = clubs.get(str((team or {}).get("club_id")))
        result.append({"id": str(player.get("id")), "name": player.get("display_name"), "team": (team or {}).get("name"), "club": (club or {}).get("name")})
    return sorted(result, key=lambda row: str(row.get("name") or "").casefold())

def admin_status(db: Any) -> dict[str, Any]:
    players = player_directory(db)
    with _lock: state = _load_unlocked()
    transfers = sorted(state["transfers"], key=lambda row: (row.get("effective_date", ""), row.get("player_name", "")))
    today = date.today().isoformat()
    for row in transfers:
        row["computed_status"] = "CANCELLED" if row.get("cancelled_at") else ("APPLIED" if row.get("effective_date", "") <= today else "SCHEDULED")
    return {"players": players, "transfers": transfers, "counts": {"players": len(players), "scheduled": sum(r["computed_status"] == "SCHEDULED" for r in transfers), "applied": sum(r["computed_status"] == "APPLIED" for r in transfers)}}

def upsert_transfer(db: Any, payload: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    players = {row["id"]: row for row in player_directory(db)}
    player = players.get(str(payload["player_id"]))
    if not player: raise ValueError("Joueur introuvable.")
    target_team, target_club = str(payload.get("target_team") or "").strip(), str(payload.get("target_club") or "").strip()
    if not target_team and not target_club: raise ValueError("Indique au moins une nouvelle équipe ou un nouveau club.")
    effective = date.fromisoformat(str(payload["effective_date"]))
    with _lock:
        state = _load_unlocked(); transfer_id = payload.get("id") or str(uuid4())
        existing = next((row for row in state["transfers"] if row.get("id") == transfer_id), None)
        transfer = {**(existing or {}), "id": transfer_id, "player_id": player["id"], "player_name": player["name"], "from_team": (existing or {}).get("from_team", player.get("team")), "from_club": (existing or {}).get("from_club", player.get("club")), "target_team": target_team or player.get("team"), "target_club": target_club or player.get("club"), "effective_date": effective.isoformat(), "note": str(payload.get("note") or "").strip()[:500] or None, "updated_at": _now(), "updated_by": user_id, "created_at": (existing or {}).get("created_at", _now()), "cancelled_at": None}
        state["transfers"] = [transfer if row.get("id") == transfer_id else row for row in state["transfers"]]
        if existing is None: state["transfers"].append(transfer)
        _write_unlocked(state)
    return {"transfer": transfer, "created": existing is None}

def cancel_transfer(transfer_id: str, confirmed: bool, user_id: str | None) -> dict[str, Any]:
    if not confirmed: raise ValueError("Confirmation requise.")
    with _lock:
        state = _load_unlocked(); row = next((item for item in state["transfers"] if item.get("id") == transfer_id), None)
        if not row: raise ValueError("Transfert introuvable.")
        row.update({"cancelled_at": _now(), "cancelled_by": user_id}); _write_unlocked(state)
    return {"transfer": row}

def player_affiliations(db: Any, player_id: str) -> dict[str, Any]:
    player = next((row for row in player_directory(db) if row["id"] == player_id), None)
    if not player: raise ValueError("Joueur introuvable.")
    return affiliations_from_current(player_id, player.get("name"), player.get("team"), player.get("club"))

def affiliations_from_current(player_id: str, player_name: str | None, team: str | None, club: str | None) -> dict[str, Any]:
    normalized_player_name = _normalized_name(player_name)
    with _lock:
        transfers = [
            dict(row)
            for row in _load_unlocked()["transfers"]
            if not row.get("cancelled_at")
            and (
                str(row.get("player_id") or "") == str(player_id)
                or (
                    bool(normalized_player_name)
                    and _normalized_name(str(row.get("player_name") or "")) == normalized_player_name
                )
            )
        ]
    transfers.sort(key=lambda row: row["effective_date"]); today = date.today()
    periods = []; current = {"club": club, "team": team, "start_date": None, "end_date": None, "source": "CURRENT_DATABASE"}
    upcoming = []
    for transfer in transfers:
        effective = date.fromisoformat(transfer["effective_date"])
        if effective > today:
            upcoming.append({"transfer_id": transfer["id"], "club": transfer.get("target_club"), "team": transfer.get("target_team"), "effective_date": transfer["effective_date"], "note": transfer.get("note")})
            continue
        previous = dict(current); previous["end_date"] = (effective - timedelta(days=1)).isoformat(); periods.append(previous)
        current = {"club": transfer.get("target_club"), "team": transfer.get("target_team"), "start_date": transfer["effective_date"], "end_date": None, "source": "TRANSFER"}
    periods.append(current)
    return {"player": {"id": player_id, "name": player_name}, "current": current, "upcoming": upcoming, "history": periods, "has_history": len(periods) > 1 or bool(upcoming)}
