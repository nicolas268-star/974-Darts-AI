from __future__ import annotations

from collections import defaultdict
from functools import cmp_to_key
from typing import Any


def _integer(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _number(value: Any) -> float | None:
    try:
        return round(float(value), 2) if value is not None else None
    except (TypeError, ValueError):
        return None


def _player_averages(tournament: dict[str, Any]) -> dict[str, float | None]:
    return {
        str(player.get("name") or ""): _number(player.get("average_3_darts"))
        for player in tournament.get("players") or []
        if player.get("name")
    }


def _first_integer(matches: list[dict[str, Any]], key: str) -> int:
    for match in matches:
        value = _integer(match.get(key))
        if value > 0:
            return value
    return 0


def _first_setting(matches: list[dict[str, Any]], key: str, default: int = 0) -> int:
    for match in matches:
        if match.get(key) is not None:
            return _integer(match[key])
    return default


def _complete(match: dict[str, Any]) -> bool:
    if "result_complete" in match:
        return bool(match["result_complete"])
    return match.get("home_score") is not None and match.get("away_score") is not None


def _nakka_ranks(standings, settings, matches, complete):
    """N01 comp v140 setRrResult/setRrPoint/fixRank, for leg-based pools.

    Nakka applies direct confrontation only to a two-way tie; a three-way
    tie stays shared. It never uses the whole-event scoring average.
    """
    if not complete or settings.get("ranking_strategy") != "NAKKA_V2":
        return {}
    if _integer(settings.get("limit")) != 1 or settings.get("unsupported_ranking_data"):
        return {}
    def key(row):
        win_loss = row["wins"] - row["losses"]
        difference = row["leg_difference"]
        if _integer(settings.get("point")) != 1:
            return (win_loss, difference)
        values = [win_loss, row["points"]] if settings.get("priority_win") else [row["points"]]
        if not settings.get("priority_win") and not settings.get("norank_wl"):
            values.append(win_loss)
        if not settings.get("norank_diff"):
            values.append(difference)
        return tuple(values)
    ranks = {row["name"]: 1 + sum(key(other) > key(row) for other in standings) for row in standings}
    for rank in set(ranks.values()):
        tied = [name for name, value in ranks.items() if value == rank]
        if len(tied) != 2:
            continue
        match = matches.get(tuple(sorted(tied, key=str.casefold)))
        if match and _complete(match):
            home_score, away_score = _integer(match.get("home_score")), _integer(match.get("away_score"))
            if home_score != away_score:
                loser = match["away"] if home_score > away_score else match["home"]
                ranks[loser] += 1
    return ranks


def _participant_names(matches: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for match in matches:
        for candidate in (match.get("home"), match.get("away")):
            name = str(candidate or "").strip()
            normalized = name.casefold()
            if not name or normalized in seen:
                continue
            seen.add(normalized)
            names.append(name)
    return names


def build_tournament_round_robins(
    tournament: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build a matrix for every tournament pool, regardless of leg format."""

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for match in tournament.get("matches") or []:
        if str(match.get("phase") or "").upper() != "POOL":
            continue
        stage_code = str(match.get("stage_code") or "rr_1")
        grouped[stage_code].append(match)
    for code in tournament.get("pool_participants") or {}:
        grouped.setdefault(code, [])

    overall_averages = _player_averages(tournament)
    tables: list[dict[str, Any]] = []
    for stage_code, matches in sorted(grouped.items(), key=lambda item: (_integer(item[0].rsplit("_", 1)[-1]), item[0])):
        names = _participant_names(matches)
        declared_names = (tournament.get("pool_participants") or {}).get(stage_code) or []
        names = list(dict.fromkeys([*declared_names, *names]))
        if not names:
            continue

        detected_first_to = max(
            (
                max(
                    _integer(match.get("home_score")),
                    _integer(match.get("away_score")),
                )
                for match in matches
            ),
            default=0,
        )
        first_to = _first_integer(matches, "round_robin_first_to") or detected_first_to
        if first_to <= 0:
            first_to = 1
        best_of = _first_integer(matches, "round_robin_best_of") or max(
            1,
            first_to * 2 - 1,
        )
        settings = tournament.get("pool_settings") or {}
        source_round = _integer(matches[0].get("stage_index")) - 1 if matches else _integer(stage_code.rsplit("_", 1)[-1]) - 1
        settings = {**settings, **next((row for row in settings.get("game_setting") or [] if isinstance(row, dict) and row.get("round") == source_round), {})}
        win_points = _integer(settings["point_w"]) if "point_w" in settings else _first_setting(matches, "round_robin_win_points", 2)
        draw_points = _integer(settings["point_d"]) if "point_d" in settings else _first_setting(matches, "round_robin_draw_points")
        loss_points = _integer(settings["point_l"]) if "point_l" in settings else _first_setting(matches, "round_robin_loss_points")
        include_leg_points = bool(settings.get("include_set")) if settings.get("ranking_strategy") == "NAKKA_V2" and _integer(settings.get("point")) == 1 else any(
            bool(match.get("round_robin_include_leg_points"))
            for match in matches
        )

        match_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
        for match in matches:
            home = str(match.get("home") or "").strip()
            away = str(match.get("away") or "").strip()
            if not home or not away or home == away:
                continue
            match_by_pair[tuple(sorted((home, away), key=str.casefold))] = match

        expected_matches = len(names) * (len(names) - 1) // 2
        standing_by_name: dict[str, dict[str, Any]] = {
            name: {
                "name": name,
                "played": 0,
                "wins": 0,
                "draws": 0,
                "losses": 0,
                "legs_for": 0,
                "legs_against": 0,
                "leg_difference": 0,
                "points": 0,
                "average_3_darts": overall_averages.get(name),
            }
            for name in names
        }

        for match in match_by_pair.values():
            if not _complete(match):
                continue
            home = str(match.get("home") or "")
            away = str(match.get("away") or "")
            if home not in standing_by_name or away not in standing_by_name:
                continue
            home_score = _integer(match.get("home_score"))
            away_score = _integer(match.get("away_score"))
            home_row = standing_by_name[home]
            away_row = standing_by_name[away]
            home_row["played"] += 1
            away_row["played"] += 1
            home_row["legs_for"] += home_score
            home_row["legs_against"] += away_score
            away_row["legs_for"] += away_score
            away_row["legs_against"] += home_score
            if home_score > away_score:
                home_row["wins"] += 1
                away_row["losses"] += 1
                home_row["points"] += win_points
                away_row["points"] += loss_points
            elif away_score > home_score:
                away_row["wins"] += 1
                home_row["losses"] += 1
                away_row["points"] += win_points
                home_row["points"] += loss_points
            else:
                home_row["draws"] += 1
                away_row["draws"] += 1
                home_row["points"] += draw_points
                away_row["points"] += draw_points

            if include_leg_points:
                home_row["points"] += home_score
                away_row["points"] += away_score

        standings = list(standing_by_name.values())
        for row in standings:
            row["leg_difference"] = row["legs_for"] - row["legs_against"]

        def compare_standings(left: dict[str, Any], right: dict[str, Any]) -> int:
            for key in ("points", "wins", "leg_difference", "legs_for"):
                left_value = _integer(left.get(key))
                right_value = _integer(right.get(key))
                if left_value != right_value:
                    return -1 if left_value > right_value else 1

            head_to_head = match_by_pair.get(
                tuple(sorted((left["name"], right["name"]), key=str.casefold))
            )
            if head_to_head:
                home = str(head_to_head.get("home") or "")
                home_score = _integer(head_to_head.get("home_score"))
                away_score = _integer(head_to_head.get("away_score"))
                if home_score != away_score:
                    winner = home if home_score > away_score else str(
                        head_to_head.get("away") or ""
                    )
                    return -1 if winner == left["name"] else 1

            return (
                -1
                if str(left["name"]).casefold() < str(right["name"]).casefold()
                else 1
                if str(left["name"]).casefold() > str(right["name"]).casefold()
                else 0
            )

        standings.sort(key=cmp_to_key(compare_standings))
        completed_count = sum(_complete(match) for match in match_by_pair.values())
        complete = completed_count == expected_matches
        source_rows = (tournament.get("source_pool_standings") or {}).get(stage_code) or []
        source_ranks = {
            str(row.get("name")): _integer(row.get("rank"))
            for row in source_rows if isinstance(row, dict) and _integer(row.get("rank")) > 0
        }
        source_reliable = set(source_ranks) == set(names)
        calculated_ranks = _nakka_ranks(standings, settings, match_by_pair, complete)
        strict = tournament.get("source_type") == "NAKKA_DIRECT"
        # Historical workbook rules are retained. New direct imports rely on
        # Nakka ranks or documented tiebreaks, never a tournament-wide average.
        for rank, row in enumerate(standings, start=1):
            row["rank"] = (
                source_ranks[row["name"]] if source_reliable
                else calculated_ranks[row["name"]] if calculated_ranks
                else rank if complete and not strict
                else None
            )
            row["rank_source"] = "NAKKA" if source_reliable else "CALCULATED" if row["rank"] is not None else "UNCONFIRMED"
            qualified = (tournament.get("pool_qualifiers") or {}).get(stage_code)
            row["qualified"] = row["name"] in qualified if qualified is not None else None
        if source_reliable or calculated_ranks:
            standings.sort(key=lambda row: (row["rank"], names.index(row["name"])))
        for row in standings:
            row["rank_tied"] = row["rank"] is not None and sum(other["rank"] == row["rank"] for other in standings) > 1
        points_available = settings.get("ranking_strategy") != "NAKKA_V2" or (_integer(settings.get("point")) == 1 and not settings.get("unsupported_ranking_data"))
        if not points_available:
            for row in standings:
                row["points"] = None
        rank_by_name = {row["name"]: row["rank"] for row in standings}

        matrix_rows: list[dict[str, Any]] = []
        for index, name in enumerate(names, start=1):
            cells: list[dict[str, Any] | None] = []
            for opponent in names:
                if opponent == name:
                    cells.append(None)
                    continue
                match = match_by_pair.get(
                    tuple(sorted((name, opponent), key=str.casefold))
                )
                if not match or not _complete(match):
                    cells.append({
                        "opponent": opponent,
                        "played": False,
                        "score_for": None,
                        "score_against": None,
                        "average_3_darts": None,
                        "won": False,
                        "source_url": None,
                    })
                    continue
                is_home = str(match.get("home") or "") == name
                score_for = _integer(
                    match.get("home_score") if is_home else match.get("away_score")
                )
                score_against = _integer(
                    match.get("away_score") if is_home else match.get("home_score")
                )
                cells.append({
                    "opponent": opponent,
                    "played": True,
                    "score_for": score_for,
                    "score_against": score_against,
                    "average_3_darts": _number(
                        match.get("home_average_3_darts")
                        if is_home
                        else match.get("away_average_3_darts")
                    ),
                    "won": score_for > score_against,
                    "source_url": match.get("source_url"),
                })
            matrix_rows.append({
                "number": index,
                "name": name,
                "average_3_darts": overall_averages.get(name),
                "rank": rank_by_name[name],
                "cells": cells,
            })

        first_match = matches[0] if matches else {}
        tables.append({
            "code": stage_code,
            "name": first_match.get("stage_label") or f"Poule {stage_code.rsplit('_', 1)[-1]}",
            "format": "ROUND_ROBIN",
            "format_label": f"Round Robin · premier à {first_to} legs",
            "best_of": best_of,
            "first_to": first_to,
            "win_points": win_points if points_available else None,
            "draw_points": draw_points if points_available else None,
            "loss_points": loss_points if points_available else None,
            "points_available": points_available,
            "include_leg_points": include_leg_points,
            "participant_count": len(names),
            "match_count": completed_count,
            "expected_match_count": expected_matches,
            "complete": complete,
            "ranking_confirmed": source_reliable or all(row["rank"] is not None and not row["rank_tied"] for row in standings),
            "ranking_source": "NAKKA" if source_reliable else "NAKKA_RULES" if calculated_ranks else "CALCULATED" if all(row["rank"] is not None for row in standings) else "UNCONFIRMED",
            "participants": names,
            "matrix": matrix_rows,
            "standings": standings,
        })
    return tables


def build_best_of_five_round_robins(
    tournament: dict[str, Any],
) -> list[dict[str, Any]]:
    """Compatibility alias retained for older imports."""

    return build_tournament_round_robins(tournament)
