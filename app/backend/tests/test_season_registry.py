import sys
import types
from unittest.mock import patch

if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.Client = object
    sys.modules["supabase"] = supabase_stub

from app.services.competition_hub_service import (
    CompetitionHubService,
    _tournament_classification,
)
from app.services.season_registry_service import _empty, _event_date


class MissingStatisticsDatabase:
    def table(self, _name: str):
        raise RuntimeError("table absente de la prévisualisation")

def test_new_season_is_registered_without_replacing_2026():
    state = _empty()
    assert [item["key"] for item in state["seasons"]] == ["2026", "2026-2027"]
    assert state["seasons"][0]["nakkaLeagueId"] == "lg_QqGB_7154"
    assert state["seasons"][1]["nakkaLeagueId"] == "lg_EUoR_6095"
    assert state["seasons"][1]["status"] == "PREPARING"
    assert state["seasons"][1]["eloPolicy"] == "CAREER_CONTINUITY"
    assert state["seasons"][1]["teamAliases"]["PDC A"]["canonical"] == "PDC Neige"
    assert state["seasons"][1]["teamAliases"]["PDC B"]["canonical"] == "PDC Fournaise"

def test_nakka_compact_date_is_supported():
    assert _event_date(20260928) == "2026-09-28"


def test_competition_hub_uses_registry_when_statistics_schema_is_absent():
    registry = {
        "defaultSeason": "2026-2027",
        "seasons": [
            {"key": "2026", "label": "Championnat 2026", "active": False},
            {"key": "2026-2027", "label": "Championnat 2026–2027", "active": True},
        ],
    }

    with patch(
        "app.services.competition_hub_service.public_seasons",
        return_value=registry,
    ):
        cards = CompetitionHubService(MissingStatisticsDatabase())._season_cards()

    by_year = {card["year"]: card for card in cards}
    assert by_year[2026]["status"] == "ARCHIVED"
    assert by_year[2026]["is_active"] is False
    assert by_year[2027]["status"] == "ACTIVE"
    assert by_year[2027]["is_active"] is True


def test_t5_is_recognized_by_committee_while_older_tournaments_stay_friendly():
    recognized = _tournament_classification("T5")
    friendly = _tournament_classification("T4")

    assert recognized["classification"] == "COMMITTEE_RECOGNIZED"
    assert recognized["affects_committee_ranking"] is True
    assert recognized["ranking_status"] == "PUBLISHED"
    assert friendly["classification"] == "FRIENDLY"
    assert friendly["affects_committee_ranking"] is False
