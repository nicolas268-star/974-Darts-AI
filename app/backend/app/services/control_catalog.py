from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata


OFFICIAL_2026_SOURCE_URL = (
    "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154"
)


ROUTE_MANIFEST = (
    {"template": "/teams/[team_id]", "kind": "team"},
    {"template": "/matches/[result_id]", "kind": "match"},
    {"template": "/players/[player_id]", "kind": "player"},
    {
        "template": "/players/compare/[left_player_id]/[right_player_id]",
        "kind": "comparison",
    },
    {"template": "/duos/[player_1_id]/[player_2_id]", "kind": "duo"},
    {"template": "/tournaments/[code]", "kind": "tournament"},
    {"template": "/championships/[season]", "kind": "championship"},
)


@dataclass(frozen=True)
class SeasonProfile:
    year: int
    expected_teams: tuple[str, ...]
    expected_clubs: tuple[str, ...]
    expected_encounters: int | None
    state: str
    note: str


SEASON_PROFILES: dict[int, SeasonProfile] = {
    2026: SeasonProfile(
        year=2026,
        expected_teams=(
            "Kazadarts A",
            "Kazadarts B",
            "PDC Fournaise",
            "PDC Neige",
            "TDC",
            "3BDC",
        ),
        expected_clubs=(
            "Kazadarts",
            "Papangue Darts Club",
            "Tampon Darts Club",
            "3 Brasseurs Darts Club",
        ),
        expected_encounters=30,
        state="OFFICIAL",
        note="Saison officielle publiée sur le portail Nakka 974.",
    ),
    2027: SeasonProfile(
        year=2027,
        expected_teams=(
            "Kazadarts A",
            "Kazadarts B",
            "PDC Fournaise",
            "PDC Neige",
            "TDC A",
            "TDC B",
            "3BDC A",
            "3BDC B",
        ),
        expected_clubs=(
            "Kazadarts",
            "Papangue Darts Club",
            "Tampon Darts Club",
            "3 Brasseurs Darts Club",
        ),
        expected_encounters=None,
        state="PREPARED",
        note=(
            "Structure préparée pour huit équipes et quatre clubs. Les noms "
            "TDC A/B et 3BDC A/B restent provisoires jusqu'à confirmation."
        ),
    ),
}


TEAM_CLUBS: dict[str, str] = {
    "Kazadarts A": "Kazadarts",
    "Kazadarts B": "Kazadarts",
    "PDC Fournaise": "Papangue Darts Club",
    "PDC Neige": "Papangue Darts Club",
    "TDC": "Tampon Darts Club",
    "TDC A": "Tampon Darts Club",
    "TDC B": "Tampon Darts Club",
    "3BDC": "3 Brasseurs Darts Club",
    "3BDC A": "3 Brasseurs Darts Club",
    "3BDC B": "3 Brasseurs Darts Club",
}


def normalize_team_name(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


TEAM_ALIASES: dict[str, str] = {
    normalize_team_name(alias): canonical
    for canonical, aliases in {
        "Kazadarts A": ("Kazadarts A", "Kaz A", "Kaza A"),
        "Kazadarts B": ("Kazadarts B", "Kaz B", "Kaza B"),
        "PDC Fournaise": (
            "PDC Fournaise",
            "PDC Fournaises",
            "Fournaise",
            "Fournaises",
            "Papangue Fournaise",
            "Papangue Fournaises",
            "PDC St Leu Fournaise",
            "PDC St Leu Fournaises",
        ),
        "PDC Neige": (
            "PDC Neige",
            "Neige",
            "Papangue Neige",
            "PDC St Leu Neige",
        ),
        "TDC": ("TDC", "Tampon Darts Club", "Tampon Dart Club"),
        "TDC A": ("TDC A", "Tampon Darts Club A"),
        "TDC B": ("TDC B", "Tampon Darts Club B"),
        "3BDC": ("3BDC", "3 BDC", "3 Brasseurs Darts Club"),
        "3BDC A": ("3BDC A", "3 BDC A", "3 Brasseurs Darts Club A"),
        "3BDC B": ("3BDC B", "3 BDC B", "3 Brasseurs Darts Club B"),
    }.items()
    for alias in aliases
}


def canonical_team_name(value: str | None, season: int | None = None) -> str:
    normalized = normalize_team_name(value)
    # En 2026, les suffixes A/B n'existent pas pour TDC et 3BDC.
    if season == 2026 and normalized in {"tdc a", "tdc b"}:
        return "TDC"
    if season == 2026 and normalized in {"3bdc a", "3bdc b", "3 bdc a", "3 bdc b"}:
        return "3BDC"

    canonical = TEAM_ALIASES.get(normalized)
    if canonical:
        return canonical
    return str(value or "").strip()


def club_name(value: str | None, season: int | None = None) -> str:
    canonical = canonical_team_name(value, season)
    return TEAM_CLUBS.get(canonical, canonical)


@dataclass(frozen=True)
class OfficialFixture:
    round_code: str
    home_team: str
    away_team: str
    played_on: str
    event_id: str


OFFICIAL_2026_FIXTURES: tuple[OfficialFixture, ...] = (
    OfficialFixture("J1", "Kazadarts A", "Kazadarts B", "2026-03-02", "t_hmQR_6833"),
    OfficialFixture("J1", "PDC Neige", "PDC Fournaise", "2026-03-03", "t_52rp_9343"),
    OfficialFixture("J1", "3BDC", "TDC", "2026-03-04", "t_GT5z_4855"),
    OfficialFixture("J2", "Kazadarts B", "3BDC", "2026-03-09", "t_SBVm_7655"),
    OfficialFixture("J2", "PDC Fournaise", "Kazadarts A", "2026-03-10", "t_EYUu_6904"),
    OfficialFixture("J2", "TDC", "PDC Neige", "2026-03-12", "t_72wx_4042"),
    OfficialFixture("J3", "Kazadarts A", "3BDC", "2026-03-23", "t_jgBv_8923"),
    OfficialFixture("J3", "PDC Neige", "Kazadarts B", "2026-03-24", "t_CVQi_9471"),
    OfficialFixture("J3", "TDC", "PDC Fournaise", "2026-03-26", "t_bVZq_9577"),
    OfficialFixture("J4", "Kazadarts B", "TDC", "2026-03-30", "t_vo1D_9858"),
    OfficialFixture("J4", "PDC Neige", "Kazadarts A", "2026-03-31", "t_3iMM_0582"),
    OfficialFixture("J4", "3BDC", "PDC Fournaise", "2026-04-01", "t_KMcG_8098"),
    OfficialFixture("J5", "Kazadarts A", "TDC", "2026-04-13", "t_KurU_8468"),
    OfficialFixture("J5", "PDC Fournaise", "Kazadarts B", "2026-04-14", "t_8YaZ_5721"),
    OfficialFixture("J5", "3BDC", "PDC Neige", "2026-04-15", "t_Z1bT_8637"),
    OfficialFixture("J6", "Kazadarts B", "Kazadarts A", "2026-04-20", "t_x3Yk_3991"),
    OfficialFixture("J6", "PDC Fournaise", "PDC Neige", "2026-04-21", "t_nkk1_5515"),
    OfficialFixture("J6", "TDC", "3BDC", "2026-04-23", "t_xRxH_0081"),
    OfficialFixture("J7", "Kazadarts A", "PDC Fournaise", "2026-05-04", "t_lySq_1445"),
    OfficialFixture("J7", "PDC Neige", "TDC", "2026-05-05", "t_AWiX_0195"),
    OfficialFixture("J7", "3BDC", "Kazadarts B", "2026-05-06", "t_CPjO_2252"),
    OfficialFixture("J8", "Kazadarts B", "PDC Neige", "2026-05-18", "t_tnKX_7899"),
    OfficialFixture("J8", "PDC Fournaise", "TDC", "2026-05-20", "t_QjIC_2199"),
    OfficialFixture("J8", "3BDC", "Kazadarts A", "2026-05-20", "t_A3c8_4050"),
    OfficialFixture("J9", "Kazadarts A", "PDC Neige", "2026-06-01", "t_Jg9o_5777"),
    OfficialFixture("J9", "PDC Fournaise", "3BDC", "2026-06-02", "t_ukbk_1683"),
    OfficialFixture("J9", "TDC", "Kazadarts B", "2026-06-04", "t_qga2_2783"),
    OfficialFixture("J10", "Kazadarts B", "PDC Fournaise", "2026-06-08", "t_qQnG_2236"),
    OfficialFixture("J10", "3BDC", "PDC Neige", "2026-06-10", "t_PRvE_6859"),
    OfficialFixture("J10", "TDC", "Kazadarts A", "2026-06-11", "t_c9fY_8751"),
)


def official_fixture(
    round_code: str | None,
    home_team: str | None,
    away_team: str | None,
) -> OfficialFixture | None:
    code = str(round_code or "").strip().upper()
    home = canonical_team_name(home_team, 2026)
    away = canonical_team_name(away_team, 2026)
    pair = {home, away}
    return next(
        (
            fixture
            for fixture in OFFICIAL_2026_FIXTURES
            if fixture.round_code == code
            and {fixture.home_team, fixture.away_team} == pair
        ),
        None,
    )


def official_played_on(
    round_code: str | None,
    home_team: str | None,
    away_team: str | None,
) -> str | None:
    fixture = official_fixture(round_code, home_team, away_team)
    return fixture.played_on if fixture else None


def season_year(value: str | int | None) -> int | None:
    match = re.search(r"\b(20\d{2})\b", str(value or ""))
    return int(match.group(1)) if match else None
