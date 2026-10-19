"""Resumable national scope for the existing Nakka discovery layer.

Anonymous source reads and isolated inventory writes only. This service never
calls direct import, calendar sync, sporting publication, or player matching.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime
from typing import Any

from app.services.france_discovery_model import (
    KEYWORDS, digest, normalize_competition, now, public_document, suggestions,
)
from app.services.n01_public_client import N01Client, N01Error

LOG = logging.getLogger(__name__)
PRIVATE_KEYS = {"admin_id", "admin_name", "co_admin_id", "join_pass", "scorer_pass",
                "password", "pass", "pass_set", "email", "access_token"}


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items() if k not in PRIVATE_KEYS}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value


class DiscoveryService:
    def __init__(self, client: N01Client, store):
        self.client, self.store = client, store

    def collect(self, n01_id: str, *, start_month: int = 9, enrich: bool = True,
                max_pages: int = 100, force_results: bool = False) -> bool:
        try:
            envelope = self.client.get("tournament/get", tdid=n01_id)
        except N01Error as exc:
            if exc.result == -1:  # Not found/private/deleted. Fail closed for public visibility.
                self.store.command("withdraw", {"n01_id": n01_id, "reason": str(exc)})
                return False
            raise
        record = normalize_competition(envelope, start_month=start_month)
        if record["n01_id"] != n01_id:
            raise N01Error("Mismatched tournament ID")
        if not record["source_public"]:
            self.store.command("withdraw", {"n01_id": n01_id, "reason": "Private/deleted source"})
            return False
        clean = sanitize(envelope)
        previous = self.store.get("sources", n01_id)
        metadata_hash = digest(clean)
        # Metadata may be absent or unreliable; the document hash is the fallback.
        unchanged = previous and previous.get("document_hash") == metadata_hash
        raw = previous["raw"] if unchanged else {"tournament": clean}
        if enrich and (force_results or not unchanged or not previous.get("enriched")):
            raw = {"tournament": clean}
            raw["entries"] = self.client.get("tournament/entry/list", tdid=n01_id)
            if not isinstance(raw["entries"].get("list"), list):
                raise N01Error("Invalid entry list")
            record["participants"] = len(raw["entries"]["list"])
            raw["stats"] = self.client.get("tournament/stats", tdid=n01_id)
            try:
                raw["standings"] = self.client.get("tournament/standings", tdid=n01_id)
            except N01Error as exc:
                if exc.result != -51:
                    raise
                raw["standings"] = {"result": -51, "unavailable": "No supported group format"}
            raw["matches"] = [row for _, page in self.client.pages(
                "match/list", tdid=n01_id, max_pages=max_pages, sort="startTime", order="asc") for row in page]
        if unchanged and previous.get("record", {}).get("participants") is not None:
            record["participants"] = previous["record"]["participants"]
        raw = sanitize(raw)
        source = {"n01_id": n01_id, "document_hash": metadata_hash,
                  "source_hash": digest({"raw": raw, "record": record}), "raw": raw,
                  "record": record, "enriched": bool(enrich or (previous or {}).get("enriched")),
                  "last_synced_at": now()}
        result = self.store.command("observe", {"source": source, "record": record})
        for candidate in suggestions(record, self.store.rows("committees"), self.store.rows("leagues")):
            self.store.command("suggest", {"n01_id": n01_id, **candidate})
        return bool(result["changed"])

    def run(self, *, mode: str = "discover", since: str = "2025-01-01", until: str | None = None,
            keywords: list[str] | None = None, start_month: int = 9, page_size: int = 100,
            max_pages: int = 30, detail_budget: int = 200, enrich: bool = True,
            resume: str | None = None, candidates_only: bool = False,
            force_results: bool = False) -> dict:
        if mode not in {"discover", "update"} or not 1 <= start_month <= 12 or detail_budget < 1:
            raise ValueError("Invalid run configuration")
        since_date = date.fromisoformat(since)
        until_date = date.fromisoformat(until) if until else datetime.now(UTC).date()
        # Inclusive --until; source filters use an exclusive next-day boundary.
        from datetime import timedelta
        lower = int(datetime.combine(since_date, datetime.min.time(), UTC).timestamp())
        upper = int(datetime.combine(until_date + timedelta(days=1), datetime.min.time(), UTC).timestamp())
        if lower >= upper or not 1 <= page_size <= 100 or max_pages < 1:
            raise ValueError("Invalid date range/pagination")
        terms = list(dict.fromkeys(keywords if keywords is not None else KEYWORDS))
        config = {"mode": mode, "since": since, "until": until_date.isoformat(), "keywords": terms,
                  "start_month": start_month, "page_size": page_size, "enrich": enrich}
        if candidates_only:
            config["candidates_only"] = True
        if force_results:
            config["force_results"] = True
        if resume:
            run = self.store.get("runs", resume)
            if not run or run["config"] != config:
                raise ValueError("Resume requires the original run configuration")
        else:
            tasks = []
            if mode == "discover":
                for word in terms:
                    tasks.extend([{"endpoint": "league/list", "filters": {"keyword": word}},
                                  {"endpoint": "tournament/list", "filters": {"keyword": word}}])
                for league in self.store.rows("leagues"):
                    tasks.append({"endpoint": "league/tournament/list", "filters": {"lgid": league["n01_id"]}})
            else:
                tasks = [{"endpoint": "detail", "n01_id": c["n01_id"]} for c in self.store.rows("competitions")]
                if candidates_only:
                    candidate_ids = {c["n01_id"] for c in self.store.rows("candidates") if c["status"] != "REJECTED"}
                    tasks = [t for t in tasks if t["n01_id"] in candidate_ids]
                # Priority season is operational ordering only, never a source of invented dates.
                by_id = {c["n01_id"]: c for c in self.store.rows("competitions")}
                tasks.sort(key=lambda t: (by_id[t["n01_id"]].get("season") != "2026-2027", t["n01_id"]))
            run = {"id": str(uuid.uuid4()), "config": config, "tasks": tasks, "seen": [],
                   "started_at": now(), "status": "RUNNING", "errors": [],
                   "stats": {"pages": 0, "discovered": 0, "changed": 0, "checked": 0}}
        run["status"] = "RUNNING"
        run["last_attempt_errors"] = []
        self.store.command("run", run)
        initial_requests = self.client.requests
        details = 0
        seen = set(run["seen"])
        try:
            for task in run["tasks"]:
                if task.get("done"):
                    continue
                if details >= detail_budget:
                    break
                try:
                    if task["endpoint"] == "detail":
                        changed = self.collect(task["n01_id"], start_month=start_month, enrich=enrich, max_pages=max_pages, force_results=force_results)
                        run["stats"]["changed"] += int(changed)
                        run["stats"]["checked"] += 1
                        details += 1
                        task["done"] = True
                        self.store.command("run", run)
                        continue
                    filters = {**task["filters"], "sort": "createTime", "order": "asc"}
                    if task["endpoint"] != "league/list":
                        filters.update(t_date__gte=lower, t_date__lt=upper)
                    for skip, rows in self.client.pages(task["endpoint"], count=page_size,
                                                       skip=task.get("skip", 0), max_pages=max_pages, **filters):
                        for item in rows:
                            if task["endpoint"] == "league/list":
                                lgid = item.get("lgid")
                                if not isinstance(lgid, str):
                                    raise N01Error("Missing league ID")
                                league = self.client.get("league/get", lgid=lgid)
                                doc = league.get("league")
                                if not isinstance(doc, dict) or doc.get("lgid") != lgid:
                                    raise N01Error("Invalid league document")
                                if not public_document(doc):
                                    continue
                                existing = self.store.get("leagues", lgid) or {}
                                self.store.command("league", {"n01_id": lgid, "title": doc.get("title"),
                                    "source_url": league.get("url"), "raw": sanitize(doc),
                                    "last_synced_at": now(), **{k: existing[k] for k in
                                     ("committee_id", "verification_status", "evidence") if k in existing}})
                                relation = {"endpoint": "league/tournament/list", "filters": {"lgid": lgid}}
                                if not any(t["endpoint"] == relation["endpoint"] and t.get("filters") == relation["filters"] for t in run["tasks"]):
                                    run["tasks"].append(relation)
                            else:
                                tdid = item.get("tdid")
                                if not isinstance(tdid, str):
                                    raise N01Error("Missing tournament ID")
                                if tdid in seen:
                                    continue
                                # Recheck source filters: unsupported filters may be silently ignored by N01.
                                from app.services.france_discovery_model import timestamp
                                stamp = timestamp(item.get("t_date"))
                                if not stamp or not since <= stamp[:10] <= until_date.isoformat():
                                    continue
                                if details >= detail_budget:
                                    raise N01Error("Detail budget reached; replay this page on resume")
                                changed = self.collect(tdid, start_month=start_month, enrich=enrich, max_pages=max_pages, force_results=force_results)
                                details += 1
                                seen.add(tdid)
                                run["seen"] = sorted(seen)
                                run["stats"]["checked"] += 1
                                run["stats"]["changed"] += int(changed)
                                run["stats"]["discovered"] += 1
                                if details % 20 == 0:
                                    LOG.info("france_progress run=%s checked=%s pages=%s", run["id"], run["stats"]["checked"], run["stats"]["pages"])
                                # Item checkpoint: a large page can resume beyond the per-run budget.
                                self.store.command("run", run)
                        task["skip"] = skip + len(rows)
                        run["stats"]["pages"] += 1
                        if len(rows) < page_size:
                            task["done"] = True
                        self.store.command("run", run)
                except (N01Error, ValueError) as exc:
                    error = {"task": {k: v for k, v in task.items() if k != "done"}, "error": str(exc), "at": now()}
                    run["errors"].append(error)
                    run["last_attempt_errors"].append(error)
                    LOG.warning("france_task_failed run=%s task=%s error=%s", run["id"], task["endpoint"], exc)
                    self.store.command("run", run)
        except (KeyboardInterrupt, Exception) as exc:
            run["status"] = "INTERRUPTED" if isinstance(exc, KeyboardInterrupt) else "FAILED"
            run["errors"].append({"error": str(exc), "at": now()})
            self.store.command("run", run)
            raise
        run["status"] = "SUCCEEDED" if all(t.get("done") for t in run["tasks"]) else "PARTIAL"
        run["updated_at"] = now()
        run["stats"]["requests"] = run["stats"].get("requests", 0) + self.client.requests - initial_requests
        self.store.command("run", run)
        return run
