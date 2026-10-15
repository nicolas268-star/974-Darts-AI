"""Confirmed corrections scoped to one encounter and one Nakka simple.

The first confirmation concerned results only. A subsequent confirmation of
40/1 dart and 6/1 dart identifies Christophe's two complete source streams.
Raw visits and canonical profiles stay intact; only their local attribution
on this simple changes.
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
STATISTICS_REASON = "Attribution des deux séries à Christophe confirmée par l’organisateur : finishes 40 et 6 en une fléchette"
STATISTICS_KEY = "J2_SIMPLE_16_CONFIRMED_STATISTICS_ATTRIBUTION"


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


def _rebuild_player_totals(payload):
    fields = {"score": "score", "darts": "darts_thrown", "f9Score": "first_9_score", "f9Darts": "first_9_darts",
              "ton00": "scores_100", "ton40": "scores_140", "ton70": "scores_170", "ton80": "scores_180"}
    for player in payload["players"]:
        if player["id"] not in (BENOIT, CHRISTOPHE):
            continue
        rows = [s for s in payload["stats"] if s["player_id"] == player["id"]]
        player.update({key: sum(s[field] for s in rows) for key, field in fields.items()})
        player.update(leg=len(rows), winLeg=sum(s["leg_won"] for s in rows), highOut=max(s["finish"] for s in rows))


def apply_statistics_correction(payload):
    if not is_target(payload):
        return payload
    if "statistics_corrections" in payload:
        expected = apply_statistics_correction(apply_result_correction(deepcopy(payload["source_snapshot"])))
        if expected != payload:
            raise SummaryUnavailable("L’attribution des statistiques J2 diffère de la source confirmée.")
        return expected
    # The previous result-only correction is independently validated and kept.
    apply_result_correction(payload)
    raw = [m for m in payload.get("raw_nakka", {}).get("sets", []) if m.get("mid") == MATCH]
    if len(raw) != 1 or len(raw[0].get("legData", [])) != 2:
        raise SummaryUnavailable("Le détail brut du simple 16 est requis pour attribuer ses statistiques.")
    for leg, finish in zip(raw[0]["legData"], (40, 6)):
        visits = leg["playerData"][0]
        if (leg["winner"] != 0 or visits[-2]["left"] != finish
                or visits[-1]["left"] != 0 or visits[-1]["score"] != -1):
            raise SummaryUnavailable("Les finishes bruts du simple 16 ne correspondent plus aux 40/1 et 6/1 confirmés.")
    corrected = deepcopy(payload)
    legs = {l["id"]: l["leg_number"] for l in payload["legs"] if l["match_id"] == MATCH}
    rows = {(s["leg_id"], s["player_id"]): s for s in payload["stats"] if s["leg_id"] in legs}
    for leg_id, number in legs.items():
        winner, opponent = rows[(leg_id, BENOIT)], rows[(leg_id, CHRISTOPHE)]
        if (winner["finish"] != (40 if number == 1 else 6) or winner["score"] != 501
                or winner["darts_thrown"] != 40 or opponent["finish"] != 0 or opponent["score"] >= 501):
            raise SummaryUnavailable("Les séries du simple 16 ont changé : nouvelle vérification requise.")
    for row in corrected["stats"]:
        if row["leg_id"] not in legs:
            continue
        source = rows[(row["leg_id"], CHRISTOPHE if row["player_id"] == BENOIT else BENOIT)]
        # Keep player/team/leg identity and the already-correct result flags.
        row.update({k: v for k, v in source.items() if k not in ("leg_id", "player_id", "team_id", "leg_won")})
    _rebuild_player_totals(corrected)
    corrected["statistics_corrections"] = [{
        "key": STATISTICS_KEY, "event_id": EVENT, "match_id": MATCH,
        "player_ids": [BENOIT, CHRISTOPHE], "reason": STATISTICS_REASON,
        "confirmed_finishes": [{"leg_number": n, "player_id": CHRISTOPHE, "finish": finish, "checkout_darts": 1}
                               for n, finish in ((1, 40), (2, 6))],
    }]
    return corrected


def apply_confirmed_corrections(payload):
    if "statistics_corrections" in payload:
        return apply_statistics_correction(payload)
    return apply_statistics_correction(apply_result_correction(payload))


def corrected_facts(payload, previous):
    """Rebuild the worker's editorial facts from the same effective results."""
    home, away = [t["source_id"] for t in payload["teams"]]
    facts = build_facts({"id": previous["result_id"], "home_team_id": home, "away_team_id": away,
                         "home_score": payload["score"][0], "away_score": payload["score"][1]},
                        {"code": payload["round"], "played_on": payload["date"]}, {"name": payload["season"]},
                        {t["source_id"]: t["name"] for t in payload["teams"]}, payload["matches"], payload["legs"], payload["stats"],
                        {p["id"]: p["name"] for p in payload["players"]})
    return {**previous, **facts, "home_score": payload["score"][0], "away_score": payload["score"][1]}
