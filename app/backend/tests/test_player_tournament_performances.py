from app.api.player_router import _normalized_name


def test_normalized_name_matches_accents_and_spacing():
    assert _normalized_name("Sébastien A") == _normalized_name("sebastien-a")


def test_normalized_name_keeps_distinct_players_distinct():
    assert _normalized_name("Alex") != _normalized_name("Alexandre")
