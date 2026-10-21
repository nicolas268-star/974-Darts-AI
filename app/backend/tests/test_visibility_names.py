"""Sharing uses exact known aliases without changing scores or identities."""
from copy import deepcopy
import unittest

from app.services.visibility_names import VisibilityNames, render_context_names
from app.services.tournament_visibility import compose_tournament_summary
import test_visibility_summary as fixtures


class VisibilityNamesTests(unittest.TestCase):
    def test_full_names_source_order_and_unknown_player_fallback(self):
        names = VisibilityNames()
        for original, expected in (("Nicolas DUPONT", "Nico"), ("DUPONT Nicolas", "Nico"),
                                   ("Christophe FERNANDEZ", "Stoo"), ("Stéphane ABROUSSE", "Stéphane A"),
                                   ("Benoit BRUNET", "Benoit"), ("Nicolas", "Nicolas"),
                                   ("Visiteur inconnu", "Visiteur inconnu")):
            self.assertEqual(names.name(original), expected)

    def test_confirmed_aliases_and_historical_ids_follow_the_active_identity(self):
        identities = [{"id": "nico", "canonical_player_id": "p1", "canonical_display_name": "Nicolas DUPONT", "status": "ACTIVE"}]
        aliases = [{"identity_id": "nico", "alias_name": "Nico (PDC)", "source_player_id": "old", "confirmed": True},
                   {"identity_id": "nico", "alias_name": "NotConfirmed", "source_player_id": "wrong", "confirmed": False}]
        names = VisibilityNames(identities=identities, aliases=aliases)
        self.assertEqual(names.name("Nico (PDC)"), "Nico")
        self.assertEqual(names.name("Old spelling", "old"), "Nico")
        self.assertEqual(names.name("NotConfirmed", "wrong"), "NotConfirmed")

    def test_ambiguous_names_are_not_guessed_but_ids_resolve_each_player(self):
        rosters = [{"players": [{"officialName": "Jean DUPONT", "nakkaName": "JD1", "player_id": "one"},
                                {"officialName": "Jean DUPONT", "nakkaName": "JD2", "player_id": "two"}]}]
        names = VisibilityNames(rosters)
        self.assertEqual(names.name("Jean DUPONT"), "Jean DUPONT")
        self.assertEqual(names.name("Jean DUPONT", "one"), "JD1")
        self.assertEqual(names.name("Jean DUPONT", "two"), "JD2")

    def test_registered_nickname_is_read_again_and_invalidates_generated_draft(self):
        fixture = fixtures.VisibilitySummaryTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        db = fixture.db()
        db.rows["players"][0]["display_name"] = "Nicolas DUPONT"
        db.rows["player_identities"] = [{"id": "nico", "canonical_player_id": "p1", "canonical_display_name": "Nicolas DUPONT", "status": "ACTIVE"}]
        db.rows["player_registrations"] = [{"identity_id": "nico", "team_id": "a", "display_name": "Nicolas DUPONT",
                                           "nakka_name": "Nico", "season_key": "2026-2027", "joined_on": "2026-09-01", "club_code": "PDC"}]
        from app.services.visibility_service import load_evening, compose_summary
        first = compose_summary(load_evening(db, "result"), context="Nicolas DUPONT a signé un 180.")
        db.rows["player_registrations"][0]["nakka_name"] = "DataMan"
        before = deepcopy(db.rows)
        updated = compose_summary(load_evening(db, "result"), use_ai=False)
        self.assertEqual(db.rows, before)
        for channel in ("whatsapp", "facebook"):
            self.assertIn("DataMan", updated[channel])
            self.assertNotIn("Nicolas DUPONT", updated[channel])
        self.assertEqual(updated["context"], "Nicolas DUPONT a signé un 180.")
        self.assertNotEqual(first["fingerprint"], updated["fingerprint"])
        self.assertEqual(updated["evening"]["legs"], 2)

    def test_duplicate_canonical_name_cannot_assign_one_roster_alias_to_two_identities(self):
        identities = [{"id": key, "canonical_player_id": key, "canonical_display_name": "Jean DUPONT", "status": "ACTIVE"}
                      for key in ("one", "two")]
        names = VisibilityNames([{"players": [{"officialName": "Jean DUPONT", "nakkaName": "JD"}]}], identities)
        self.assertEqual(names.name("Jean DUPONT", "one"), "Jean DUPONT")
        self.assertEqual(names.name("Jean DUPONT", "two"), "Jean DUPONT")

    def test_context_replaces_only_complete_names_in_one_pass(self):
        original = "Nicolas DUPONT et Nicolas ont joué. Nicolas DUPONTSON aussi."
        self.assertEqual(render_context_names(original, {"Nicolas DUPONT": "Nico", "Nicolas": "Wrong"}),
                         "Nico et Nicolas ont joué. Nicolas DUPONTSON aussi.")

    def test_tournament_podium_performances_and_doublettes_use_nicknames(self):
        tournament = {"code": "test", "name": "Test", "discipline": "SINGLE",
                      "players": [{"name": "Nico (PDC)", "canonical_player_id": "p1", "average_3_darts": 45, "best_finish": 80}],
                      "display_aliases": {"Nico (PDC)": "Nicolas DUPONT"},
                      "official_results": [{"name": "Nicolas DUPONT", "canonical_player_id": "p1", "placement": "WINNER", "points": 30}]}
        summary = compose_tournament_summary(tournament)
        for channel in ("whatsapp", "facebook"):
            self.assertIn("Vainqueur : Nico (30 pts Comité)", summary[channel])
            self.assertIn("Nico, 45,00", summary[channel])
            self.assertNotIn("Nicolas DUPONT", summary[channel])
        tournament.update(discipline="DOUBLE", players=[], duos=[{"name": "Duo original", "nakka_participant_id": "duo", "average_3_darts": 40}])
        tournament["official_results"][0]["source_ref"] = "duo:1"
        tournament["official_results"].append({"name": "Christophe FERNANDEZ", "source_ref": "duo:2", "placement": "WINNER", "points": 30})
        summary = compose_tournament_summary(tournament)
        self.assertIn("Doublette vainqueur : Nico / Stoo", summary["whatsapp"])
        self.assertIn("Nico / Stoo, 40,00", summary["whatsapp"])
        self.assertIn("Nico : 30 pts", summary["whatsapp"])
        self.assertIn("60 au total", summary["whatsapp"])

    def test_unique_tournament_source_name_is_preserved_for_an_unknown_identity(self):
        tournament = {"code": "guest", "name": "Tournoi", "players": [{"name": "DartVisitor", "canonical_player_id": "visitor"}],
                      "display_aliases": {"DartVisitor": "Prénom NOM"},
                      "official_results": [{"name": "Prénom NOM", "canonical_player_id": "visitor", "placement": "WINNER", "points": 30}]}
        self.assertIn("Vainqueur : DartVisitor", compose_tournament_summary(tournament)["facebook"])
