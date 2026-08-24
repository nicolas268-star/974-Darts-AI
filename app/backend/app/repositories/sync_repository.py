from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from supabase import Client

from app.services.sync_service import PublishedSnapshot


DEFAULT_PAGE_SIZE = 1000


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _number(value: Any, integer: bool = False) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return int(parsed) if integer else round(parsed, 6)


def _fetch_all(
    db: Client,
    table: str,
    columns: str,
    *,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> list[dict[str, Any]]:
    """Charge une table Supabase avec pagination PostgREST."""

    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        response = (
            db.table(table)
            .select(columns)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)

        if len(page) < page_size:
            break

        offset += page_size

    return rows


@dataclass(frozen=True)
class PublishedRows:
    """Enregistrements nécessaires à la reconstruction du snapshot publié."""

    seasons: list[dict[str, Any]]
    rounds: list[dict[str, Any]]
    teams: list[dict[str, Any]]
    players: list[dict[str, Any]]
    encounters: list[dict[str, Any]]
    matches: list[dict[str, Any]]
    legs: list[dict[str, Any]]
    player_leg_stats: list[dict[str, Any]]


def build_published_snapshot(rows: PublishedRows) -> PublishedSnapshot:
    """
    Reconstruit les natural keys métier depuis les lignes Supabase.

    Cette fonction est pure et ne réalise aucun appel réseau.
    """

    snapshot = PublishedSnapshot()

    season_names = {
        _text(row.get("id")): _text(row.get("name"))
        for row in rows.seasons
    }
    round_refs = {
        _text(row.get("id")): (
            season_names.get(_text(row.get("season_id")), ""),
            _text(row.get("code")),
        )
        for row in rows.rounds
    }
    team_names = {
        _text(row.get("id")): _text(row.get("name"))
        for row in rows.teams
    }
    player_names = {
        _text(row.get("id")): _text(row.get("display_name"))
        for row in rows.players
    }

    for season_name, round_code in round_refs.values():
        if season_name and round_code:
            snapshot.rounds.add((season_name, round_code))

    encounter_keys: dict[str, str] = {}
    for row in rows.encounters:
        encounter_id = _text(row.get("id"))
        natural_key = _text(row.get("natural_key"))
        round_id = _text(row.get("round_id"))
        season_name, round_code = round_refs.get(round_id, ("", ""))

        if not natural_key:
            natural_key = "|".join(
                [season_name, round_code, _text(row.get("name"))]
            )

        encounter_keys[encounter_id] = natural_key
        snapshot.encounters[natural_key] = {
            "season": season_name,
            "round": round_code,
            "name": _text(row.get("name")),
            "homeTeam": team_names.get(
                _text(row.get("home_team_id"))
            ) or None,
            "awayTeam": team_names.get(
                _text(row.get("away_team_id"))
            ) or None,
        }

    match_keys: dict[str, str] = {}
    for row in rows.matches:
        match_id = _text(row.get("id"))
        natural_key = _text(row.get("natural_key"))
        encounter_key = encounter_keys.get(
            _text(row.get("encounter_id")),
            "",
        )
        encounter_parts = encounter_key.split("|", 2)
        season_name = encounter_parts[0] if len(encounter_parts) > 0 else ""
        round_code = encounter_parts[1] if len(encounter_parts) > 1 else ""
        encounter_name = encounter_parts[2] if len(encounter_parts) > 2 else ""

        if not natural_key:
            natural_key = "|".join(
                [
                    season_name,
                    round_code,
                    encounter_name,
                    _text(row.get("nakka_match_number")),
                    _text(row.get("match_number")),
                    _text(row.get("mode")),
                ]
            )

        match_keys[match_id] = natural_key
        snapshot.matches[natural_key] = {
            "season": season_name,
            "round": round_code,
            "encounter": encounter_name,
            "nakkaMatchNumber": _number(
                row.get("nakka_match_number"),
                True,
            ),
            "matchNumber": _number(row.get("match_number"), True),
            "mode": _text(row.get("mode")),
            "team1": team_names.get(_text(row.get("team_1_id"))) or None,
            "team2": team_names.get(_text(row.get("team_2_id"))) or None,
        }

    leg_keys: dict[str, str] = {}
    for row in rows.legs:
        leg_id = _text(row.get("id"))
        natural_key = _text(row.get("natural_key"))
        match_key = match_keys.get(_text(row.get("match_id")), "")

        if not natural_key:
            natural_key = (
                f"{match_key}|{_text(row.get('leg_number'))}"
            )

        leg_keys[leg_id] = natural_key
        snapshot.legs[natural_key] = {
            "matchNaturalKey": match_key,
            "legNumber": _number(row.get("leg_number"), True),
            "winnerTeam": team_names.get(
                _text(row.get("winner_team_id"))
            ) or None,
            "status": _text(row.get("status")),
        }

    for row in rows.player_leg_stats:
        leg_key = leg_keys.get(_text(row.get("leg_id")), "")
        team_name = team_names.get(_text(row.get("team_id")), "")
        player_name = player_names.get(_text(row.get("player_id")), "")

        if not leg_key or not team_name or not player_name:
            # Une référence incomplète ne doit pas créer une fausse clé.
            continue

        natural_key = f"{leg_key}|{team_name}|{player_name}"
        snapshot.player_leg_rows[natural_key] = {
            "legNaturalKey": leg_key,
            "team": team_name,
            "player": player_name,
            "score": _number(row.get("score"), True),
            "dartsThrown": _number(row.get("darts_thrown"), True),
            "average3Darts": _number(row.get("average_3_darts")),
            "first9": _number(row.get("first_9")),
            "finish": _number(row.get("finish"), True),
            "scores180": _number(row.get("scores_180"), True) or 0,
            "scores170": _number(row.get("scores_170"), True) or 0,
            "scores140": _number(row.get("scores_140"), True) or 0,
            "scores100": _number(row.get("scores_100"), True) or 0,
            "scores80": _number(row.get("scores_80"), True) or 0,
            "noScore": _number(row.get("no_score"), True) or 0,
            "legWon": bool(row.get("leg_won")),
        }

    return snapshot


class SyncRepository:
    """Charge l'état publié actuel depuis Supabase."""

    def __init__(
        self,
        db: Client,
        *,
        page_size: int = DEFAULT_PAGE_SIZE,
    ):
        self.db = db
        self.page_size = page_size

    def load_rows(self) -> PublishedRows:
        return PublishedRows(
            seasons=_fetch_all(
                self.db,
                "seasons",
                "id,name",
                page_size=self.page_size,
            ),
            rounds=_fetch_all(
                self.db,
                "rounds",
                "id,season_id,code,published",
                page_size=self.page_size,
            ),
            teams=_fetch_all(
                self.db,
                "teams",
                "id,name",
                page_size=self.page_size,
            ),
            players=_fetch_all(
                self.db,
                "players",
                "id,display_name,team_id",
                page_size=self.page_size,
            ),
            encounters=_fetch_all(
                self.db,
                "encounters",
                (
                    "id,round_id,natural_key,name,"
                    "home_team_id,away_team_id"
                ),
                page_size=self.page_size,
            ),
            matches=_fetch_all(
                self.db,
                "matches",
                (
                    "id,encounter_id,natural_key,match_number,"
                    "nakka_match_number,mode,team_1_id,team_2_id"
                ),
                page_size=self.page_size,
            ),
            legs=_fetch_all(
                self.db,
                "legs",
                (
                    "id,match_id,natural_key,leg_number,"
                    "winner_team_id,status"
                ),
                page_size=self.page_size,
            ),
            player_leg_stats=_fetch_all(
                self.db,
                "player_leg_stats",
                (
                    "leg_id,player_id,team_id,score,darts_thrown,"
                    "average_3_darts,first_9,finish,scores_180,"
                    "scores_170,scores_140,scores_100,scores_80,"
                    "no_score,leg_won"
                ),
                page_size=self.page_size,
            ),
        )

    def load_snapshot(self) -> PublishedSnapshot:
        return build_published_snapshot(self.load_rows())


__all__ = [
    "PublishedRows",
    "SyncRepository",
    "build_published_snapshot",
]
