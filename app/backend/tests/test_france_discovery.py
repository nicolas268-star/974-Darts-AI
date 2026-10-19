from __future__ import annotations

import copy
import io
import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError

from app.services.france_discovery_model import (
    digest, normalize_competition, public_competitions, season_key, suggestions, timestamp,
)
from app.services.france_discovery_report import render_report, safe_cell
from app.services.france_discovery_service import DiscoveryService, sanitize
from app.services.france_discovery_store import SQLiteStore, SupabaseStore, promote_initial_inventory
from app.services.n01_public_client import N01Client, N01Error

FIXTURE = json.loads((Path(__file__).parent / "fixtures/france_discovery/tournament.json").read_text(encoding="utf-8"))
ID = "t_FIXTURE_001"


def evidence(target):
    return {"target": target, "url": "https://official.example.test/results/fixture", "kind": "OFFICIAL_LINK",
            "justification": "Synthetic evidence for tests only", "checked_at": "2026-10-19T00:00:00Z"}


def committee(key="fixture-committee"):
    return {"id": key, "name": "Comité de test", "organism_type": "COMMITTEE", "aliases": ["Comité de test"],
            "verification_status": "VERIFIED", "evidence": evidence(key)}


def observation(envelope=None):
    env = copy.deepcopy(envelope or FIXTURE)
    record = normalize_competition(env)
    return {"record": record, "source": {"n01_id": record["n01_id"], "source_hash": digest(env), "raw": env}}


class Response(io.BytesIO):
    pass


def response(value):
    return Response(json.dumps(value).encode())


class FakeAPI:
    """Synthetic transport, fully separate from real discovery data."""
    def __init__(self, *, fail=None, entries=None):
        self.requests = 0
        self.calls = []
        self.fail = fail
        self.entries = entries or [copy.deepcopy(FIXTURE["tournament"])]
        self.trace = []

    def get(self, endpoint, **params):
        self.requests += 1
        self.calls.append((endpoint, params))
        if endpoint == self.fail:
            raise N01Error("fixture failure")
        if endpoint == "tournament/get":
            env = copy.deepcopy(FIXTURE)
            env["tournament"] = copy.deepcopy(next(x for x in self.entries if x["tdid"] == params["tdid"]))
            env["url"] = "https://n01darts.com/n01/league/season.php?id=" + params["tdid"]
            return env
        if endpoint == "tournament/entry/list":
            return {"result": 0, "list": copy.deepcopy(FIXTURE["tournament"]["entry_list"])}
        if endpoint == "tournament/stats":
            return {"result": 0, "stats": {}}
        if endpoint == "tournament/standings":
            raise N01Error("No supported group", result=-51)
        raise AssertionError(endpoint)

    def pages(self, endpoint, **params):
        self.requests += 1
        self.calls.append((endpoint, params))
        if endpoint == "league/list" or endpoint == "match/list":
            yield params.get("skip", 0), []
        else:
            yield params.get("skip", 0), copy.deepcopy(self.entries)


class ClientTests(unittest.TestCase):
    def test_pagination_and_filters(self):
        urls = []
        replies = iter([{"result": 0, "list": [{"tdid": "t_FIXTURE_1"}]}, {"result": 0, "list": []}])
        def open_(req, **kw):
            urls.append(req.full_url)
            self.assertNotIn("Authorization", req.headers)
            return response(next(replies))
        client = N01Client(opener=open_, sleep=lambda _: None)
        self.assertEqual(len(list(client.pages("tournament/list", count=1, keyword="comité", t_date__gte=1735689600))), 2)
        self.assertIn("skip=1", urls[1])
        self.assertIn("t_date__gte=1735689600", urls[0])
        self.assertIn("keyword=comit%C3%A9", urls[0])

    def test_bad_envelopes_and_application_errors(self):
        for bad in ([], {}, {"result": "0"}, {"result": False}, {"result": -51, "error": "bad field"}):
            with self.subTest(bad=bad), self.assertRaises(N01Error):
                N01Client(opener=lambda *a, **kw: response(bad)).get("league/list")

    def test_malformed_json_not_retried(self):
        with self.assertRaisesRegex(N01Error, "Invalid JSON"):
            N01Client(opener=lambda *a, **kw: Response(b"<html>bad</html>")).get("league/list")

    def test_429_retry_after_and_progressive_network_retry(self):
        waits = []
        replies = iter([HTTPError("x", 429, "limited", {"Retry-After": "7"}, None),
                        URLError("temporary"), {"result": 0, "list": []}])
        def open_(*args, **kw):
            reply = next(replies)
            if isinstance(reply, Exception):
                raise reply
            return response(reply)
        client = N01Client(opener=open_, sleep=waits.append, interval=0)
        client.get("league/list")
        self.assertIn(7, waits)
        self.assertIn(2, waits)
        self.assertEqual(client.requests, 3)

    def test_http_date_retry_after(self):
        from email.utils import format_datetime
        waits = []
        attempts = iter([HTTPError("x", 429, "limited", {"Retry-After": format_datetime(datetime.now(UTC) + timedelta(seconds=8))}, None), None])
        def open_(*args, **kw):
            error = next(attempts)
            if error:
                raise error
            return response({"result": 0})
        N01Client(opener=open_, sleep=waits.append, interval=0).get("league/list")
        self.assertTrue(any(x > 6 for x in waits))

    def test_permanent_http_error_not_retried(self):
        def open_(*a, **kw):
            raise HTTPError("x", 404, "missing", {}, None)
        client = N01Client(opener=open_)
        with self.assertRaises(N01Error) as caught:
            client.get("league/get", lgid="lg_FIXTURE_001")
        self.assertEqual(caught.exception.http, 404)
        self.assertEqual(client.requests, 1)

    def test_application_error_inside_http_400_and_404(self):
        for http, result in ((400, -51), (404, -1)):
            def open_(*a, **kw):
                raise HTTPError("x", http, "application error", {}, response({"result": result, "error": "fixture"}))
            with self.subTest(http=http), self.assertRaises(N01Error) as caught:
                N01Client(opener=open_).get("tournament/standings", tdid=ID)
            self.assertEqual(caught.exception.result, result)
            self.assertEqual(caught.exception.http, http)

    def test_no_mutations_authentication_or_infinite_pagination(self):
        client = N01Client(opener=lambda *a, **kw: response({"result": 0, "list": [{}]}), sleep=lambda _: None)
        for endpoint, params in (("tournament/create", {}), ("league/list", {"owner": 1}), ("league/list", {"admin_id": "me"})):
            with self.assertRaises(ValueError):
                client.get(endpoint, **params)
        with self.assertRaisesRegex(N01Error, "Repeated page"):
            list(client.pages("league/list", count=1))
        with self.assertRaises(ValueError):
            list(client.pages("league/list", count=101))
        with self.assertRaisesRegex(N01Error, "Page budget"):
            list(client.pages("league/list", count=1, max_pages=1))

    def test_invalid_list(self):
        for rows in (None, {}, ["bad"]):
            with self.subTest(rows=rows), self.assertRaises(N01Error):
                list(N01Client(opener=lambda *a, **kw: response({"result": 0, "list": rows})).pages("league/list"))


class ModelAndStoreTests(unittest.TestCase):
    def setUp(self):
        self.store = SQLiteStore()
        self.addCleanup(self.store.close)
        self.store.command("committee", committee())
        self.store.command("observe", observation())

    def decide(self, status="VERIFIED", **extra):
        return self.store.command("decide", {"n01_id": ID, "committee_id": "fixture-committee", "status": status,
            "actor": "test-operator", "reason": "test decision", "evidence": evidence(ID), **extra})

    def test_seconds_milliseconds_missing_and_invalid(self):
        self.assertEqual(timestamp(1792267200), timestamp(1792267200000))
        for value in (0, None, "bad", float("nan"), float("inf"), -1, True):
            self.assertIsNone(timestamp(value))
        self.assertEqual(season_key("2026-08-31"), "2025-2026")
        self.assertEqual(season_key("2026-09-01"), "2026-2027")
        self.assertEqual(season_key("2026-07-01", 7), "2026-2027")

    def test_n01_statuses_formats_and_unknowns(self):
        for status, expected in ((10, "PREPARING"), (20, "ENTRIES_OPEN"), (25, "BUILDING_BRACKET"),
                                 (30, "IN_PROGRESS"), (40, "FINISHED"), (999, "UNKNOWN")):
            env = copy.deepcopy(FIXTURE)
            env["tournament"]["status"] = status
            self.assertEqual(normalize_competition(env)["status"], expected)
        record = normalize_competition(FIXTURE)
        self.assertEqual(record["formats"], ["ROUND_ROBIN", "DOUBLE_ELIMINATION"])
        env = {"tournament": {"tdid": ID}}
        record = normalize_competition(env)
        for field in ("competition_date", "season", "participants", "formats", "source_url"):
            self.assertIsNone(record[field])
        self.assertNotIn("winner", record)

    def test_idempotent_observations_and_catalogue(self):
        self.store.command("committee", committee())
        before = len(self.store.rows("history"))
        self.assertFalse(self.store.command("observe", observation())["changed"])
        self.assertEqual(len(self.store.rows("competitions")), 1)
        self.assertEqual(len(self.store.rows("history")), before)

    def test_similarity_and_ambiguous_names_never_publish(self):
        choices = suggestions(normalize_competition(FIXTURE), [committee(), committee("second")], [])
        self.assertEqual(len(choices), 2)
        self.assertTrue(all(c["status"] == "REVIEW_REQUIRED" for c in choices))
        self.assertEqual(public_competitions(self.store.snapshot()), [])

    def test_verification_requires_targeted_proof_and_actor(self):
        for extra in ({"evidence": None}, {"evidence": evidence("wrong")}, {"actor": ""}, {"reason": ""}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                self.decide(**extra)
        self.assertEqual(public_competitions(self.store.snapshot()), [])
        self.decide()
        self.assertEqual(len(public_competitions(self.store.snapshot())), 1)

    def test_club_cannot_be_verified_as_committee(self):
        row = committee("club")
        row["organism_type"] = "CLUB"
        with self.assertRaises(ValueError):
            self.store.command("committee", row)

    def test_audited_organism_correction_is_preserved(self):
        self.store.command("correct_committee", {"id": "fixture-committee", "actor": "test-admin",
            "reason": "Territorial proof checked", "overrides": {"department": "Test territory"}})
        self.assertEqual(self.store.get("committees", "fixture-committee")["department"], "Test territory")
        with self.assertRaises(ValueError):
            self.store.command("committee", committee())

    def test_seed_does_not_erase_observed_league_metadata(self):
        self.store.command("league", {"n01_id": "lg_FIXTURE_001", "raw": {"title": "Public title"},
            "committee_id": "fixture-committee", "verification_status": "REVIEW_REQUIRED"})
        self.store.command("league", {"n01_id": "lg_FIXTURE_001", "title": "New title", "committee_id": "wrong"})
        league = self.store.get("leagues", "lg_FIXTURE_001")
        self.assertEqual(league["raw"], {"title": "Public title"})
        self.assertEqual(league["committee_id"], "fixture-committee")

    def test_conflicting_decisions_and_revoke(self):
        self.store.command("committee", committee("second"))
        self.decide()
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.decide(committee_id="second", evidence=evidence(ID))
        self.decide("REJECTED")
        self.assertEqual(public_competitions(self.store.snapshot()), [])
        self.decide(committee_id="second", evidence=evidence(ID))
        self.assertEqual(public_competitions(self.store.snapshot())[0]["committee_id"], "second")

    def test_manual_corrections_and_rejections_survive_new_source(self):
        self.decide("REJECTED")
        self.store.command("correct", {"n01_id": ID, "actor": "test-admin", "reason": "date checked", "overrides": {"title": "Corrected title"}})
        env = copy.deepcopy(FIXTURE)
        env["tournament"]["title"] = "Changed on source"
        self.assertTrue(self.store.command("observe", observation(env))["changed"])
        self.assertEqual(self.store.get("competitions", ID)["title"], "Corrected title")
        self.store.command("suggest", {"n01_id": ID, "committee_id": "fixture-committee", "score": 99})
        self.assertEqual(self.store.rows("candidates")[0]["status"], "REJECTED")

    def test_private_deleted_and_inaccessible_sources_withdraw(self):
        self.decide()
        self.store.command("withdraw", {"n01_id": ID})
        self.assertEqual(public_competitions(self.store.snapshot()), [])
        self.assertEqual(self.store.get("competitions", ID)["verification_status"], "VERIFIED")

    def test_dry_clone_and_readonly_report_do_not_mutate_database(self):
        clone = self.store.clone()
        clone.command("withdraw", {"n01_id": ID})
        clone.close()
        self.assertTrue(self.store.get("competitions", ID)["source_public"])
        before = self.store.snapshot()
        md, csv = render_report(before)
        self.assertIn("validation nécessaire", md)
        self.assertIn("UNASSIGNED", csv)
        self.assertEqual(self.store.snapshot(), before)
        self.assertEqual(safe_cell("=SUM(A1)"), "'=SUM(A1)")
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "inventory.sqlite"
            disk = SQLiteStore(path)
            disk.close()
            raw = path.read_bytes()
            disk = SQLiteStore(path, readonly=True)
            render_report(disk.snapshot())
            disk.close()
            self.assertEqual(raw, path.read_bytes())

    def test_source_sanitizer(self):
        result = sanitize({"co_admin_id": "secret", "entries": [{"name": "Public name", "email": "private"}], "join_pass": "secret"})
        self.assertEqual(result, {"entries": [{"name": "Public name"}]})


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.store = SQLiteStore()
        self.addCleanup(self.store.close)

    def run_discovery(self, api, **kw):
        return DiscoveryService(api, self.store).run(keywords=["comité"], until="2027-08-31", enrich=False, **kw)

    def test_discovery_repeat_and_changed_update(self):
        api = FakeAPI()
        first = self.run_discovery(api)
        self.assertEqual(first["status"], "SUCCEEDED")
        self.run_discovery(api)
        self.assertEqual(len(self.store.rows("competitions")), 1)
        self.assertEqual(len(self.store.rows("sources")), 1)
        api.entries[0]["title"] = "New source title"
        service = DiscoveryService(api, self.store)
        service.run(mode="update", keywords=["comité"], until="2027-08-31", enrich=False)
        self.assertEqual(self.store.get("competitions", ID)["title"], "New source title")

    def test_failure_checkpoint_and_resume(self):
        first = self.run_discovery(FakeAPI(fail="tournament/get"))
        self.assertEqual(first["status"], "PARTIAL")
        self.assertEqual(self.store.rows("competitions"), [])
        final = self.run_discovery(FakeAPI(), resume=first["id"])
        self.assertEqual(final["status"], "SUCCEEDED")
        self.assertEqual(len(self.store.rows("competitions")), 1)
        self.assertEqual(final["last_attempt_errors"], [])

    def test_detail_budget_resumes_inside_page(self):
        second = copy.deepcopy(FIXTURE["tournament"])
        second["tdid"] = "t_FIXTURE_002"
        api = FakeAPI(entries=[FIXTURE["tournament"], second])
        run = self.run_discovery(api, detail_budget=1)
        self.assertEqual(run["status"], "PARTIAL")
        self.assertEqual(len(self.store.rows("competitions")), 1)
        run = self.run_discovery(api, resume=run["id"], detail_budget=1)
        self.assertEqual(len(self.store.rows("competitions")), 2)
        # Depending on the task boundary one final empty-page checkpoint may remain.
        if run["status"] == "PARTIAL":
            run = self.run_discovery(api, resume=run["id"], detail_budget=1)
        self.assertEqual(run["status"], "SUCCEEDED")

    def test_resume_refuses_different_window(self):
        run = self.run_discovery(FakeAPI(fail="tournament/get"))
        with self.assertRaises(ValueError):
            DiscoveryService(FakeAPI(), self.store).run(resume=run["id"], since="2026-01-01")

    def test_interruption_records_checkpoint_and_can_resume(self):
        api = FakeAPI()
        def interrupted(*args, **kwargs):
            raise KeyboardInterrupt()
        api.get = interrupted
        with self.assertRaises(KeyboardInterrupt):
            self.run_discovery(api)
        run = self.store.rows("runs")[0]
        self.assertEqual(run["status"], "INTERRUPTED")
        final = self.run_discovery(FakeAPI(), resume=run["id"])
        self.assertEqual(final["status"], "SUCCEEDED")

    def test_private_league_event_is_never_stored(self):
        item = copy.deepcopy(FIXTURE["tournament"])
        item["private"] = 1
        self.run_discovery(FakeAPI(entries=[item]))
        self.assertEqual(self.store.rows("sources"), [])

    def test_out_of_range_and_unknown_dates_excluded(self):
        for stamp in (0, 1, 2000000000):
            item = copy.deepcopy(FIXTURE["tournament"])
            item["t_date"] = stamp
            self.run_discovery(FakeAPI(entries=[item]))
        self.assertEqual(self.store.rows("competitions"), [])

    def test_unchanged_skips_auxiliary_endpoints(self):
        api = FakeAPI()
        service = DiscoveryService(api, self.store)
        service.collect(ID)
        self.assertEqual(self.store.get("sources", ID)["raw"]["standings"]["result"], -51)
        api.calls.clear()
        self.assertFalse(service.collect(ID))
        self.assertEqual([c[0] for c in api.calls], ["tournament/get"])

    def test_enrichment_failure_does_not_partially_overwrite(self):
        service = DiscoveryService(FakeAPI(fail="tournament/stats"), self.store)
        with self.assertRaises(N01Error):
            service.collect(ID)
        self.assertEqual(self.store.rows("competitions"), [])

    def test_force_results_rechecks_auxiliary_endpoints(self):
        api = FakeAPI()
        service = DiscoveryService(api, self.store)
        service.collect(ID)
        api.calls.clear()
        service.collect(ID, force_results=True)
        self.assertIn("tournament/stats", [c[0] for c in api.calls])

    def test_inaccessible_source_masks_previously_verified_row(self):
        self.store.command("committee", committee())
        self.store.command("observe", observation())
        self.store.command("decide", {"n01_id": ID, "committee_id": "fixture-committee", "status": "VERIFIED",
            "actor": "test", "reason": "test", "evidence": evidence(ID)})
        api = FakeAPI()
        def inaccessible(*args, **kwargs):
            raise N01Error("Private", result=-1, http=404)
        api.get = inaccessible
        DiscoveryService(api, self.store).collect(ID)
        self.assertEqual(public_competitions(self.store.snapshot()), [])


class PromotionTests(unittest.TestCase):
    def test_real_source_promotion_is_idempotent_and_does_not_publish_local_decisions(self):
        source, target = SQLiteStore(), SQLiteStore()
        self.addCleanup(source.close)
        self.addCleanup(target.close)
        source.command("committee", committee())
        observation_ = observation()
        observation_["source"]["record"] = observation_["record"]
        source.command("observe", observation_)
        source.command("decide", {"n01_id": ID, "committee_id": "fixture-committee", "status": "VERIFIED",
            "actor": "test-only", "reason": "Test local decision", "evidence": evidence(ID)})
        first = promote_initial_inventory(source, target)
        self.assertEqual(first["competitions"], 1)
        self.assertEqual(public_competitions(target.snapshot()), [])
        self.assertEqual(target.get("sources", ID)["raw"], source.get("sources", ID)["raw"])
        target.command("correct", {"n01_id": ID, "actor": "test", "reason": "Target correction", "overrides": {"title": "Target title"}})
        second = promote_initial_inventory(source, target)
        self.assertTrue(all(v == 0 for v in second.values()))
        self.assertEqual(target.get("competitions", ID)["title"], "Target title")


if __name__ == "__main__":
    unittest.main()
