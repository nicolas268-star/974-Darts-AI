from unittest.mock import patch

from app.services.competition_hub_service import _season_year
from app.services.ranking_service import _rules_for_season_name, build_ranking


def test_legacy_default_rules_remain_unchanged():
    rules = _rules_for_season_name("2026")
    assert rules["win_points"] == 3
    assert rules["draw_points"] == 2
    assert rules["loss_points"] == 1
    assert rules["forfeit_points"] == 0


def test_2026_2027_uses_new_committee_rules():
    for season_name in ("2026-2027", "2026–2027", "2026/2027"):
        rules = _rules_for_season_name(season_name)
        assert rules["win_points"] == 4
        assert rules["draw_points"] == 2
        assert rules["loss_points"] == 1
        assert rules["forfeit_points"] == 0


def test_sporting_season_is_displayed_under_its_ending_year():
    assert _season_year("2026") == 2026
    assert _season_year("2026-2027") == 2027
    assert _season_year("Championnat 2026–2027") == 2027


def test_empty_official_results_are_not_reported_as_a_missing_migration():
    season = {"id": "active", "name": "2026-2027", "is_active": True}

    def rows(_db, table, _select, _filters=None):
        return {"seasons": [season], "rounds": [], "teams": []}[table]

    with (
        patch("app.services.ranking_service._all", side_effect=rows),
        patch("app.services.ranking_service._optional_all", return_value=[]),
        patch("app.services.ranking_service._detailed_leg_totals", return_value=({}, 0)),
        patch("app.services.ranking_service.get_rules", return_value=_rules_for_season_name("2026-2027")),
        patch("app.services.ranking_service._pvp_fallback") as fallback,
    ):
        ranking = build_ranking(object(), "active")

    fallback.assert_not_called()
    assert ranking["ranking_source"] == "CALENDRIER_SCORE"
    assert ranking["data_quality_notes"] == []
    assert ranking["summary"]["rounds"] == 0
