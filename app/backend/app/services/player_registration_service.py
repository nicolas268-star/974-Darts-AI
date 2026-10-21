"""Season registrations shared by admin, public rosters and Nakka publication."""
from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo
import re

from .ranking_service import _all
from .control_catalog import SEASON_PROFILES, canonical_team_name, normalize_team_name


def today():
    return datetime.now(ZoneInfo("Indian/Reunion")).date().isoformat()


def registrations(db, *, optional=False):
    try:
        return _all(db, "player_registrations", "*")
    except Exception:
        if optional:
            return []  # Allows rolling deployment before the additive migration.
        raise


def season_key(name):
    years = re.findall(r"20\d{2}", name or "")
    if not years:
        raise ValueError("Saison sans année identifiable.")
    year = int(years[-1])
    return f"{year - 1}-{year}"


def admin_options(db):
    seasons = _all(db, "seasons", "id,name,is_active")
    # The catalog can contain two 2026 archives; keep the official named season.
    by_key = {}
    for season in sorted(seasons, key=lambda s: (bool(s.get("is_active")), len(s["name"]))):
        by_key[season_key(season["name"])] = {**season, "key": season_key(season["name"])}
    teams = _all(db, "teams", "id,name,official_club_code")
    clubs = _all(db, "committee_clubs", "code,name,is_active")
    # Legacy aliases remain in the database for historical matches.
    canonical = {}
    for team in teams:
        name = canonical_team_name(team["name"], 2027)
        if name in SEASON_PROFILES[2026].expected_teams and name not in SEASON_PROFILES[2027].expected_teams:
            continue
        key = normalize_team_name(name)
        if team.get("official_club_code") and (key not in canonical or team["name"] == name):
            canonical[key] = {**team, "name": name}
    identities = _all(db, "player_identities", "id,canonical_player_id,canonical_display_name,status")
    return {
        "seasons": sorted(by_key.values(), key=lambda s: (not s.get("is_active"), s["key"])),
        "clubs": [c for c in clubs if c.get("is_active")],
        "teams": sorted(canonical.values(), key=lambda t: t["name"]),
        "players": [{"identity_id": i["id"], "player_id": i["canonical_player_id"], "name": i["canonical_display_name"]}
                    for i in identities if i["status"] == "ACTIVE"],
        "registrations": sorted(registrations(db), key=lambda r: r["created_at"], reverse=True),
    }


def save_registration(db, payload, actor_id):
    try:
        result = db.rpc("register_club_player", {"p": payload, "actor": actor_id}).execute().data
    except Exception as exc:
        messages = {
            "REG_DUPLICATE_PLAYER": "Ce joueur existe déjà. Sélectionne sa fiche dans « Joueur existant ».",
            "REG_DUPLICATE_LICENSE": "Ce numéro de licence est déjà utilisé pour cette saison.",
            "REG_ALIAS_CONFLICT": "Ce pseudo Nakka est déjà associé à un autre joueur. Vérifie l’identité.",
            "REG_TEAM_CONFLICT": "Ce joueur est déjà inscrit dans une autre équipe cette saison. Utilise les transferts.",
            "REG_INVALID": "Vérifie la saison, le club, l’équipe, la date et les informations du joueur.",
            "REG_REQUEST_CONFLICT": "Cette validation a déjà été utilisée. Recharge le formulaire.",
        }
        for marker, message in messages.items():
            if marker in str(exc):
                raise ValueError(message) from None
        raise
    if not isinstance(result, dict) or not result.get("player_id"):
        raise RuntimeError("Registration was not confirmed")
    return result


def official_rosters(db, key="2026-2027", *, as_of=None):
    from .interclub_publication_service import ROSTERS, resolve_team

    rosters = deepcopy(ROSTERS) if key == "2026-2027" else []
    teams = {str(t["id"]): t for t in _all(db, "teams", "id,name,official_club_code")}
    identities = {str(i["id"]): i for i in _all(db, "player_identities", "id,canonical_player_id,status")}
    rows = [r for r in registrations(db, optional=True) if r["season_key"] == key and r["joined_on"] <= (as_of or today())]
    for row in rows:
        team = teams.get(str(row["team_id"]))
        identity = identities.get(str(row["identity_id"]))
        if not team or not identity or identity["status"] != "ACTIVE":
            continue
        roster = next((r for r in rosters if r["id"] == str(team["id"])), None)
        if key == "2026-2027":
            try:
                roster_id = resolve_team(team["name"])["id"]
                roster = next(r for r in rosters if r["id"] == roster_id)
            except ValueError:
                pass  # A separately configured team can be represented by its database ID.
        if roster is None:
            roster = {"id": str(team["id"]), "name": team["name"], "club": row["club_code"], "players": []}
            rosters.append(roster)
        from .interclub_publication_service import name_key
        for other in rosters:
            other["players"] = [m for m in other["players"] if m.get("player_id") != str(identity["canonical_player_id"])
                                and name_key(m["officialName"]) != name_key(row["display_name"])]
        roster["players"].append({"officialName": row["display_name"], "nakkaName": row["nakka_name"] or row["display_name"],
                                  "license": "", "player_id": str(identity["canonical_player_id"])})
    for roster in rosters:
        candidates = [t for t in teams.values() if canonical_team_name(t["name"], int(key[-4:])) == roster["name"]]
        candidates.sort(key=lambda t: (t["name"] != roster["name"], str(t["id"])))
        if candidates:
            roster["team_id"] = str(candidates[0]["id"])
    return rosters
