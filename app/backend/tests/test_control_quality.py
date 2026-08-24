from __future__ import annotations

import re
import unittest

from app.services.control_catalog import (
    OFFICIAL_2026_FIXTURES,
    ROUTE_MANIFEST,
    SEASON_PROFILES,
    canonical_team_name,
    club_name,
    official_fixture,
)


class ControlQualityCatalogTests(unittest.TestCase):
    def test_2026_reference_has_six_teams_four_clubs_and_thirty_matches(self) -> None:
        profile = SEASON_PROFILES[2026]
        self.assertEqual(len(profile.expected_teams), 6)
        self.assertEqual(len(profile.expected_clubs), 4)
        self.assertEqual(profile.expected_encounters, 30)
        self.assertEqual(len(OFFICIAL_2026_FIXTURES), 30)

    def test_2027_is_prepared_for_eight_teams_and_four_clubs(self) -> None:
        profile = SEASON_PROFILES[2027]
        self.assertEqual(len(profile.expected_teams), 8)
        self.assertEqual(len(profile.expected_clubs), 4)
        self.assertEqual(profile.state, "PREPARED")

    def test_2026_official_dates_and_event_ids_are_complete_and_unique(self) -> None:
        dates = [fixture.played_on for fixture in OFFICIAL_2026_FIXTURES]
        event_ids = [fixture.event_id for fixture in OFFICIAL_2026_FIXTURES]
        self.assertTrue(all(re.fullmatch(r"2026-\d{2}-\d{2}", value) for value in dates))
        self.assertEqual(len(set(event_ids)), 30)

    def test_j1_collective_only_fixture_is_preserved(self) -> None:
        fixture = official_fixture("J1", "Kazadarts A", "Kazadarts B")
        self.assertIsNotNone(fixture)
        self.assertEqual(fixture.event_id, "t_hmQR_6833")
        self.assertEqual(fixture.played_on, "2026-03-02")

    def test_fixture_lookup_is_independent_of_home_away_order(self) -> None:
        direct = official_fixture("J10", "TDC", "Kazadarts A")
        reverse = official_fixture("J10", "Kazadarts A", "TDC")
        self.assertEqual(direct, reverse)

    def test_fournaise_aliases_share_one_canonical_team(self) -> None:
        self.assertEqual(canonical_team_name("Fournaise", 2026), "PDC Fournaise")
        self.assertEqual(canonical_team_name("PDC Fournaise", 2026), "PDC Fournaise")
        self.assertEqual(canonical_team_name("Fournaises", 2026), "PDC Fournaise")
        self.assertEqual(canonical_team_name("PDC Fournaises", 2026), "PDC Fournaise")
        self.assertEqual(club_name("Fournaise", 2026), "Papangue Darts Club")

    def test_2026_collapses_provisional_tdc_and_3bdc_suffixes(self) -> None:
        self.assertEqual(canonical_team_name("TDC A", 2026), "TDC")
        self.assertEqual(canonical_team_name("3BDC B", 2026), "3BDC")
        self.assertEqual(canonical_team_name("TDC A", 2027), "TDC A")
        self.assertEqual(canonical_team_name("3BDC B", 2027), "3BDC B")

    def test_dynamic_route_manifest_is_complete(self) -> None:
        templates = {item["template"] for item in ROUTE_MANIFEST}
        self.assertEqual(
            templates,
            {
                "/teams/[team_id]",
                "/matches/[result_id]",
                "/players/[player_id]",
                "/players/compare/[left_player_id]/[right_player_id]",
                "/duos/[player_1_id]/[player_2_id]",
                "/tournaments/[code]",
                "/championships/[season]",
            },
        )


if __name__ == "__main__":
    unittest.main()
