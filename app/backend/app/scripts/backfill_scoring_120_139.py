"""Replay detailed interclub sources. Dry-run by default; never publish messages."""
from __future__ import annotations

import argparse
import json
import re

from app.services.interclub_analysis_source import collect_publication
from app.services.interclub_publication_service import publish_collected, resolve_payload
from app.services.ranking_service import _all
from app.services.season_registry_service import DEFAULT_SEASONS


def backfill(db, *, apply=False, event_id=None, collect=collect_publication):
    seasons = {s["id"]: s["name"] for s in _all(db, "seasons", "id,name")}
    configs = {s["key"]: s for s in DEFAULT_SEASONS}
    licensed = _all(db, "committee_licensed_players", "season_key,official_display_name,official_source_name,club_code,identity_id,license_status")
    identities = _all(db, "player_identities", "id,canonical_player_id,canonical_display_name,status")
    aliases = _all(db, "player_aliases", "identity_id,alias_name,confirmed")
    report, seen = [], set()
    for row in _all(db, "championship_results", "id,season_id,source_sheet,played_on,detail_status,quality_status"):
        match = re.fullmatch(r"https://n01darts.com/n01/league/season.php\?id=(t_[A-Za-z0-9]+_[0-9]+)", row.get("source_sheet") or "")
        if not match or (event_id and match[1] != event_id) or match[1] in seen:
            continue
        seen.add(match[1])
        name = seasons.get(row["season_id"])
        item = {"event_id": match[1], "season": name}
        report.append(item)
        # Retain the existing identity/publisher scope. Older workbook imports
        # contain aggregate counters, not enough evidence for this new range.
        if (name != "2026-2027" or not row.get("played_on")
                or row.get("detail_status") != "DETAILED" or row.get("quality_status") != "VERIFIED"):
            item.update(status="UNAVAILABLE", reason="Source détaillée compatible avec le publieur existant indisponible.")
            continue
        try:
            collected = collect({"source_url": row["source_sheet"], "start_date": row["played_on"]}, configs[name], row["id"])
            payload = resolve_payload(collected["publication"], licensed, identities, aliases)
            item.update(player_legs=len(payload["stats"]),
                        scores_120_139=sum(s["scores_120_139"] for s in payload["stats"]))
            if apply:
                item["result"] = publish_collected(collected, db=db)
                item["status"] = "APPLIED"
            else:
                item["status"] = "DRY_RUN"
        except Exception as exc:
            # Keep batch failures visible without printing upstream credentials
            # or database responses. No failed event is marked as recalculated.
            item.update(status="ERROR", reason=type(exc).__name__)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Persist exact counts after validation.")
    parser.add_argument("--event-id", help="Limit replay to one Nakka event.")
    args = parser.parse_args()
    from supabase import create_client
    from app.config import settings
    report = backfill(create_client(settings.supabase_url, settings.supabase_service_role_key),
                      apply=args.apply, event_id=args.event_id)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if any(item["status"] == "ERROR" for item in report) or (args.event_id and not report) else 0


if __name__ == "__main__":
    raise SystemExit(main())
