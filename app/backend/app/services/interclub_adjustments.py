"""Organiser-confirmed exceptions, scoped to one immutable Nakka encounter.

The raw source is validated first. Only result flags are corrected afterwards;
scoring, visits and canonical identities are never exchanged.
"""
from collections import Counter
from copy import deepcopy

from .visibility_service import SummaryUnavailable, build_facts

EVENT = "t_uAfU_5679"
MATCH = "8jsiG9Na_1791996900443"
BENOIT = "a9fded26-6e5a-489e-b15c-fb5568ee553d"
CHRISTOPHE = "78c05fc0-340e-43fa-93d6-7aadd225fe36"
GUEST_IDENTITY = "45f23d50-2f77-4ef4-983c-2cca7f5a425f"
REASON = "Inversion de score confirmée par l’organisateur"
GUEST_NOTE = "Renfort exceptionnel pour Ambrée — équipe habituelle : Brune"
USUAL_TEAM = "3B Darts Club - B(rune)"


def usual_team_for_encounter(encounter, player_id):
    """A guest's represented team must not become his profile affiliation."""
    if (encounter.get("natural_key") == f"2026-2027|J2|nakka:{EVENT}" and player_id == BENOIT):
        return USUAL_TEAM
    return None


def is_target(payload):
    if payload.get("event_id") != EVENT:
        return False
    if any(payload.get(k) != v for k, v in {
        "season": "2026-2027", "league_id": "lg_EUoR_6095", "round": "J2",
        "date": "2026-10-14", "source_url": f"https://n01darts.com/n01/league/season.php?id={EVENT}",
    }.items()) or [(t["source_id"], t["name"]) for t in payload["teams"]] != [
        ("z1ps", "3B Darts Club - A(mbré)"), ("uwbj", "Papangue Darts Club - Fournaise")
    ]:
        raise SummaryUnavailable("Le contexte de la correction J2 a changé : vérification requise.")
    return True


def guest_roster(payload, player, represented_roster):
    """A single source participant may resolve against his usual season roster."""
    # Called after both team names have been canonicalised by resolve_payload.
    if (is_target(payload) and represented_roster["id"] == "3bdc-ambre"
            and player["source_id"] == "5ggq" and player["team_id"] == "z1ps"):
        return "3bdc-blonde"
    return None


def apply_result_correction(payload):
    if not is_target(payload):
        return payload
    # Reapplying a resolved payload is deterministic, including its audit snapshot.
    if "result_corrections" in payload:
        rebuilt = apply_result_correction(deepcopy(payload["source_snapshot"]))
        if rebuilt != payload:
            raise SummaryUnavailable("La trace de correction J2 ne correspond plus au détail.")
        return rebuilt
    players = {p["source_id"]: p for p in payload["players"]}
    if (players.get("5ggq", {}).get("id") != BENOIT
            or players.get("a0zp", {}).get("id") != CHRISTOPHE
            or players["5ggq"]["team_id"] != "z1ps" or players["a0zp"]["team_id"] != "uwbj"):
        raise SummaryUnavailable("Les identités du simple J2 doivent être vérifiées.")
    selected = [m for m in payload["matches"] if m["id"] == MATCH and m["mode"] == "S" and m["number"] == 18]
    legs = [l for l in payload["legs"] if l["match_id"] == MATCH]
    ids = {l["id"] for l in legs}
    rows = [s for s in payload["stats"] if s["leg_id"] in ids]
    before = [sum(l["winner_team_id"] == t for l in legs) for t in ("z1ps", "uwbj")]
    if (len(selected) != 1 or len(legs) != 2 or before not in ([2, 0], [0, 2])
            or len(rows) != 4 or any({s["player_id"] for s in rows if s["leg_id"] == lid} != {BENOIT, CHRISTOPHE} for lid in ids)):
        raise SummaryUnavailable("Le simple Benoit–Christophe J2 est absent ou a changé.")
    corrected = deepcopy(payload)
    corrected["source_snapshot"] = deepcopy(payload)
    for m in corrected["matches"]:
        if m["id"] == MATCH:
            m["winner_team_id"] = "uwbj"
    for l in corrected["legs"]:
        if l["id"] in ids:
            l["winner_team_id"] = "uwbj"
    for s in corrected["stats"]:
        if s["leg_id"] in ids:
            s["leg_won"] = s["player_id"] == CHRISTOPHE
    for p in corrected["players"]:
        p["winLeg"] = sum(s["leg_won"] for s in corrected["stats"] if s["player_id"] == p["id"])
    wins = Counter(m["winner_team_id"] for m in corrected["matches"])
    corrected["score"] = [wins[t["source_id"]] for t in corrected["teams"]]
    if corrected["score"] != [5, 15]:
        raise SummaryUnavailable(f"Après la seule correction du simple 16 : Ambrée {corrected['score'][0]}–{corrected['score'][1]} Fournaise ; attendu 5–15. Les autres résultats sont conservés.")
    corrected["result_corrections"] = [{
        "key": "J2_FOURNAISE_AMBREE_SIMPLE_16", "event_id": EVENT, "match_id": MATCH,
        "player_ids": [BENOIT, CHRISTOPHE], "initial_score": before, "corrected_score": [0, 2],
        "reason": REASON,
    }]
    return corrected


def corrected_facts(payload, previous):
    """Rebuild the worker's editorial facts from the same effective results."""
    home, away = [t["source_id"] for t in payload["teams"]]
    facts = build_facts({"id": previous["result_id"], "home_team_id": home, "away_team_id": away,
                         "home_score": payload["score"][0], "away_score": payload["score"][1]},
                        {"code": payload["round"], "played_on": payload["date"]}, {"name": payload["season"]},
                        {t["source_id"]: t["name"] for t in payload["teams"]}, payload["matches"], payload["legs"], payload["stats"],
                        {p["id"]: p["name"] for p in payload["players"]})
    return {**previous, **facts, "home_score": payload["score"][0], "away_score": payload["score"][1]}
