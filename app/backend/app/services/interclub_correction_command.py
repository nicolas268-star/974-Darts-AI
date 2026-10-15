"""Read-only preview by default; publish just the confirmed J2 on explicit --apply.

Does not run the analysis worker, prepare social posts or send notifications.
"""
import argparse
import json
from pathlib import Path

from .calendar_service import list_events
from .season_registry_service import registry_status
from .interclub_analysis_source import collect_publication
from .interclub_publication_service import resolve_payload, publish_collected
from .interclub_adjustments import BENOIT, CHRISTOPHE, EVENT, MATCH
from .ranking_service import _all


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply one atomic publication after the migration is installed")
    parser.add_argument("--snapshot", type=Path, help="Save the complete source and preview before applying (required with --apply)")
    args = parser.parse_args()
    if args.apply and not args.snapshot:
        parser.error("--apply requires --snapshot to preserve a local audit before writing")
    from supabase import create_client
    from app.config import settings
    db = create_client(settings.supabase_url, settings.supabase_service_role_key)
    url = f"https://n01darts.com/n01/league/season.php?id={EVENT}"
    events = [e for e in list_events()["events"] if e.get("source_url") == url and e.get("event_type") == "CHAMPIONSHIP" and e.get("status") != "CANCELLED"]
    seasons = [s for s in registry_status()["seasons"] if s.get("key") == "2026-2027" and s.get("active")]
    if len(events) != 1 or len(seasons) != 1:
        raise ValueError("Exactly one active-season calendar encounter is required; nothing was modified")
    event = events[0]
    collected = collect_publication(event, seasons[0], event["id"])
    payload = resolve_payload(collected["publication"],
                              _all(db, "committee_licensed_players", "season_key,official_display_name,official_source_name,club_code,identity_id,license_status"),
                              _all(db, "player_identities", "id,canonical_player_id,canonical_display_name,status"),
                              _all(db, "player_aliases", "identity_id,alias_name,confirmed"))
    key = f"2026-2027|J2|nakka:{EVENT}"
    existing = _all(db, "championship_results", "id,home_score,away_score", [("natural_key", key)])
    audit = _all(db, "interclub_auto_publications", "payload_hash,payload,result_id", [("source_event_id", EVENT)])
    if existing and (not audit or audit[0]["payload"] != payload):
        raise ValueError("A different result is already stored. The publisher will preserve it; review the source before applying")
    preview = {
        "calendar_event_id": event["id"], "natural_key": key, "nakka_event_id": EVENT,
        "nakka_match_id": MATCH, "simple_number": 16, "stored_match_number": 18,
        "existing_result": existing, "initial_score_ambree_fournaise": payload["source_snapshot"]["score"],
        "effective_score_ambree_fournaise": payload["score"], "guest": "Benoit BRUNET (Brune → Ambrée, this encounter only)",
        "result_corrections": payload["result_corrections"],
        "statistics_corrections": payload.get("statistics_corrections", []),
        "players": [{"id": p["id"], "name": p["name"], "legs_played": p["leg"], "legs_won": p["winLeg"]}
                    for p in payload["players"] if p["id"] in (BENOIT, CHRISTOPHE)],
        "mode": "APPLY" if args.apply else "DRY_RUN",
    }
    if args.snapshot:
        # Never overwrite an earlier operational audit, including on a retry.
        with args.snapshot.open("x", encoding="utf-8") as stream:
            json.dump({"preview": preview, "collected": collected, "effective_payload": payload}, stream, ensure_ascii=False, indent=2)
    if args.apply:
        # Proves the new database guard is present before invoking publication.
        db.rpc("validate_interclub_adjustments", {"p": payload}).execute()
        preview["publication"] = publish_collected(collected, db=db)
        result_id = preview["publication"]["result_id"]
        stored = _all(db, "championship_results", "id,home_score,away_score", [("id", result_id)])
        encounters = _all(db, "encounters", "id", [("natural_key", key)])
        if len(stored) != 1 or [stored[0]["home_score"], stored[0]["away_score"]] != [5, 15] or len(encounters) != 1:
            raise RuntimeError("Publication returned; post-commit verification requires attention")
        preview["verified_result"] = stored[0]
        preview["encounter_id"] = encounters[0]["id"]
        preview["match_id"] = _all(db, "matches", "id,winner_team_id", [("natural_key", key + "|" + MATCH)])[0]["id"]
    print(json.dumps(preview, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
