from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from .control_catalog import (
    OFFICIAL_2026_FIXTURES,
    OFFICIAL_2026_SOURCE_URL,
    ROUTE_MANIFEST,
    SEASON_PROFILES,
    canonical_team_name,
    club_name,
    official_fixture,
    season_year,
)
from .ranking_service import _optional_all


def _safe_all(db: Client, table: str, select: str) -> list[dict[str, Any]]:
    return list(_optional_all(db, table, select) or [])


def _iso_date(value: Any) -> str | None:
    text = str(value or "").strip()
    return text[:10] if text else None


def _status(ok: bool, *, empty: bool = False) -> str:
    if empty:
        return "PREPARED"
    return "PASS" if ok else "CHECK"


def _season_rows(
    year: int,
    seasons: list[dict[str, Any]],
    results: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    candidates = [row for row in seasons if season_year(row.get("name")) == year]
    if candidates:
        season = max(
            candidates,
            key=lambda row: (
                bool(row.get("is_active")),
                sum(result.get("season_id") == row.get("id") for result in results),
            ),
        )
        return season, [
            row for row in results if row.get("season_id") == season.get("id")
        ]

    if year == 2026 and results:
        by_season: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for result in results:
            if result.get("season_id"):
                by_season[str(result["season_id"])].append(result)
        if by_season:
            season_id, rows = max(by_season.items(), key=lambda item: len(item[1]))
            return next(
                (row for row in seasons if str(row.get("id")) == season_id),
                {"id": season_id, "name": "Saison 2026", "is_active": True},
            ), rows
    return None, []


def build_control_quality_report(db: Client) -> dict[str, Any]:
    seasons = _safe_all(db, "seasons", "id,name,is_active")
    teams = _safe_all(db, "teams", "id,name,club_id")
    rounds = _safe_all(db, "rounds", "id,code,season_id,played_on,published")
    results = _safe_all(
        db,
        "championship_results",
        (
            "id,season_id,round_id,home_team_id,away_team_id,"
            "detail_status,quality_status"
        ),
    )
    players = _safe_all(db, "players", "id,display_name,team_id")
    identities = _safe_all(
        db,
        "player_identities",
        "id,canonical_player_id,canonical_display_name,status,merged_into_identity_id",
    )
    aliases = _safe_all(
        db,
        "player_aliases",
        "id,identity_id,source_player_id,alias_name,confirmed",
    )

    team_names = {str(row.get("id")): str(row.get("name") or "") for row in teams}
    round_rows = {str(row.get("id")): row for row in rounds}
    season_reports: list[dict[str, Any]] = []

    for year, profile in SEASON_PROFILES.items():
        season, season_results = _season_rows(year, seasons, results)
        observed_team_names = {
            canonical_team_name(team_names.get(str(team_id)), year)
            for result in season_results
            for team_id in (result.get("home_team_id"), result.get("away_team_id"))
            if team_id
        }
        observed_team_names.discard("")
        observed_clubs = {
            club_name(team_name, year) for team_name in observed_team_names
        }

        date_rows: list[dict[str, Any]] = []
        for result in season_results:
            round_row = round_rows.get(str(result.get("round_id")), {})
            db_date = _iso_date(round_row.get("played_on"))
            fixture = official_fixture(
                round_row.get("code"),
                team_names.get(str(result.get("home_team_id"))),
                team_names.get(str(result.get("away_team_id"))),
            ) if year == 2026 else None
            date_rows.append({
                "resultId": result.get("id"),
                "round": round_row.get("code"),
                "home": team_names.get(str(result.get("home_team_id"))),
                "away": team_names.get(str(result.get("away_team_id"))),
                "playedOn": fixture.played_on if fixture else db_date,
                "source": "NAKKA_OFFICIAL" if fixture else "DATABASE" if db_date else "UNCONFIRMED",
                "nakkaEventId": fixture.event_id if fixture else None,
            })

        empty = not season_results
        teams_ok = len(observed_team_names) == len(profile.expected_teams)
        clubs_ok = len(observed_clubs) == len(profile.expected_clubs)
        encounters_ok = (
            profile.expected_encounters is None
            or len(season_results) == profile.expected_encounters
        )
        dated = sum(bool(row["playedOn"]) for row in date_rows)
        dates_ok = not season_results or dated == len(season_results)
        missing_expected = sorted(set(profile.expected_teams) - observed_team_names)
        unexpected = sorted(observed_team_names - set(profile.expected_teams))

        season_reports.append({
            "year": year,
            "seasonId": season.get("id") if season else None,
            "catalogState": profile.state,
            "status": _status(
                teams_ok and clubs_ok and encounters_ok and dates_ok,
                empty=empty,
            ),
            "note": profile.note,
            "teams": {
                "expected": len(profile.expected_teams),
                "observed": len(observed_team_names),
                "names": sorted(observed_team_names) if observed_team_names else list(profile.expected_teams),
                "missing": missing_expected if not empty else [],
                "unexpected": unexpected,
            },
            "clubs": {
                "expected": len(profile.expected_clubs),
                "observed": len(observed_clubs),
                "names": sorted(observed_clubs) if observed_clubs else list(profile.expected_clubs),
            },
            "encounters": {
                "expected": profile.expected_encounters,
                "observed": len(season_results),
            },
            "dates": {
                "expected": len(season_results) if season_results else profile.expected_encounters,
                "confirmed": dated,
                "missing": len(season_results) - dated,
                "source": OFFICIAL_2026_SOURCE_URL if year == 2026 else None,
                "timezone": "Indian/Reunion",
                "format": "DD/MM/YYYY",
                "fixtures": date_rows,
            },
        })

    canonical_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for team in teams:
        canonical_groups[canonical_team_name(team.get("name"))].append(team)
    team_duplicates = [
        {
            "canonical": canonical,
            "records": [
                {"id": row.get("id"), "name": row.get("name")} for row in rows
            ],
        }
        for canonical, rows in canonical_groups.items()
        if canonical and len(rows) > 1
    ]

    active_identity_ids = {
        str(row.get("id"))
        for row in identities
        if row.get("status") != "MERGED" and row.get("id")
    }
    canonical_player_ids = {
        str(row.get("canonical_player_id"))
        for row in identities
        if row.get("status") != "MERGED" and row.get("canonical_player_id")
    }
    confirmed_aliases = [row for row in aliases if row.get("confirmed")]
    aliased_player_ids = {
        str(row.get("source_player_id"))
        for row in confirmed_aliases
        if row.get("source_player_id")
    }
    unresolved_players = [
        {"id": row.get("id"), "name": row.get("display_name")}
        for row in players
        if str(row.get("id")) not in canonical_player_ids | aliased_player_ids
    ]
    alias_targets: dict[str, set[str]] = defaultdict(set)
    for alias in confirmed_aliases:
        if alias.get("source_player_id") and alias.get("identity_id"):
            alias_targets[str(alias["source_player_id"])].add(str(alias["identity_id"]))
    conflicting_aliases = [
        {"sourcePlayerId": player_id, "identityIds": sorted(identity_ids)}
        for player_id, identity_ids in alias_targets.items()
        if len(identity_ids) > 1
    ]
    invalid_merges = [
        {
            "identityId": row.get("id"),
            "mergedIntoIdentityId": row.get("merged_into_identity_id"),
        }
        for row in identities
        if row.get("status") == "MERGED"
        and str(row.get("merged_into_identity_id")) not in active_identity_ids
    ]

    examples = {
        "team": str(teams[0].get("id")) if teams else None,
        "match": str(results[0].get("id")) if results else None,
        "player": str(players[0].get("id")) if players else None,
    }
    route_report = []
    for route in ROUTE_MANIFEST:
        example = route["template"]
        example = example.replace("[team_id]", examples["team"] or "team-id")
        example = example.replace("[result_id]", examples["match"] or "result-id")
        example = example.replace("[player_id]", examples["player"] or "player-id")
        example = example.replace("[left_player_id]", examples["player"] or "player-id")
        example = example.replace("[right_player_id]", examples["player"] or "player-id")
        example = example.replace("[player_1_id]", examples["player"] or "player-id")
        example = example.replace("[player_2_id]", examples["player"] or "player-id")
        example = example.replace("[code]", "t1").replace("[season]", "2026")
        route_report.append({**route, "example": example, "declared": True})

    official_2026 = next(item for item in season_reports if item["year"] == 2026)
    blockers = []
    if official_2026["status"] != "PASS":
        blockers.append("La saison 2026 ne respecte pas encore toutes les références officielles.")
    if conflicting_aliases:
        blockers.append("Un joueur source pointe vers plusieurs identités canoniques.")
    if invalid_merges:
        blockers.append("Une fusion d'identité pointe vers une cible absente ou inactive.")

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "READ_ONLY",
        "overallStatus": "PASS" if not blockers else "CHECK",
        "blockers": blockers,
        "seasons": season_reports,
        "teams": {
            "duplicateCanonicalGroups": team_duplicates,
            "fournaiseConsolidated": not any(
                row["canonical"] == "PDC Fournaise" for row in team_duplicates
            ),
        },
        "identities": {
            "players": len(players),
            "active": len(active_identity_ids),
            "merged": sum(row.get("status") == "MERGED" for row in identities),
            "confirmedAliases": len(confirmed_aliases),
            "unresolvedPlayers": unresolved_players,
            "conflictingAliases": conflicting_aliases,
            "invalidMerges": invalid_merges,
            "rule": "Une personne conserve une identité canonique, même en changeant d'équipe.",
        },
        "routes": route_report,
        "seo": {
            "canonicalOrigin": "https://974darts.re",
            "language": "fr-RE",
            "robots": "index,follow",
        },
        "officialFixtures2026": len(OFFICIAL_2026_FIXTURES),
    }
