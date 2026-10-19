"""Inventory stores: offline SQLite and service-only Supabase RPC.

SQLite is an operational fallback, never a substitute for existing 974Darts
competition tables. A command is atomic; a failed page is safe to replay.
"""
from __future__ import annotations

import copy
import json
import sqlite3
import uuid
from pathlib import Path
from typing import Any

from app.services.france_discovery_model import (
    DECISIONS, ORGANISM_TYPES, digest, now, validate_evidence,
)
from app.services.nakka_competition_radar import normalize_text

KINDS = ("committees", "leagues", "competitions", "sources", "candidates", "runs", "history")
CORRECTABLE = {"title", "competition_date", "season", "competition_type", "status", "participants", "formats"}


class SQLiteStore:
    def __init__(self, path: str | Path = ":memory:", *, readonly: bool = False):
        if str(path) != ":memory:" and not readonly:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(f"file:{Path(path).as_posix()}?mode=ro" if readonly else str(path),
                                  uri=readonly)
        if not readonly:
            self.db.execute("create table if not exists inventory(kind text,id text,payload text,primary key(kind,id))")
            self.db.commit()

    def close(self):
        self.db.close()

    def rows(self, kind: str) -> list[dict]:
        return [json.loads(row[0]) for row in self.db.execute(
            "select payload from inventory where kind=? order by id", (kind,))]

    def get(self, kind: str, key: str) -> dict | None:
        row = self.db.execute("select payload from inventory where kind=? and id=?", (kind, key)).fetchone()
        return json.loads(row[0]) if row else None

    def _put(self, kind: str, key: str, value: dict):
        self.db.execute("insert into inventory values(?,?,?) on conflict(kind,id) do update set payload=excluded.payload",
                        (kind, key, json.dumps(value, ensure_ascii=False)))

    def snapshot(self) -> dict:
        return {kind: self.rows(kind) for kind in KINDS}

    def clone(self) -> SQLiteStore:
        result = SQLiteStore()
        self.db.backup(result.db)
        return result

    def command(self, action: str, payload: dict) -> Any:
        with self.db:
            self.db.execute("begin immediate")
            return self._command(action, copy.deepcopy(payload))

    def _audit(self, action: str, payload: dict):
        key = str(uuid.uuid4())
        self._put("history", key, {"id": key, "action": action, "at": now(), "payload": payload})

    def _command(self, action: str, p: dict) -> Any:
        if action == "committee":
            p["normalized_name"] = normalize_text(p.get("name", ""))
            if p.get("organism_type") not in ORGANISM_TYPES or p.get("verification_status") not in DECISIONS or not p.get("name") or not p.get("id"):
                raise ValueError("Invalid organism")
            if p.get("verification_status") == "VERIFIED":
                validate_evidence(p.get("evidence"), target=p["id"])
                if p["organism_type"] not in {"COMMITTEE", "REGIONAL_LEAGUE", "FEDERATION"}:
                    raise ValueError("Clubs and individuals cannot be verified as committees")
            old = self.get("committees", p["id"])
            if old:
                if old != p:
                    raise ValueError("Existing organism: use an audited administrative correction")
                return old
            self._put("committees", p["id"], p)
            self._audit(action, p)
            return p
        if action == "league":
            old = self.get("leagues", p["n01_id"]) or {}
            p = {**old, **p}
            # Discovery does not overwrite a manually mapped league.
            for field in ("committee_id", "evidence", "verification_status"):
                if field in old:
                    p[field] = old[field]
            self._put("leagues", p["n01_id"], p)
            return p
        if action == "observe":
            source, record = p["source"], p["record"]
            key = record["n01_id"]
            old_source = self.get("sources", key) or {}
            old = self.get("competitions", key) or {}
            changed = old_source.get("source_hash") != source["source_hash"]
            source["overrides"] = old_source.get("overrides", {})
            record.update(source["overrides"])
            record.update({"committee_id": old.get("committee_id"),
                           "verification_status": old.get("verification_status", "UNASSIGNED"),
                           "first_seen_at": old.get("first_seen_at", now()), "last_synced_at": now()})
            self._put("sources", key, source)
            self._put("competitions", key, record)
            if changed:
                self._audit(action, {"n01_id": key, "previous_hash": old_source.get("source_hash"),
                                     "source_hash": source["source_hash"], "record": record, "source": source})
            return {"changed": changed}
        if action == "withdraw":
            old = self.get("competitions", p["n01_id"])
            if old:
                old.update(source_public=False, last_synced_at=now())
                self._put("competitions", p["n01_id"], old)
                self._audit(action, p)
            return old
        if action == "suggest":
            key = p["n01_id"] + ":" + p["committee_id"]
            old = self.get("candidates", key)
            if not old:
                p.update(id=key, status="REVIEW_REQUIRED", discovered_at=now())
                self._put("candidates", key, p)
            return old or p
        if action == "decide":
            key = p["n01_id"] + ":" + p["committee_id"]
            competition = self.get("competitions", p["n01_id"])
            committee = self.get("committees", p["committee_id"])
            if not competition or not committee or p.get("status") not in DECISIONS or not p.get("actor") or not p.get("reason"):
                raise ValueError("Invalid decision/actor/reason")
            if p["status"] == "VERIFIED":
                if committee.get("verification_status") != "VERIFIED":
                    raise ValueError("Organism must be verified first")
                validate_evidence(p.get("evidence"), target=p["n01_id"])
                if competition.get("committee_id") not in (None, p["committee_id"]):
                    raise ValueError("Conflicting verified committee; revoke previous decision first")
                competition.update(committee_id=p["committee_id"], verification_status="VERIFIED")
            elif competition.get("committee_id") in (None, p["committee_id"]):
                competition.update(committee_id=None, verification_status=(
                    "REVIEW_REQUIRED" if p["status"] == "REVIEW_REQUIRED" else "UNASSIGNED"))
            p.update(id=key, decided_at=now())
            self._put("candidates", key, p)
            self._put("competitions", competition["n01_id"], competition)
            self._audit(action, p)
            return p
        if action == "correct":
            if not p.get("actor") or not p.get("reason") or not p.get("overrides") or set(p["overrides"]) - CORRECTABLE:
                raise ValueError("Invalid correction")
            source = self.get("sources", p["n01_id"])
            record = self.get("competitions", p["n01_id"])
            if not source or not record:
                raise ValueError("Unknown competition")
            source["overrides"] = {**source.get("overrides", {}), **p["overrides"]}
            record.update(p["overrides"])
            self._put("sources", p["n01_id"], source)
            self._put("competitions", p["n01_id"], record)
            self._audit(action, p)
            return record
        if action == "correct_committee":
            allowed = {"name", "aliases", "department", "region", "parent_organization", "reference_url", "evidence"}
            old = self.get("committees", p["id"])
            if not old or not p.get("actor") or not p.get("reason") or not p.get("overrides") or set(p["overrides"]) - allowed:
                raise ValueError("Invalid organism correction")
            old.update(p["overrides"])
            if not str(old.get("name", "")).strip():
                raise ValueError("An organism name is required")
            if old["verification_status"] == "VERIFIED":
                validate_evidence(old.get("evidence"), target=old["id"])
            old["normalized_name"] = normalize_text(old["name"])
            self._put("committees", p["id"], old)
            self._audit(action, p)
            return old
        if action == "run":
            self._put("runs", p["id"], p)
            return p
        raise ValueError("Unknown inventory action")


class SupabaseStore:
    """Only called by a trusted operator with SUPABASE_SERVICE_ROLE_KEY."""
    def __init__(self, client):
        self.client = client

    def rows(self, kind: str) -> list[dict]:
        if kind not in KINDS:
            raise ValueError("Unknown inventory table")
        rows, start = [], 0
        while True:
            page = self.client.table("france_" + kind).select("id,payload").order("id").range(start, start + 499).execute().data
            rows.extend(({"id": r["id"], **r["payload"]} if kind == "history" else r["payload"]) for r in page)
            if len(page) < 500:
                return rows
            start += 500

    def get(self, kind: str, key: str) -> dict | None:
        if kind not in KINDS:
            raise ValueError("Unknown inventory table")
        rows = self.client.table("france_" + kind).select("payload").eq("id", key).execute().data
        return rows[0]["payload"] if rows else None

    def snapshot(self) -> dict:
        return {kind: self.rows(kind) for kind in KINDS}

    def clone(self) -> SQLiteStore:
        store = SQLiteStore()
        for kind in KINDS:
            for row in self.rows(kind):
                store._put(kind, str(row.get("id") or row.get("n01_id")), row)
        store.db.commit()
        return store

    def command(self, action: str, payload: dict) -> Any:
        if action == "committee":
            payload = {**payload, "normalized_name": normalize_text(payload.get("name", ""))}
        if action == "correct_committee" and "name" in payload.get("overrides", {}):
            payload = copy.deepcopy(payload)
            payload["overrides"]["normalized_name"] = normalize_text(payload["overrides"]["name"])
        return self.client.rpc("france_inventory_command", {"p_action": action, "p_payload": payload}).execute().data
