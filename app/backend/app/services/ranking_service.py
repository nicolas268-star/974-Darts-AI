from __future__ import annotations

from collections import defaultdict
from typing import Any

from supabase import Client


DEFAULT_RULES = {
    "win_points": 3,
    "draw_points": 2,
    "loss_points": 1,
    "ranking_order": [
        "points",
        "set_difference",
        "sets_won",
        "wins",
        "name",
    ],
}


def _all(
    db: Client,
    table: str,
    select: str,
    filters: list[tuple[str, Any]] | None = None,
) -> list[dict]:
    rows: list[dict] = []
    start = 0
    size = 1000

    while True:
        query = db.table(table).select(select)

        for key, value in filters or []:
            query = query.eq(key, value)

        page = query.range(start, start + size - 1).execute().data or []
        rows.extend(page)

        if len(page) < size:
            return rows

        start += size


def _optional_all(
    db: Client,
    table: str,
    select: str,
    filters: list[tuple[str, Any]] | None = None,
) -> list[dict] | None:
    """Keep the API available before the Sprint 10.1 migration is installed."""
    try:
        return _all(db, table, select, filters)
    except Exception:
        return None


def get_rules(db: Client, season_id: str | None = None) -> dict:
    query = db.table("competition_rules").select("*")

    if season_id:
        query = query.eq("season_id", season_id)

    result = (
        query.order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )

    if result:
        row = result[0]
        row["ranking_order"] = (
            row.get("ranking_order") or DEFAULT_RULES["ranking_order"]
        )
        return row

    return DEFAULT_RULES.copy()


def _select_season(
    seasons: list[dict],
    rounds: list[dict],
    season_id: str | None,
) -> dict | None:
    if season_id:
        return next(
            (season for season in seasons if season.get("id") == season_id),
            None,
        )

    published_rounds_by_season: dict[str, int] = defaultdict(int)
    for round_row in rounds:
        if round_row.get("published") and round_row.get("season_id"):
            published_rounds_by_season[round_row["season_id"]] += 1

    active_seasons = [
        season for season in seasons if season.get("is_active")
    ]
    candidates = active_seasons or seasons

    if not candidates:
        return None

    return max(
        candidates,
        key=lambda season: (
            published_rounds_by_season.get(season.get("id"), 0),
            str(season.get("name") or ""),
        ),
    )


def _detailed_leg_totals(
    db: Client,
    published_round_ids: set[str],
) -> tuple[dict[str, dict[str, int]], int]:
    encounter_teams = {
        encounter["id"]: (
            encounter.get("home_team_id"),
            encounter.get("away_team_id"),
        )
        for encounter in _all(
            db,
            "encounters",
            "id,round_id,home_team_id,away_team_id",
        )
        if encounter.get("round_id") in published_round_ids
    }
    encounter_ids = set(encounter_teams)

    matches = _all(
        db,
        "matches",
        "id,encounter_id",
    )
    match_to_encounter = {
        match["id"]: match["encounter_id"]
        for match in matches
        if match.get("encounter_id") in encounter_ids
    }
    match_ids = set(match_to_encounter)

    legs = _all(
        db,
        "legs",
        "id,match_id,winner_team_id,status",
    )

    totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"won": 0, "lost": 0}
    )
    total_valid_legs = 0

    for leg in legs:
        if (
            leg.get("match_id") not in match_ids
            or leg.get("status") != "VALID"
            or not leg.get("winner_team_id")
        ):
            continue

        winner_team_id = leg["winner_team_id"]
        encounter_id = match_to_encounter[leg["match_id"]]
        home_team_id, away_team_id = encounter_teams[encounter_id]
        loser_team_id = (
            away_team_id
            if winner_team_id == home_team_id
            else home_team_id
            if winner_team_id == away_team_id
            else None
        )

        totals[winner_team_id]["won"] += 1
        if loser_team_id:
            totals[loser_team_id]["lost"] += 1
        total_valid_legs += 1

    return {team_id: dict(values) for team_id, values in totals.items()}, total_valid_legs


def _official_standings(
    results: list[dict],
    team_names: dict[str, str],
    round_codes: dict[str, str],
    rules: dict,
    detailed_legs: dict[str, dict[str, int]],
    total_valid_legs: int,
) -> dict:
    stats: dict[str, dict[str, Any]] = {}
    notes: list[str] = []

    def team_row(team_id: str) -> dict[str, Any]:
        if team_id not in stats:
            stats[team_id] = {
                "team_id": team_id,
                "name": team_names.get(team_id, "Équipe inconnue"),
                "played": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "sets_won": 0,
                "sets_lost": 0,
                "legs_won": detailed_legs.get(team_id, {}).get("won", 0),
                "legs_lost": detailed_legs.get(team_id, {}).get("lost", 0),
                "points": 0,
                "detailed_encounters": 0,
                "collective_only_encounters": 0,
            }
        return stats[team_id]

    collective_only = 0
    score_warnings = 0

    for result in results:
        home_team_id = result.get("home_team_id")
        away_team_id = result.get("away_team_id")
        home_score = int(result.get("home_score") or 0)
        away_score = int(result.get("away_score") or 0)

        if not home_team_id or not away_team_id:
            continue

        home = team_row(home_team_id)
        away = team_row(away_team_id)

        for current, own_score, opponent_score in (
            (home, home_score, away_score),
            (away, away_score, home_score),
        ):
            current["played"] += 1
            current["sets_won"] += own_score
            current["sets_lost"] += opponent_score

            if result.get("detail_status") == "COLLECTIVE_ONLY":
                current["collective_only_encounters"] += 1
            else:
                current["detailed_encounters"] += 1

        if home_score > away_score:
            home["wins"] += 1
            away["losses"] += 1
            home["points"] += rules["win_points"]
            away["points"] += rules["loss_points"]
        elif away_score > home_score:
            away["wins"] += 1
            home["losses"] += 1
            away["points"] += rules["win_points"]
            home["points"] += rules["loss_points"]
        else:
            home["draws"] += 1
            away["draws"] += 1
            home["points"] += rules["draw_points"]
            away["points"] += rules["draw_points"]

        if result.get("detail_status") == "COLLECTIVE_ONLY":
            collective_only += 1
            notes.append(
                (
                    f"{round_codes.get(result.get('round_id'), 'Journée inconnue')} · "
                    f"{team_names.get(home_team_id, 'Équipe inconnue')} "
                    f"{home_score}–{away_score} "
                    f"{team_names.get(away_team_id, 'Équipe inconnue')} : "
                    "résultat collectif compté, détail PvP indisponible."
                )
            )

        if result.get("quality_status") == "CHECK":
            score_warnings += 1
            note = str(result.get("quality_note") or "").strip()
            if note:
                notes.append(note)

    # Detailed leg totals deliberately exclude collective-only encounters.
    total_by_team = sum(
        values.get("won", 0)
        for values in detailed_legs.values()
    )
    for team_id, current in stats.items():
        own = detailed_legs.get(team_id, {})
        current["legs_won"] = own.get("won", 0)
        current["legs_lost"] = own.get("lost", 0)
        current["leg_difference"] = (
            current["legs_won"] - current["legs_lost"]
        )
        current["set_difference"] = (
            current["sets_won"] - current["sets_lost"]
        )
        current["win_rate"] = (
            round(current["wins"] / current["played"] * 100, 1)
            if current["played"]
            else 0
        )
        current["detail_complete"] = (
            current["collective_only_encounters"] == 0
        )

    standings = list(stats.values())
    standings.sort(
        key=lambda item: (
            -item["points"],
            -item["set_difference"],
            -item["sets_won"],
            -item["wins"],
            item["name"].lower(),
        )
    )

    for index, item in enumerate(standings, 1):
        item["rank"] = index

    return {
        "standings": standings,
        "summary": {
            "rounds": len(
                {
                    result.get("round_id")
                    for result in results
                    if result.get("round_id")
                }
            ),
            "teams": len(standings),
            "encounters": len(results),
            "official_results": len(results),
            "collective_only_encounters": collective_only,
            "score_warnings": score_warnings,
            "valid_legs": total_valid_legs,
            "detailed_leg_wins": total_by_team,
        },
        "data_quality_notes": notes,
        "ranking_source": "CALENDRIER_SCORE",
    }


def _pvp_fallback(
    db: Client,
    encounters: list[dict],
    team_names: dict[str, str],
    rules: dict,
    total_valid_legs: int,
) -> dict:
    """Sprint 10 reconstruction retained only as a safe pre-migration fallback."""
    encounter_ids = {
        encounter["id"]
        for encounter in encounters
    }
    matches = _all(
        db,
        "matches",
        (
            "id,encounter_id,team_1_id,team_2_id,"
            "winner_team_id,match_number,nakka_match_number,mode"
        ),
    )
    matches = [
        match
        for match in matches
        if match.get("encounter_id") in encounter_ids
    ]
    match_ids = {
        match["id"]
        for match in matches
    }
    legs = _all(
        db,
        "legs",
        "id,match_id,winner_team_id,status",
    )

    leg_counts_by_match: dict[str, dict[str, int]] = defaultdict(
        lambda: defaultdict(int)
    )
    for leg in legs:
        if (
            leg.get("match_id") in match_ids
            and leg.get("status") == "VALID"
            and leg.get("winner_team_id")
        ):
            leg_counts_by_match[leg["match_id"]][leg["winner_team_id"]] += 1

    matches_by_encounter: dict[str, list[dict]] = defaultdict(list)
    for match in matches:
        if match.get("encounter_id"):
            matches_by_encounter[match["encounter_id"]].append(match)

    stats: dict[str, dict[str, Any]] = {}

    def team_row(team_id: str) -> dict[str, Any]:
        if team_id not in stats:
            stats[team_id] = {
                "team_id": team_id,
                "name": team_names.get(team_id, "Équipe inconnue"),
                "played": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "sets_won": 0,
                "sets_lost": 0,
                "legs_won": 0,
                "legs_lost": 0,
                "points": 0,
                "detailed_encounters": 0,
                "collective_only_encounters": 0,
                "detail_complete": True,
            }
        return stats[team_id]

    completed = 0
    for encounter in encounters:
        home_team_id = encounter.get("home_team_id")
        away_team_id = encounter.get("away_team_id")
        if not home_team_id or not away_team_id:
            continue

        home_matches_won = 0
        away_matches_won = 0
        home_legs_won = 0
        away_legs_won = 0

        for match in matches_by_encounter.get(encounter["id"], []):
            match_id = match["id"]
            team_1_id = match.get("team_1_id")
            team_2_id = match.get("team_2_id")
            team_1_legs = leg_counts_by_match[match_id].get(team_1_id, 0)
            team_2_legs = leg_counts_by_match[match_id].get(team_2_id, 0)
            winner = match.get("winner_team_id")

            if winner not in {team_1_id, team_2_id}:
                if team_1_legs > team_2_legs:
                    winner = team_1_id
                elif team_2_legs > team_1_legs:
                    winner = team_2_id
                else:
                    winner = None

            if winner == home_team_id:
                home_matches_won += 1
            elif winner == away_team_id:
                away_matches_won += 1

            home_legs_won += leg_counts_by_match[match_id].get(
                home_team_id, 0
            )
            away_legs_won += leg_counts_by_match[match_id].get(
                away_team_id, 0
            )

        if home_matches_won + away_matches_won == 0:
            continue

        completed += 1
        home = team_row(home_team_id)
        away = team_row(away_team_id)

        for current, sets_won, sets_lost, legs_won, legs_lost in (
            (
                home,
                home_matches_won,
                away_matches_won,
                home_legs_won,
                away_legs_won,
            ),
            (
                away,
                away_matches_won,
                home_matches_won,
                away_legs_won,
                home_legs_won,
            ),
        ):
            current["played"] += 1
            current["sets_won"] += sets_won
            current["sets_lost"] += sets_lost
            current["legs_won"] += legs_won
            current["legs_lost"] += legs_lost
            current["detailed_encounters"] += 1

        if home_matches_won > away_matches_won:
            home["wins"] += 1
            away["losses"] += 1
            home["points"] += rules["win_points"]
            away["points"] += rules["loss_points"]
        elif away_matches_won > home_matches_won:
            away["wins"] += 1
            home["losses"] += 1
            away["points"] += rules["win_points"]
            home["points"] += rules["loss_points"]
        else:
            home["draws"] += 1
            away["draws"] += 1
            home["points"] += rules["draw_points"]
            away["points"] += rules["draw_points"]

    standings = list(stats.values())
    for item in standings:
        item["set_difference"] = item["sets_won"] - item["sets_lost"]
        item["leg_difference"] = item["legs_won"] - item["legs_lost"]
        item["win_rate"] = (
            round(item["wins"] / item["played"] * 100, 1)
            if item["played"]
            else 0
        )

    standings.sort(
        key=lambda item: (
            -item["points"],
            -item["set_difference"],
            -item["sets_won"],
            -item["wins"],
            item["name"].lower(),
        )
    )
    for index, item in enumerate(standings, 1):
        item["rank"] = index

    return {
        "standings": standings,
        "summary": {
            "teams": len(standings),
            "encounters": completed,
            "official_results": 0,
            "collective_only_encounters": 0,
            "score_warnings": 1,
            "valid_legs": total_valid_legs,
        },
        "data_quality_notes": [
            (
                "Mode de secours PvP actif : installez la migration Sprint 10.1 "
                "pour inclure les résultats collectifs absents du détail."
            )
        ],
        "ranking_source": "PVP_FALLBACK",
    }


def build_ranking(
    db: Client,
    season_id: str | None = None,
) -> dict:
    seasons = _all(
        db,
        "seasons",
        "id,name,is_active",
    )
    all_rounds = _all(
        db,
        "rounds",
        "id,code,season_id,published",
    )
    season = _select_season(
        seasons=seasons,
        rounds=all_rounds,
        season_id=season_id,
    )
    resolved_season_id = season.get("id") if season else None
    rules = get_rules(db, resolved_season_id)

    if not resolved_season_id:
        return {
            "season": None,
            "rules": rules,
            "standings": [],
            "summary": {
                "rounds": 0,
                "teams": 0,
                "encounters": 0,
                "official_results": 0,
                "collective_only_encounters": 0,
                "score_warnings": 0,
                "valid_legs": 0,
            },
            "data_quality_notes": [],
            "ranking_source": "NONE",
        }

    rounds = [
        round_row
        for round_row in all_rounds
        if round_row.get("season_id") == resolved_season_id
    ]
    published_round_ids = {
        round_row["id"]
        for round_row in rounds
        if round_row.get("published")
    }
    round_codes = {
        round_row["id"]: round_row["code"]
        for round_row in rounds
    }

    teams = _all(
        db,
        "teams",
        "id,name",
    )
    team_names = {
        team["id"]: team["name"]
        for team in teams
    }

    detailed_legs, total_valid_legs = _detailed_leg_totals(
        db,
        published_round_ids,
    )

    official_results = _optional_all(
        db,
        "championship_results",
        (
            "id,natural_key,season_id,round_id,home_team_id,away_team_id,"
            "home_score,away_score,detail_status,quality_status,quality_note,"
            "source_sheet,source_row"
        ),
        [("season_id", resolved_season_id)],
    )

    if official_results:
        payload = _official_standings(
            results=[
                result
                for result in official_results
                if result.get("round_id") in published_round_ids
            ],
            team_names=team_names,
            round_codes=round_codes,
            rules=rules,
            detailed_legs=detailed_legs,
            total_valid_legs=total_valid_legs,
        )
    else:
        encounters = _all(
            db,
            "encounters",
            "id,round_id,home_team_id,away_team_id,name",
        )
        encounters = [
            encounter
            for encounter in encounters
            if encounter.get("round_id") in published_round_ids
        ]
        payload = _pvp_fallback(
            db=db,
            encounters=encounters,
            team_names=team_names,
            rules=rules,
            total_valid_legs=total_valid_legs,
        )
        payload["summary"]["rounds"] = len(published_round_ids)

    return {
        "season": season,
        "rules": rules,
        **payload,
    }
