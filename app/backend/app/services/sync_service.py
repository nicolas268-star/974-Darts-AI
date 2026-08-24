from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

import pandas as pd

from app.parser import ParsedWorkbook, number, text


MATCH_KEY_COLUMNS: tuple[str, ...] = (
    "Saison",
    "Jour",
    "Rencontre",
    "Match Nakka",
    "Match",
    "S/D",
)

LEG_KEY_COLUMNS: tuple[str, ...] = MATCH_KEY_COLUMNS + ("Leg",)

PLAYER_LEG_KEY_COLUMNS: tuple[str, ...] = LEG_KEY_COLUMNS + (
    "Team",
    "Joueur",
)


@dataclass(frozen=True)
class SyncConflict:
    """Différence détectée entre une donnée publiée et le nouvel export."""

    entity: str
    natural_key: str
    changed_fields: dict[str, dict[str, Any]]

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "entity": self.entity,
            "naturalKey": self.natural_key,
            "changedFields": self.changed_fields,
        }


@dataclass
class EntitySyncSummary:
    """Résumé incrémental pour une famille d'entités."""

    total_in_file: int = 0
    new: int = 0
    unchanged: int = 0
    conflicts: int = 0

    def to_api_dict(self) -> dict[str, int]:
        return {
            "totalInFile": self.total_in_file,
            "new": self.new,
            "unchanged": self.unchanged,
            "conflicts": self.conflicts,
        }


@dataclass
class SyncPreview:
    """
    Aperçu avant publication.

    Aucun enregistrement n'est écrit ni supprimé par ce moteur.
    Les conflits doivent être revus avant toute synchronisation.
    """

    filename: str
    seasons: list[str]
    rounds_in_file: list[str]
    new_rounds: list[str]
    existing_rounds: list[str]
    encounters: EntitySyncSummary
    matches: EntitySyncSummary
    legs: EntitySyncSummary
    player_leg_rows: EntitySyncSummary
    conflicts: list[SyncConflict] = field(default_factory=list)

    @property
    def total_new(self) -> int:
        return sum(
            summary.new
            for summary in (
                self.encounters,
                self.matches,
                self.legs,
                self.player_leg_rows,
            )
        )

    @property
    def total_unchanged(self) -> int:
        return sum(
            summary.unchanged
            for summary in (
                self.encounters,
                self.matches,
                self.legs,
                self.player_leg_rows,
            )
        )

    @property
    def total_conflicts(self) -> int:
        return len(self.conflicts)

    @property
    def can_publish(self) -> bool:
        return self.total_conflicts == 0

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "seasons": self.seasons,
            "roundsInFile": self.rounds_in_file,
            "newRounds": self.new_rounds,
            "existingRounds": self.existing_rounds,
            "encounters": self.encounters.to_api_dict(),
            "matches": self.matches.to_api_dict(),
            "legs": self.legs.to_api_dict(),
            "playerLegRows": self.player_leg_rows.to_api_dict(),
            "totalNew": self.total_new,
            "totalUnchanged": self.total_unchanged,
            "totalConflicts": self.total_conflicts,
            "canPublish": self.can_publish,
            "conflicts": [item.to_api_dict() for item in self.conflicts],
        }


@dataclass
class PublishedSnapshot:
    """
    État publié minimal nécessaire à la comparaison.

    Les clés sont les natural keys métier. Les valeurs sont des payloads
    normalisés, généralement construits depuis Supabase dans le lot suivant.
    """

    rounds: set[tuple[str, str]] = field(default_factory=set)
    encounters: dict[str, dict[str, Any]] = field(default_factory=dict)
    matches: dict[str, dict[str, Any]] = field(default_factory=dict)
    legs: dict[str, dict[str, Any]] = field(default_factory=dict)
    player_leg_rows: dict[str, dict[str, Any]] = field(default_factory=dict)


def _clean_number(value: Any, integer: bool = False) -> int | float | None:
    parsed = number(value)
    if parsed is None:
        return None
    return int(parsed) if integer else round(float(parsed), 6)


def _key(row: pd.Series, columns: Iterable[str]) -> str:
    return "|".join(text(row.get(column)) for column in columns)


def _normalized_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.items()
        if value is not None and value != ""
    }


def _changed_fields(
    current: dict[str, Any],
    desired: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    changed: dict[str, dict[str, Any]] = {}
    keys = set(current) | set(desired)

    for key in sorted(keys):
        current_value = current.get(key)
        desired_value = desired.get(key)
        if current_value != desired_value:
            changed[key] = {
                "published": current_value,
                "incoming": desired_value,
            }

    return changed


def _compare_entity(
    entity: str,
    desired: dict[str, dict[str, Any]],
    published: dict[str, dict[str, Any]],
) -> tuple[EntitySyncSummary, list[SyncConflict]]:
    summary = EntitySyncSummary(total_in_file=len(desired))
    conflicts: list[SyncConflict] = []

    for natural_key, desired_payload in desired.items():
        current_payload = published.get(natural_key)

        if current_payload is None:
            summary.new += 1
            continue

        changes = _changed_fields(
            _normalized_payload(current_payload),
            _normalized_payload(desired_payload),
        )

        if changes:
            summary.conflicts += 1
            conflicts.append(
                SyncConflict(
                    entity=entity,
                    natural_key=natural_key,
                    changed_fields=changes,
                )
            )
        else:
            summary.unchanged += 1

    return summary, conflicts


def build_incoming_snapshot(parsed: ParsedWorkbook) -> PublishedSnapshot:
    """
    Transforme l'export Nakka en snapshot métier déterministe.

    Cette représentation reprend les natural keys déjà utilisées par
    ``Publisher``. Elle ne dépend d'aucun identifiant UUID Supabase.
    """

    dataframe = parsed.dataframe
    snapshot = PublishedSnapshot()

    if dataframe.empty:
        return snapshot

    # Journées
    for _, row in dataframe.iterrows():
        season = text(row.get("Saison"))
        round_code = text(row.get("Jour"))
        if season and round_code:
            snapshot.rounds.add((season, round_code))

    # Rencontres
    encounter_groups = dataframe.groupby(
        ["Saison", "Jour", "Rencontre"],
        dropna=False,
    )
    for (season, round_code, encounter_name), group in encounter_groups:
        season_name = text(season)
        round_name = text(round_code)
        name = text(encounter_name)
        natural_key = f"{season_name}|{round_name}|{name}"
        teams = sorted({text(value) for value in group["Team"] if text(value)})

        snapshot.encounters[natural_key] = {
            "season": season_name,
            "round": round_name,
            "name": name,
            "homeTeam": teams[0] if teams else None,
            "awayTeam": teams[1] if len(teams) > 1 else None,
        }

    # Matchs
    for keys, group in dataframe.groupby(list(MATCH_KEY_COLUMNS), dropna=False):
        season, round_code, encounter, nakka, match_no, mode = map(text, keys)
        natural_key = "|".join(
            [season, round_code, encounter, nakka, match_no, mode]
        )
        teams = sorted({text(value) for value in group["Team"] if text(value)})

        snapshot.matches[natural_key] = {
            "season": season,
            "round": round_code,
            "encounter": encounter,
            "nakkaMatchNumber": _clean_number(nakka, True),
            "matchNumber": _clean_number(match_no, True),
            "mode": mode,
            "team1": teams[0] if teams else None,
            "team2": teams[1] if len(teams) > 1 else None,
        }

    # Legs
    for keys, group in dataframe.groupby(list(LEG_KEY_COLUMNS), dropna=False):
        season, round_code, encounter, nakka, match_no, mode, leg_no = map(
            text,
            keys,
        )
        match_key = "|".join(
            [season, round_code, encounter, nakka, match_no, mode]
        )
        natural_key = f"{match_key}|{leg_no}"

        scores: dict[str, float] = {}
        for _, source in group.iterrows():
            team = text(source.get("Team"))
            scores[team] = scores.get(team, 0.0) + (
                number(source.get("Score")) or 0.0
            )

        winners = [
            team
            for team, total in scores.items()
            if round(total) == 501
        ]
        winning_team = winners[0] if len(winners) == 1 else None

        snapshot.legs[natural_key] = {
            "matchNaturalKey": match_key,
            "legNumber": _clean_number(leg_no, True),
            "winnerTeam": winning_team,
            "status": "VALID" if winning_team else "AMBIGUOUS",
        }

        for _, source in group.iterrows():
            team = text(source.get("Team"))
            player = text(source.get("Joueur"))
            player_key = f"{natural_key}|{team}|{player}"

            snapshot.player_leg_rows[player_key] = {
                "legNaturalKey": natural_key,
                "team": team,
                "player": player,
                "score": _clean_number(source.get("Score"), True),
                "dartsThrown": _clean_number(
                    source.get("fleches lancees"),
                    True,
                ),
                "average3Darts": _clean_number(
                    source.get("Average 3 Darts")
                ),
                "first9": _clean_number(
                    source.get("First 9 Average")
                ),
                "finish": _clean_number(source.get("Finish"), True),
                "scores180": _clean_number(source.get("180+"), True) or 0,
                "scores170": _clean_number(source.get("170+"), True) or 0,
                "scores140": _clean_number(source.get("140+"), True) or 0,
                "scores100": _clean_number(source.get("100+"), True) or 0,
                "scores80": _clean_number(source.get("80+"), True) or 0,
                "noScore": _clean_number(source.get("No Score"), True) or 0,
                "legWon": team == winning_team,
            }

    return snapshot


def compare_with_published(
    parsed: ParsedWorkbook,
    published: PublishedSnapshot,
) -> SyncPreview:
    """Compare l'export entrant avec un snapshot déjà publié."""

    incoming = build_incoming_snapshot(parsed)

    encounter_summary, encounter_conflicts = _compare_entity(
        "encounter",
        incoming.encounters,
        published.encounters,
    )
    match_summary, match_conflicts = _compare_entity(
        "match",
        incoming.matches,
        published.matches,
    )
    leg_summary, leg_conflicts = _compare_entity(
        "leg",
        incoming.legs,
        published.legs,
    )
    player_leg_summary, player_leg_conflicts = _compare_entity(
        "player_leg",
        incoming.player_leg_rows,
        published.player_leg_rows,
    )

    rounds_in_file = sorted(
        f"{season}:{round_code}"
        for season, round_code in incoming.rounds
    )
    new_rounds = sorted(
        f"{season}:{round_code}"
        for season, round_code in incoming.rounds - published.rounds
    )
    existing_rounds = sorted(
        f"{season}:{round_code}"
        for season, round_code in incoming.rounds & published.rounds
    )

    return SyncPreview(
        filename=parsed.filename,
        seasons=(
            parsed.analysis.get("seasons", [])
            if isinstance(parsed.analysis, dict)
            else list(getattr(parsed.analysis, "seasons", []))
        ),
        rounds_in_file=rounds_in_file,
        new_rounds=new_rounds,
        existing_rounds=existing_rounds,
        encounters=encounter_summary,
        matches=match_summary,
        legs=leg_summary,
        player_leg_rows=player_leg_summary,
        conflicts=[
            *encounter_conflicts,
            *match_conflicts,
            *leg_conflicts,
            *player_leg_conflicts,
        ],
    )


__all__ = [
    "EntitySyncSummary",
    "PublishedSnapshot",
    "SyncConflict",
    "SyncPreview",
    "build_incoming_snapshot",
    "compare_with_published",
]
