from app.services.season_registry_service import (
    _empty,
    _event_date,
    resolve_database_season,
)


def test_resolve_database_season_prefers_the_populated_canonical_row():
    seasons = [
        {"id": "empty", "name": "Championnat 2026", "is_active": False},
        {"id": "official", "name": "2026", "is_active": False},
        {"id": "active", "name": "2026-2027", "is_active": True},
    ]
    rounds = [
        {"season_id": "official", "published": True},
        {"season_id": "official", "published": True},
    ]

    assert resolve_database_season("2026", seasons, rounds)["id"] == "official"
    assert resolve_database_season("2026-2027", seasons, rounds)["id"] == "active"

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
