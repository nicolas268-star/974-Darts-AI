from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

from supabase import Client

from .control_catalog import canonical_team_name, normalize_team_name
from .ranking_service import _all

NAKKA_DATA_NOTE = (
    "Les valeurs de finish sont des totaux de volée Nakka. "
    "Aucune route de checkout, tentative de double, double touché ou précision aux doubles n'est déduite."
)


def _round_number(code: str | None) -> tuple[int, str]:
    label = (code or "").strip()
    digits = "".join(c for c in label if c.isdigit())
    return (int(digits) if digits else 10**9, label.lower())


def _numeric(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _wilson_lower_bound(wins: int, total: int, z: float = 1.96) -> float:
    """Return the Wilson lower confidence bound as a percentage."""
    if total <= 0:
        return 0.0
    proportion = wins / total
    denominator = 1 + (z * z / total)
    centre = proportion + (z * z / (2 * total))
    margin = z * ((proportion * (1 - proportion) / total + z * z / (4 * total * total)) ** 0.5)
    return round(max(0.0, (centre - margin) / denominator) * 100, 2)


def _relationship_badge(wilson: float, win_rate: float, sample_size: int) -> str:
    """Internal analytical label derived only from observed results."""
    if sample_size < 3:
        return "À confirmer"
    if wilson >= 60 and win_rate >= 70:
        return "Elite"
    if wilson >= 45 and win_rate >= 58:
        return "Très solide"
    if wilson >= 30 and win_rate >= 50:
        return "Solide"
    if win_rate >= 40:
        return "Mitigé"
    return "Fragile"


def _row_average_3_darts(row: dict[str, Any]) -> float | None:
    explicit = _numeric(row.get("average_3_darts"))
    if explicit is not None:
        return explicit
    score = _numeric(row.get("score"))
    darts = _numeric(row.get("darts_thrown"))
    if score is not None and darts and darts > 0:
        return score / darts * 3
    return None


def _weighted_metric(rows: list[dict[str, Any]], key: str) -> float | None:
    values: list[tuple[float, int]] = []
    for row in rows:
        value = _row_average_3_darts(row) if key == "average_3_darts" else _numeric(row.get(key))
        if value is None:
            continue
        values.append((value, int(row.get("darts_thrown") or 0)))
    if not values:
        return None
    weighted = [(value, darts) for value, darts in values if darts > 0]
    if weighted:
        total_darts = sum(darts for _, darts in weighted)
        if total_darts:
            return round(sum(value * darts for value, darts in weighted) / total_darts, 2)
    return round(sum(value for value, _ in values) / len(values), 2)


def _first9_metric(
    rows: list[dict[str, Any]],
    daily_rows: list[dict[str, Any]],
    profile: dict[str, Any] | None,
) -> tuple[float | None, str | None]:
    """
    Resolve First 9 without reconstructing missing Nakka data.

    The season profile is preferred because Nakka_Player_Raw contains the
    official cumulative value. Daily and leg values are retained only as
    compatibility fallbacks for older imports.
    """
    profile_value = _numeric(profile.get("first_9")) if profile else None
    if profile_value is not None:
        return round(profile_value, 2), "NAKKA_PLAYER_RAW"

    daily_values: list[tuple[float, int]] = []
    for row in daily_rows:
        value = _numeric(row.get("first_9"))
        if value is None:
            continue
        daily_values.append((value, int(row.get("legs_played") or 0)))
    if daily_values:
        weighted = [
            (value, legs)
            for value, legs in daily_values
            if legs > 0
        ]
        if weighted:
            total_legs = sum(legs for _, legs in weighted)
            return (
                round(
                    sum(value * legs for value, legs in weighted)
                    / total_legs,
                    2,
                ),
                "PLAYER_DAILY_STATS",
            )
        return (
            round(
                sum(value for value, _ in daily_values)
                / len(daily_values),
                2,
            ),
            "PLAYER_DAILY_STATS",
        )

    leg_values = [
        value
        for row in rows
        if (value := _numeric(row.get("first_9"))) is not None
    ]
    if leg_values:
        return (
            round(sum(leg_values) / len(leg_values), 2),
            "PLAYER_LEG_STATS",
        )
    return None, None


def _safe_all(db: Client, table: str, select: str) -> list[dict[str, Any]]:
    """Load an optional table without breaking the dashboard on older schemas."""
    try:
        return _all(db, table, select)
    except Exception:
        return []


def _canonical_identity_maps(
    players: list[dict[str, Any]],
    identities: list[dict[str, Any]],
    aliases: list[dict[str, Any]],
) -> tuple[dict[str, str], dict[str, set[str]]]:
    """
    Resolve every technical player id to the active canonical player id.

    Identity merges are intentionally non-destructive: historical statistics
    keep their original player_id. Public read models must therefore group all
    source ids that end at the same active identity.
    """
    player_ids = {
        str(player["id"])
        for player in players
        if player.get("id")
    }
    identity_by_id = {
        str(row["id"]): row
        for row in identities
        if row.get("id")
    }
    identity_for_player: dict[str, str] = {}
    for row in identities:
        if row.get("canonical_player_id") and row.get("id"):
            identity_for_player[str(row["canonical_player_id"])] = str(
                row["id"]
            )
    for row in aliases:
        if row.get("source_player_id") and row.get("identity_id"):
            identity_for_player[str(row["source_player_id"])] = str(
                row["identity_id"]
            )

    def resolve(player_id: str) -> str:
        identity_id = identity_for_player.get(player_id)
        visited: set[str] = set()
        while identity_id and identity_id not in visited:
            visited.add(identity_id)
            identity = identity_by_id.get(identity_id)
            if not identity:
                break
            if (
                identity.get("status") == "MERGED"
                and identity.get("merged_into_identity_id")
            ):
                identity_id = str(identity["merged_into_identity_id"])
                continue
            canonical = identity.get("canonical_player_id")
            return str(canonical) if canonical else player_id
        return player_id

    canonical_by_player = {
        player_id: resolve(player_id)
        for player_id in player_ids
    }
    members_by_canonical: dict[str, set[str]] = defaultdict(set)
    for player_id, canonical_id in canonical_by_player.items():
        members_by_canonical[canonical_id].add(player_id)
        if canonical_id in player_ids:
            members_by_canonical[canonical_id].add(canonical_id)
    return canonical_by_player, dict(members_by_canonical)


def _relationship_tier(index: float, sample_size: int) -> str:
    """Stable frontend tier derived from the internal relationship index."""
    if sample_size < 3:
        return "unconfirmed"
    if index >= 75:
        return "elite"
    if index >= 60:
        return "excellent"
    if index >= 45:
        return "good"
    if index >= 30:
        return "average"
    return "poor"


def _relationship_color(tier: str) -> str:
    """Semantic color token; the frontend remains responsible for its palette."""
    return {
        "elite": "gold",
        "excellent": "green",
        "good": "lime",
        "average": "orange",
        "poor": "red",
        "unconfirmed": "slate",
    }.get(tier, "slate")


def _percentile_rank(value: float, population: list[float]) -> int:
    """
    Return an inclusive percentile rank from 0 to 100.

    This is a relative display value computed only inside the current
    relationship population.
    """
    if not population:
        return 0
    below_or_equal = sum(1 for item in population if item <= value)
    return int(round(below_or_equal / len(population) * 100))


def _clamp_index(value: float) -> int:
    return int(round(min(100.0, max(0.0, value))))


def _player_style(indices: dict[str, int]) -> dict[str, str]:
    ordered = sorted(indices.items(), key=lambda item: item[1], reverse=True)
    leader = ordered[0][0] if ordered else "mastery"
    mapping = {
        "power": ("Scoreur explosif", "La puissance de scoring domine le profil."),
        "consistency": ("Joueur régulier", "La stabilité des performances domine le profil."),
        "finishes": ("Finisseur", "Les finishes observés dominent le profil."),
        "progression": ("Joueur en progression", "La dynamique récente domine le profil."),
        "volume": ("Gros volume", "La fréquence des scores significatifs domine le profil."),
        "mastery": ("Joueur complet", "L'équilibre entre résultats et production domine le profil."),
    }
    label, description = mapping.get(leader, mapping["mastery"])
    if len(ordered) >= 2 and ordered[0][1] - ordered[-1][1] <= 12 and sum(indices.values()) / len(indices) >= 55:
        return {"key": "mastery", "label": "Joueur complet", "description": "Le profil est équilibré sur les indices disponibles."}
    return {"key": leader, "label": label, "description": description}


def _dominance_label(score: int) -> str:
    if score >= 80:
        return "Domination élevée"
    if score >= 65:
        return "Impact fort"
    if score >= 50:
        return "Impact solide"
    if score >= 35:
        return "Impact modéré"
    return "Impact à développer"


def _coach_priority(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 55:
        return "medium"
    return "low"


def _coach_confidence(legs_played: int, trend_points: int, relationship_count: int) -> dict[str, Any]:
    observed_volume = min(100, int(round(legs_played / 80 * 100)))
    trend_coverage = min(100, int(round(trend_points / 8 * 100)))
    relationship_coverage = min(100, int(round(relationship_count / 6 * 100)))
    score = _clamp_index(observed_volume * 0.55 + trend_coverage * 0.25 + relationship_coverage * 0.20)
    label = "Confiance élevée" if score >= 75 else "Confiance modérée" if score >= 50 else "Confiance limitée"
    return {"score": score, "label": label, "legs_component": observed_volume, "trend_component": trend_coverage, "relationship_component": relationship_coverage}


def _coach_item(key: str, title: str, explanation: str, evidence: list[dict[str, Any]], score: int, category: str) -> dict[str, Any]:
    return {"key": key, "title": title, "explanation": explanation, "evidence": evidence, "score": _clamp_index(score), "priority": _coach_priority(score), "category": category}


def _comparison_advantage(left: float | None, right: float | None, tolerance: float = 0.5) -> str:
    if left is None and right is None: return "tie"
    if left is None: return "right"
    if right is None: return "left"
    delta=float(left)-float(right)
    return "tie" if abs(delta)<=tolerance else ("left" if delta>0 else "right")

def _comparison_probability(left_score: float, right_score: float) -> dict[str, float]:
    total=max(1.0,left_score+right_score)
    left=round(left_score/total*100,1)
    return {"left":left,"right":round(100-left,1)}

def _comparison_label(delta: float) -> str:
    value=abs(delta)
    if value<3: return "Très équilibré"
    if value<8: return "Avantage léger"
    if value<15: return "Avantage net"
    return "Avantage marqué"


@dataclass(frozen=True)
class PlayerStatisticsDataset:
    players: list[dict[str, Any]]
    teams: list[dict[str, Any]]
    clubs: list[dict[str, Any]]
    seasons: list[dict[str, Any]]
    rounds: list[dict[str, Any]]
    encounters: list[dict[str, Any]]
    matches: list[dict[str, Any]]
    legs: list[dict[str, Any]]
    stats: list[dict[str, Any]]
    daily_stats: list[dict[str, Any]]
    profiles: list[dict[str, Any]]
    identities: list[dict[str, Any]]
    aliases: list[dict[str, Any]]

    @classmethod
    def load(cls, db: Client) -> "PlayerStatisticsDataset":
        return cls(
            players=_all(db, "players", "id,display_name,team_id,public_profile"),
            teams=_all(db, "teams", "id,name,club_id"),
            clubs=_all(db, "clubs", "id,name"),
            seasons=_all(db, "seasons", "id,name,is_active"),
            rounds=_all(db, "rounds", "id,season_id,code,played_on,published"),
            encounters=_all(db, "encounters", "id,round_id,name,home_team_id,away_team_id"),
            matches=_all(db, "matches", "id,encounter_id,match_number,nakka_match_number,mode,team_1_id,team_2_id,winner_team_id"),
            legs=_all(db, "legs", "id,match_id,leg_number,winner_team_id,status"),
            stats=_all(db, "player_leg_stats", "id,leg_id,player_id,team_id,score,darts_thrown,average_3_darts,first_9,finish,scores_180,scores_170,scores_140,scores_100,scores_80,no_score,leg_won"),
            daily_stats=_safe_all(db, "player_daily_stats", "id,player_id,round_id,team_id,legs_played,legs_won,average_3_darts,first_9,best_finish,elo_after"),
            profiles=_safe_all(db, "player_profiles", "id,player_id,season_id,legs_played,legs_won,average_3_darts,first_9,best_finish,elo"),
            identities=_safe_all(db, "player_identities", "id,canonical_player_id,status,merged_into_identity_id"),
            aliases=_safe_all(db, "player_aliases", "identity_id,source_player_id"),
        )


class PlayerStatisticsEngine:
    def __init__(self, dataset: PlayerStatisticsDataset):
        self.data = dataset
        self.player_by_id = {
            str(row.get("id")): row
            for row in dataset.players
            if row.get("id")
        }
        (
            self.canonical_by_player,
            self.members_by_canonical,
        ) = _canonical_identity_maps(
            dataset.players,
            dataset.identities,
            dataset.aliases,
        )
        self.team_by_id = {str(row.get("id")): row for row in dataset.teams}
        self.club_by_id = {str(row.get("id")): row for row in dataset.clubs}
        self.round_by_id = {str(row.get("id")): row for row in dataset.rounds}
        self.encounter_by_id = {str(row.get("id")): row for row in dataset.encounters}
        self.match_by_id = {str(row.get("id")): row for row in dataset.matches}
        self.leg_by_id = {str(row.get("id")): row for row in dataset.legs}

        self.encounters_by_round: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.matches_by_encounter: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.legs_by_match: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.stats_by_leg: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in dataset.encounters:
            self.encounters_by_round[str(row.get("round_id"))].append(row)
        for row in dataset.matches:
            self.matches_by_encounter[str(row.get("encounter_id"))].append(row)
        for row in dataset.legs:
            self.legs_by_match[str(row.get("match_id"))].append(row)
        for row in dataset.stats:
            self.stats_by_leg[str(row.get("leg_id"))].append(row)

    @classmethod
    def from_db(cls, db: Client) -> "PlayerStatisticsEngine":
        return cls(PlayerStatisticsDataset.load(db))

    def _round_has_data(self, round_id: str) -> bool:
        if any(str(row.get("round_id")) == round_id for row in self.data.daily_stats):
            return True
        for encounter in self.encounters_by_round.get(round_id, []):
            for match in self.matches_by_encounter.get(str(encounter.get("id")), []):
                for leg in self.legs_by_match.get(str(match.get("id")), []):
                    if leg.get("status") == "VALID" and self.stats_by_leg.get(str(leg.get("id"))):
                        return True
        return False

    def _season_data_counts(self) -> dict[str, int]:
        counts: dict[str, int] = defaultdict(int)
        for round_row in self.data.rounds:
            round_id = str(round_row.get("id"))
            season_id = str(round_row.get("season_id"))
            if self._round_has_data(round_id):
                counts[season_id] += 1
        return counts

    def _resolve_season(self, requested: str | None) -> tuple[dict[str, Any] | None, str]:
        if requested:
            season = next((s for s in self.data.seasons if str(s.get("id")) == requested), None)
            return season, "requested"

        counts = self._season_data_counts()
        active = next((s for s in self.data.seasons if bool(s.get("is_active"))), None)
        if active and counts.get(str(active.get("id")), 0) > 0:
            return active, "active_with_data"

        seasons_with_data = [s for s in self.data.seasons if counts.get(str(s.get("id")), 0) > 0]
        if seasons_with_data:
            seasons_with_data.sort(
                key=lambda s: (counts.get(str(s.get("id")), 0), str(s.get("name") or "")),
                reverse=True,
            )
            return seasons_with_data[0], "data_rich_fallback"

        if active:
            return active, "active_without_data"
        return (self.data.seasons[-1], "latest_without_data") if self.data.seasons else (None, "none")

    def _scope(self, season_id: str | None):
        season, season_strategy = self._resolve_season(season_id)
        if not season:
            return None, {}, {}, {}, {}, {"season_strategy": season_strategy, "round_strategy": "none"}

        season_rounds = [r for r in self.data.rounds if str(r.get("season_id")) == str(season.get("id"))]
        published_rounds = [r for r in season_rounds if bool(r.get("published"))]
        data_rounds = [r for r in season_rounds if self._round_has_data(str(r.get("id")))]

        if published_rounds:
            effective_rounds = published_rounds
            round_strategy = "published"
        elif data_rounds:
            effective_rounds = data_rounds
            round_strategy = "data_present_fallback"
        else:
            effective_rounds = season_rounds
            round_strategy = "season_all_no_data"

        rounds = {str(r["id"]): r for r in effective_rounds}
        encounters = {str(e["id"]): e for e in self.data.encounters if str(e.get("round_id")) in rounds}
        matches = {str(m["id"]): m for m in self.data.matches if str(m.get("encounter_id")) in encounters}
        legs = {
            str(l["id"]): l
            for l in self.data.legs
            if str(l.get("match_id")) in matches and l.get("status") == "VALID"
        }
        diagnostics = {
            "season_strategy": season_strategy,
            "round_strategy": round_strategy,
            "season_rounds": len(season_rounds),
            "published_rounds": len(published_rounds),
            "data_rounds": len(data_rounds),
        }
        return season, rounds, encounters, matches, legs, diagnostics

    @staticmethod
    def _season_year(season: dict[str, Any] | None) -> int | None:
        if not season:
            return None
        digits = "".join(char for char in str(season.get("name") or "") if char.isdigit())
        return int(digits[:4]) if len(digits) >= 4 else None

    def _canonical_team(self, team: dict[str, Any] | None, season_year: int | None) -> dict[str, Any] | None:
        """Return the official team row for a legacy or plural team label."""
        if not team:
            return None
        canonical_name = canonical_team_name(team.get("name"), season_year)
        candidates = [
            row
            for row in self.data.teams
            if canonical_team_name(row.get("name"), season_year) == canonical_name
        ]
        canonical_normalized = normalize_team_name(canonical_name)
        candidates.sort(
            key=lambda row: (
                normalize_team_name(row.get("name")) != canonical_normalized,
                str(row.get("id")) != str(team.get("id")),
            )
        )
        selected = candidates[0] if candidates else team
        return {**selected, "name": canonical_name}

    def _identity(
        self,
        player: dict[str, Any],
        season: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raw_team = self.team_by_id.get(str(player.get("team_id")))
        team = self._canonical_team(raw_team, self._season_year(season))
        club = self.club_by_id.get(str(team.get("club_id"))) if team else None
        return {
            "id": player.get("id"),
            "name": player.get("display_name"),
            "public_profile": bool(player.get("public_profile", True)),
            "team_id": team.get("id") if team else player.get("team_id"),
            "team": team.get("name") if team else None,
            "club_id": club.get("id") if club else None,
            "club": club.get("name") if club else None,
        }

    def _canonical_id(self, player_id: str) -> str:
        return self.canonical_by_player.get(player_id, player_id)

    def _member_ids(self, player_id: str) -> set[str]:
        canonical_id = self._canonical_id(player_id)
        return set(
            self.members_by_canonical.get(
                canonical_id,
                {canonical_id},
            )
        )

    def _canonical_player(
        self,
        player_id: str,
    ) -> dict[str, Any] | None:
        canonical_id = self._canonical_id(player_id)
        player = self.player_by_id.get(canonical_id)
        if player:
            return player
        player = self.player_by_id.get(player_id)
        if player:
            return player
        return next(
            (
                self.player_by_id.get(member_id)
                for member_id in sorted(self._member_ids(player_id))
                if self.player_by_id.get(member_id)
            ),
            None,
        )

    def _aggregate(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        finishes = [int(r["finish"]) for r in rows if r.get("finish") not in (None, 0)]
        played = len(rows)
        won = sum(1 for r in rows if bool(r.get("leg_won")))
        return {
            "legs_played": played,
            "legs_won": won,
            "win_rate": round(won / played * 100, 1) if played else 0.0,
            "average_3_darts": _weighted_metric(rows, "average_3_darts"),
            "first_9": _weighted_metric(rows, "first_9"),
            "best_finish": max(finishes) if finishes else None,
            "average_finish": round(sum(finishes) / len(finishes), 1) if finishes else None,
        }

    @staticmethod
    def _scoring(rows: list[dict[str, Any]]) -> dict[str, int]:
        return {
            "scores_80_plus": sum(int(r.get("scores_80") or 0) for r in rows),
            "scores_100_plus": sum(int(r.get("scores_100") or 0) for r in rows),
            "scores_140_plus": sum(int(r.get("scores_140") or 0) for r in rows),
            "scores_170_plus": sum(int(r.get("scores_170") or 0) for r in rows),
            "scores_180": sum(int(r.get("scores_180") or 0) for r in rows),
            "no_score": sum(int(r.get("no_score") or 0) for r in rows),
        }

    def _daily_rows(self, player_id: str, round_ids: set[str]) -> list[dict[str, Any]]:
        member_ids = self._member_ids(player_id)
        return [
            row for row in self.data.daily_stats
            if str(row.get("player_id")) in member_ids
            and str(row.get("round_id")) in round_ids
        ]

    def _profile(self, player_id: str, season_id: str | None) -> dict[str, Any] | None:
        canonical_id = self._canonical_id(player_id)
        member_ids = self._member_ids(player_id)
        candidates = [
            row
            for row in self.data.profiles
            if str(row.get("player_id")) in member_ids
            and (
                season_id is None
                or str(row.get("season_id")) == season_id
            )
        ]
        candidates.sort(
            key=lambda row: (
                _numeric(row.get("first_9")) is None,
                str(row.get("player_id")) != canonical_id,
            )
        )
        return next(
            iter(candidates),
            None,
        )

    def dashboard(self, player_id: str, season_id: str | None = None) -> dict[str, Any] | None:
        player = self._canonical_player(player_id)
        if player is None:
            return None

        canonical_id = self._canonical_id(player_id)
        member_ids = self._member_ids(player_id)
        season, rounds, encounters, matches, legs, scope_meta = self._scope(season_id)
        rows = [
            r for r in self.data.stats
            if str(r.get("player_id")) in member_ids
            and str(r.get("leg_id")) in legs
        ]
        daily_rows = self._daily_rows(canonical_id, set(rounds))
        profile = self._profile(
            canonical_id,
            str(season.get("id")) if season else None,
        )

        kpis = self._aggregate(rows)
        if not rows and daily_rows:
            played = sum(int(r.get("legs_played") or 0) for r in daily_rows)
            won = sum(int(r.get("legs_won") or 0) for r in daily_rows)
            kpis = {
                "legs_played": played,
                "legs_won": won,
                "win_rate": round(won / played * 100, 1) if played else 0.0,
                "average_3_darts": _weighted_metric(daily_rows, "average_3_darts"),
                "first_9": _weighted_metric(daily_rows, "first_9"),
                "best_finish": max((int(r.get("best_finish")) for r in daily_rows if r.get("best_finish")), default=None),
                "average_finish": None,
            }
        if not rows and not daily_rows and profile:
            played = int(profile.get("legs_played") or 0)
            won = int(profile.get("legs_won") or 0)
            kpis = {
                "legs_played": played,
                "legs_won": won,
                "win_rate": round(won / played * 100, 1) if played else 0.0,
                "average_3_darts": _numeric(profile.get("average_3_darts")),
                "first_9": _numeric(profile.get("first_9")),
                "best_finish": profile.get("best_finish"),
                "average_finish": None,
            }

        first_9, first_9_source = _first9_metric(
            rows,
            daily_rows,
            profile,
        )
        kpis["first_9"] = first_9

        elo_history = []
        for row in daily_rows:
            if row.get("elo_after") is None:
                continue
            round_row = rounds.get(str(row.get("round_id")))
            elo_history.append({
                "round_id": row.get("round_id"),
                "round": round_row.get("code") if round_row else None,
                "played_on": round_row.get("played_on") if round_row else None,
                "value": int(row.get("elo_after")),
            })
        elo_history.sort(key=lambda x: (_round_number(x.get("round")), x.get("played_on") or ""))
        elo_value = elo_history[-1]["value"] if elo_history else (int(profile.get("elo")) if profile and profile.get("elo") is not None else None)

        base = {
            "player": self._identity(player, season),
            "season": season,
            "kpis": kpis,
            "scoring": self._scoring(rows),
            "trends": [],
            "recent_matches": [],
            "elo": {"available": elo_value is not None, "value": elo_value, "history": elo_history},
            "meta": {
                "has_data": bool(rows or daily_rows or profile),
                "nakka_note": NAKKA_DATA_NOTE,
                "scope": scope_meta,
                "data_quality": {
                    "effective_rounds": len(rounds),
                    "valid_legs_in_scope": len(legs),
                    "player_stat_rows": len(rows),
                    "player_daily_rows": len(daily_rows),
                    "profile_available": profile is not None,
                    "average_rows": sum(1 for r in rows if _row_average_3_darts(r) is not None),
                    "first_9_rows": sum(1 for r in rows if _numeric(r.get("first_9")) is not None),
                    "first_9_source": first_9_source,
                    "finish_rows": sum(1 for r in rows if r.get("finish") not in (None, 0)),
                },
            },
        }

        by_round: dict[str, list[dict[str, Any]]] = defaultdict(list)
        by_match: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in rows:
            leg = legs.get(str(r.get("leg_id")))
            if not leg:
                continue
            match = matches.get(str(leg.get("match_id")))
            if not match:
                continue
            encounter = encounters.get(str(match.get("encounter_id")))
            if not encounter:
                continue
            by_round[str(encounter.get("round_id"))].append(r)
            by_match[str(match.get("id"))].append(r)

        trends = []
        if by_round:
            for round_id, group in by_round.items():
                rr = rounds[round_id]
                trends.append({
                    "round_id": round_id,
                    "round": rr.get("code"),
                    "played_on": rr.get("played_on"),
                    **self._aggregate(group),
                    **{k: v for k, v in self._scoring(group).items() if k in {"scores_100_plus", "scores_140_plus", "scores_180"}},
                })
        elif daily_rows:
            for row in daily_rows:
                rr = rounds.get(str(row.get("round_id")))
                if not rr:
                    continue
                lp = int(row.get("legs_played") or 0)
                lw = int(row.get("legs_won") or 0)
                trends.append({
                    "round_id": row.get("round_id"),
                    "round": rr.get("code"),
                    "played_on": rr.get("played_on"),
                    "legs_played": lp,
                    "legs_won": lw,
                    "win_rate": round(lw / lp * 100, 1) if lp else 0.0,
                    "average_3_darts": _numeric(row.get("average_3_darts")),
                    "first_9": _numeric(row.get("first_9")),
                    "best_finish": row.get("best_finish"),
                    "average_finish": None,
                    "scores_100_plus": None,
                    "scores_140_plus": None,
                    "scores_180": None,
                })
        trends.sort(key=lambda x: (_round_number(x.get("round")), x.get("played_on") or ""))
        base["trends"] = trends

        if by_match:
            team_names = {str(t.get("id")): t.get("name") for t in self.data.teams}
            player_names = {
                str(p.get("id")): p.get("display_name")
                for p in self.data.players
                if p.get("id") and p.get("display_name")
            }
            recent = []
            for match_id, group in by_match.items():
                match = matches[match_id]
                encounter = encounters[str(match.get("encounter_id"))]
                rr = rounds[str(encounter.get("round_id"))]
                player_team_id = str(player.get("team_id"))
                team_1 = str(match.get("team_1_id")) if match.get("team_1_id") else None
                team_2 = str(match.get("team_2_id")) if match.get("team_2_id") else None
                opponent = team_2 if team_1 == player_team_id else team_1
                opponent_player_names: list[str] = []
                seen_opponents: set[str] = set()
                for leg in self.legs_by_match.get(match_id, []):
                    leg_id = str(leg.get("id"))
                    if leg_id not in legs:
                        continue
                    for stat in self.stats_by_leg.get(leg_id, []):
                        opponent_player_id = (
                            str(stat.get("player_id"))
                            if stat.get("player_id")
                            else None
                        )
                        if (
                            not opponent_player_id
                            or opponent_player_id in member_ids
                            or str(stat.get("team_id")) != opponent
                            or opponent_player_id in seen_opponents
                        ):
                            continue
                        opponent_name = player_names.get(opponent_player_id)
                        if not opponent_name:
                            continue
                        seen_opponents.add(opponent_player_id)
                        opponent_player_names.append(opponent_name)
                recent.append({
                    "match_id": match_id,
                    "round": rr.get("code"),
                    "played_on": rr.get("played_on"),
                    "encounter": encounter.get("name"),
                    "match_number": match.get("match_number"),
                    "nakka_match_number": match.get("nakka_match_number"),
                    "mode": match.get("mode"),
                    "opponent_team_id": opponent,
                    "opponent_team": team_names.get(opponent),
                    "opponent_names": " / ".join(opponent_player_names)
                    if opponent_player_names
                    else None,
                    **self._aggregate(group),
                    **{k: v for k, v in self._scoring(group).items() if k in {"scores_100_plus", "scores_140_plus", "scores_180"}},
                })
            recent.sort(
                key=lambda x: (x.get("played_on") or date.min.isoformat(), _round_number(x.get("round")), x.get("match_number") or 0),
                reverse=True,
            )
            base["recent_matches"] = recent[:10]

        return base


    def _relationship_identity(
        self,
        player_id: str,
        season: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        canonical_id = self._canonical_id(player_id)
        player = self._canonical_player(canonical_id)
        if not player:
            return {
                "player_id": canonical_id,
                "name": "Joueur inconnu",
                "team_id": None,
                "team": None,
                "club_id": None,
                "club": None,
            }
        identity = self._identity(player, season)
        return {
            "player_id": identity.get("id"),
            "name": identity.get("name"),
            "team_id": identity.get("team_id"),
            "team": identity.get("team"),
            "club_id": identity.get("club_id"),
            "club": identity.get("club"),
        }

    @staticmethod
    def _relationship_score(
        wilson: float,
        win_rate: float,
        legs_played: int,
        average_3_darts: float | None,
    ) -> float:
        """
        Internal 974 Darts AI relationship index.

        The score is derived exclusively from:
        - observed Wilson lower bound;
        - observed win rate;
        - observed sample size;
        - observed 3-dart average where available.
        """
        volume_confidence = min(100.0, legs_played / 12 * 100)
        average_component = min(100.0, max(0.0, ((average_3_darts or 0.0) / 70) * 100))
        score = (
            wilson * 0.50
            + win_rate * 0.25
            + volume_confidence * 0.15
            + average_component * 0.10
        )
        return round(min(100.0, max(0.0, score)), 1)

    def network(self, player_id: str, season_id: str | None = None) -> dict[str, Any] | None:
        player = self._canonical_player(player_id)
        if player is None:
            return None

        canonical_id = self._canonical_id(player_id)
        member_ids = self._member_ids(player_id)
        season, rounds, encounters, matches, legs, scope_meta = self._scope(season_id)

        player_rows_by_leg: dict[str, dict[str, Any]] = {}
        for row in self.data.stats:
            leg_id = str(row.get("leg_id"))
            if (
                leg_id in legs
                and str(row.get("player_id")) in member_ids
            ):
                player_rows_by_leg[leg_id] = row

        partner_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        opponent_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

        for leg_id, player_row in player_rows_by_leg.items():
            player_team_id = str(player_row.get("team_id")) if player_row.get("team_id") is not None else None
            leg_rows = self.stats_by_leg.get(leg_id, [])

            for other in leg_rows:
                other_player_id = str(other.get("player_id"))
                other_canonical_id = self._canonical_id(other_player_id)
                if other_canonical_id == canonical_id:
                    continue

                other_team_id = str(other.get("team_id")) if other.get("team_id") is not None else None
                relation_row = {
                    "leg_id": leg_id,
                    "match_id": legs.get(leg_id, {}).get("match_id"),
                    "player_average_3_darts": _row_average_3_darts(player_row),
                    "other_average_3_darts": _row_average_3_darts(other),
                    "leg_won": bool(player_row.get("leg_won")),
                }

                if player_team_id is not None and other_team_id == player_team_id:
                    partner_groups[other_canonical_id].append(relation_row)
                elif player_team_id is not None and other_team_id is not None and other_team_id != player_team_id:
                    opponent_groups[other_canonical_id].append(relation_row)

        def aggregate_relationships(
            groups: dict[str, list[dict[str, Any]]],
            relation_type: str,
        ) -> list[dict[str, Any]]:
            relationships: list[dict[str, Any]] = []

            for related_player_id, rows in groups.items():
                leg_ids = {str(row.get("leg_id")) for row in rows}
                match_ids = {str(row.get("match_id")) for row in rows if row.get("match_id") is not None}
                legs_played = len(leg_ids)
                legs_won = sum(1 for row in rows if row.get("leg_won"))
                win_rate = round(legs_won / legs_played * 100, 1) if legs_played else 0.0
                wilson = _wilson_lower_bound(legs_won, legs_played)

                observed_averages = [
                    value
                    for row in rows
                    for value in [row.get("player_average_3_darts")]
                    if value is not None
                ]
                player_average = (
                    round(sum(observed_averages) / len(observed_averages), 2)
                    if observed_averages
                    else None
                )

                related_averages = [
                    value
                    for row in rows
                    for value in [row.get("other_average_3_darts")]
                    if value is not None
                ]
                related_average = (
                    round(sum(related_averages) / len(related_averages), 2)
                    if related_averages
                    else None
                )

                relationship_index = self._relationship_score(
                    wilson=wilson,
                    win_rate=win_rate,
                    legs_played=legs_played,
                    average_3_darts=player_average,
                )

                relationships.append({
                    **self._relationship_identity(related_player_id, season),
                    "relation_type": relation_type,
                    "matches_played": len(match_ids),
                    "legs_played": legs_played,
                    "legs_won": legs_won,
                    "legs_lost": max(0, legs_played - legs_won),
                    "win_rate": win_rate,
                    "wilson_lower_bound": wilson,
                    "player_average_3_darts": player_average,
                    "related_player_average_3_darts": related_average,
                    "relationship_index": relationship_index,
                    "badge": _relationship_badge(wilson, win_rate, legs_played),
                    "sample_status": "reliable" if legs_played >= 8 else "limited" if legs_played >= 3 else "very_limited",
                })

            index_population = [
                float(item.get("relationship_index") or 0)
                for item in relationships
            ]
            for item in relationships:
                index_value = float(item.get("relationship_index") or 0)
                tier = _relationship_tier(index_value, int(item.get("legs_played") or 0))
                item["tier"] = tier
                item["color"] = _relationship_color(tier)
                item["percentile"] = _percentile_rank(index_value, index_population)

            relationships.sort(
                key=lambda item: (
                    -float(item.get("relationship_index") or 0),
                    -float(item.get("wilson_lower_bound") or 0),
                    -int(item.get("legs_played") or 0),
                    str(item.get("name") or "").lower(),
                )
            )
            for index, item in enumerate(relationships, start=1):
                item["rank"] = index
            return relationships

        partners = aggregate_relationships(partner_groups, "partner")
        opponents = aggregate_relationships(opponent_groups, "opponent")

        best_partners = list(partners)
        worst_partners = sorted(
            partners,
            key=lambda item: (
                float(item.get("relationship_index") or 0),
                float(item.get("wilson_lower_bound") or 0),
                -int(item.get("legs_played") or 0),
                str(item.get("name") or "").lower(),
            ),
        )
        favorite_opponents = sorted(
            opponents,
            key=lambda item: (
                -float(item.get("relationship_index") or 0),
                -float(item.get("wilson_lower_bound") or 0),
                -int(item.get("legs_played") or 0),
                str(item.get("name") or "").lower(),
            ),
        )
        toughest_opponents = sorted(
            opponents,
            key=lambda item: (
                float(item.get("relationship_index") or 0),
                float(item.get("win_rate") or 0),
                float(item.get("wilson_lower_bound") or 0),
                -int(item.get("legs_played") or 0),
                str(item.get("name") or "").lower(),
            ),
        )

        return {
            "player": self._identity(player, season),
            "season": season,
            "partners": partners,
            "opponents": opponents,
            "best_partners": best_partners,
            "worst_partners": worst_partners,
            "favorite_opponents": favorite_opponents,
            "toughest_opponents": toughest_opponents,
            "highlights": {
                "best_partner": best_partners[0] if best_partners else None,
                "difficult_partner": worst_partners[0] if worst_partners else None,
                "favorite_opponent": favorite_opponents[0] if favorite_opponents else None,
                "toughest_opponent": toughest_opponents[0] if toughest_opponents else None,
            },
            "meta": {
                "has_partner_data": bool(partners),
                "has_opponent_data": bool(opponents),
                "partner_count": len(partners),
                "opponent_count": len(opponents),
                "scope": scope_meta,
                "contract_version": "7.2.1a",
                "frontend_ready": True,
                "default_partner_ranking": "relationship_index",
                "default_opponent_ranking": "relationship_index",
                "methodology": {
                    "relationship_index": (
                        "Indice analytique interne 974 Darts AI dérivé du Wilson, "
                        "du taux de victoire, du volume observé et de la moyenne 3 fléchettes disponible."
                    ),
                    "percentile": (
                        "Rang percentile relatif à la population de relations du même type "
                        "dans la réponse courante."
                    ),
                    "tier": "Niveau d'affichage dérivé de l'indice relationnel et du volume observé.",
                    "color": "Jeton sémantique destiné au frontend, sans imposer de code hexadécimal.",
                    "wilson": "Borne basse de Wilson à 95 % calculée sur les legs observés.",
                    "no_invented_data": True,
                },
                "nakka_note": NAKKA_DATA_NOTE,
            },
        }


    def dna(self, player_id: str, season_id: str | None = None) -> dict[str, Any] | None:
        dashboard = self.dashboard(player_id, season_id)
        if dashboard is None:
            return None

        kpis = dashboard.get("kpis") or {}
        scoring = dashboard.get("scoring") or {}
        trends = dashboard.get("trends") or []

        average_3_darts = _numeric(kpis.get("average_3_darts")) or 0.0
        first_9 = _numeric(kpis.get("first_9"))
        win_rate = _numeric(kpis.get("win_rate")) or 0.0
        legs_played = int(kpis.get("legs_played") or 0)
        best_finish = int(kpis.get("best_finish") or 0)

        trend_averages = [float(row.get("average_3_darts")) for row in trends if row.get("average_3_darts") is not None]
        if len(trend_averages) >= 2:
            mean = sum(trend_averages) / len(trend_averages)
            deviation = (sum((value - mean) ** 2 for value in trend_averages) / len(trend_averages)) ** 0.5
            consistency = _clamp_index(100 - deviation * 8)
        else:
            consistency = 50 if trend_averages else 0

        first_three = sum(trend_averages[:3]) / len(trend_averages[:3]) if trend_averages[:3] else None
        last_three = sum(trend_averages[-3:]) / len(trend_averages[-3:]) if trend_averages[-3:] else None
        progression_delta = last_three - first_three if first_three is not None and last_three is not None else 0.0

        s80 = int(scoring.get("scores_80_plus") or 0)
        s100 = int(scoring.get("scores_100_plus") or 0)
        s140 = int(scoring.get("scores_140_plus") or 0)
        s170 = int(scoring.get("scores_170_plus") or 0)
        s180 = int(scoring.get("scores_180") or 0)
        no_score = int(scoring.get("no_score") or 0)

        weighted = s80 + s100 * 2 + s140 * 4 + s170 * 6 + s180 * 8
        power = _clamp_index((average_3_darts / 70) * 60 + (s140 / max(1, legs_played)) * 220 + (s180 / max(1, legs_played)) * 500)
        volume = _clamp_index((weighted / max(1, legs_played)) * 10)
        finishes = _clamp_index((best_finish / 170) * 70 + (min(best_finish, 100) / 100) * 30)
        progression = _clamp_index(50 + progression_delta * 7)
        mastery = _clamp_index(
            win_rate * 0.55
            + ((first_9 if first_9 is not None else average_3_darts) / 70) * 30
            + consistency * 0.15
            - (no_score / max(1, legs_played)) * 35
        )

        indices = {
            "power": power,
            "consistency": consistency,
            "finishes": finishes,
            "progression": progression,
            "volume": volume,
            "mastery": mastery,
        }
        dominance = _clamp_index(
            power * 0.23 + consistency * 0.18 + finishes * 0.12
            + progression * 0.10 + volume * 0.17 + mastery * 0.20
        )
        style = _player_style(indices)

        return {
            "player": dashboard.get("player"),
            "season": dashboard.get("season"),
            "indices": indices,
            "dominance": {"score": dominance, "label": _dominance_label(dominance)},
            "style": style,
            "strengths": [key for key, value in sorted(indices.items(), key=lambda item: item[1], reverse=True) if value >= 60][:3],
            "development_areas": [key for key, value in sorted(indices.items(), key=lambda item: item[1]) if value < 50][:2],
            "heatmap": [
                {"key": "scores_180", "label": "180", "value": s180, "weight": 5},
                {"key": "scores_170_plus", "label": "170+", "value": s170, "weight": 4},
                {"key": "scores_140_plus", "label": "140+", "value": s140, "weight": 3},
                {"key": "scores_100_plus", "label": "100+", "value": s100, "weight": 2},
                {"key": "scores_80_plus", "label": "80+", "value": s80, "weight": 1},
                {"key": "no_score", "label": "No Score", "value": no_score, "weight": -1},
            ],
            "observed": {
                "average_3_darts": kpis.get("average_3_darts"),
                "first_9": kpis.get("first_9"),
                "win_rate": kpis.get("win_rate"),
                "legs_played": legs_played,
                "best_finish": kpis.get("best_finish"),
                "progression_delta": round(progression_delta, 2),
            },
            "meta": {
                "contract_version": "7.2.3",
                "frontend_ready": True,
                "index_type": "internal_analytical",
                "methodology": "Indices internes dérivés des statistiques observées disponibles.",
                "no_invented_data": True,
                "nakka_note": NAKKA_DATA_NOTE,
            },
        }

    def coach(self, player_id: str, season_id: str | None = None) -> dict[str, Any] | None:
        dashboard = self.dashboard(player_id, season_id)
        dna = self.dna(player_id, season_id)
        network = self.network(player_id, season_id)
        if dashboard is None or dna is None or network is None:
            return None
        kpis = dashboard.get("kpis") or {}
        scoring = dashboard.get("scoring") or {}
        trends = dashboard.get("trends") or []
        recent_matches = dashboard.get("recent_matches") or []
        indices = dna.get("indices") or {}
        observed = dna.get("observed") or {}
        average_3_darts = _numeric(kpis.get("average_3_darts")) or 0.0
        first_9 = _numeric(kpis.get("first_9"))
        win_rate = _numeric(kpis.get("win_rate")) or 0.0
        legs_played = int(kpis.get("legs_played") or 0)
        best_finish = int(kpis.get("best_finish") or 0)
        progression_delta = _numeric(observed.get("progression_delta")) or 0.0
        s100 = int(scoring.get("scores_100_plus") or 0); s140 = int(scoring.get("scores_140_plus") or 0); s180 = int(scoring.get("scores_180") or 0); no_score = int(scoring.get("no_score") or 0)
        strengths=[]; development=[]; recommendations=[]
        consistency=int(indices.get("consistency") or 0); power=int(indices.get("power") or 0); finishes=int(indices.get("finishes") or 0)
        if consistency >= 65:
            strengths.append(_coach_item("consistency","Régularité solide","Les moyennes par journée présentent une dispersion contenue.",[{"metric":"Indice régularité","value":consistency,"unit":"/100"}],consistency,"strength"))
        elif consistency < 45:
            development.append(_coach_item("consistency","Stabiliser la moyenne","Les performances varient sensiblement d'une journée à l'autre.",[{"metric":"Indice régularité","value":consistency,"unit":"/100"}],100-consistency,"development"))
            recommendations.append(_coach_item("consistency_drill","Bloc de répétition à rythme constant","Privilégier des séries courtes et répétables pour réduire les écarts entre passages.",[{"metric":"Objectif analytique","value":"Réduire la dispersion","unit":""}],76,"recommendation"))
        if power >= 65:
            strengths.append(_coach_item("power","Scoring puissant","La moyenne et les volumes de gros scores soutiennent un profil offensif.",[{"metric":"Indice puissance","value":power,"unit":"/100"},{"metric":"140+","value":s140,"unit":"observés"},{"metric":"180","value":s180,"unit":"observés"}],power,"strength"))
        elif s140 / max(1, legs_played) < .10:
            development.append(_coach_item("high_scoring","Augmenter la fréquence des 140+","Le volume de 140+ reste faible par rapport au nombre de legs observés.",[{"metric":"140+","value":s140,"unit":"observés"},{"metric":"Legs","value":legs_played,"unit":"joués"}],70,"development"))
            recommendations.append(_coach_item("scoring_drill","Renforcer les séquences de scoring","Mettre l'accent sur la répétition des zones de scoring principales, sans déduire de route de checkout.",[{"metric":"Cible analytique","value":"140+ par leg","unit":"à augmenter"}],72,"recommendation"))
        if first_9 is not None and first_9 >= average_3_darts + 5:
            strengths.append(_coach_item("opening_phase","Débuts de legs performants","La moyenne First 9 est nettement supérieure à la moyenne générale.",[{"metric":"First 9","value":round(first_9,2),"unit":""},{"metric":"Moyenne","value":round(average_3_darts,2),"unit":""}],min(100,int(round(60+(first_9-average_3_darts)*3))),"strength"))
        elif first_9 is not None and first_9 < average_3_darts - 3:
            development.append(_coach_item("opening_phase","Mieux lancer les legs","La production sur les neuf premières fléchettes est inférieure à la moyenne générale.",[{"metric":"First 9","value":round(first_9,2),"unit":""},{"metric":"Moyenne","value":round(average_3_darts,2),"unit":""}],68,"development"))
        if finishes >= 65:
            strengths.append(_coach_item("finishes","Capacité de finish marquée","Le meilleur finish observé soutient un indice finishes élevé.",[{"metric":"Indice finishes","value":finishes,"unit":"/100"},{"metric":"Meilleur finish","value":best_finish or None,"unit":""}],finishes,"strength"))
        elif finishes < 45:
            development.append(_coach_item("finishes","Développer les situations de finish","L'indice finishes est inférieur aux autres dimensions du profil.",[{"metric":"Indice finishes","value":finishes,"unit":"/100"},{"metric":"Meilleur finish","value":best_finish or None,"unit":""}],100-finishes,"development"))
            recommendations.append(_coach_item("finish_practice","Travailler des fins de legs variées","S'entraîner sur des situations de finish connues, sans attribuer de route préférée au joueur.",[{"metric":"Limite des données","value":"Aucune route déduite","unit":""}],74,"recommendation"))
        if progression_delta >= 2:
            strengths.append(_coach_item("progression","Dynamique positive","Les dernières journées disponibles sont supérieures aux premières.",[{"metric":"Progression récente","value":round(progression_delta,2),"unit":"pts"}],min(100,int(round(60+progression_delta*6))),"strength"))
        elif progression_delta <= -2:
            development.append(_coach_item("progression","Relancer la dynamique","La moyenne des dernières journées est inférieure à celle du début de période.",[{"metric":"Progression récente","value":round(progression_delta,2),"unit":"pts"}],min(100,int(round(60+abs(progression_delta)*6))),"development"))
        if no_score / max(1, legs_played) >= .08:
            development.append(_coach_item("no_score","Réduire les passages sans score","La fréquence des No Score observés mérite une attention spécifique.",[{"metric":"No Score","value":no_score,"unit":"observés"},{"metric":"Legs","value":legs_played,"unit":"joués"}],min(100,int(round(55+(no_score/max(1,legs_played))*250))),"development"))
        highlights=network.get("highlights") or {}; relationships=[]
        for rel_type,key,title in [("best_partner","best_partner","Association la plus performante"),("difficult_partner","difficult_partner","Association à surveiller"),("toughest_opponent","toughest_opponent","Adversaire le plus difficile")]:
            item=highlights.get(key)
            if item:
                relationships.append({"type":rel_type,"title":title,"player_id":item.get("player_id"),"name":item.get("name"),"relationship_index":item.get("relationship_index"),"wilson_lower_bound":item.get("wilson_lower_bound"),"legs_played":item.get("legs_played"),"message":f"{item.get('name')} est identifié à partir des relations réellement observées."})
        recent_wins=sum(1 for m in recent_matches[:5] if (_numeric(m.get("win_rate")) or 0)>=50)
        confidence=_coach_confidence(legs_played,len(trends),len(network.get("partners") or [])+len(network.get("opponents") or []))
        summary=f"{dashboard.get('player',{}).get('name')} présente un profil {dna.get('style',{}).get('label','analytique').lower()}, avec un indice de domination de {dna.get('dominance',{}).get('score',0)}/100 et un taux de victoire observé de {round(win_rate,1)} %."
        if strengths: summary += f" Le principal point fort identifié est : {strengths[0]['title'].lower()}."
        if development: summary += f" La priorité de progression est : {development[0]['title'].lower()}."
        return {"player":dashboard.get("player"),"season":dashboard.get("season"),"headline":{"title":"Coach IA explicable","style":dna.get("style"),"dominance":dna.get("dominance"),"recent_form":{"wins":recent_wins,"matches":min(5,len(recent_matches))}},"summary":summary,"strengths":sorted(strengths,key=lambda i:i["score"],reverse=True)[:4],"development_areas":sorted(development,key=lambda i:i["score"],reverse=True)[:4],"recommendations":sorted(recommendations,key=lambda i:i["score"],reverse=True)[:4],"relationships":relationships,"confidence":confidence,"meta":{"contract_version":"7.3","frontend_ready":True,"engine_type":"deterministic_explainable_coach","uses_external_llm":False,"data_sources":["dashboard","player_dna","player_network"],"no_invented_data":True,"limitations":["Aucune route de checkout n'est déduite.","Aucune précision aux doubles n'est calculée sans donnée source.","Les conseils sont des interprétations internes et non des statistiques officielles."],"nakka_note":NAKKA_DATA_NOTE}}

    def compare(self, left_player_id: str, right_player_id: str, season_id: str | None = None) -> dict[str, Any] | None:
        left=self.dashboard(left_player_id,season_id); right=self.dashboard(right_player_id,season_id)
        left_dna=self.dna(left_player_id,season_id); right_dna=self.dna(right_player_id,season_id)
        if not left or not right or not left_dna or not right_dna: return None
        lk, rk = left.get("kpis") or {}, right.get("kpis") or {}
        defs=[("average_3_darts","Moyenne 3 fléchettes",lk.get("average_3_darts"),rk.get("average_3_darts"),.3),("first_9","First 9",lk.get("first_9"),rk.get("first_9"),.3),("win_rate","Taux de victoire",lk.get("win_rate"),rk.get("win_rate"),.5),("legs_won","Legs gagnés",lk.get("legs_won"),rk.get("legs_won"),0),("best_finish","Meilleur finish",lk.get("best_finish"),rk.get("best_finish"),0)]
        metrics=[]; lw=rw=0
        for key,label,lv,rv,tol in defs:
            adv=_comparison_advantage(_numeric(lv),_numeric(rv),tol); lw+=adv=="left"; rw+=adv=="right"
            metrics.append({"key":key,"label":label,"left":lv,"right":rv,"advantage":adv})
        dims=[]
        for key in ["power","consistency","finishes","progression","volume","mastery"]:
            lv=int((left_dna.get("indices") or {}).get(key) or 0); rv=int((right_dna.get("indices") or {}).get(key) or 0)
            dims.append({"key":key,"left":lv,"right":rv,"advantage":_comparison_advantage(lv,rv,2)})
        ls=float(left_dna.get("dominance",{}).get("score") or 0)*.6+float(lk.get("win_rate") or 0)*.25+min(100,float(lk.get("average_3_darts") or 0)/70*100)*.15
        rs=float(right_dna.get("dominance",{}).get("score") or 0)*.6+float(rk.get("win_rate") or 0)*.25+min(100,float(rk.get("average_3_darts") or 0)/70*100)*.15
        prob=_comparison_probability(ls,rs); delta=prob["left"]-prob["right"]
        leader="left" if delta>0 else "right" if delta<0 else "tie"
        return {"left":{"player":left.get("player"),"kpis":lk,"dna":left_dna},"right":{"player":right.get("player"),"kpis":rk,"dna":right_dna},"metrics":metrics,"dna_dimensions":dims,"summary":{"leader":leader,"label":_comparison_label(delta),"left_metric_wins":lw,"right_metric_wins":rw,"ties":len(metrics)-lw-rw,"analytical_probability":prob},"meta":{"contract_version":"7.4","frontend_ready":True,"estimate_type":"internal_analytical","official_prediction":False,"no_invented_data":True,"nakka_note":NAKKA_DATA_NOTE}}

    def overview(self, season_id: str | None = None) -> list[dict[str, Any]]:
        season, rounds, _, _, legs, _ = self._scope(season_id)
        by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in self.data.stats:
            if str(row.get("leg_id")) in legs:
                by_player[str(row.get("player_id"))].append(row)

        daily_by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in self.data.daily_stats:
            if str(row.get("round_id")) in rounds:
                daily_by_player[str(row.get("player_id"))].append(row)

        result = []
        season_id_value = str(season.get("id")) if season else None
        canonical_ids = {
            self._canonical_id(str(player.get("id")))
            for player in self.data.players
            if player.get("id")
        }
        for canonical_id in sorted(canonical_ids):
            player = self._canonical_player(canonical_id)
            if player is None:
                continue
            member_ids = self._member_ids(canonical_id)
            identity = self._identity(player, season)
            rows = [
                row
                for member_id in member_ids
                for row in by_player.get(member_id, [])
            ]
            daily_rows = [
                row
                for member_id in member_ids
                for row in daily_by_player.get(member_id, [])
            ]
            profile = self._profile(canonical_id, season_id_value)
            kpis = self._aggregate(rows)
            if not rows and daily_rows:
                played = sum(int(r.get("legs_played") or 0) for r in daily_rows)
                won = sum(int(r.get("legs_won") or 0) for r in daily_rows)
                kpis.update({
                    "legs_played": played,
                    "legs_won": won,
                    "win_rate": round(won / played * 100, 1) if played else 0.0,
                    "average_3_darts": _weighted_metric(daily_rows, "average_3_darts"),
                    "first_9": _weighted_metric(daily_rows, "first_9"),
                    "best_finish": max((int(r.get("best_finish")) for r in daily_rows if r.get("best_finish")), default=None),
                })
            elif not rows and not daily_rows and profile:
                played = int(profile.get("legs_played") or 0)
                won = int(profile.get("legs_won") or 0)
                kpis.update({
                    "legs_played": played,
                    "legs_won": won,
                    "win_rate": round(won / played * 100, 1) if played else 0.0,
                    "average_3_darts": _numeric(profile.get("average_3_darts")),
                    "first_9": _numeric(profile.get("first_9")),
                    "best_finish": profile.get("best_finish"),
                })
            kpis["first_9"], _first_9_source = _first9_metric(
                rows,
                daily_rows,
                profile,
            )
            scoring = self._scoring(rows)
            elo = None
            if daily_rows:
                elo_rows = [r for r in daily_rows if r.get("elo_after") is not None]
                if elo_rows:
                    elo_rows.sort(key=lambda r: _round_number(self.round_by_id.get(str(r.get("round_id")), {}).get("code")))
                    elo = int(elo_rows[-1].get("elo_after"))
            if elo is None and profile and profile.get("elo") is not None:
                elo = int(profile.get("elo"))

            result.append({
                "player_id": canonical_id,
                "name": identity["name"],
                "team_id": identity["team_id"],
                "team": identity["team"] or "—",
                "season_id": season.get("id") if season else None,
                "legs_played": kpis["legs_played"],
                "legs_won": kpis["legs_won"],
                "win_rate": kpis["win_rate"],
                "average_3_darts": kpis["average_3_darts"],
                "first_9": kpis["first_9"],
                "best_finish": kpis["best_finish"],
                "elo": elo,
                "scores_180": scoring["scores_180"],
                "scores_170": scoring["scores_170_plus"],
                "scores_140": scoring["scores_140_plus"],
                "scores_100": scoring["scores_100_plus"],
                "finishes": sum(1 for r in rows if r.get("finish") not in (None, 0)),
                "nakka_note": NAKKA_DATA_NOTE,
                "identity_members": len(member_ids),
            })
        result.sort(key=lambda x: (-(x.get("average_3_darts") or 0), x["name"].lower(), x.get("team") or ""))
        return result
