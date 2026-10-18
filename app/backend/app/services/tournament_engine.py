"""Pure Nakka presentation projection shared by official and friendly events.

The official workflow owns publication, identity validation and points. This
module only reads its saved snapshot and builds the historical T5 contract.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime, timezone
import hashlib
import json
from typing import Any

from app.services.tournament_round_robin import build_tournament_round_robins


PLACEMENTS = {
    "WINNER": 1, "RUNNER_UP": 2, "SEMI_FINALIST": 3,
    "QUARTER_FINALIST": 5, "ROUND_OF_16": 9,
}
FORMAT_LABELS = {
    "POOLS": "Poules",
    "SINGLE_ELIMINATION": "Élimination simple",
    "DOUBLE_ELIMINATION": "Double élimination · Winner Bracket · Loser Bracket",
    "POOLS_AND_KNOCKOUT": "Poules · Élimination simple",
    "POOLS_AND_DOUBLE_ELIMINATION": "Poules · Double élimination",
}
COMPETITION_TYPES = {
    "COMMITTEE_OPEN": "Open Comité", "COMMITTEE_CUP": "Coupe Comité",
    "CLUB_SINGLE": "Open de club individuel", "CLUB_DOUBLE": "Open de club en doublettes",
}
PUBLIC_METADATA = (
    "classification", "classification_label", "competition_type", "organizer",
    "location", "venue", "category", "committee_event_key", "ranking_status",
    "official_event_id", "official_version_id", "official_publication",
    "affects_committee_ranking", "season_key",
)


def _integer(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _bracket_kind(match: dict[str, Any]) -> str:
    if match.get("bracket_kind"):
        return str(match["bracket_kind"])
    code = str(match.get("stage_code") or "")
    if code.startswith("grand_final_"):
        return "GRAND_FINAL"
    if code.startswith("winner_"):
        return "WINNER"
    if code.startswith("secondary_"):
        return "SECONDARY"
    if code.startswith("loser_"):
        return "LOSER"
    if code.startswith("ko_third_place_"):
        return "THIRD_PLACE"
    return "PRIMARY"


def _public_participant(participant: dict[str, Any], *, double: bool) -> dict[str, Any]:
    identity = participant.get("identity") or {}
    exact = identity.get("status") == "EXACT" and not double
    fields = {
        "legs_played": "legsPlayed", "legs_won": "legsWon",
        "average_3_darts": "average3Darts", "first_9": "first9",
        "best_finish": "bestFinish", "scores_180": "scores180",
        "scores_170": "scores170", "scores_140": "scores140",
        "scores_120_139": "scores120", "scores_100": "scores100",
        "matches_played": "matchesPlayed", "matches_won": "matchesWon",
        "win_rate": "winRate", "best_leg": "bestLeg", "worst_leg": "worstLeg",
    }
    return {
        "name": participant.get("name"),
        "canonical_player_id": identity.get("canonicalPlayerId") if exact else None,
        "nakka_participant_id": participant.get("sourceId"),
        **{key: participant.get(source) for key, source in fields.items()},
        "no_score": None,
        "teams": ["Doublettes" if double else "Tournoi individuel"],
        "team": "Doublettes" if double else "Tournoi individuel",
        "identity_status": "TEAM" if double else identity.get("status", "UNRESOLVED"),
        "statistics_scope": "DUO" if double else "INDIVIDUAL",
    }


def _source_final_standings(matches: list[dict[str, Any]], double_elimination: bool) -> list[dict[str, Any]]:
    relevant = [
        match for match in matches
        if _bracket_kind(match) in ({"GRAND_FINAL"} if double_elimination else {"PRIMARY"})
        and match.get("phase") == "KNOCKOUT"
    ]
    if not relevant:
        return []
    if not double_elimination and not any(match.get("stage_label") == "Finale" for match in relevant):
        return []
    latest_stage = max(_integer(match.get("stage_index")) for match in relevant)
    finals = [match for match in relevant if _integer(match.get("stage_index")) == latest_stage]
    if len(finals) != 1 or not finals[0].get("result_complete") or not finals[0].get("winner") or finals[0].get("is_decisive") is False:
        return []
    final = finals[0]
    # A reset slot that exists but remains unplayed must not hide a completed
    # grand final. The normalizer does not emit empty Nakka round dictionaries.
    winner = final["winner"]
    loser = final.get("away") if winner == final.get("home") else final.get("home")
    result = [
        {"name": winner, "rank": 1, "placement": "WINNER"},
        {"name": loser, "rank": 2, "placement": "RUNNER_UP"},
    ]
    if double_elimination or not all(match.get("result_complete") for match in relevant):
        return result
    seen = {winner, loser}
    for stage_index in sorted({_integer(match.get("stage_index")) for match in relevant}, reverse=True):
        if stage_index == latest_stage:
            continue
        distance = latest_stage - stage_index
        if distance > 2:
            continue
        for match in relevant:
            if _integer(match.get("stage_index")) != stage_index or not match.get("winner"):
                continue
            eliminated = match.get("away") if match["winner"] == match.get("home") else match.get("home")
            if eliminated and eliminated not in seen:
                result.append({"name": eliminated, "rank": 3 if distance == 1 else 5,
                               "placement": "SEMI_FINALIST" if distance == 1 else "QUARTER_FINALIST"})
                seen.add(eliminated)
    return result


def _highlights(participants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for metric, label in (
        ("average_3_darts", "Meilleure moyenne"), ("first_9", "Meilleur First 9"),
        ("best_finish", "Meilleur finish"), ("scores_180", "Plus de 180"),
    ):
        eligible = [row for row in participants if isinstance(row.get(metric), (float, int)) and row[metric] > 0]
        if not eligible:
            continue
        value = max(row[metric] for row in eligible)
        leaders = [row["name"] for row in eligible if row[metric] == value]
        result.append({"metric": metric, "label": label, "name": " / ".join(leaders), "names": leaders, "value": value})
    return result


def build_tournament_payload(
    snapshot: dict[str, Any], *, code: str,
    metadata: dict[str, Any] | None = None,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a public tournament without writing results, points, ELO or identities.

    ``snapshot`` accepts either ``analyze_direct_event(..., persist=False)`` or
    the official revision ``{source, metadata, results}``. Only saved official
    results may supply committee points; no scale is imported or recalculated.
    """
    existing = existing or {}
    meta = {**(snapshot.get("metadata") or {}), **(metadata or {})}
    source = deepcopy(snapshot.get("source") if isinstance(snapshot.get("source"), dict) else snapshot)
    results = deepcopy(meta.get("results") if "results" in meta else snapshot.get("results") or [])
    double = meta.get("kind") == "CLUB_DOUBLE" or str(meta.get("discipline") or source.get("discipline") or "").upper() == "DOUBLE"
    participants = [row for row in source.get("participants") or [] if isinstance(row, dict)]
    by_source = defaultdict(list)
    for row in results:
        by_source[str(row.get("source_ref") or "").rsplit(":", 1)[0]].append(row)
    for participant in participants:
        official_rows = by_source.get(str(participant.get("sourceId") or ""), [])
        if not double and len(official_rows) == 1 and official_rows[0].get("identity_id"):
            row = official_rows[0]
            participant["identity"] = {"status": "EXACT", "canonicalPlayerId": row.get("canonical_player_id"), "canonicalName": row.get("player_name"), "identityId": row["identity_id"]}
        elif not double and len(official_rows) > 1:
            participant["identity"] = {"status": "AMBIGUOUS", "canonicalPlayerId": None}
        elif not double and not official_rows and (participant.get("identity") or {}).get("status") == "UNRESOLVED":
            saved = [
                row for row in existing.get("players") or []
                if row.get("nakka_participant_id") == participant.get("sourceId")
                and row.get("name") == participant.get("name")
                and row.get("canonical_player_id")
            ]
            if len(saved) == 1:
                participant["identity"] = {"status": "EXACT", "canonicalPlayerId": saved[0]["canonical_player_id"], "canonicalName": (existing.get("display_aliases") or {}).get(participant.get("name"))}

    matches, seen = [], set()
    for match in source.get("matches") or []:
        key = match.get("id") or (
            match.get("stage_code"), match.get("home_source_id") or match.get("home"),
            match.get("away_source_id") or match.get("away"),
        )
        if key in seen:
            continue
        seen.add(key)
        match = deepcopy(match)
        if str(match.get("phase") or "").upper() == "KNOCKOUT":
            match["bracket_kind"] = _bracket_kind(match)
        if double:
            match.update(mode="Double", tracked_players=[], tracked_teams=[match.get("home"), match.get("away")])
        matches.append(match)
    pool_matches = [row for row in matches if str(row.get("phase") or "").upper() == "POOL"]
    knockout_matches = [row for row in matches if str(row.get("phase") or "").upper() == "KNOCKOUT"]
    # Old snapshots used loser_* for s2. If provenance is absent we retain a
    # neutral secondary label; only dw/dl normalization proves double elimination.
    has_double = bool(source.get("hasDoubleElimination")) or any(_bracket_kind(row) in {"WINNER", "GRAND_FINAL"} for row in knockout_matches)
    if not has_double:
        for match in knockout_matches:
            if _bracket_kind(match) == "LOSER":
                match["bracket_kind"] = "SECONDARY"
                match["stage_label"] = str(match.get("stage_label") or "Tableau secondaire").replace("Loser Bracket", "Consolante")
    has_secondary = any(_bracket_kind(row) == "SECONDARY" for row in knockout_matches)
    has_pools = bool(pool_matches or source.get("poolParticipants"))
    format_code = (
        "POOLS_AND_DOUBLE_ELIMINATION" if has_pools and has_double
        else "DOUBLE_ELIMINATION" if has_double
        else "POOLS_AND_KNOCKOUT" if has_pools and knockout_matches
        else "POOLS" if has_pools else "SINGLE_ELIMINATION"
    )
    format_label = FORMAT_LABELS[format_code]
    if has_secondary:
        format_label += " · Consolante"
    grouped = defaultdict(list)
    for match in matches:
        grouped[(match.get("phase"), str(match.get("stage_code") or "rr_1"))].append(match)
    pools, bracket = [], []
    for (phase, stage_code), rows in sorted(grouped.items(), key=lambda item: (_integer(item[1][0].get("stage_index")), item[0][1])):
        stage = {"code": stage_code, "name": rows[0].get("stage_label") or "Poule", "order": _integer(rows[0].get("stage_index")), "matches": rows}
        if phase == "POOL":
            pools.append(stage)
        else:
            stage["bracket_kind"] = _bracket_kind(rows[0])
            bracket.append(stage)
    public_participants = [_public_participant(row, double=double) for row in participants]
    if double:
        for row in public_participants:
            row["members"] = [
                {"canonical_player_id": item.get("canonical_player_id"), "name": item.get("player_name")}
                for item in by_source.get(str(row.get("nakka_participant_id") or ""), [])
            ]
    classification = meta.get("classification") or existing.get("classification") or "FRIENDLY"
    official = classification != "FRIENDLY"
    official_results = [
        {"name": row.get("player_name") or row.get("name"), "rank": PLACEMENTS.get(row.get("placement")),
         "canonical_player_id": row.get("canonical_player_id"), "points": row.get("points"),
         "placement": row.get("placement"), "source_ref": row.get("source_ref")}
        for row in results
    ] if official else []
    final_standings = _source_final_standings(matches, has_double)
    source_standings = final_standings
    if official_results:
        if not double:
            final_standings = [deepcopy(row) for row in official_results if row.get("rank") is not None]
        else:
            final_standings = []
            for source_key, members in by_source.items():
                placements = {member.get("placement") for member in members}
                if len(members) != 2 or len(placements) != 1:
                    continue
                placement = next(iter(placements))
                if placement not in PLACEMENTS:
                    continue
                name = members[0].get("source_name") or next((row.get("name") for row in participants if row.get("sourceId") == source_key), None)
                final_standings.append({"name": name, "rank": PLACEMENTS[placement], "placement": placement})
    stable_names = {
        participant.get("name")
        for participant in participants
        if (participant.get("identity") or {}).get("status") == "EXACT" and any(saved.get("nakka_participant_id") == participant.get("sourceId") and saved.get("name") == participant.get("name") for saved in existing.get("players") or [])
    }
    aliases = {
        **{name: value for name, value in (existing.get("display_aliases") or {}).items() if name in stable_names},
        **(source.get("display_aliases") or {}),
    }
    names_to_ids = defaultdict(set)
    for participant in participants:
        identity = participant.get("identity") or {}
        if not double and identity.get("status") == "EXACT" and identity.get("canonicalPlayerId"):
            names_to_ids[str(participant.get("name"))].add((identity["canonicalPlayerId"], identity.get("canonicalName")))
    for name, identities in names_to_ids.items():
        if len(identities) == 1:
            canonical_name = next(iter(identities))[1]
            if canonical_name:
                aliases[name] = canonical_name
        else:
            aliases.pop(name, None)
    source_id = source.get("sourceId") or existing.get("source_tournament_id")
    stable_source = {key: value for key, value in source.items() if key not in {"collectedAt", "importedAt", "imported", "importedTournamentCode", "snapshotHash"}}
    source_hash = source.get("snapshotHash") or hashlib.sha256(json.dumps(stable_source, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()
    notes = ["Les données sportives proviennent du snapshot Nakka validé."]
    notes.extend(source.get("blockingReasons") or [])
    if any((row.get("identity") or {}).get("status") != "EXACT" for row in participants) and not double:
        notes.append("Les identités non résolues restent propres au tournoi, sans création automatique de joueur.")
    if double:
        notes.append("Les statistiques des doublettes sont collectives et ne sont pas attribuées aux joueurs.")
    if not official:
        notes.append("Tournoi amical : aucun point Comité, classement officiel ou ELO n’est modifié.")
    if official_results:
        official_winner = next((row["name"] for row in final_standings if row["rank"] == 1), None)
        source_winner = next((row["name"] for row in source_standings if row["rank"] == 1), None)
        if source_winner and aliases.get(source_winner, source_winner) != official_winner:
            notes.append("Le palmarès et les points suivent la publication officielle ; le parcours Nakka présente une différence à contrôler.")
    now = datetime.now(timezone.utc).isoformat()
    event_date = meta.get("event_date") or source.get("date")
    event_date = str(event_date) if event_date is not None else None
    date_label = source.get("dateLabel")
    if meta.get("event_date"):
        from app.services.nakka_direct_import import FRENCH_MONTHS
        try:
            day = date.fromisoformat(str(meta["event_date"])[:10])
            date_label = f"{day.day} {FRENCH_MONTHS[day.month]} {day.year}"
        except ValueError:
            date_label = None
    payload = {
        "code": code, "source_tournament_id": source_id, "source_type": "NAKKA_DIRECT",
        "source_url": source.get("sourceUrl") or meta.get("source_url"),
        "source_snapshot_hash": source_hash, "source_updated_at": source.get("sourceUpdatedAt"),
        "source_status": source.get("sourceStatus"),
        "imported_at": existing.get("imported_at") or now, "refreshed_at": now,
        "name": meta.get("title") or source.get("title") or existing.get("name") or "Tournoi Nakka",
        "event_name": meta.get("title") or source.get("title") or "Tournoi Nakka",
        "date": event_date, "date_label": date_label,
        "season": str(meta.get("season_key") or source.get("season") or ""),
        "discipline": "DOUBLE" if double else "SINGLE", "status": "AVAILABLE",
        "classification": classification,
        "classification_label": "Tournoi amical" if not official else "Compétition officielle",
        **{key: deepcopy(meta[key]) for key in PUBLIC_METADATA if key in meta},
        "competition_type": meta.get("competition_type") or COMPETITION_TYPES.get(meta.get("kind")) or ("Tournoi en doublettes" if double else "Tournoi individuel"),
        "format": format_code, "format_label": format_label,
        "has_pools": has_pools, "has_secondary_bracket": has_secondary, "has_double_elimination": has_double,
        "official_separation": True, "affects_official_ranking": False,
        "affects_official_points": False, "affects_elo": False,
        "winner": next((row["name"] for row in final_standings if row["rank"] == 1), None),
        "runner_up": next((row["name"] for row in final_standings if row["rank"] == 2), None),
        "display_aliases": aliases, "editorial_summary": source.get("editorial_summary"),
        "summary": {"source_rows": len(matches), "matches": len(matches),
                    "legs": sum(_integer(row.get("legs")) for row in matches),
                    "pool_matches": len(pool_matches), "knockout_matches": len(knockout_matches),
                    "tracked_players": 0 if double else len(public_participants),
                    "tracked_duos": len(public_participants) if double else 0,
                    "complete_results": sum(bool(row.get("result_complete")) for row in matches)},
        "matches": matches, "pools": pools, "bracket": bracket,
        "pool_participants": source.get("poolParticipants") or {},
        "pool_settings": source.get("poolSettings") or {},
        "source_pool_standings": source.get("sourcePoolStandings") or {},
        "pool_qualifiers": source.get("poolQualifiers") or {},
        "players": [] if double else public_participants, "duos": public_participants if double else [],
        "highlights": _highlights(public_participants), "final_standings": final_standings,
        "official_results": official_results, "data_quality_notes": notes,
    }
    if meta.get("location") is None and meta.get("venue"):
        payload["location"] = meta["venue"]
    payload["round_robin"] = build_tournament_round_robins(payload)
    for pool in payload["round_robin"]:
        if not pool.get("ranking_confirmed"):
            notes.append(f"{pool['name']} : classement non confirmé ou égalité non départagée par la source.")
    return payload
