from __future__ import annotations

from collections import defaultdict
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

    overall_averages = _player_averages(tournament)
    tables: list[dict[str, Any]] = []
    for stage_code, matches in sorted(grouped.items()):
        names = _participant_names(matches)
        if len(names) < 2:
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
        win_points = _first_integer(matches, "round_robin_win_points") or 2
        draw_points = _first_integer(matches, "round_robin_draw_points")
        loss_points = _first_integer(matches, "round_robin_loss_points")

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

        standings = list(standing_by_name.values())
        for row in standings:
            row["leg_difference"] = row["legs_for"] - row["legs_against"]
        standings.sort(
            key=lambda row: (
                -row["points"],
                -row["wins"],
                -row["leg_difference"],
                -row["legs_for"],
                -float(row.get("average_3_darts") or 0),
                str(row["name"]).casefold(),
            )
        )
        for rank, row in enumerate(standings, start=1):
            row["rank"] = rank
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
                if not match:
                    cells.append({
                        "opponent": opponent,
                        "played": False,
                        "score_for": 0,
                        "score_against": 0,
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
            "name": first_match.get("stage_label") or "Poule",
            "format": "ROUND_ROBIN",
            "format_label": f"Round Robin · premier à {first_to} legs",
            "best_of": best_of,
            "first_to": first_to,
            "win_points": win_points,
            "draw_points": draw_points,
            "loss_points": loss_points,
            "participant_count": len(names),
            "match_count": len(match_by_pair),
            "expected_match_count": expected_matches,
            "complete": len(match_by_pair) == expected_matches,
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
