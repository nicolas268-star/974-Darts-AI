from __future__ import annotations

from collections import defaultdict
from datetime import date
from itertools import combinations
from typing import Any

from supabase import Client

from .player_statistics_engine import (
    NAKKA_DATA_NOTE,
    PlayerStatisticsDataset,
    PlayerStatisticsEngine,
    _numeric,
    _round_number,
    _row_average_3_darts,
)


def _pair_key(player_1_id: str, player_2_id: str) -> tuple[str, str]:
    return tuple(sorted((str(player_1_id), str(player_2_id))))  # type: ignore[return-value]


def _wilson_lower_bound(wins: int, total: int, z: float = 1.96) -> float:
    """Return the Wilson lower confidence bound as a percentage."""
    if total <= 0:
        return 0.0
    proportion = wins / total
    z_squared = z * z
    denominator = 1 + z_squared / total
    centre = proportion + z_squared / (2 * total)
    margin = z * (
        (
            proportion * (1 - proportion)
            + z_squared / (4 * total)
        )
        / total
    ) ** 0.5
    return round(max(0.0, (centre - margin) / denominator * 100), 1)


def _difficulty_level(wilson_score: float, legs_played: int) -> tuple[int, str]:
    """Convert opponent reliability into a transparent five-level difficulty."""
    volume_bonus = min(8.0, max(0, legs_played - 4) * 0.35)
    difficulty_score = min(100.0, wilson_score * 1.55 + volume_bonus)
    stars = (
        5 if difficulty_score >= 72
        else 4 if difficulty_score >= 55
        else 3 if difficulty_score >= 38
        else 2 if difficulty_score >= 20
        else 1
    )
    label = (
        "Très difficile" if stars == 5
        else "Difficile" if stars == 4
        else "Équilibré" if stars == 3
        else "Accessible" if stars == 2
        else "Faible recul"
    )
    return stars, label


def _is_explicit_duo_mode(mode: Any) -> bool:
    value = str(mode or "").strip().lower()
    return any(token in value for token in ("double", "duo", "pair", "d4"))


def _sum_int(rows: list[dict[str, Any]], key: str) -> int:
    return sum(int(row.get(key) or 0) for row in rows)


def _combined_metric(rows: list[dict[str, Any]], key: str) -> float | None:
    values: list[tuple[float, int]] = []
    for row in rows:
        value = _row_average_3_darts(row) if key == "average_3_darts" else _numeric(row.get(key))
        if value is None:
            continue
        darts = int(row.get("darts_thrown") or 0)
        values.append((value, darts))
    if not values:
        return None
    weighted = [(value, darts) for value, darts in values if darts > 0]
    if weighted:
        total_darts = sum(darts for _, darts in weighted)
        if total_darts:
            return round(sum(value * darts for value, darts in weighted) / total_darts, 2)
    return round(sum(value for value, _ in values) / len(values), 2)


class DuoStatisticsEngine:
    """Compute pair statistics only from observed Nakka player/leg rows.

    A duo is detected when two players from the same team are present in a
    match. Explicit duo modes are accepted directly. For older imports whose
    mode is generic (for example ``501``), a pair is also accepted when the
    same team has exactly two distinct players in that match.
    """

    def __init__(self, dataset: PlayerStatisticsDataset):
        self.data = dataset
        self.player_engine = PlayerStatisticsEngine(dataset)
        self.player_by_id = {str(row.get("id")): row for row in dataset.players}
        self.team_by_id = {str(row.get("id")): row for row in dataset.teams}
        self.stats_by_leg: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in dataset.stats:
            self.stats_by_leg[str(row.get("leg_id"))].append(row)

    @classmethod
    def from_db(cls, db: Client) -> "DuoStatisticsEngine":
        return cls(PlayerStatisticsDataset.load(db))

    def _identity(self, player_id: str) -> dict[str, Any]:
        player = self.player_by_id.get(player_id, {})
        team = self.team_by_id.get(str(player.get("team_id")), {})
        return {
            "id": player.get("id", player_id),
            "name": player.get("display_name"),
            "team_id": player.get("team_id"),
            "team": team.get("name"),
        }

    def _observations(self, season_id: str | None = None):
        season, rounds, encounters, matches, legs, scope = self.player_engine._scope(season_id)
        observations: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        ignored_matches = 0

        for match_id, match in matches.items():
            match_legs = [leg for leg in legs.values() if str(leg.get("match_id")) == match_id]
            rows = [row for leg in match_legs for row in self.stats_by_leg.get(str(leg.get("id")), [])]
            players_by_team: dict[str, set[str]] = defaultdict(set)
            for row in rows:
                if row.get("player_id") and row.get("team_id"):
                    players_by_team[str(row.get("team_id"))].add(str(row.get("player_id")))

            accepted_any = False
            for team_id, player_ids in players_by_team.items():
                if len(player_ids) != 2:
                    continue
                if not _is_explicit_duo_mode(match.get("mode")) and len(players_by_team) < 2:
                    continue
                player_1_id, player_2_id = sorted(player_ids)
                pair = _pair_key(player_1_id, player_2_id)
                encounter = encounters.get(str(match.get("encounter_id")), {})
                round_row = rounds.get(str(encounter.get("round_id")), {})
                team_rows = [row for row in rows if str(row.get("team_id")) == team_id]
                team_leg_ids = {str(row.get("leg_id")) for row in team_rows}
                won_leg_ids = {
                    leg_id
                    for leg_id in team_leg_ids
                    if str(legs.get(leg_id, {}).get("winner_team_id")) == team_id
                }
                opponent_team_id = next((tid for tid in players_by_team if tid != team_id), None)
                opponent_player_ids = (
                    sorted(players_by_team.get(str(opponent_team_id), set()))
                    if opponent_team_id is not None
                    else []
                )
                observations[pair].append({
                    "pair": pair,
                    "match_id": match_id,
                    "match": match,
                    "encounter": encounter,
                    "round": round_row,
                    "team_id": team_id,
                    "opponent_team_id": opponent_team_id,
                    "opponent_player_ids": opponent_player_ids,
                    "rows": team_rows,
                    "leg_ids": team_leg_ids,
                    "won_leg_ids": won_leg_ids,
                })
                accepted_any = True
            if not accepted_any:
                ignored_matches += 1

        return season, observations, {**scope, "duo_matches_ignored": ignored_matches}

    def _player_contribution(self, player_id: str, rows: list[dict[str, Any]], duo_score: int) -> dict[str, Any]:
        player_rows = [row for row in rows if str(row.get("player_id")) == player_id]
        score = _sum_int(player_rows, "score")
        finishes = [int(row.get("finish")) for row in player_rows if row.get("finish") not in (None, 0)]
        return {
            "player": self._identity(player_id),
            "score": score,
            "scoring_share": round(score / duo_score * 100, 1) if duo_score else 0.0,
            "average_3_darts": _combined_metric(player_rows, "average_3_darts"),
            "first_9": _combined_metric(player_rows, "first_9"),
            "finishes": len(finishes),
            "best_finish": max(finishes, default=None),
            "scores_80_plus": _sum_int(player_rows, "scores_80"),
            "scores_100_plus": _sum_int(player_rows, "scores_100"),
            "scores_140_plus": _sum_int(player_rows, "scores_140"),
            "scores_170_plus": _sum_int(player_rows, "scores_170"),
            "scores_180": _sum_int(player_rows, "scores_180"),
        }

    def _aggregate(self, pair: tuple[str, str], observations: list[dict[str, Any]]) -> dict[str, Any]:
        rows = [row for observation in observations for row in observation["rows"]]
        match_ids = {str(observation["match_id"]) for observation in observations}
        leg_ids = {leg_id for observation in observations for leg_id in observation["leg_ids"]}
        won_leg_ids = {leg_id for observation in observations for leg_id in observation["won_leg_ids"]}
        duo_score = _sum_int(rows, "score")
        finishes = [int(row.get("finish")) for row in rows if row.get("finish") not in (None, 0)]
        players = [self._player_contribution(player_id, rows, duo_score) for player_id in pair]
        team_id = next((str(obs.get("team_id")) for obs in observations if obs.get("team_id")), None)
        team = self.team_by_id.get(team_id or "", {})
        return {
            "duo_id": "__".join(pair),
            "player_1": players[0]["player"],
            "player_2": players[1]["player"],
            "team_id": team_id,
            "team": team.get("name"),
            "matches_played": len(match_ids),
            "legs_played": len(leg_ids),
            "legs_won": len(won_leg_ids),
            "win_rate": round(len(won_leg_ids) / len(leg_ids) * 100, 1) if leg_ids else 0.0,
            "average_3_darts": _combined_metric(rows, "average_3_darts"),
            "first_9": _combined_metric(rows, "first_9"),
            "score": duo_score,
            "finishes": len(finishes),
            "best_finish": max(finishes, default=None),
            "scores_80_plus": _sum_int(rows, "scores_80"),
            "scores_100_plus": _sum_int(rows, "scores_100"),
            "scores_140_plus": _sum_int(rows, "scores_140"),
            "scores_170_plus": _sum_int(rows, "scores_170"),
            "scores_180": _sum_int(rows, "scores_180"),
            "contributions": players,
        }

    def overview(self, season_id: str | None = None, team_id: str | None = None) -> dict[str, Any]:
        season, observations, scope = self._observations(season_id)
        duos = [self._aggregate(pair, rows) for pair, rows in observations.items()]
        if team_id:
            duos = [duo for duo in duos if str(duo.get("team_id")) == str(team_id)]
        duos.sort(key=lambda duo: (duo["win_rate"], duo["legs_won"], duo["matches_played"]), reverse=True)
        for rank, duo in enumerate(duos, 1):
            duo["rank"] = rank
        return {
            "season": season,
            "duos": duos,
            "meta": {
                "count": len(duos),
                "nakka_note": NAKKA_DATA_NOTE,
                "scope": scope,
                "duo_detection": "Deux joueurs distincts observés pour une même équipe dans un match de duo.",
            },
        }

    def detail(self, player_1_id: str, player_2_id: str, season_id: str | None = None) -> dict[str, Any] | None:
        pair = _pair_key(player_1_id, player_2_id)
        season, observations, scope = self._observations(season_id)
        pair_observations = observations.get(pair)
        if not pair_observations:
            return None

        summary = self._aggregate(pair, pair_observations)

        opponent_profiles: dict[tuple[str, str], dict[str, Any]] = {}
        for observed_pair, observed_rows in observations.items():
            aggregate = self._aggregate(observed_pair, observed_rows)
            wilson_score = _wilson_lower_bound(
                int(aggregate.get("legs_won") or 0),
                int(aggregate.get("legs_played") or 0),
            )
            difficulty_stars, difficulty_label = _difficulty_level(
                wilson_score,
                int(aggregate.get("legs_played") or 0),
            )
            opponent_profiles[observed_pair] = {
                "aggregate": aggregate,
                "wilson_score": wilson_score,
                "difficulty_stars": difficulty_stars,
                "difficulty_label": difficulty_label,
            }

        by_round: dict[str, list[dict[str, Any]]] = defaultdict(list)
        history = []
        for observation in pair_observations:
            round_row = observation["round"]
            round_id = str(round_row.get("id"))
            by_round[round_id].append(observation)
            match = observation["match"]
            opponent_id = observation.get("opponent_team_id")
            opponent_player_ids = observation.get("opponent_player_ids") or []
            opponent_players = [
                self._identity(str(player_id))
                for player_id in opponent_player_ids
            ]
            opponent_pair = (
                _pair_key(str(opponent_player_ids[0]), str(opponent_player_ids[1]))
                if len(opponent_player_ids) == 2
                else None
            )
            match_aggregate = self._aggregate(pair, [observation])
            match_win_rate = float(match_aggregate.get("win_rate") or 0.0)
            result = "win" if match_win_rate > 50 else "draw" if match_win_rate == 50 else "loss"

            opponent_profile = opponent_profiles.get(opponent_pair) if opponent_pair else None
            opponent_aggregate = opponent_profile.get("aggregate", {}) if opponent_profile else {}
            opponent_wilson = float(opponent_profile.get("wilson_score", 0.0)) if opponent_profile else 0.0
            difficulty_stars = int(opponent_profile.get("difficulty_stars", 1)) if opponent_profile else 1
            difficulty_label = str(opponent_profile.get("difficulty_label", "Adversaire non classé")) if opponent_profile else "Adversaire non classé"

            opponent_strength = min(
                100.0,
                opponent_wilson * 1.55
                + min(8.0, max(0, int(opponent_aggregate.get("legs_played") or 0) - 4) * 0.35),
            )
            result_value = 1.0 if result == "win" else 0.5 if result == "draw" else 0.0
            prestige_points = round(result_value * opponent_strength)

            expected_result = (
                "Victoire de prestige" if result == "win" and difficulty_stars >= 4
                else "Belle victoire" if result == "win" and difficulty_stars == 3
                else "Victoire attendue" if result == "win"
                else "Nul solide" if result == "draw" and difficulty_stars >= 4
                else "Nul logique" if result == "draw"
                else "Défaite logique" if result == "loss" and difficulty_stars >= 4
                else "Défaite surprise" if result == "loss" and difficulty_stars <= 2
                else "Défaite disputée"
            )

            history.append({
                "match_id": observation["match_id"],
                "round_id": round_row.get("id"),
                "round": round_row.get("code"),
                "played_on": round_row.get("played_on"),
                "encounter": observation["encounter"].get("name"),
                "match_number": match.get("match_number"),
                "nakka_match_number": match.get("nakka_match_number"),
                "mode": match.get("mode"),
                "opponent_team_id": opponent_id,
                "opponent_team": self.team_by_id.get(str(opponent_id), {}).get("name"),
                "opponent_player_1": opponent_players[0] if len(opponent_players) > 0 else None,
                "opponent_player_2": opponent_players[1] if len(opponent_players) > 1 else None,
                "opponent_duo_id": "__".join(opponent_pair) if opponent_pair else None,
                "opponent_wilson_score": opponent_wilson,
                "opponent_difficulty_stars": difficulty_stars,
                "opponent_difficulty_label": difficulty_label,
                "opponent_matches_played": int(opponent_aggregate.get("matches_played") or 0),
                "opponent_legs_played": int(opponent_aggregate.get("legs_played") or 0),
                "opponent_win_rate": float(opponent_aggregate.get("win_rate") or 0.0),
                "result": result,
                "performance_label": expected_result,
                "prestige_points": prestige_points,
                **{k: v for k, v in match_aggregate.items() if k not in {"duo_id", "player_1", "player_2", "team_id", "team", "contributions"}},
                "contributions": match_aggregate["contributions"],
            })

        trends = []
        for round_id, group in by_round.items():
            round_row = group[0]["round"]
            aggregate = self._aggregate(pair, group)
            trends.append({
                "round_id": round_id,
                "round": round_row.get("code"),
                "played_on": round_row.get("played_on"),
                **{k: v for k, v in aggregate.items() if k not in {"duo_id", "player_1", "player_2", "team_id", "team"}},
            })
        trends.sort(key=lambda row: (_round_number(row.get("round")), row.get("played_on") or ""))
        history.sort(
            key=lambda row: (row.get("played_on") or date.min.isoformat(), _round_number(row.get("round")), row.get("match_number") or 0),
            reverse=True,
        )
        return {
            "season": season,
            "duo": summary,
            "trends": trends,
            "recent_matches": history[:20],
            "meta": {
                "has_data": True,
                "nakka_note": NAKKA_DATA_NOTE,
                "scope": scope,
                "duo_detection": "Deux joueurs distincts observés pour une même équipe dans un match de duo.",
            },
        }
