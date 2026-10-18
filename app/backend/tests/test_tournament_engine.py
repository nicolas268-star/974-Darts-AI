from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import unittest

from app.services.nakka_direct_import import normalize_direct_event
from app.services.tournament_engine import build_tournament_payload


URL = "https://n01darts.com/n01/tournament/comp.php?id=t_universal_1"


def result(home, away, score=3, conceded=1):
    return {home: {away: {"r": score}}, away: {home: {"r": conceded}}}


def event(**extra):
    return {
        "tdid": "t_universal_1", "title": "Tournoi test", "status": 40,
        "entry_list": [{"tpid": key, "name": name} for key, name in zip("abcd", ("Alice", "Bob", "Chloé", "Dan"))],
        **extra,
    }


def project(raw, stats=None, metadata=None):
    normalized = normalize_direct_event(raw, stats or {}, URL, 2027)
    return build_tournament_payload(normalized, code="stable-event", metadata=metadata)


class TournamentEngineTests(unittest.TestCase):
    def test_pool_only_has_no_bracket_and_preserves_zero_points_rule(self):
        raw = event(rr_table=[["a", "b"]], rr_result=[result("a", "b", 2, 0)],
                    rr_setting={"limit": 1, "limit_leg_count": 2, "point": 1, "point_w": 0, "point_l": 0})
        payload = project(raw)
        self.assertEqual(payload["format"], "POOLS")
        self.assertFalse(payload["bracket"])
        group = payload["round_robin"][0]
        self.assertEqual(group["win_points"], 0)
        self.assertEqual(group["standings"][0]["rank"], 1)
        self.assertEqual(group["standings"][0]["points"], 0)

    def test_simple_knockout_uses_primary_final_not_third_place(self):
        raw = event(t_result=[{**result("a", "c"), **result("b", "d")}, result("a", "b")],
                    t3_result=[result("c", "d")])
        payload = project(raw)
        self.assertEqual(payload["format"], "SINGLE_ELIMINATION")
        self.assertEqual((payload["winner"], payload["runner_up"]), ("Alice", "Bob"))
        self.assertEqual({row["name"] for row in payload["final_standings"] if row["rank"] == 3}, {"Chloé", "Dan"})

    def test_bracket_slots_follow_source_table_instead_of_completion_order(self):
        raw = event(t_setting={"t_player_count": 4},
                    t_table=[["a", "c", "b", "d"], ["a", "b"], ["a"]],
                    t_result=[{**result("d", "b", 1, 3), **result("c", "a", 1, 3)}, result("b", "a", 1, 3)])
        payload = project(raw)
        first_round = payload["bracket"][0]["matches"]
        self.assertEqual([(row["home"], row["away"]) for row in first_round], [("Alice", "Chloé"), ("Bob", "Dan")])
        self.assertEqual([(row["home_score"], row["away_score"]) for row in first_round], [(3, 1), (3, 1)])
        self.assertEqual([row["bracket_position"] for row in first_round], [0, 1])
        self.assertEqual(payload["winner"], "Alice")

    def test_pools_and_secondary_draw_are_not_double_elimination(self):
        raw = event(rr_table=[["a", "b"], ["c", "d"]], rr_result=[result("a", "b"), result("c", "d")],
                    t_result=[result("a", "c")], s2_result=[result("b", "d")])
        payload = project(raw)
        self.assertEqual(payload["format"], "POOLS_AND_KNOCKOUT")
        self.assertTrue(payload["has_secondary_bracket"])
        self.assertFalse(payload["has_double_elimination"])
        self.assertEqual({row["bracket_kind"] for row in payload["bracket"]}, {"PRIMARY", "SECONDARY"})
        self.assertEqual(payload["winner"], "Alice")

    def test_double_elimination_without_played_reset_keeps_winner_final(self):
        raw = event(d_setting={"t_player_count": 4, "no_reset": 0},
                    dw_result=[{**result("a", "c"), **result("b", "d")}, result("a", "b"), result("a", "c"), {}],
                    dl_result=[result("c", "d"), result("c", "b")])
        payload = project(raw)
        self.assertEqual(payload["format"], "DOUBLE_ELIMINATION")
        self.assertEqual([row["code"] for row in payload["bracket"] if row["bracket_kind"] == "WINNER"], ["winner_1", "winner_2"])
        self.assertEqual([row["code"] for row in payload["bracket"] if row["bracket_kind"] == "GRAND_FINAL"], ["grand_final_1"])
        self.assertEqual(payload["winner"], "Alice")

    def test_loser_champion_grand_final_win_requires_reset(self):
        raw = event(d_setting={"t_player_count": 4, "no_reset": 0},
                    dw_result=[{**result("a", "c"), **result("b", "d")}, result("a", "b"), result("c", "a"), {}],
                    dl_result=[result("c", "d"), result("c", "b")])
        self.assertIsNone(project(raw)["winner"])
        raw["dw_result"][-1] = result("c", "a")
        payload = project(raw)
        self.assertEqual(payload["winner"], "Chloé")
        self.assertEqual(payload["bracket"][-1]["code"], "grand_final_2")

    def test_pools_and_double_elimination_with_no_reset_rule(self):
        raw = event(rr_table=[["a", "b"]], rr_result=[result("a", "b")],
                    d_setting={"t_player_count": 4, "no_reset": 1},
                    dw_result=[{**result("a", "c"), **result("b", "d")}, result("a", "b"), result("c", "a")],
                    dl_result=[result("c", "d"), result("c", "b")])
        payload = project(raw)
        self.assertEqual(payload["format"], "POOLS_AND_DOUBLE_ELIMINATION")
        self.assertEqual(payload["winner"], "Chloé")

    def test_missing_metric_is_null_but_explicit_zero_is_preserved(self):
        raw = event(t_result=[result("a", "b")])
        payload = project(raw, {"a": {"match": 1, "winMatch": 0, "ton80": 0, "darts": 30}})
        alice = next(row for row in payload["players"] if row["name"] == "Alice")
        self.assertEqual(alice["scores_180"], 0)
        self.assertEqual(alice["matches_won"], 0)
        self.assertIsNone(alice["average_3_darts"])
        self.assertIsNone(alice["scores_120_139"])
        bob = next(row for row in payload["players"] if row["name"] == "Bob")
        self.assertIsNone(bob["matches_played"])

    def test_doublettes_keep_stats_collective_and_no_individual_attribution(self):
        raw = event(t_result=[result("a", "b")])
        stats = {"a": {"score": 1503, "darts": 90, "match": 1, "ton80": 2}}
        payload = project(raw, stats, {"kind": "CLUB_DOUBLE", "classification": "OFFICIAL", "results": [
            {"source_ref": "a:1", "identity_id": "identity-1", "canonical_player_id": "player-1", "player_name": "Alice", "placement": "WINNER", "points": 50},
            {"source_ref": "a:2", "identity_id": "identity-2", "canonical_player_id": "player-2", "player_name": "Bob", "placement": "WINNER", "points": 50},
        ]})
        self.assertFalse(payload["players"])
        self.assertEqual(len(payload["duos"]), 4)
        self.assertIsNone(payload["duos"][0]["canonical_player_id"])
        self.assertEqual(payload["duos"][0]["scores_180"], 2)
        self.assertEqual(payload["duos"][0]["statistics_scope"], "DUO")
        self.assertFalse(payload["matches"][0]["tracked_players"])

    def test_ambiguous_identity_does_not_attach_or_create_a_player(self):
        raw = event(t_result=[result("a", "b")])
        snapshot = normalize_direct_event(raw, {}, URL, 2027, [{"id": "one", "name": "Alice"}, {"id": "two", "name": "Alice"}])
        payload = build_tournament_payload(snapshot, code="stable")
        self.assertEqual(payload["players"][0]["identity_status"], "AMBIGUOUS")
        self.assertIsNone(payload["players"][0]["canonical_player_id"])

    def test_duplicate_alias_rows_for_same_identity_are_unambiguous(self):
        raw = event(t_result=[result("a", "b")])
        snapshot = normalize_direct_event(raw, {}, URL, 2027, [{"id": "one", "name": "Alice"}, {"id": "one", "name": "ALICE"}])
        payload = build_tournament_payload(snapshot, code="stable")
        self.assertEqual(payload["players"][0]["canonical_player_id"], "one")

    def test_incomplete_source_never_converts_missing_result_to_zero(self):
        raw = event(t_result=[{"a": {"b": {"r": 3}}}])
        snapshot = normalize_direct_event(raw, {}, URL, 2027)
        self.assertEqual(snapshot["status"], "BLOCKED")
        self.assertIsNone(snapshot["matches"][0]["away_score"])
        self.assertFalse(snapshot["matches"][0]["result_complete"])
        self.assertIsNone(build_tournament_payload(snapshot, code="stable")["winner"])

    def test_running_knockout_score_is_not_a_completed_result(self):
        raw = event(t_setting={"limit": 1, "limit_leg_count": 3}, t_result=[result("a", "b", 1, 0)])
        payload = project(raw)
        self.assertEqual(payload["summary"]["complete_results"], 0)
        self.assertIsNone(payload["winner"])

    def test_missing_pool_match_is_blocking_and_not_given_a_final_rank(self):
        raw = event(rr_setting={"limit": 1, "limit_leg_count": 2, "point": 0},
                    rr_table=[["a", "b", "c"]], rr_result=[result("a", "b", 2, 0)])
        snapshot = normalize_direct_event(raw, {}, URL, 2027)
        self.assertEqual(snapshot["status"], "BLOCKED")
        group = build_tournament_payload(snapshot, code="stable")["round_robin"][0]
        self.assertEqual(group["participant_count"], 3)
        self.assertFalse(group["complete"])
        self.assertTrue(all(row["rank"] is None for row in group["standings"]))

    def test_missing_knockout_final_is_not_inferred_from_last_played_round(self):
        raw = event(t_setting={"t_player_count": 4, "limit": 1, "limit_leg_count": 3},
                    t_table=[["a", "c", "b", "d"], ["a", "b"], [None]],
                    t_result=[{**result("a", "c"), **result("b", "d")}])
        snapshot = normalize_direct_event(raw, {}, URL, 2027)
        self.assertEqual(snapshot["status"], "BLOCKED")
        payload = build_tournament_payload(snapshot, code="stable")
        self.assertEqual(payload["bracket"][0]["name"], "Demi-finales")
        self.assertIsNone(payload["winner"])

    def test_explicit_nakka_pool_ranks_take_precedence_over_reconstruction(self):
        raw = event(rr_table=[["a", "b"]], rr_result=[result("a", "b", 2, 0)],
                    rr_setting={"limit": 1, "limit_leg_count": 2, "point": 0}, rr_rank=[{"a": 2, "b": 1}])
        group = project(raw)["round_robin"][0]
        self.assertEqual([(row["name"], row["rank"]) for row in group["standings"]], [("Bob", 1), ("Alice", 2)])
        self.assertEqual(group["ranking_source"], "NAKKA")

    def test_unconfirmed_supplemental_scoring_does_not_invent_pool_points_or_ranks(self):
        raw = event(rr_table=[["a", "b"]], rr_result=[result("a", "b", 2, 0)],
                    rr_setting={"limit": 1, "limit_leg_count": 2, "point": 1, "point_w": 3},
                    rr_pts=[{"a": -4}])
        group = project(raw)["round_robin"][0]
        self.assertFalse(group["ranking_confirmed"])
        self.assertFalse(group["points_available"])
        self.assertTrue(all(row["rank"] is None and row["points"] is None for row in group["standings"]))

    def test_nakka_three_way_tie_stays_shared_without_average_tiebreak(self):
        raw = event(rr_table=[["a", "b", "c"]],
                    rr_result=[{"a": {"b": {"r": 2}, "c": {"r": 0}}, "b": {"a": {"r": 0}, "c": {"r": 2}}, "c": {"b": {"r": 0}, "a": {"r": 2}}}],
                    rr_setting={"limit": 1, "limit_leg_count": 2, "point": 0})
        group = project(raw, {"a": {"score": 501, "darts": 9}, "b": {"score": 501, "darts": 12}})["round_robin"][0]
        self.assertEqual([row["rank"] for row in group["standings"]], [1, 1, 1])
        self.assertTrue(all(row["rank_tied"] for row in group["standings"]))
        self.assertFalse(group["ranking_confirmed"])

    def test_event_date_and_label_follow_official_metadata_together(self):
        payload = project(event(t_result=[result("a", "b")]), metadata={"event_date": "2026-10-18"})
        self.assertEqual(payload["date"], "2026-10-18")
        self.assertEqual(payload["date_label"], "18 octobre 2026")

    def test_official_points_are_copied_and_never_recalculated(self):
        raw = event(t_result=[result("a", "b")])
        source = normalize_direct_event(raw, {}, URL, 2027)
        revision = {"metadata": {"title": "OC1", "season_key": "2026-2027"}, "source": source, "results": [
            {"source_ref": "a:1", "identity_id": "identity-a", "canonical_player_id": "player-a", "player_name": "Alice Canonique", "placement": "WINNER", "points": 137},
            {"source_ref": "b:1", "identity_id": "identity-b", "player_name": "Bob", "placement": "RUNNER_UP", "points": 41},
        ]}
        before = deepcopy(revision)
        payload = build_tournament_payload(revision, code="stable", metadata={"classification": "COMMITTEE_OFFICIAL"})
        self.assertEqual([row["points"] for row in payload["official_results"]], [137, 41])
        self.assertEqual(payload["players"][0]["canonical_player_id"], "player-a")
        self.assertIsNone(payload["players"][1]["canonical_player_id"])
        self.assertFalse(payload["affects_official_points"])
        self.assertEqual(revision, before)
        friendly = build_tournament_payload(revision, code="stable", metadata={"classification": "FRIENDLY"})
        self.assertFalse(friendly["official_results"])

    def test_refresh_preserves_only_unchanged_confirmed_source_identity(self):
        raw = event(t_result=[result("a", "b")])
        source = normalize_direct_event(raw, {}, URL, 2027, [{"id": "player-a", "name": "Alice", "canonicalName": "Alice Canonique"}])
        saved = build_tournament_payload(source, code="stable")
        refreshed = normalize_direct_event(raw, {}, URL, 2027)
        payload = build_tournament_payload(refreshed, code="stable", existing=saved)
        self.assertEqual(payload["players"][0]["canonical_player_id"], "player-a")
        raw["entry_list"][0]["name"] = "Autre personne"
        changed = build_tournament_payload(normalize_direct_event(raw, {}, URL, 2027), code="stable", existing=saved)
        player = next(row for row in changed["players"] if row["nakka_participant_id"] == "a")
        self.assertIsNone(player["canonical_player_id"])

    def test_deduplication_is_by_source_match_id_and_hash_ignores_collection_time(self):
        snapshot = normalize_direct_event(event(t_result=[result("a", "b")]), {}, URL, 2027)
        snapshot["matches"].append(deepcopy(snapshot["matches"][0]))
        snapshot.pop("snapshotHash")
        first = build_tournament_payload(snapshot, code="stable")
        snapshot["collectedAt"] = "2099-12-31"
        second = build_tournament_payload(snapshot, code="stable", existing=first)
        self.assertEqual(len(second["matches"]), 1)
        self.assertEqual(first["source_snapshot_hash"], second["source_snapshot_hash"])

    def test_oc1_real_source_regression(self):
        root = Path(__file__).parent / "fixtures"
        raw = json.loads((root / "nakka_oc1_event.json").read_text(encoding="utf-8"))
        stats = json.loads((root / "nakka_oc1_stats.json").read_text(encoding="utf-8"))
        source = normalize_direct_event(raw, stats, "https://n01darts.com/n01/tournament/comp.php?id=t_ssSW_4561", 2027)
        payload = build_tournament_payload(source, code="oc1-2026-10-18")
        self.assertEqual(payload["summary"]["matches"], 83)
        self.assertEqual(payload["summary"]["pool_matches"], 56)
        self.assertEqual(payload["summary"]["knockout_matches"], 27)
        self.assertEqual(payload["summary"]["tracked_players"], 29)
        self.assertEqual(len(payload["round_robin"]), 6)
        self.assertEqual((payload["winner"], payload["runner_up"]), ("Abrousse Stephane", "VERDIERJacky"))
        self.assertFalse(payload["has_double_elimination"])
        self.assertTrue(payload["has_secondary_bracket"])
        self.assertEqual(sum(row["scores_180"] for row in payload["players"]), 2)
        for pool in payload["round_robin"]:
            self.assertTrue(pool["complete"])
            self.assertTrue(pool["ranking_confirmed"])
            self.assertFalse(pool["points_available"])
            self.assertTrue(all(row["points"] is None for row in pool["standings"]))
        self.assertEqual([row["name"] for row in payload["round_robin"][2]["standings"]], ["SchreiberTristan", "GrassetEmmanuel", "DubourdieuBenjamin", "ParetLaurent", "RocheMartin"])

    def test_t5_real_source_preserves_points_per_leg_and_parallel_draws(self):
        root = Path(__file__).parent / "fixtures"
        source = normalize_direct_event(
            json.loads((root / "nakka_t5_event.json").read_text(encoding="utf-8")),
            json.loads((root / "nakka_t5_stats.json").read_text(encoding="utf-8")),
            "https://n01darts.com/n01/tournament/comp.php?id=t_aKyY_3246", 2026,
        )
        payload = build_tournament_payload(source, code="T5")
        self.assertEqual(payload["code"], "T5")
        self.assertEqual(payload["summary"]["matches"], 90)
        self.assertEqual(payload["summary"]["pool_matches"], 60)
        self.assertEqual(payload["summary"]["knockout_matches"], 30)
        self.assertEqual(payload["summary"]["tracked_players"], 35)
        self.assertEqual((payload["winner"], payload["runner_up"]), ("Manu (KAD)", "Dudul (KAD)"))
        self.assertEqual(len(payload["round_robin"]), 8)
        self.assertTrue(all(group["ranking_confirmed"] and group["include_leg_points"] for group in payload["round_robin"]))
        self.assertEqual(payload["round_robin"][0]["standings"][0]["points"], 16)
        self.assertEqual(payload["format"], "POOLS_AND_KNOCKOUT")
        self.assertFalse(payload["has_double_elimination"])
        self.assertTrue(payload["has_secondary_bracket"])


if __name__ == "__main__":
    unittest.main()
