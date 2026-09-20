from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import re
from typing import Any

from supabase import Client

from app.services.player_statistics_engine import PlayerStatisticsEngine
from app.services.ranking_service import build_ranking, _rules_for_season_name
from app.services.season_registry_service import public_seasons
from app.services.control_catalog import (
    OFFICIAL_2026_FIXTURES,
    OFFICIAL_2026_SOURCE_URL,
)
from app.services.tournament_workbook_service import (
    TOURNAMENT_CODES,
    available_tournament_codes,
    load_tournament_cache,
)
from app.services.tournament_round_robin import build_tournament_round_robins
from app.services.player_identity_service import normalize_alias


COMMITTEE_RECOGNIZED_TOURNAMENTS: dict[str, dict[str, Any]] = {
    "T5": {
        "classification": "COMMITTEE_RECOGNIZED",
        "classification_label": "Open de club reconnu",
        "affects_committee_ranking": True,
        "committee_event_key": "club-open-kaz-2026-09-13",
        "ranking_status": "PUBLISHED",
    },
}


def _tournament_classification(code: str) -> dict[str, Any]:
    return COMMITTEE_RECOGNIZED_TOURNAMENTS.get(
        code.upper(),
        {
            "classification": "FRIENDLY",
            "classification_label": "Tournoi amical",
            "affects_committee_ranking": False,
            "committee_event_key": None,
            "ranking_status": "NOT_APPLICABLE",
        },
    )


def _rows(response: Any) -> list[dict[str, Any]]:
    return list(getattr(response, "data", None) or [])


def _season_year(value: Any) -> int | None:
    years = re.findall(r"20\d{2}", str(value or ""))
    if not years:
        return None
    # Une saison sportive 2026-2027 est présentée sous son année de fin : 2027.
    return int(years[-1])


def _canonical_display_aliases(
    db: Client | None,
    names: list[str],
) -> dict[str, str]:
    if db is None:
        return {}
    normalized_to_raw: dict[str, list[str]] = defaultdict(list)
    for name in names:
        normalized = normalize_alias(name)
        if normalized:
            normalized_to_raw[normalized].append(name)
    if not normalized_to_raw:
        return {}

    aliases = _rows(
        db.table("player_aliases")
        .select("identity_id,normalized_alias")
        .in_("normalized_alias", sorted(normalized_to_raw))
        .eq("confirmed", True)
        .execute()
    )
    identity_ids = sorted({str(row["identity_id"]) for row in aliases if row.get("identity_id")})
    identities = {}
    if identity_ids:
        identities = {
            str(row["id"]): str(row["canonical_display_name"])
            for row in _rows(
                db.table("player_identities")
                .select("id,canonical_display_name,status")
                .in_("id", identity_ids)
                .eq("status", "ACTIVE")
                .execute()
            )
        }

    canonical_by_normalized: dict[str, set[str]] = defaultdict(set)
    for alias in aliases:
        canonical = identities.get(str(alias.get("identity_id") or ""))
        normalized = str(alias.get("normalized_alias") or "")
        if canonical and normalized:
            canonical_by_normalized[normalized].add(canonical)

    return {
        raw_name: next(iter(canonical_names))
        for normalized, raw_names in normalized_to_raw.items()
        if len(canonical_names := canonical_by_normalized.get(normalized, set())) == 1
        for raw_name in raw_names
    }


class CompetitionHubService:
    """Read-only hub for official seasons and friendly tournaments."""

    def __init__(self, db: Client):
        self.db = db

    def _seasons_and_rounds(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        # Un environnement de prévisualisation peut ne contenir que le
        # registre officiel des licenciés. Le catalogue doit alors rester
        # disponible à partir du registre de saisons embarqué, sans transformer
        # l'absence des tables statistiques en erreur HTTP 500.
        try:
            seasons = _rows(
                self.db.table("seasons")
                .select("id,name,is_active")
                .execute()
            )
        except Exception:
            seasons = []
        try:
            rounds = _rows(
                self.db.table("rounds")
                .select("id,season_id,code,published,played_on")
                .execute()
            )
        except Exception:
            rounds = []
        return seasons, rounds

    def _season_cards(self) -> list[dict[str, Any]]:
        seasons, rounds = self._seasons_and_rounds()
        round_count: dict[str, int] = defaultdict(int)
        published_count: dict[str, int] = defaultdict(int)
        for round_row in rounds:
            code = str(round_row.get("code") or "").upper()
            if code in TOURNAMENT_CODES:
                continue
            season_id = str(round_row.get("season_id"))
            round_count[season_id] += 1
            if round_row.get("published"):
                published_count[season_id] += 1

        actual_by_year: dict[int, dict[str, Any]] = {}
        active_year = None
        current_year = datetime.now(timezone.utc).year
        for season in seasons:
            year = _season_year(season.get("name"))
            if year is None and season.get("is_active"):
                year = current_year
            if year is None:
                continue

            # Plusieurs lignes peuvent représenter la même année. C'est le
            # cas du projet 974 Darts avec la vraie saison active "2026" et
            # une saison préparatoire vide "Championnat 2026". Le Hub doit
            # choisir la saison active, puis celle qui possède le plus de
            # journées publiées, exactement comme le classement principal.
            existing = actual_by_year.get(year)
            season_id = str(season.get("id") or "")
            candidate_priority = (
                1 if season.get("is_active") else 0,
                published_count.get(season_id, 0),
                round_count.get(season_id, 0),
            )
            if existing is None:
                actual_by_year[year] = season
            else:
                existing_id = str(existing.get("id") or "")
                existing_priority = (
                    1 if existing.get("is_active") else 0,
                    published_count.get(existing_id, 0),
                    round_count.get(existing_id, 0),
                )
                if candidate_priority > existing_priority:
                    actual_by_year[year] = season

            if season.get("is_active"):
                active_year = year

        registry = public_seasons()
        registry_seasons = registry.get("seasons") or []
        registry_years = {
            year
            for item in registry_seasons
            if (year := _season_year(item.get("key") or item.get("label")))
            is not None
        }
        registry_active_year = _season_year(registry.get("defaultSeason"))
        if registry_active_year is not None:
            active_year = max(active_year or registry_active_year, registry_active_year)

        anchor_year = (
            active_year
            or max(actual_by_year, default=current_year)
        )
        first_year = min(
            min(actual_by_year, default=anchor_year),
            min(registry_years, default=anchor_year),
            anchor_year,
        )
        last_year = max(
            max(actual_by_year, default=anchor_year),
            max(registry_years, default=anchor_year),
            anchor_year + 2,
        )

        cards: list[dict[str, Any]] = []
        for year in range(first_year, last_year + 1):
            season = actual_by_year.get(year)
            season_id = str(season.get("id")) if season else None
            rounds_total = round_count.get(season_id or "", 0)
            published = published_count.get(season_id or "", 0)
            card_is_active = year == active_year
            if card_is_active:
                status = "ACTIVE"
            elif season and rounds_total > 0:
                status = "ARCHIVED" if year < anchor_year else "AVAILABLE"
            elif year < anchor_year:
                status = "ARCHIVED"
            else:
                status = "PLANNED"
            cards.append({
                "id": season_id,
                "slug": str(year),
                "name": str(
                    season.get("name")
                    if season
                    else year
                ),
                "year": year,
                "is_active": card_is_active,
                "status": status,
                "rounds": rounds_total,
                "published_rounds": published,
                "has_data": rounds_total > 0,
                "href": f"/championships/{year}",
            })
        cards.sort(key=lambda item: item["year"])
        return cards

    @staticmethod
    def _tournament_cards(db: Client | None = None) -> list[dict[str, Any]]:
        cache = load_tournament_cache()
        available = {
            str(item.get("code") or "").upper(): item
            for item in cache.get("tournaments") or []
        }
        cards = []
        codes = available_tournament_codes(cache)
        for code in sorted(
            codes,
            key=lambda value: int(value[1:]),
            reverse=True,
        ):
            tournament = available.get(code)
            summary = (
                tournament.get("summary")
                if tournament
                else {
                    "source_rows": 0,
                    "matches": 0,
                    "legs": 0,
                    "pool_matches": 0,
                    "knockout_matches": 0,
                    "tracked_players": 0,
                    "tracked_duos": 0,
                    "complete_results": 0,
                }
            )
            cards.append({
                **_tournament_classification(code),
                "code": code,
                "name": (
                    tournament.get("name")
                    if tournament
                    else "Date à renseigner"
                ),
                "date": (
                    tournament.get("date")
                    if tournament
                    else None
                ),
                "date_label": (
                    tournament.get("date_label")
                    if tournament
                    else None
                ),
                "event_name": (
                    tournament.get("event_name")
                    if tournament
                    else f"Tournoi amical {code}"
                ),
                "format": tournament.get("format") if tournament else None,
                "format_label": (
                    tournament.get("format_label") if tournament else None
                ),
                "winner": tournament.get("winner") if tournament else None,
                "runner_up": (
                    tournament.get("runner_up") if tournament else None
                ),
                "season": (
                    tournament.get("season")
                    if tournament
                    else None
                ),
                "status": "AVAILABLE" if tournament else "WAITING_DATA",
                "summary": summary,
                "href": f"/tournaments/{code.lower()}",
            })
        aliases = _canonical_display_aliases(
            db,
            [
                str(name)
                for card in cards
                for name in (card.get("winner"), card.get("runner_up"))
                if name
            ],
        )
        for card in cards:
            if card.get("winner"):
                card["winner"] = aliases.get(str(card["winner"]), card["winner"])
            if card.get("runner_up"):
                card["runner_up"] = aliases.get(str(card["runner_up"]), card["runner_up"])
        return cards

    def catalog(self) -> dict[str, Any]:
        seasons = self._season_cards()
        tournaments = self._tournament_cards(self.db)
        active = next(
            (item for item in seasons if item["is_active"]),
            None,
        )
        return {
            "contract_version": "14.1",
            "title": "Compétitions 974 Darts",
            "active_championship": active,
            "championships": seasons,
            "tournaments": tournaments,
            "principles": {
                "official_separation": True,
                "friendly_tournaments_affect_official_ranking": False,
                "recognized_events_may_affect_committee_ranking": True,
                "tournaments_affect_official_elo": False,
                "player_identity_shared": True,
            },
        }

    def championship(
        self,
        season_ref: str,
    ) -> dict[str, Any] | None:
        cards = self._season_cards()
        card = next(
            (
                item
                for item in cards
                if item["slug"] == season_ref
                or item.get("id") == season_ref
            ),
            None,
        )
        if card is None:
            return None
        official_schedule = (
            [
                {
                    "round": fixture.round_code,
                    "played_on": fixture.played_on,
                    "home": fixture.home_team,
                    "away": fixture.away_team,
                    "nakka_event_id": fixture.event_id,
                }
                for fixture in OFFICIAL_2026_FIXTURES
            ]
            if card.get("year") == 2026
            else []
        )
        if card.get("id") is None:
            return {
                "contract_version": "14.1",
                "championship": card,
                "season": None,
                "rules": (
                    _rules_for_season_name("2026-2027")
                    if card.get("year") == 2027
                    else None
                ),
                "summary": {
                    "rounds": 0,
                    "teams": 0,
                    "encounters": 0,
                    "valid_legs": 0,
                    "players": 0,
                },
                "standings": [],
                "leaders": [],
                "schedule": official_schedule,
                "schedule_source": (
                    OFFICIAL_2026_SOURCE_URL if official_schedule else None
                ),
                "status_message": (
                    "Cette saison est prête. Les premiers résultats officiels "
                    "seront affichés dès leur publication."
                ),
            }

        ranking = build_ranking(self.db, str(card["id"]))
        players = PlayerStatisticsEngine.from_db(
            self.db
        ).overview(str(card["id"]))
        ranked_players = [
            player
            for player in players
            if int(player.get("legs_played") or 0) > 0
        ]
        ranked_players.sort(
            key=lambda item: (
                -float(item.get("average_3_darts") or 0),
                str(item.get("name") or "").lower(),
            )
        )
        summary = dict(ranking.get("summary") or {})
        summary["players"] = len(ranked_players)
        return {
            "contract_version": "14.1",
            "championship": card,
            "season": ranking.get("season"),
            "rules": ranking.get("rules"),
            "summary": summary,
            "standings": ranking.get("standings") or [],
            "leaders": ranked_players[:10],
            "schedule": official_schedule,
            "schedule_source": (
                OFFICIAL_2026_SOURCE_URL if official_schedule else None
            ),
            "ranking_source": ranking.get("ranking_source"),
            "data_quality_notes": (
                ranking.get("data_quality_notes") or []
            ),
            "status_message": None,
        }

    @staticmethod
    def tournaments(db: Client | None = None) -> dict[str, Any]:
        return {
            "contract_version": "14.1",
            "tournaments": CompetitionHubService._tournament_cards(db),
            "official_separation": True,
        }

    @staticmethod
    def tournament(code: str, db: Client | None = None) -> dict[str, Any] | None:
        normalized = code.upper()
        cache = load_tournament_cache()
        if normalized not in available_tournament_codes(cache):
            return None
        tournament = next(
            (
                item
                for item in cache.get("tournaments") or []
                if str(item.get("code") or "").upper() == normalized
            ),
            None,
        )
        if tournament:
            payload = {
                "contract_version": "16.0.3",
                "official_separation": True,
                **_tournament_classification(normalized),
                **tournament,
            }
            names = [
                str(value)
                for match in payload.get("matches") or []
                for value in (match.get("home"), match.get("away"), match.get("winner"))
                if value
            ]
            names.extend(
                str(player.get("name"))
                for player in payload.get("players") or []
                if player.get("name")
            )
            payload["display_aliases"] = {
                **(payload.get("display_aliases") or {}),
                **_canonical_display_aliases(db, names),
            }
            payload["round_robin"] = build_tournament_round_robins(payload)
            return payload
        return {
            "contract_version": "16.0.3",
            "official_separation": True,
            **_tournament_classification(normalized),
            "code": normalized,
            "name": f"Tournoi amical {normalized}",
            "date": None,
            "date_label": None,
            "event_name": f"Tournoi amical {normalized}",
            "season": None,
            "status": "WAITING_DATA",
            "summary": {
                "source_rows": 0,
                "matches": 0,
                "legs": 0,
                "pool_matches": 0,
                "knockout_matches": 0,
                "tracked_players": 0,
                "tracked_duos": 0,
                "complete_results": 0,
            },
            "matches": [],
            "pools": [],
            "bracket": [],
            "round_robin": [],
            "players": [],
            "duos": [],
            "data_quality_notes": [
                (
                    "Aucune ligne correspondante n'a été trouvée dans "
                    "le dernier classeur synchronisé."
                )
            ],
        }
