"""Calendar-driven preparation of private match summaries, with durable retries."""
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
from uuid import NAMESPACE_URL, uuid5

from .calendar_service import list_events
from .interclub_analysis_source import REUNION, collect_evening
from .season_registry_service import registry_status
from .visibility_service import SummaryUnavailable, ai_configured, compose_summary

STATE_PATH = Path(os.getenv("INTERCLUB_ANALYSIS_STATE_PATH", "/app/data/interclub_analysis.json"))
RETRY = timedelta(minutes=5)
WINDOW = timedelta(hours=48)


def _load():
    if not STATE_PATH.exists():
        return {"records": {}, "last_check_at": None}
    return json.loads(STATE_PATH.read_text())


def _write(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=STATE_PATH.parent, prefix=".interclub-analysis-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(state, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, STATE_PATH)
    finally:
        if os.path.exists(name):
            os.unlink(name)


@contextmanager
def _worker_lock():
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with STATE_PATH.with_suffix(".lock").open("a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def event_key(event):
    return str(uuid5(NAMESPACE_URL, "974darts:interclub-analysis:" + str(event["id"])))


def signature(event):
    return hashlib.sha256(json.dumps({k: event.get(k) for k in ("id", "start_date", "source_url")}, sort_keys=True).encode()).hexdigest()


def due_at(event):
    return datetime.combine(datetime.fromisoformat(event["start_date"]).date(), time(23, 50), REUNION)


def _events():
    return [e for e in list_events()["events"] if e.get("event_type") == "CHAMPIONSHIP" and e.get("status") != "CANCELLED"]


def run_due_analyses(*, now=None, events=None, seasons=None, collector=collect_evening, composer=compose_summary):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("An aware clock is required")
    events = _events() if events is None else events
    seasons = registry_status()["seasons"] if seasons is None else seasons
    active = [s for s in seasons if s.get("active")]
    with _worker_lock() as acquired:
        if not acquired:
            return 0
        state = _load()
        records = state.setdefault("records", {})
        state["last_check_at"] = now.isoformat()
        _write(state)
        processed = 0
        for event in events:
            if event.get("event_type") != "CHAMPIONSHIP" or event.get("status") == "CANCELLED":
                continue
            try:
                due = due_at(event)
            except (ValueError, KeyError):
                continue
            key = event_key(event)
            record = records.get(key, {})
            if record.get("signature") != signature(event):
                record = {}
            if now < due or now > due + WINDOW:
                continue
            if record.get("status") == "READY" and (record.get("summary", {}).get("mode") == "ai" or not ai_configured()):
                continue
            if record.get("next_try_at") and now < datetime.fromisoformat(record["next_try_at"]):
                continue
            record.update(id=key, event_id=event["id"], title=event["title"], date=event["start_date"], source_url=event.get("source_url"),
                          signature=signature(event), due_at=due.isoformat(), last_attempt_at=now.isoformat(),
                          next_try_at=(now + RETRY).isoformat(), attempts=record.get("attempts", 0) + 1)
            try:
                if len(active) != 1:
                    raise SummaryUnavailable("Une seule saison active doit être configurée.")
                # An API outage retries only editorial selection once the match facts are ready.
                facts = record.get("summary", {}).get("evening") or collector(event, active[0], key)
                record["summary"] = composer(facts, use_ai=True)
                record.update(status="READY", message="Analyse prête", prepared_at=now.isoformat())
            except SummaryUnavailable as exc:
                record.update(status="WAITING", message=str(exc))
            except Exception:
                record.update(status="WAITING", message="La source est indisponible ou incohérente. Nouvelle tentative automatique.")
            records[key] = record
            processed += 1
            _write(state)
        _write(state)
        return processed


def available_records():
    current = {event_key(e): e for e in _events()}
    active = {s["key"] for s in registry_status()["seasons"] if s.get("active")}
    return [r for key, r in _load().get("records", {}).items()
            if key in current and r.get("signature") == signature(current[key])
            and (not r.get("summary") or r["summary"]["evening"]["season"] in active)]


def automatic_summary(result_id, *, use_ai=False):
    record = next((r for r in available_records() if r["id"] == str(result_id) and r.get("status") == "READY"), None)
    if not record:
        return None
    value = compose_summary(record["summary"]["evening"], use_ai=True) if use_ai else dict(record["summary"])
    value["ai_available"] = ai_configured()
    value["note"] += " Préparation automatique à partir du détail Nakka contrôlé."
    return value


def extend_catalog(catalog, source_results):
    records = available_records()
    ready = [r for r in records if r.get("status") == "READY"]
    prepared_urls = {r["source_url"] for r in ready}
    replaced = {r["id"] for r in source_results if r.get("source_sheet") in prepared_urls}
    catalog["evenings"] = [e for e in catalog["evenings"] if e["id"] not in replaced]
    for record in ready:
        facts = record["summary"]["evening"]
        catalog["evenings"].append({k: facts[k] for k in ("round", "home", "away", "home_score", "away_score")}
                                  | {"id": record["id"], "date": record["date"]})
    catalog["evenings"].sort(key=lambda e: (e["date"] or "", e["round"], e["id"]), reverse=True)
    now = datetime.now(timezone.utc)
    future = [due_at(e) for e in _events() if due_at(e) > now]
    heartbeat = _load().get("last_check_at")
    catalog["automation"] = {"time": "23:50", "timezone": "Indian/Reunion", "last_check_at": heartbeat,
                             "running": bool(heartbeat and now - datetime.fromisoformat(heartbeat) < timedelta(minutes=3)),
                             "next_at": min(future).isoformat() if future else None,
                             "recent": [{k: r.get(k) for k in ("title", "date", "status", "message", "prepared_at", "last_attempt_at")}
                                        | {"retry_expired": now > datetime.fromisoformat(r["due_at"]) + WINDOW}
                                        for r in sorted(records, key=lambda r: r["date"], reverse=True)[:8]]}
    return catalog
