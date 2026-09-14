from app.services.ranking_service import _rules_for_season_name


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
