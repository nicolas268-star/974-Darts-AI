from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import re
from typing import Any

from supabase import Client

from app.services.player_statistics_engine import PlayerStatisticsEngine
from app.services.ranking_service import build_ranking
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


def _rows(response: Any) -> list[dict[str, Any]]:
    return list(getattr(response, "data", None) or [])


def _season_year(value: Any) -> int | None:
    match = re.search(r"(20\d{2})", str(value or ""))
    return int(match.group(1)) if match else None


class CompetitionHubService:
    """Read-only hub for official seasons and friendly tournaments."""

    def __init__(self, db: Client):
        self.db = db

    def _seasons_and_rounds(
        self,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        seasons = _rows(
            self.db.table("seasons")
            .select("id,name,is_active")
            .execute()
        )
        rounds = _rows(
            self.db.table("rounds")
            .select("id,season_id,code,published,played_on")
            .execute()
        )
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

        anchor_year = (
            active_year
            or max(actual_by_year, default=current_year)
        )
        first_year = min(
            min(actual_by_year, default=anchor_year),
            anchor_year,
        )
        last_year = max(
            max(actual_by_year, default=anchor_year),
            anchor_year + 2,
        )

        cards: list[dict[str, Any]] = []
        for year in range(first_year, last_year + 1):
            season = actual_by_year.get(year)
            season_id = str(season.get("id")) if season else None
            rounds_total = round_count.get(season_id or "", 0)
            published = published_count.get(season_id or "", 0)
            if season and season.get("is_active"):
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
                "is_active": bool(
                    season and season.get("is_active")
                ),
                "status": status,
                "rounds": rounds_total,
                "published_rounds": published,
                "has_data": rounds_total > 0,
                "href": f"/championships/{year}",
            })
        cards.sort(key=lambda item: item["year"])
        return cards

    @staticmethod
    def _tournament_cards() -> list[dict[str, Any]]:
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
                "season": (
                    tournament.get("season")
                    if tournament
                    else None
                ),
                "status": "AVAILABLE" if tournament else "WAITING_DATA",
                "summary": summary,
                "href": f"/tournaments/{code.lower()}",
            })
        return cards

    def catalog(self) -> dict[str, Any]:
        seasons = self._season_cards()
        tournaments = self._tournament_cards()
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
                "tournaments_affect_official_ranking": False,
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
                "rules": None,
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
                    "Cette saison est préparée dans la navigation. "
                    "Elle sera alimentée dès sa création et son premier import."
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
    def tournaments() -> dict[str, Any]:
        return {
            "contract_version": "14.1",
            "tournaments": CompetitionHubService._tournament_cards(),
            "official_separation": True,
        }

    @staticmethod
    def tournament(code: str) -> dict[str, Any] | None:
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
                **tournament,
            }
            payload["round_robin"] = build_tournament_round_robins(payload)
            return payload
        return {
            "contract_version": "16.0.3",
            "official_separation": True,
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
