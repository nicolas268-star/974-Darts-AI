"""python -m app.scripts.france_inventory --help (no production worker enabled)."""
from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

from app.services.france_discovery_model import now
from app.services.france_discovery_report import write_report
from app.services.france_discovery_service import DiscoveryService
from app.services.france_discovery_store import SQLiteStore, SupabaseStore, promote_initial_inventory
from app.services.n01_public_client import N01Client

ROOT = next((parent for parent in Path(__file__).resolve().parents
             if (parent / "supabase").is_dir() and (parent / "app/backend").is_dir()),
            Path(os.getenv("FRANCE_INVENTORY_ROOT", "/app")))
DATA_DIRECTORY = ROOT / "app/backend/data" if (ROOT / "app/backend").is_dir() else ROOT / "data"


def parser():
    p = argparse.ArgumentParser(description="Inventaire Comités France : lecture publique N01, aucun classement")
    p.add_argument("mode", choices=("discover", "update", "seed", "validate", "correct", "correct-organism", "report", "probe", "promote"))
    p.add_argument("--database", type=Path, default=DATA_DIRECTORY / "france-inventory.sqlite")
    p.add_argument("--supabase", action="store_true", help="Explicit opt-in, service role env required")
    p.add_argument("--dry-run", action="store_true", help="In-memory state clone, no database writes")
    p.add_argument("--catalog", type=Path, default=ROOT / "docs/france-comites/catalogue-sources.json")
    p.add_argument("--decision-file", type=Path, help="Audited decision/correction JSON, never a guessed association")
    p.add_argument("--output", type=Path, default=ROOT / "docs/france-comites")
    p.add_argument("--since", default="2025-01-01")
    p.add_argument("--until", help="Inclusive UTC date; default today")
    p.add_argument("--keyword", action="append", help="Repeat to override discovery search terms")
    p.add_argument("--season-start-month", type=int, default=9)
    p.add_argument("--page-size", type=int, default=100)
    p.add_argument("--max-pages", type=int, default=30)
    p.add_argument("--detail-budget", type=int, default=200)
    p.add_argument("--metadata-only", action="store_true")
    p.add_argument("--candidates-only", action="store_true", help="Update only competitions with an organism candidate")
    p.add_argument("--force-results", action="store_true", help="Refresh auxiliary results even if tournament metadata is unchanged")
    p.add_argument("--interval", type=float, default=0.75)
    p.add_argument("--resume", help="Run ID; keep the same search/date/season/enrichment options")
    p.add_argument("--probe-tournament", default="t_aKyY_3246")
    p.add_argument("--probe-league", default="lg_z9w5_4962")
    return p


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    if args.mode == "promote" and not args.supabase:
        raise ValueError("Promotion requires an explicit --supabase target")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    client = N01Client(interval=args.interval)
    if args.mode == "probe":
        cases = [("tournament/list", {"keyword": "comit", "count": 2}),
            ("league/list", {"keyword": "comit", "count": 2}),
            ("league/get", {"lgid": args.probe_league}),
            ("league/tournament/list", {"lgid": args.probe_league, "count": 2}),
            *[(endpoint, {"tdid": args.probe_tournament}) for endpoint in (
                "tournament/get", "tournament/entry/list", "tournament/stats", "tournament/standings")],
            ("match/list", {"tdid": args.probe_tournament, "count": 1})]
        results = []
        for endpoint, params in cases:
            try:
                response = client.get(endpoint, **params)
                results.append({"endpoint": endpoint, "params": params, "result": response["result"],
                                "keys": sorted(response), "items": len(response.get("list", []))})
            except Exception as exc:
                results.append({"endpoint": endpoint, "params": params, "error": str(exc)})
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "verification-endpoints.json").write_text(json.dumps(
            {"checked_at": now(), "anonymous": True, "results": results, "trace": client.trace}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(results, ensure_ascii=False))
        return int(any("error" in r for r in results))
    if args.supabase:
        from supabase import create_client
        store = SupabaseStore(create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]))
    else:
        readonly = args.mode == "report" or (args.dry_run and args.database.exists())
        store = SQLiteStore(":memory:" if args.dry_run and not args.database.exists() else args.database,
                            readonly=readonly)
    if args.dry_run:
        original = store
        store = store.clone()
        if isinstance(original, SQLiteStore):
            original.close()
    try:
        result = None
        if args.mode == "promote":
            source = SQLiteStore(args.database, readonly=True)
            try:
                result = promote_initial_inventory(source, store)
            finally:
                source.close()
        elif args.mode == "seed":
            catalog = json.loads(args.catalog.read_text(encoding="utf-8-sig"))
            for committee in catalog["committees"]:
                store.command("committee", committee)
            for league in catalog.get("leagues", []):
                store.command("league", league)
            result = {"organisms": len(catalog["committees"]), "leagues": len(catalog.get("leagues", []))}
        elif args.mode in {"validate", "correct", "correct-organism"}:
            if not args.decision_file:
                raise ValueError("--decision-file is required")
            payload = json.loads(args.decision_file.read_text(encoding="utf-8-sig"))
            result = store.command({"validate": "decide", "correct": "correct", "correct-organism": "correct_committee"}[args.mode], payload)
        elif args.mode in {"discover", "update"}:
            result = DiscoveryService(client, store).run(mode=args.mode, since=args.since, until=args.until,
                keywords=args.keyword, start_month=args.season_start_month, page_size=args.page_size,
                max_pages=args.max_pages, detail_budget=args.detail_budget, enrich=not args.metadata_only, resume=args.resume,
                candidates_only=args.candidates_only, force_results=args.force_results)
            result = {k: result[k] for k in ("id", "status", "stats", "last_attempt_errors")}
        write_report(store.snapshot(), args.output)
        if client.trace:
            (args.output / "derniere-collecte-http.json").write_text(json.dumps(
                {"dry_run": args.dry_run, "trace": client.trace}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"dry_run": args.dry_run, "result": result, "output": str(args.output)}, ensure_ascii=False))
        return 2 if result and result.get("status") == "PARTIAL" else 0
    finally:
        if isinstance(store, SQLiteStore):
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
