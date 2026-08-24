from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from supabase import Client

from .ranking_service import _all, _optional_all, _select_season
from .control_catalog import official_fixture


def _integer(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _number(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _mean(values: list[float | int | None], digits: int = 2) -> float | None:
    clean = [float(value) for value in values if value is not None]
    return round(sum(clean) / len(clean), digits) if clean else None


def _round_sort_key(code: str | None) -> tuple[int, str]:
    text = str(code or "")
    digits = "".join(character for character in text if character.isdigit())
    return (_integer(digits) if digits else 9999, text)


def _iso_date(value: Any) -> str | None:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    text = str(value or "").strip()
    return text or None


def _mode_kind(value: Any) -> str:
    mode = str(value or "").strip().upper()
    if mode.startswith("D") or "DOUBLE" in mode:
        return "DOUBLE"
    return "SIMPLE"


def _outcome(score_for: int, score_against: int) -> str:
    if score_for > score_against:
        return "WIN"
    if score_for < score_against:
        return "LOSS"
    return "DRAW"


def _team_result_row(
    result: dict,
    team_id: str,
    team_names: dict[str, str],
    round_rows: dict[str, dict],
    encounter_ids: dict[tuple[str, str, str], str],
) -> dict:
    home_team_id = result["home_team_id"]
    away_team_id = result["away_team_id"]
    is_home = home_team_id == team_id
    opponent_id = away_team_id if is_home else home_team_id
    score_for = _integer(
        result["home_score"] if is_home else result["away_score"]
    )
    score_against = _integer(
        result["away_score"] if is_home else result["home_score"]
    )
    round_row = round_rows.get(result.get("round_id"), {})
    home_team_name = team_names.get(home_team_id, "Équipe inconnue")
    away_team_name = team_names.get(away_team_id, "Équipe inconnue")
    fixture = official_fixture(
        round_row.get("code"),
        home_team_name,
        away_team_name,
    )
    database_date = _iso_date(round_row.get("played_on"))
    played_on = fixture.played_on if fixture else database_date
    encounter_id = encounter_ids.get(
        (result.get("round_id"), home_team_id, away_team_id)
    )

    return {
        "result_id": result["id"],
        "encounter_id": encounter_id,
        "round_id": result.get("round_id"),
        "round_code": round_row.get("code") or "—",
        "played_on": played_on,
        "date_source": "NAKKA_OFFICIAL" if fixture else "DATABASE" if database_date else "UNCONFIRMED",
        "nakka_event_id": fixture.event_id if fixture else None,
        "venue": "HOME" if is_home else "AWAY",
        "team_id": team_id,
        "team_name": team_names.get(team_id, "Équipe inconnue"),
        "opponent_id": opponent_id,
        "opponent_name": team_names.get(opponent_id, "Équipe inconnue"),
        "home_team_id": home_team_id,
        "home_team_name": home_team_name,
        "away_team_id": away_team_id,
        "away_team_name": away_team_name,
        "home_score": _integer(result.get("home_score")),
        "away_score": _integer(result.get("away_score")),
        "score_for": score_for,
        "score_against": score_against,
        "outcome": _outcome(score_for, score_against),
        "detail_status": result.get("detail_status") or "DETAILED",
        "detail_available": (
            result.get("detail_status") != "COLLECTIVE_ONLY"
            and encounter_id is not None
        ),
        "quality_status": result.get("quality_status") or "VERIFIED",
        "quality_note": result.get("quality_note"),
        "hub_path": f"/matches/{result['id']}",
    }


def team_match_history(
    db: Client,
    team_id: str,
    season_id: str | None = None,
) -> dict:
    teams = _all(db, "teams", "id,name")
    team_names = {row["id"]: row["name"] for row in teams}

    if team_id not in team_names:
        return {
            "season": None,
            "team": None,
            "matches": [],
            "summary": {"played": 0, "wins": 0, "draws": 0, "losses": 0},
            "data_quality_notes": ["Équipe introuvable."],
        }

    seasons = _all(db, "seasons", "id,name,is_active")
    rounds = _all(db, "rounds", "id,code,season_id,played_on,published")
    season = _select_season(seasons, rounds, season_id)
    resolved_season_id = season.get("id") if season else None

    if not resolved_season_id:
        return {
            "season": None,
            "team": {"id": team_id, "name": team_names[team_id]},
            "matches": [],
            "summary": {"played": 0, "wins": 0, "draws": 0, "losses": 0},
            "data_quality_notes": ["Aucune saison disponible."],
        }

    round_rows = {
        row["id"]: row
        for row in rounds
        if row.get("season_id") == resolved_season_id
        and row.get("published")
    }
    results = _optional_all(
        db,
        "championship_results",
        (
            "id,season_id,round_id,home_team_id,away_team_id,home_score,"
            "away_score,detail_status,quality_status,quality_note,source_sheet"
        ),
        [("season_id", resolved_season_id)],
    )
    results = results or []

    encounters = _all(
        db,
        "encounters",
        "id,round_id,home_team_id,away_team_id",
    )
    encounter_ids: dict[tuple[str, str, str], str] = {}
    for row in encounters:
        round_id = row.get("round_id")
        home_team_id = row.get("home_team_id")
        away_team_id = row.get("away_team_id")
        if not round_id or not home_team_id or not away_team_id:
            continue
        encounter_ids[(round_id, home_team_id, away_team_id)] = row["id"]
        encounter_ids[(round_id, away_team_id, home_team_id)] = row["id"]

    history = [
        _team_result_row(
            result,
            team_id,
            team_names,
            round_rows,
            encounter_ids,
        )
        for result in results
        if result.get("round_id") in round_rows
        and team_id in {
            result.get("home_team_id"),
            result.get("away_team_id"),
        }
    ]
    history.sort(key=lambda row: _round_sort_key(row["round_code"]))

    notes = [
        str(row["quality_note"])
        for row in history
        if row.get("quality_note")
    ]
    collective_only = sum(
        row["detail_status"] == "COLLECTIVE_ONLY" for row in history
    )

    return {
        "season": season,
        "team": {"id": team_id, "name": team_names[team_id]},
        "matches": history,
        "summary": {
            "played": len(history),
            "wins": sum(row["outcome"] == "WIN" for row in history),
            "draws": sum(row["outcome"] == "DRAW" for row in history),
            "losses": sum(row["outcome"] == "LOSS" for row in history),
            "detailed": sum(row["detail_available"] for row in history),
            "collective_only": collective_only,
        },
        "data_quality_notes": notes,
        "source": "CALENDRIER_SCORE",
    }


def _leg_payload(
    leg: dict,
    match: dict,
    rows: list[dict],
    player_names: dict[str, str],
    team_names: dict[str, str],
) -> dict:
    winner_team_id = leg.get("winner_team_id")
    team_ids = [
        team_id
        for team_id in (match.get("team_1_id"), match.get("team_2_id"))
        if team_id
    ]
    loser_team_id = next(
        (team_id for team_id in team_ids if team_id != winner_team_id),
        None,
    )
    winner_rows = [
        row for row in rows if row.get("team_id") == winner_team_id
    ]
    loser_rows = [
        row for row in rows if row.get("team_id") == loser_team_id
    ]
    finisher_row = next(
        (
            row
            for row in winner_rows
            if row.get("leg_won") and _integer(row.get("finish")) > 0
        ),
        None,
    )
    if not finisher_row:
        finisher_row = next(
            (
                row
                for row in winner_rows
                if _integer(row.get("finish")) > 0
            ),
            None,
        )

    winning_darts_values = [
        _integer(row.get("darts_thrown"))
        for row in winner_rows
        if row.get("darts_thrown") is not None
    ]
    loser_scores = [
        _integer(row.get("score"))
        for row in loser_rows
        if row.get("score") is not None
    ]
    opponent_names = []
    seen_opponents: set[str] = set()
    for row in loser_rows:
        player_id = row.get("player_id")
        if not player_id or player_id in seen_opponents:
            continue
        seen_opponents.add(player_id)
        opponent_names.append(player_names.get(player_id, "Joueur inconnu"))

    remaining = (
        max(501 - sum(loser_scores), 0)
        if loser_scores
        else None
    )

    return {
        "leg_id": leg["id"],
        "match_id": match["id"],
        "match_number": match.get("match_number"),
        "mode": _mode_kind(match.get("mode")),
        "leg_number": leg.get("leg_number"),
        "winner_team_id": winner_team_id,
        "winner_team_name": team_names.get(
            winner_team_id,
            "Équipe inconnue",
        ),
        "loser_team_id": loser_team_id,
        "loser_team_name": team_names.get(
            loser_team_id,
            "Équipe inconnue",
        ),
        "finisher_id": finisher_row.get("player_id") if finisher_row else None,
        "finisher_name": player_names.get(
            finisher_row.get("player_id"),
            "—",
        )
        if finisher_row
        else "—",
        "opponent_names": " / ".join(opponent_names)
        if opponent_names
        else "—",
        "finish": _integer(finisher_row.get("finish"))
        if finisher_row
        else None,
        "darts": sum(winning_darts_values)
        if winning_darts_values
        else None,
        "no_score": sum(_integer(row.get("no_score")) for row in rows),
        "opponent_remaining": remaining,
    }


def _participants(
    rows: list[dict],
    team_id: str | None,
    player_names: dict[str, str],
) -> list[dict]:
    result = []
    seen: set[str] = set()
    for row in rows:
        player_id = row.get("player_id")
        if (
            row.get("team_id") != team_id
            or not player_id
            or player_id in seen
        ):
            continue
        seen.add(player_id)
        result.append(
            {
                "player_id": player_id,
                "name": player_names.get(player_id, "Joueur inconnu"),
            }
        )
    return result


def _finish_pressure(legs: list[dict]) -> list[dict]:
    buckets = [
        ("0–50", 0, 50),
        ("51–100", 51, 100),
        ("101–170", 101, 170),
        ("171+", 171, 10000),
    ]
    return [
        {
            "label": label,
            "count": sum(
                low <= row["opponent_remaining"] <= high
                for row in legs
                if row.get("opponent_remaining") is not None
            ),
        }
        for label, low, high in buckets
    ]


def _detailed_payload(
    result: dict,
    encounter: dict,
    matches: list[dict],
    legs: list[dict],
    stats: list[dict],
    player_names: dict[str, str],
    team_names: dict[str, str],
) -> dict:
    stats_by_leg: dict[str, list[dict]] = defaultdict(list)
    for row in stats:
        stats_by_leg[row["leg_id"]].append(row)

    legs_by_match: dict[str, list[dict]] = defaultdict(list)
    for leg in legs:
        legs_by_match[leg["match_id"]].append(leg)
    for rows in legs_by_match.values():
        rows.sort(key=lambda row: _integer(row.get("leg_number")))

    all_leg_rows: list[dict] = []
    match_rows: list[dict] = []

    for match in sorted(
        matches,
        key=lambda row: (
            _integer(row.get("match_number")),
            _integer(row.get("nakka_match_number")),
        ),
    ):
        match_legs = legs_by_match.get(match["id"], [])
        player_rows = [
            stat
            for leg in match_legs
            for stat in stats_by_leg.get(leg["id"], [])
        ]
        rendered_legs = [
            _leg_payload(
                leg,
                match,
                stats_by_leg.get(leg["id"], []),
                player_names,
                team_names,
            )
            for leg in match_legs
        ]
        all_leg_rows.extend(rendered_legs)

        leg_wins: dict[str, int] = defaultdict(int)
        for leg in match_legs:
            if leg.get("winner_team_id"):
                leg_wins[leg["winner_team_id"]] += 1

        winner_team_id = match.get("winner_team_id")
        if winner_team_id not in {
            match.get("team_1_id"),
            match.get("team_2_id"),
        }:
            winner_team_id = (
                max(leg_wins, key=leg_wins.get)
                if leg_wins
                else None
            )

        team_1_id = match.get("team_1_id")
        team_2_id = match.get("team_2_id")
        match_rows.append(
            {
                "match_id": match["id"],
                "match_number": match.get("match_number"),
                "nakka_match_number": match.get("nakka_match_number"),
                "mode": _mode_kind(match.get("mode")),
                "team_1_id": team_1_id,
                "team_1_name": team_names.get(team_1_id, "Équipe inconnue"),
                "team_2_id": team_2_id,
                "team_2_name": team_names.get(team_2_id, "Équipe inconnue"),
                "team_1_players": _participants(
                    player_rows,
                    team_1_id,
                    player_names,
                ),
                "team_2_players": _participants(
                    player_rows,
                    team_2_id,
                    player_names,
                ),
                "winner_team_id": winner_team_id,
                "winner_team_name": team_names.get(
                    winner_team_id,
                    "—",
                ),
                "team_1_legs": leg_wins.get(team_1_id, 0),
                "team_2_legs": leg_wins.get(team_2_id, 0),
                "legs": rendered_legs,
            }
        )

    singles_by_player: dict[str, dict[str, Any]] = {}
    for match in match_rows:
        if match["mode"] != "SIMPLE":
            continue
        participant_rows = (
            match["team_1_players"] + match["team_2_players"]
        )
        for participant in participant_rows:
            player_id = participant["player_id"]
            if player_id not in singles_by_player:
                singles_by_player[player_id] = {
                    "player_id": player_id,
                    "name": participant["name"],
                    "matches_played": 0,
                    "matches_won": 0,
                    "legs_played": 0,
                    "legs_won": 0,
                    "finishes": 0,
                    "no_score": 0,
                    "average_values": [],
                    "first_9_values": [],
                    "best_leg": None,
                }
            player = singles_by_player[player_id]
            player["matches_played"] += 1

            player_team_id = (
                match["team_1_id"]
                if any(
                    row["player_id"] == player_id
                    for row in match["team_1_players"]
                )
                else match["team_2_id"]
            )
            if match["winner_team_id"] == player_team_id:
                player["matches_won"] += 1

            match_leg_ids = {
                row["leg_id"] for row in match["legs"]
            }
            player_stats = [
                row
                for row in stats
                if row.get("player_id") == player_id
                and row.get("leg_id") in match_leg_ids
            ]
            player["legs_played"] += len(player_stats)
            player["legs_won"] += sum(
                bool(row.get("leg_won")) for row in player_stats
            )
            player["finishes"] += sum(
                _integer(row.get("finish")) > 0 for row in player_stats
            )
            player["no_score"] += sum(
                _integer(row.get("no_score")) for row in player_stats
            )
            player["average_values"].extend(
                _number(row.get("average_3_darts"))
                for row in player_stats
                if row.get("average_3_darts") is not None
            )
            player["first_9_values"].extend(
                _number(row.get("first_9"))
                for row in player_stats
                if row.get("first_9") is not None
            )
            winning_darts = [
                row["darts"]
                for row in match["legs"]
                if row.get("finisher_id") == player_id
                and row.get("darts") is not None
            ]
            if winning_darts:
                candidate = min(winning_darts)
                if (
                    player["best_leg"] is None
                    or candidate < player["best_leg"]
                ):
                    player["best_leg"] = candidate

    singles = []
    for player in singles_by_player.values():
        matches_played = player.pop("matches_played")
        matches_won = player.pop("matches_won")
        legs_played = player["legs_played"]
        legs_won = player["legs_won"]
        average_values = player.pop("average_values")
        first_9_values = player.pop("first_9_values")
        singles.append(
            {
                **player,
                "matches_played": matches_played,
                "matches_won": matches_won,
                "match_win_rate": round(
                    matches_won / matches_played * 100,
                    1,
                )
                if matches_played
                else 0,
                "leg_win_rate": round(
                    legs_won / legs_played * 100,
                    1,
                )
                if legs_played
                else 0,
                "average_3_darts": _mean(average_values),
                "first_9": _mean(first_9_values),
            }
        )
    singles.sort(
        key=lambda row: (
            -row["matches_won"],
            -row["legs_won"],
            -(row["average_3_darts"] or 0),
            row["name"].lower(),
        )
    )

    doubles = [
        {
            **leg,
            "winning_duo": " / ".join(
                player["name"]
                for player in (
                    match["team_1_players"]
                    if match["winner_team_id"] == match["team_1_id"]
                    else match["team_2_players"]
                )
            )
            or "—",
            "losing_duo": " / ".join(
                player["name"]
                for player in (
                    match["team_2_players"]
                    if match["winner_team_id"] == match["team_1_id"]
                    else match["team_1_players"]
                )
            )
            or "—",
        }
        for match in match_rows
        if match["mode"] == "DOUBLE"
        for leg in match["legs"]
    ]

    finishes = [
        row["finish"]
        for row in all_leg_rows
        if row.get("finish") is not None
    ]
    best_legs = [
        row["darts"]
        for row in all_leg_rows
        if row.get("darts") is not None
        and row.get("finish") is not None
    ]
    remaining_values = [
        row["opponent_remaining"]
        for row in all_leg_rows
        if row.get("opponent_remaining") is not None
    ]
    averages_by_team: dict[str, list[float]] = defaultdict(list)
    for row in stats:
        average = _number(row.get("average_3_darts"))
        if row.get("team_id") and average is not None:
            averages_by_team[row["team_id"]].append(average)

    home_team_id = result["home_team_id"]
    away_team_id = result["away_team_id"]
    top_player = singles[0] if singles else None

    return {
        "encounter": encounter,
        "matches": match_rows,
        "singles": singles,
        "doubles": doubles,
        "legs": all_leg_rows,
        "summary": {
            "matches": len(match_rows),
            "singles": sum(row["mode"] == "SIMPLE" for row in match_rows),
            "doubles": sum(row["mode"] == "DOUBLE" for row in match_rows),
            "legs_analysed": len(all_leg_rows),
            "finishes_recorded": len(finishes),
            "finish_coverage": round(
                len(finishes) / len(all_leg_rows) * 100,
                1,
            )
            if all_leg_rows
            else 0,
            "best_leg": min(best_legs) if best_legs else None,
            "no_score": sum(row["no_score"] for row in all_leg_rows),
            "average_finish": _mean(finishes),
            "average_opponent_remaining": _mean(remaining_values),
            "home_average_3_darts": _mean(
                averages_by_team.get(home_team_id, [])
            ),
            "away_average_3_darts": _mean(
                averages_by_team.get(away_team_id, [])
            ),
            "home_matches_won": sum(
                row["winner_team_id"] == home_team_id for row in match_rows
            ),
            "away_matches_won": sum(
                row["winner_team_id"] == away_team_id for row in match_rows
            ),
        },
        "finish_pressure": _finish_pressure(all_leg_rows),
        "highlights": {
            "top_player": top_player,
            "best_leg": min(best_legs) if best_legs else None,
            "average_opponent_remaining": _mean(remaining_values),
        },
    }


def build_match_hub(db: Client, result_id: str) -> dict | None:
    results = _optional_all(
        db,
        "championship_results",
        (
            "id,season_id,round_id,home_team_id,away_team_id,home_score,"
            "away_score,detail_status,quality_status,quality_note,source_sheet,"
            "source_row"
        ),
        [("id", result_id)],
    )
    if not results:
        return None

    result = results[0]
    teams = _all(db, "teams", "id,name")
    team_names = {row["id"]: row["name"] for row in teams}
    seasons = {
        row["id"]: row
        for row in _all(db, "seasons", "id,name,is_active")
    }
    rounds = {
        row["id"]: row
        for row in _all(
            db,
            "rounds",
            "id,code,season_id,played_on,published",
        )
    }
    players = _all(db, "players", "id,display_name,team_id")
    player_names = {
        row["id"]: row["display_name"] for row in players
    }
    round_row = rounds.get(result.get("round_id"), {})
    home_team_name = team_names.get(
        result.get("home_team_id"),
        "Équipe inconnue",
    )
    away_team_name = team_names.get(
        result.get("away_team_id"),
        "Équipe inconnue",
    )
    fixture = official_fixture(
        round_row.get("code"),
        home_team_name,
        away_team_name,
    )
    database_date = _iso_date(round_row.get("played_on"))

    payload = {
        "result": {
            **result,
            "round_code": round_row.get("code") or "—",
            "played_on": fixture.played_on if fixture else database_date,
            "date_source": "NAKKA_OFFICIAL" if fixture else "DATABASE" if database_date else "UNCONFIRMED",
            "nakka_event_id": fixture.event_id if fixture else None,
            "home_team_name": home_team_name,
            "away_team_name": away_team_name,
        },
        "season": seasons.get(result.get("season_id")),
        "detail_available": False,
        "matches": [],
        "singles": [],
        "doubles": [],
        "legs": [],
        "summary": {
            "matches": 0,
            "singles": 0,
            "doubles": 0,
            "legs_analysed": 0,
            "finishes_recorded": 0,
            "finish_coverage": 0,
            "best_leg": None,
            "no_score": 0,
            "average_finish": None,
            "average_opponent_remaining": None,
            "home_average_3_darts": None,
            "away_average_3_darts": None,
            "home_matches_won": 0,
            "away_matches_won": 0,
        },
        "finish_pressure": [],
        "highlights": {
            "top_player": None,
            "best_leg": None,
            "average_opponent_remaining": None,
        },
        "data_quality_notes": [],
    }

    if result.get("quality_note"):
        payload["data_quality_notes"].append(result["quality_note"])

    if result.get("detail_status") == "COLLECTIVE_ONLY":
        payload["data_quality_notes"].append(
            (
                f"{round_row.get('code', 'Journée')} · "
                f"{payload['result']['home_team_name']} "
                f"{result['home_score']}–{result['away_score']} "
                f"{payload['result']['away_team_name']} : résultat collectif "
                "compté, détail PvP indisponible. Aucun indicateur individuel "
                "n'est reconstitué."
            )
        )
        return payload

    encounter = next(
        (
            row
            for row in _all(
                db,
                "encounters",
                "id,round_id,home_team_id,away_team_id,name",
            )
            if row.get("round_id") == result.get("round_id")
            and {
                row.get("home_team_id"),
                row.get("away_team_id"),
            }
            == {
                result.get("home_team_id"),
                result.get("away_team_id"),
            }
        ),
        None,
    )
    if not encounter:
        payload["data_quality_notes"].append(
            (
                "Résultat collectif disponible, mais aucune rencontre PvP "
                "correspondante n'a été trouvée."
            )
        )
        return payload

    matches = [
        row
        for row in _all(
            db,
            "matches",
            (
                "id,encounter_id,match_number,nakka_match_number,mode,"
                "team_1_id,team_2_id,winner_team_id"
            ),
        )
        if row.get("encounter_id") == encounter["id"]
    ]
    match_ids = {row["id"] for row in matches}
    legs = [
        row
        for row in _all(
            db,
            "legs",
            "id,match_id,leg_number,winner_team_id,status",
        )
        if row.get("match_id") in match_ids
        and row.get("status") == "VALID"
    ]
    leg_ids = {row["id"] for row in legs}
    stats = [
        row
        for row in _all(
            db,
            "player_leg_stats",
            (
                "id,leg_id,player_id,team_id,score,darts_thrown,"
                "average_3_darts,first_9,finish,no_score,leg_won"
            ),
        )
        if row.get("leg_id") in leg_ids
    ]

    detail = _detailed_payload(
        result=result,
        encounter=encounter,
        matches=matches,
        legs=legs,
        stats=stats,
        player_names=player_names,
        team_names=team_names,
    )
    payload.update(detail)
    payload["detail_available"] = bool(matches and legs)
    if not payload["detail_available"]:
        payload["data_quality_notes"].append(
            "La rencontre existe, mais aucun leg PvP valide n'est disponible."
        )

    return payload
