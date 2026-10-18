"""Inventory by default; --apply writes only the tournament-page projection.

Run from app/backend with the backend's normal server environment.
"""
from __future__ import annotations

import argparse
import json
from supabase import create_client
from app.services.tournament_page_service import fingerprint, published_revision, sync_official


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--source-id", help="OC1: t_ssSW_4561")
    target.add_argument("--all", action="store_true", help="All already-published official events")
    parser.add_argument("--apply", action="store_true", help="Persist public pages; never republish official points")
    parser.add_argument("--collect-missing", action="store_true", help="Allow Nakka collection only when saved matches or pool rules are insufficient")
    parser.add_argument("--location", help="Optional presentation location, for a single source only")
    args = parser.parse_args()
    if args.all and args.location:
        parser.error("--location requires --source-id")
    from app.config import settings
    db = create_client(settings.supabase_url, settings.supabase_service_role_key)
    query = db.table("ranking_workflow_events").select("*")
    if args.source_id:
        query = query.eq("source_id", args.source_id)
    events = query.execute().data or []
    if not events:
        raise SystemExit("No official dossier found. No event or points were created.")
    report = []
    for event in events:
        if not event.get("published_revision_id"):
            report.append({"event_id": event["id"], "status": "NOT_PUBLISHED", "written": False})
            continue
        revision = published_revision(db, event)
        snapshot = revision["snapshot"]
        source = snapshot.get("source") or {}
        results = snapshot.get("results") or []
        before = fingerprint(results)
        item = {
            "event_id": event["id"], "source_id": event["source_id"],
            "discipline": event["discipline"], "published_revision": revision["id"],
            "published_version": revision["number"], "matches": len(source.get("matches") or []),
            "pool_matches": sum(m.get("phase") == "POOL" for m in source.get("matches") or []),
            "knockout_matches": sum(m.get("phase") == "KNOCKOUT" for m in source.get("matches") or []),
            "participants": len(source.get("participants") or []),
            "published_results": len(results),
            "bound_identities": sum(bool(r.get("identity_id")) for r in results),
            "published_points": sum(r.get("points") or 0 for r in results),
            "results_checksum": before, "written": False,
        }
        if args.apply:
            page = sync_official(db, event["id"], collect_missing=args.collect_missing,
                                 display_metadata={"location": args.location} if args.location else None)
            after = published_revision(db, event)
            if before != fingerprint(after["snapshot"].get("results") or []):
                raise RuntimeError("Official results changed concurrently; inspect the official workflow.")
            item.update(written=True, public_url=f"/tournaments/{page['code']}",
                        official_results_unchanged=True)
        report.append(item)
    print(json.dumps({"mode": "APPLY_PROJECTION_ONLY" if args.apply else "READ_ONLY", "events": report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
