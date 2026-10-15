import copy
import json
from pathlib import Path
import sys
import unittest
import io
from contextlib import redirect_stdout

from tests.test_interclub_publication import fixture_payload
from app.services.interclub_analysis_source import source_facts
from app.services.interclub_publication_service import resolve_payload, publish_collected
from app.services.interclub_adjustments import (BENOIT, CHRISTOPHE, EVENT, MATCH, GUEST_IDENTITY,
                                              apply_result_correction, apply_confirmed_corrections,
                                              apply_statistics_correction, corrected_facts)
from app.services.visibility_service import SummaryUnavailable
from unittest.mock import patch, MagicMock
from types import SimpleNamespace


def fixture():
    raw = json.loads((Path(__file__).parent / "fixtures/interclub_j2_fournaise_ambree.json").read_text())
    collected = source_facts({"start_date": "2026-10-14", "source_url": f"https://n01darts.com/n01/league/season.php?id={EVENT}"},
                             {"key": "2026-2027", "nakkaLeagueId": "lg_EUoR_6095"}, "test-j2",
                             raw["data"], raw["sets"], raw["players"], raw["teams"], with_details=True)
    _, licensed, identities = fixture_payload()
    for identity in identities:
        name = identity["canonical_display_name"]
        if name in ("Benoit BRUNET", "Christophe FERNANDEZ"):
            original = identity["id"]
            identity["id"] = GUEST_IDENTITY if name == "Benoit BRUNET" else "3d02bc37-d8e4-436e-88f5-da4f73091984"
            identity["canonical_player_id"] = BENOIT if name == "Benoit BRUNET" else CHRISTOPHE
            for row in licensed:
                if row["identity_id"] == original:
                    row["identity_id"] = identity["id"]
    return collected, licensed, identities


class J2CorrectionTests(unittest.TestCase):
    def test_only_result_flags_change_and_the_20_matches_aggregate_to_15_5(self):
        collected, licensed, identities = fixture()
        raw = copy.deepcopy(collected)
        p = apply_result_correction(resolve_payload(collected["publication"], licensed, identities, [])["source_snapshot"])
        self.assertEqual(collected, raw, "The validated source stays untouched")
        self.assertEqual(raw["publication"]["score"], [6, 14])
        self.assertEqual(p["score"], [5, 15])
        self.assertEqual(p["raw_nakka"], raw["publication"]["raw_nakka"])
        original = p["source_snapshot"]
        selected = {l["id"] for l in p["legs"] if l["match_id"] == MATCH}
        self.assertEqual(len(selected), 2)
        for key, flag in (("matches", "winner_team_id"), ("legs", "winner_team_id"), ("stats", "leg_won"), ("players", "winLeg")):
            self.assertEqual([{k: v for k, v in r.items() if k != flag} for r in p[key]],
                             [{k: v for k, v in r.items() if k != flag} for r in original[key]])
        for after, before in zip(p["stats"], original["stats"]):
            if after["leg_id"] in selected:
                self.assertEqual(after["leg_won"], after["player_id"] == CHRISTOPHE)
            else:
                self.assertEqual(after, before)
        for match, before in zip(p["matches"], original["matches"]):
            if match["id"] == MATCH:
                self.assertEqual(match["winner_team_id"], "uwbj")
            else:
                self.assertEqual(match, before)
        self.assertEqual(p["result_corrections"][0]["initial_score"], [2, 0])
        self.assertEqual(p["result_corrections"][0]["corrected_score"], [0, 2])
        for pid, before_wins, after_wins in ((BENOIT, 7, 5), (CHRISTOPHE, 7, 9)):
            self.assertEqual(next(x for x in original["players"] if x["id"] == pid)["winLeg"], before_wins)
            self.assertEqual(next(x for x in p["players"] if x["id"] == pid)["winLeg"], after_wins)
        facts = corrected_facts(p, collected["facts"])
        self.assertEqual([facts["home_score"], facts["away_score"]], [5, 15])
        self.assertIn("15–32", next(f["text"] for f in facts["facts"] if f["id"] == "volume"))

    def test_guest_is_unique_and_authorized_only_for_this_encounter(self):
        collected, licensed, identities = fixture()
        p = resolve_payload(collected["publication"], licensed, identities, [])
        guest = next(x for x in p["players"] if x["id"] == BENOIT)
        self.assertEqual(guest["team_id"], "z1ps")
        self.assertEqual(guest["participation_exception"]["usual_team"], "3B Darts Club - B(rune)")
        self.assertEqual(len({x["id"] for x in p["players"]}), 8)
        for key, value in (("event_id", "t_other_1234"), ("date", "2026-10-15"), ("season", "2026")):
            other = copy.deepcopy(collected["publication"]); other[key] = value
            with self.assertRaises(SummaryUnavailable): resolve_payload(other, licensed, identities, [])
        duplicate = copy.deepcopy(collected["publication"])
        duplicate["players"].append(copy.deepcopy(duplicate["players"][0]))
        with self.assertRaises(SummaryUnavailable): resolve_payload(duplicate, licensed, identities, [])
        wrong = copy.deepcopy(collected["publication"])
        next(x for x in wrong["players"] if x["source_id"] == "5ggq")["source_name"] = "Vincent AUBERT"
        with self.assertRaises(SummaryUnavailable): resolve_payload(wrong, licensed, identities, [])

    def test_idempotence_reimport_source_edit_and_missing_match_guards(self):
        collected, licensed, identities = fixture()
        p = resolve_payload(collected["publication"], licensed, identities, [])
        self.assertEqual(apply_confirmed_corrections(p), p)
        self.assertEqual(resolve_payload(copy.deepcopy(collected["publication"]), licensed, identities, []), p)
        for change in ("missing_match", "different_total", "wrong_identity"):
            bad = copy.deepcopy(p["source_snapshot"])
            if change == "missing_match": bad["matches"] = [m for m in bad["matches"] if m["id"] != MATCH]
            elif change == "wrong_identity": next(x for x in bad["players"] if x["source_id"] == "a0zp")["id"] = BENOIT
            else: next(m for m in bad["matches"] if m["winner_team_id"] == "uwbj" and m["id"] != MATCH)["winner_team_id"] = "z1ps"
            with self.assertRaises(SummaryUnavailable): apply_result_correction(bad)
        tampered = copy.deepcopy(p); tampered["stats"][0]["score"] += 1
        with self.assertRaises(SummaryUnavailable): apply_confirmed_corrections(tampered)

    def test_confirmed_streams_give_christophe_40_and_6_in_one_checkout_dart(self):
        collected, licensed, identities = fixture()
        p = resolve_payload(collected["publication"], licensed, identities, [])
        previous = apply_result_correction(p["source_snapshot"])
        selected = {l["id"]: l["leg_number"] for l in p["legs"] if l["match_id"] == MATCH}
        for row, before in zip(p["stats"], previous["stats"]):
            if row["leg_id"] not in selected:
                self.assertEqual(row, before)
                continue
            for key in ("player_id", "team_id", "leg_id", "leg_won"):
                self.assertEqual(row[key], before[key])
            other = next(s for s in previous["stats"] if s["leg_id"] == row["leg_id"] and s["player_id"] != row["player_id"])
            self.assertEqual({k: v for k, v in row.items() if k not in ("player_id", "team_id", "leg_won")},
                             {k: v for k, v in other.items() if k not in ("player_id", "team_id", "leg_won")})
            if row["player_id"] == CHRISTOPHE:
                self.assertEqual([row["score"], row["darts_thrown"], row["finish"], row["leg_won"]],
                                 [501, 40, 40 if selected[row["leg_id"]] == 1 else 6, True])
            else:
                self.assertEqual(row["finish"], 0)
        self.assertEqual(p["score"], [5, 15])
        self.assertEqual(p["matches"], previous["matches"])
        self.assertEqual(p["legs"], previous["legs"])
        self.assertEqual(p["raw_nakka"], previous["raw_nakka"])
        self.assertEqual(p["source_snapshot"], previous["source_snapshot"])
        self.assertEqual([x["checkout_darts"] for x in p["statistics_corrections"][0]["confirmed_finishes"]], [1, 1])
        for pid, score, darts, f9 in ((BENOIT, 5075, 430, 1402), (CHRISTOPHE, 6035, 482, 1715)):
            player = next(x for x in p["players"] if x["id"] == pid)
            self.assertEqual([player["score"], player["darts"], player["f9Score"]], [score, darts, f9])
        self.assertEqual(apply_statistics_correction(p), p)

    def test_statistics_attribution_refuses_a_different_checkout_signature(self):
        collected, licensed, identities = fixture()
        p = resolve_payload(collected["publication"], licensed, identities, [])
        old = apply_result_correction(p["source_snapshot"])
        raw = next(m for m in old["raw_nakka"]["sets"] if m["mid"] == MATCH)
        raw["legData"][0]["playerData"][0][-1]["score"] = -2
        with self.assertRaises(SummaryUnavailable): apply_statistics_correction(old)
        changed = copy.deepcopy(p)
        changed["statistics_corrections"][0]["confirmed_finishes"][0]["finish"] = 60
        with self.assertRaises(SummaryUnavailable): apply_statistics_correction(changed)

    def test_publisher_updates_worker_facts_without_sending_messages(self):
        collected, licensed, identities = fixture()
        class DB:
            def rpc(self, name, args):
                self.name, self.payload = name, args["p"]
                return SimpleNamespace(execute=lambda: SimpleNamespace(data={"status": "PUBLISHED", "result_id": "db-j2"}))
        db = DB()
        with patch("app.services.interclub_publication_service._all", side_effect=[licensed, identities, []]):
            result = publish_collected(collected, db=db)
        self.assertEqual(db.name, "publish_interclub_match")
        self.assertEqual(result["result_id"], "db-j2")
        self.assertEqual([collected["facts"]["home_score"], collected["facts"]["away_score"]], [5, 15])

    def test_operational_command_is_read_only_by_default_and_reports_the_exact_target(self):
        from app.services import interclub_correction_command as command
        collected, licensed, identities = fixture()
        db = MagicMock()
        event = {"id": "calendar-j2", "event_type": "CHAMPIONSHIP", "status": "COMPLETED", "source_url": collected["publication"]["source_url"]}
        output = io.StringIO()
        with patch.object(sys.modules["supabase"], "create_client", return_value=db, create=True), \
             patch.dict(sys.modules, {"app.config": SimpleNamespace(settings=SimpleNamespace(supabase_url="https://example.test", supabase_service_role_key="test-only"))}), \
             patch.object(sys, "argv", ["interclub_correction_command"]), \
             patch.object(command, "list_events", return_value={"events": [event]}), \
             patch.object(command, "registry_status", return_value={"seasons": [{"key": "2026-2027", "active": True}]}), \
             patch.object(command, "collect_publication", return_value=collected), \
             patch.object(command, "_all", side_effect=[licensed, identities, [], [], []]), \
             patch.object(command, "publish_collected") as publish, redirect_stdout(output):
            command.main()
        publish.assert_not_called(); db.rpc.assert_not_called()
        preview = json.loads(output.getvalue())
        self.assertEqual(preview["mode"], "DRY_RUN")
        self.assertEqual(preview["calendar_event_id"], "calendar-j2")
        self.assertEqual(preview["effective_score_ambree_fournaise"], [5, 15])
        self.assertEqual(preview["nakka_match_id"], MATCH)


if __name__ == "__main__":
    if "--fixture" in sys.argv or "--fixture-result-only" in sys.argv:
        collected, licensed, identities = fixture()
        payload = resolve_payload(collected["publication"], licensed, identities, [])
        if "--fixture-result-only" in sys.argv:
            payload = apply_result_correction(payload["source_snapshot"])
        print(json.dumps({"payload": payload,
                          "licensed": licensed, "identities": identities}))
    elif "--read-paths" in sys.argv or "--read-paths-statistics" in sys.argv:
        from tests.test_visibility_summary import DB, Query
        from app.services.ranking_service import build_ranking
        from app.services.player_statistics_engine import PlayerStatisticsEngine
        from app.services.match_hub_service import build_match_hub
        from app.services.visibility_service import load_evening
        Query.order = lambda self, *args, **kwargs: self
        Query.limit = lambda self, count: self.range(0, count - 1)
        rows = json.load(sys.stdin)
        db = DB(rows)
        ranking = build_ranking(db)
        fournaise = next(t for t in ranking["standings"] if "Fournaise" in t["name"])
        ambree = next(t for t in ranking["standings"] if "A(mbré)" in t["name"])
        assert [fournaise["sets_won"], fournaise["sets_lost"], fournaise["points"], fournaise["legs_won"], fournaise["legs_lost"]] == [15, 5, 4, 32, 15]
        assert [ambree["sets_won"], ambree["sets_lost"], ambree["points"]] == [5, 15, 1]
        engine = PlayerStatisticsEngine.from_db(db)
        overview = engine.overview()
        for pid, won in ((BENOIT, 5), (CHRISTOPHE, 9)):
            player = next(p for p in overview if p["player_id"] == pid)
            assert player["legs_won"] == won, player
            if pid == BENOIT:
                assert player["team"] == "3B Darts Club - B(rune)", player
        result = next(r for r in rows["championship_results"] if r["natural_key"].endswith(EVENT))
        hub = build_match_hub(db, result["id"])
        assert [hub["summary"]["home_matches_won"], hub["summary"]["away_matches_won"]] == [5, 15]
        assert any("Renfort exceptionnel pour Ambrée" in n for n in hub["data_quality_notes"])
        assert any("Benoit BRUNET 0–2 Christophe FERNANDEZ" in n for n in hub["data_quality_notes"])
        if "--read-paths-statistics" in sys.argv:
            target = next(m for m in hub["matches"] if m["match_number"] == 18)
            assert [(l["finisher_id"], l["finish"], l["darts"]) for l in target["legs"]] == [(CHRISTOPHE, 40, 40), (CHRISTOPHE, 6, 40)]
            assert any("40 et 6 en une fléchette" in n for n in hub["data_quality_notes"])
            ch = next(p for p in overview if p["player_id"] == CHRISTOPHE)
            assert ch["average_3_darts"] == 37.56 and ch["first_9"] == 47.64, ch
        evening = load_evening(db, result["id"])
        assert "5–15" in next(f["text"] for f in evening["facts"] if f["id"] == "score")
        print("PASS J2 public read paths: standings, leg differential, player statistics, match hub, guest/correction notes and editorial facts")
    else:
        unittest.main()
