from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from tests.test_interclub_publication import fixture_payload
from tests.test_interclub_j2_correction import fixture as j2_fixture
from tests import test_player_team_season_transition as transition
from tests.test_visibility_summary import DB
from app.services.interclub_analysis_source import source_facts
from app.services.interclub_publication_service import resolve_payload
from app.services.interclub_adjustments import MATCH, BENOIT, CHRISTOPHE
from app.services.player_statistics_engine import PlayerStatisticsEngine
from app.services.scoring_ranges import is_120_139, scoring_120_139, load_scoring_rows
from app.scripts.backfill_scoring_120_139 import backfill


@pytest.mark.parametrize("score,expected", [(119, False), (120, True), (125, True), (139, True), (140, False)])
def test_inclusive_visit_boundaries(score, expected):
    assert is_120_139(score) is expected


def test_real_nakka_visits_are_attributed_individually_including_alternating_doubles():
    details, _, _ = fixture_payload()
    raw = json.loads((Path(__file__).parent / "fixtures/interclub_j1.json").read_text())
    expected = Counter()
    for match in raw["sets"]:
        for n, leg in enumerate(match["legData"], 1):
            for side, visits in enumerate(leg["playerData"]):
                order = [p["oid"] for p in match["statsData"][side]["order"] if p.get("oid")]
                for turn, visit in enumerate(visits[1:]):
                    score = visits[turn]["left"] - visit["left"]
                    if 120 <= score <= 139:
                        expected[(f"{match['mid']}:{n}", order[turn % len(order)])] += 1
    assert sum(expected.values()) > 0
    for row in details["stats"]:
        assert row["scores_120_139"] == expected[(row["leg_id"], row["player_id"])]
        assert row["scores_120_139"] <= row["scores_100"]
    assert details == source_facts(
        {"start_date": details["date"], "source_url": details["source_url"]},
        {"key": details["season"], "nakkaLeagueId": details["league_id"]}, "test",
        raw["data"], raw["sets"], raw["players"], raw["teams"], with_details=True)["publication"]


def test_j2_new_counter_follows_confirmed_source_stream_swap():
    collected, licensed, identities = j2_fixture()
    resolved = resolve_payload(collected["publication"], licensed, identities, [])
    source = {(s["leg_id"], s["player_id"]): s for s in resolved["source_snapshot"]["stats"]}
    ids = {l["id"] for l in resolved["legs"] if l["match_id"] == MATCH}
    for row in resolved["stats"]:
        if row["leg_id"] in ids:
            donor = CHRISTOPHE if row["player_id"] == BENOIT else BENOIT
            assert row["scores_120_139"] == source[(row["leg_id"], donor)]["scores_120_139"]
    assert resolved["score"] == [5, 15]


def test_unknown_partial_and_observed_zero_are_distinct():
    assert scoring_120_139([])["scores_120_139"] is None
    assert scoring_120_139([{"scores_100": 8}])["scores_120_139"] is None
    assert scoring_120_139([{"scores_120_139": 0}])["scores_120_139"] == 0
    partial = scoring_120_139([{"scores_120_139": 2}, {"scores_100": 8}])
    assert partial["scores_120_139"] is None
    assert partial["scores_120_139_observed"] == 2
    assert partial["scores_120_139_coverage"]["status"] == "partial"


def test_matches_seasons_teams_and_existing_kpis_do_not_change():
    engine = transition.PlayerTeamSeasonTransitionTests().engine()
    original = engine.dashboard("p", "2027")
    for i in (1, 2):
        engine.data.matches.append({**engine.data.matches[0], "id": f"m{i}", "match_number": i + 1})
        engine.data.legs.append({**engine.data.legs[0], "id": f"l{i}", "match_id": f"m{i}"})
        engine.data.stats.append({**engine.data.stats[0], "id": f"s{i+2}", "leg_id": f"l{i}"})
    for row in engine.data.stats:
        row.update(scores_100=4, scores_140=1, scores_180=0)
    engine = PlayerStatisticsEngine(engine.data)
    baseline = engine.dashboard("p", "2027")
    for row in engine.data.stats:
        row["scores_120_139"] = 2
    dashboard = engine.dashboard("p", "2027")
    assert dashboard["scoring"]["scores_120_139"] == 6
    assert len(dashboard["recent_matches"]) == 3
    assert all(m["scores_120_139"] == 2 for m in dashboard["recent_matches"])
    assert dashboard["trends"][0]["scores_120_139"] == 6
    assert dashboard["kpis"] == baseline["kpis"]
    assert dashboard["scoring"]["scores_100_plus"] == baseline["scoring"]["scores_100_plus"] == 12
    assert dashboard["scoring"]["scores_140_plus"] == baseline["scoring"]["scores_140_plus"] == 3
    assert dashboard["player"]["team_id"] == original["player"]["team_id"] == "b"
    old = engine.dashboard("p", "2026")
    assert old["scoring"]["scores_120_139"] is None
    assert old["player"]["team_id"] == "a"
    assert engine.dashboard("p", "2028")["scoring"]["scores_120_139"] is None
    rows = engine.overview("2027")
    assert next(p for p in rows if p["player_id"] == "p")["scores_120_139"] == 6


def test_pre_migration_schema_keeps_legacy_stats_readable():
    rows = [{"id": "1", "scores_100": 12}]
    with patch("app.services.scoring_ranges._all", side_effect=[RuntimeError("missing column"), rows]) as read:
        assert load_scoring_rows(object(), "id,scores_100") == rows
        assert read.call_args.args[2] == "id,scores_100"
    with patch("app.services.scoring_ranges._all", side_effect=RuntimeError("offline")):
        assert load_scoring_rows(object(), "id,scores_100") == []


def test_backfill_dry_run_resolves_exact_identities_and_never_writes():
    details, licensed, identities = fixture_payload()
    db = DB({"seasons": [{"id": "s", "name": details["season"]}],
             "committee_licensed_players": licensed, "player_identities": identities,
             "championship_results": [{"id": "r", "season_id": "s", "source_sheet": details["source_url"],
                                       "played_on": details["date"], "detail_status": "DETAILED", "quality_status": "VERIFIED"}]})
    with patch("app.scripts.backfill_scoring_120_139.publish_collected") as publish:
        result = backfill(db, collect=lambda *args: {"publication": deepcopy(details)})
        publish.assert_not_called()
        assert result[0]["status"] == "DRY_RUN"
        assert result[0]["scores_120_139"] == sum(r["scores_120_139"] for r in details["stats"])
        backfill(db, apply=True, collect=lambda *args: {"publication": deepcopy(details)})
        publish.assert_called_once()
