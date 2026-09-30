"""Canonical identities and atomic publication of validated interclub details."""
from copy import deepcopy
import json
from pathlib import Path
import re
import unicodedata

from .ranking_service import _all
from .visibility_service import SummaryUnavailable

ROSTERS = json.loads(Path(__file__).with_name("interclub_rosters_2027.json").read_text())
CLUBS = {"kaz": "KAD", "pdc": "PDC", "tdc": "TDC", "3bdc": "3BDC"}


def name_key(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    # Full names may be FIRST LAST or LAST FIRST; never fuzzy-match identities.
    return " ".join(sorted(re.findall(r"[a-z0-9]+", value.lower())))


def resolve_team(name):
    aliases = {
        name_key("Tampon DC - Zarboutan"): "tdc-zarboutan",
        name_key("Tampon DC - Zarlor"): "tdc-zarlor",
        name_key("Papangue DC - Fournaise"): "pdc-fournaise",
        name_key("Papangue DC - Neige"): "pdc-neige",
        name_key("3B Darts Club - A(mbrée)"): "3bdc-ambre",
        name_key("3B Darts Club - B(rune)"): "3bdc-blonde",
    }
    found = [r for r in ROSTERS if name_key(r["name"]) == name_key(name) or r["id"] == aliases.get(name_key(name))]
    if len(found) != 1:
        raise SummaryUnavailable(f"Équipe non reconnue dans l’effectif officiel : {name}.")
    return found[0]


def resolve_payload(details, licensed, identities, aliases):
    payload = deepcopy(details)
    if payload["season"] != "2026-2027" or payload["league_id"] != "lg_EUoR_6095":
        raise SummaryUnavailable("Les effectifs de cette saison doivent être configurés.")
    by_identity = {i["id"]: i for i in identities if i["status"] == "ACTIVE"}
    official = {}
    for row in licensed:
        if row["season_key"] == payload["season"] and row["license_status"] == "ACTIVE" and row.get("identity_id") in by_identity:
            official.setdefault(name_key(row["official_display_name"]), []).append(row)
    rosters = {}
    for team in payload["teams"]:
        roster = resolve_team(team["name"])
        team.update(name=roster["name"], club_code=CLUBS[roster["id"].split("-")[0]])
        rosters[team["source_id"]] = roster
    if len({t["name"] for t in payload["teams"]}) != 2:
        raise SummaryUnavailable("Les deux équipes doivent être distinctes.")
    canonical = {}
    for player in payload["players"]:
        roster = rosters[player["team_id"]]
        candidates = {}
        for member in roster["players"]:
            rows = official.get(name_key(member["officialName"]), [])
            if len(rows) != 1:
                continue
            row = rows[0]
            expected_club = CLUBS[roster["id"].split("-")[0]]
            if row["club_code"] != expected_club:
                continue
            identity = by_identity[row["identity_id"]]
            names = [member["officialName"], member["nakkaName"], row["official_source_name"],
                     *[a["alias_name"] for a in aliases if a["identity_id"] == identity["id"] and a.get("confirmed") is True]]
            if name_key(player["source_name"]) in {name_key(n) for n in names}:
                candidates[identity["canonical_player_id"]] = identity
        if len(candidates) != 1:
            raise SummaryUnavailable(f"Identité ou équipe à vérifier pour {player['source_name']}.")
        player_id, identity = next(iter(candidates.items()))
        if player_id in canonical.values():
            raise SummaryUnavailable("Un joueur apparaît sous plusieurs identifiants Nakka.")
        canonical[player["source_id"]] = player_id
        # A source opid is an audit hint only (Yoann/Yvan share a wrong opid on J1).
        player.update(id=player_id, identity_id=identity["id"], name=identity["canonical_display_name"])
    for row in payload["stats"]:
        row["player_id"] = canonical[row["player_id"]]
    return payload


def publish_collected(collected, *, db=None):
    if db is None:
        from supabase import create_client
        from app.config import settings
        db = create_client(settings.supabase_url, settings.supabase_service_role_key)
    payload = resolve_payload(collected["publication"],
                              _all(db, "committee_licensed_players", "season_key,official_display_name,official_source_name,club_code,identity_id,license_status"),
                              _all(db, "player_identities", "id,canonical_player_id,canonical_display_name,status"),
                              _all(db, "player_aliases", "identity_id,alias_name,confirmed"))
    try:
        result = db.rpc("publish_interclub_match", {"p": payload}).execute().data
    except Exception as exc:
        # Surface known business errors only, never raw database/credential details.
        code = str(exc)
        if any(marker in code for marker in ("INTERCLUB_SOURCE_CHANGED", "INTERCLUB_EXISTING_RESULT_CONFLICT", "INTERCLUB_STORED_")):
            raise SummaryUnavailable("Un résultat déjà publié diffère de la source. Vérification nécessaire ; les données publiées sont conservées.") from None
        if "INTERCLUB_CANONICAL_IDENTITY_CHANGED" in code:
            raise SummaryUnavailable("Une identité officielle a changé. Nouvelle vérification automatique.") from None
        raise
    if not isinstance(result, dict) or result.get("status") not in ("PUBLISHED", "UNCHANGED"):
        raise SummaryUnavailable("La publication n’a pas été confirmée. Nouvelle tentative automatique.")
    return result
