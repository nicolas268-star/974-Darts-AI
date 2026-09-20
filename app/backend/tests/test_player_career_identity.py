import sys
import types

if "supabase" not in sys.modules:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.Client = object
    sys.modules["supabase"] = supabase_stub

from app.services.player_identity_service import (
    _aggregate_career_rows,
    _canonical_memberships,
    _career_player_ids,
)


def test_pierre_career_recovers_historical_rows_from_confirmed_names():
    profile = {
        "identity": {
            "canonical_player_id": "official-pierre",
            "canonical_display_name": "Pierre BERTLER",
        },
        "aliases": [
            {
                "source_player_id": None,
                "alias_name": "Pierre",
                "normalized_alias": "pierre",
                "confirmed": True,
            },
            {
                "source_player_id": None,
                "alias_name": "Pierre (PDC)",
                "normalized_alias": "pierrepdc",
                "confirmed": True,
            },
        ],
    }
    players = [
        {"id": "historical-pierre", "display_name": "Pierre"},
        {"id": "historical-pdc", "display_name": "Pierre (PDC)"},
        {"id": "other", "display_name": "Pierre DUPONT"},
    ]

    player_ids = _career_player_ids(profile, players)

    assert player_ids == ["historical-pdc", "historical-pierre", "official-pierre"]
    stats = _aggregate_career_rows([
        {"player_id": "historical-pierre", "leg_won": True, "average_3_darts": 52.0, "darts_thrown": 18, "finish": 80},
        {"player_id": "historical-pdc", "leg_won": False, "average_3_darts": 50.0, "darts_thrown": 12, "finish": 0},
    ])
    assert stats["legs_played"] == 2
    assert stats["legs_won"] == 1
    assert stats["average_3_darts"] == 51.2
    assert stats["best_finish"] == 80


def test_equivalent_pierre_affiliations_are_canonicalized_once():
    memberships = _canonical_memberships([
        {"id": "old", "team": "Fournaise", "season": None, "is_current": True, "source": "MANUAL"},
        {"id": "official", "team": "PDC Fournaise", "season": None, "is_current": False, "source": "COMMITTEE_LICENSE_REGISTRY"},
    ])

    assert len(memberships) == 1
    assert memberships[0]["team"] == "PDC Fournaise"
    assert memberships[0]["is_current"] is True
    assert memberships[0]["id"] == "official"
