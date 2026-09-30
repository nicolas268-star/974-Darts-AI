import copy
import json
from pathlib import Path
import re
import sys
import types
import unittest
from uuid import NAMESPACE_URL, uuid5

if "supabase" not in sys.modules:
    stub = types.ModuleType("supabase")
    stub.Client = object
    sys.modules["supabase"] = stub

from app.services.interclub_analysis_source import source_facts
from app.services.interclub_publication_service import CLUBS, ROSTERS, resolve_payload, resolve_team
from app.services.visibility_service import SummaryUnavailable


def fixture_payload():
    raw = json.loads((Path(__file__).parent / "fixtures/interclub_j1.json").read_text())
    event = {"start_date": "2026-09-28", "source_url": "https://n01darts.com/n01/league/season.php?id=t_eMqn_6846"}
    details = source_facts(event, {"key": "2026-2027", "nakkaLeagueId": "lg_EUoR_6095"}, "test",
                           raw["data"], raw["sets"], raw["players"], raw["teams"], with_details=True)["publication"]
    licensed, identities = [], []
    for team in ROSTERS:
        for player in team["players"]:
            name = player["officialName"]
            identity = str(uuid5(NAMESPACE_URL, "test-identity:" + name))
            identities.append({"id": identity, "canonical_player_id": str(uuid5(NAMESPACE_URL, "test-player:" + name)),
                               "canonical_display_name": name, "status": "ACTIVE"})
            licensed.append({"season_key": "2026-2027", "official_display_name": name, "official_source_name": name,
                             "club_code": CLUBS[team["id"].split("-")[0]], "identity_id": identity, "license_status": "ACTIVE"})
    return details, licensed, identities


class PublicationTests(unittest.TestCase):
    def test_complete_details_resolve_without_opid_and_preserve_exact_first9_weights(self):
        details, licensed, identities = fixture_payload()
        payload = resolve_payload(details, licensed, identities, [])
        self.assertEqual(len(payload["players"]), 10)
        self.assertEqual(len({p["id"] for p in payload["players"]}), 10)
        self.assertEqual([m["number"] for m in payload["matches"]], list(range(1, 21)))
        for player in payload["players"]:
            rows = [s for s in payload["stats"] if s["player_id"] == player["id"]]
            for target, source in [("score", "score"), ("darts_thrown", "darts"), ("first_9_score", "f9Score"), ("first_9_darts", "f9Darts")]:
                self.assertEqual(sum(s[target] for s in rows), player[source])
        yoann = next(p for p in payload["players"] if p["name"] == "Yoann MARQUES")
        yvan = next(p for p in payload["players"] if p["name"] == "Yvan GEFFROY")
        self.assertEqual(yoann["source_opid"], yvan["source_opid"])
        self.assertNotEqual(yoann["id"], yvan["id"])

    def test_unknown_ambiguous_wrong_team_and_inactive_players_block_publication(self):
        details, licensed, identities = fixture_payload()
        for bad in ("Joueur inconnu", "Nicolas DUPONT", "Yoan MARQUES"):
            changed = copy.deepcopy(details)
            changed["players"][0]["source_name"] = bad
            with self.assertRaises(SummaryUnavailable): resolve_payload(changed, licensed, identities, [])
        with self.assertRaises(SummaryUnavailable): resolve_payload(details, [], identities, [])
        with self.assertRaises(SummaryUnavailable): resolve_payload(details, licensed, [{**i, "status": "MERGED"} for i in identities], [])
        changed = copy.deepcopy(details)
        changed["players"].append(copy.deepcopy(changed["players"][0]))
        with self.assertRaises(SummaryUnavailable): resolve_payload(changed, licensed, identities, [])

    def test_observed_source_team_aliases_and_roster_sync(self):
        self.assertEqual(resolve_team("Tampon DC - Zarboutan")["id"], "tdc-zarboutan")
        self.assertEqual(resolve_team("3B darts club - B(rune)")["id"], "3bdc-blonde")
        self.assertEqual(resolve_team("Papangue DC - Fournaise")["id"], "pdc-fournaise")
        with self.assertRaises(SummaryUnavailable): resolve_team("Équipe X")
        source = Path(__file__).parents[2] / "frontend/lib/team-rosters-2027.ts"
        text = source.read_text()
        text = text[text.index("= [") + 2:text.index("\n];") + 2]
        text = re.sub(r"(\w+):", r'"\1":', text)
        self.assertEqual(ROSTERS, json.loads(re.sub(r",\s*([}\]])", r"\1", text)))


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        details, licensed, identities = fixture_payload()
        print(json.dumps({"payload": resolve_payload(details, licensed, identities, []), "licensed": licensed, "identities": identities}))
    elif "--read-paths" in sys.argv:
        from tests.test_visibility_summary import DB, Query
        from app.services.ranking_service import build_ranking
        from app.services.player_statistics_engine import PlayerStatisticsEngine
        from app.services.match_hub_service import team_match_history, build_match_hub
        from app.services.visibility_service import list_evenings
        Query.order = lambda self, *args, **kwargs: self
        Query.limit = lambda self, count: self.range(0, count - 1)
        rows = json.load(sys.stdin)
        db = DB(rows)
        ranking = build_ranking(db)
        assert ranking["summary"]["official_results"] == 2
        assert [t["points"] for t in ranking["standings"]] == [8, 2]
        assert [t["legs_won"] for t in ranking["standings"]] == [68, 22]
        engine = PlayerStatisticsEngine.from_db(db)
        emmanuel = next(p for p in engine.overview() if p["name"] == "Emmanuel GRASSET")
        assert emmanuel["legs_played"] == 28 and emmanuel["average_3_darts"] == 50.82
        dashboard = engine.dashboard(emmanuel["player_id"])
        assert dashboard["kpis"]["best_finish"] == 88
        team_id = rows["championship_results"][0]["home_team_id"]
        history = team_match_history(db, team_id)
        assert history["summary"]["played"] == 2
        assert sorted(e["date"] for e in list_evenings(db)["evenings"]) == ["2026-09-28", "2026-09-29"]
        for result in rows["championship_results"]:
            assert build_match_hub(db, result["id"])["result"]["played_on"] == result["played_on"]
        print("PASS public read paths: standings, team history, player overview/dashboard, match dates and visibility")
    else:
        unittest.main()
