"""Collect and reconcile complete Nakka matches before any publication."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .nakka_direct_import import TOURNAMENT_API, TOURNAMENT_STATS_API, validate_direct_event_url
from .visibility_service import SummaryUnavailable, build_facts

REUNION = timezone(timedelta(hours=4), "Indian/Reunion")
ONLINE_API = "https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_online_t.php"


def request_json(base, command, params, *, post=False):
    # Fixed upstreams only: the calendar URL never becomes an arbitrary HTTP target.
    request = Request(base + "?" + urlencode({"cmd": command, **params}),
                      data=json.dumps(params).encode() if post else None,
                      headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                               "User-Agent": "974Darts-Interclub-Analysis/1"})
    with urlopen(request, timeout=25) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise SummaryUnavailable("Le détail Nakka dépasse la limite de lecture.")
    return json.loads(raw)


def collect_evening(event, season, result_id, fetch=request_json, *, with_details=False):
    url, source_id = validate_direct_event_url(event.get("source_url", ""))
    if "/league/season.php" not in url:
        raise SummaryUnavailable("Un lien de rencontre interclubs Nakka est requis.")
    data = fetch(TOURNAMENT_API, "get_data", {"tdid": source_id})
    if data.get("tdid") != source_id or data.get("lgid") != season["nakkaLeagueId"]:
        raise SummaryUnavailable("La rencontre Nakka ne correspond pas à la saison active.")
    schedule = fetch(TOURNAMENT_API, "get_lg_schedule", {"tdid": source_id, "div": 0}, post=True)
    entries = data.get("entry_list") or []
    if len(entries) != 2 or not isinstance(schedule, list) or len(schedule) != 1:
        raise SummaryUnavailable("La rencontre doit opposer exactement deux équipes.")
    pair = sorted(e["tpid"] for e in entries)
    if sorted(schedule[0].get("p") or []) != pair:
        raise SummaryUnavailable("Les équipes et le programme Nakka divergent.")
    tmid = f"{source_id}_lg_0_{schedule[0]['lsid']}_{'_'.join(pair)}"
    sets = fetch(ONLINE_API, "get_setdata", {"tmid": tmid}, post=True)
    players = fetch(TOURNAMENT_STATS_API, "player_stats_list", {"tdid": source_id}, post=True)
    teams = fetch(TOURNAMENT_STATS_API, "stats_list", {"tdid": source_id}, post=True)
    # Detect edits during the several upstream reads; retry a consistent snapshot later.
    after = fetch(TOURNAMENT_API, "get_data", {"tdid": source_id})
    if after.get("updateTime") != data.get("updateTime"):
        raise SummaryUnavailable("Nakka est encore en cours de mise à jour.")
    return source_facts(event, season, result_id, data, sets, players, teams, with_details=with_details)


def collect_publication(event, season, result_id):
    return collect_evening(event, season, result_id, with_details=True)


def _scoring_totals(rows):
    fields = {"score": "score", "darts": "darts_thrown",
              "f9Score": "first_9_score", "f9Darts": "first_9_darts",
              "ton00": "scores_100", "ton40": "scores_140",
              "ton70": "scores_170", "ton80": "scores_180"}
    totals = defaultdict(Counter)
    for row in rows:
        total = totals[row["player_id"]]
        for key, field in fields.items():
            total[key] += row[field]
        total["highOut"] = max(total["highOut"], row["finish"])
    return totals


def _reconcile_3bdc_double(event, data, matches, legs, stats, aggregate, active, teams):
    # Authorized recovery for J1 3BDC after Double 3 was completed manually.
    # Accept only aggregates that exactly omit leg 2 or the whole Double 3.
    # Never change the validated visits, match scores or participation counters.
    if (data.get("tdid") != "t_1hPp_2294" or event["start_date"] != "2026-09-30"
            or event.get("source_url") != "https://n01darts.com/n01/league/season.php?id=t_1hPp_2294"):
        return active, teams, None
    match = next(m for m in matches if m["mode"] == "D" and m["number"] == 19)
    match_legs = {leg["id"] for leg in legs if leg["match_id"] == match["id"]}
    scoring = _scoring_totals(stats)
    if all(all(total[k] == active[oid].get(k, 0) for k in total)
           for oid, total in scoring.items()):
        return active, teams, None
    for omitted in ({match["id"] + ":2"}, match_legs):
        baseline_rows = [row for row in stats if row["leg_id"] not in omitted]
        baseline = _scoring_totals(baseline_rows)
        if any(any(baseline[oid][k] != active[oid].get(k, 0) for k in total)
               or any(aggregate[oid][k] != active[oid].get(k, 0) for k in ("leg", "winLeg"))
               for oid, total in scoring.items()):
            continue
        if any(sum(row[field] for row in baseline_rows if row["team_id"] == team) != total[key]
               for team, total in teams.items()
               for key, field in (("score", "score"), ("darts", "darts_thrown"))):
            continue
        corrected_players = {oid: {**player, **scoring[oid]} for oid, player in active.items()}
        corrected_teams = {
            team: {**total,
                   "score": sum(row["score"] for row in stats if row["team_id"] == team),
                   "darts": sum(row["darts_thrown"] for row in stats if row["team_id"] == team)}
            for team, total in teams.items()}
        # The manual closure can also replace both team counters with the
        # Double 3 leg score (2-0), while retaining the evening scoring totals.
        # Repair only that exact signature, established from the validated legs.
        wins = Counter(m["winner_team_id"] for m in matches)
        double_wins = Counter(leg["winner_team_id"] for leg in legs if leg["id"] in match_legs)
        counters_replaced = (len(match_legs) == 2
                             and all(total.get("set") == 2
                                     and total.get("winSet") == double_wins[team]
                                     for team, total in teams.items()))
        if counters_replaced:
            for team, total in corrected_teams.items():
                total.update(set=len(matches), winSet=wins[team])
        audit = {"reason": "J1_3BDC_DOUBLE_3_STALE_AGGREGATES", "match_id": match["id"],
                 "legs_missing_from_source_scoring": sorted(omitted),
                 "team_counters_replaced_by_double_3": counters_replaced,
                 "source_player_totals": active, "source_team_totals": teams}
        return corrected_players, corrected_teams, audit
    return active, teams, None


def source_facts(event, season, result_id, data, sets, player_totals, team_totals, *, with_details=False):
    def require(condition, message):
        if not condition:
            raise SummaryUnavailable(message)

    require(data.get("lgid") == season["nakkaLeagueId"], "Saison Nakka inattendue.")
    source_date = datetime.fromtimestamp(int(data["t_date"]), REUNION).date().isoformat()
    require(source_date == event["start_date"], "La date Nakka diffère du calendrier : rencontre à vérifier.")
    code = re.match(r"^\s*(J\d+)\b", data.get("title", ""), re.I)
    require(bool(code), "Journée de championnat introuvable.")
    entries = data.get("entry_list") or []
    require(len(entries) == 2, "Deux équipes sont requises.")
    home, away = [e["tpid"] for e in entries]
    names = {e["tpid"]: e["name"] for e in entries}
    require(home != away and set(names) <= set(team_totals), "Statistiques collectives absentes.")
    require(isinstance(sets, list) and len(sets) == 20, "La rencontre n’a pas encore ses 20 matchs terminés.")
    require(len({m["mid"] for m in sets}) == 20, "Des matchs Nakka sont dupliqués.")
    matches, legs, stats = [], [], []
    aggregate = defaultdict(Counter)
    labels = set()
    for match in sets:
        label = re.search(r"\b(Simple|Double)\s+(\d+)\b", match.get("title", ""), re.I)
        require(bool(label) and match.get("endMatch") == 1 and not match.get("delete"), "Un match n’est pas terminé ou son format est inconnu.")
        mode, number = label[1].lower(), int(label[2])
        require((mode, number) not in labels, "Un numéro de match est dupliqué.")
        labels.add((mode, number))
        sides = match["statsData"]
        require(len(sides) == 2 and {s["tpid"] for s in sides} == {home, away}, "Équipes incohérentes dans le détail.")
        orders = [[p["oid"] for p in side["order"] if p.get("oid")] for side in sides]
        require(all(len(order) == (2 if mode == "double" else 1) for order in orders), "Composition de simple ou double incomplète.")
        winners = Counter()
        for index, leg in enumerate(match["legData"], 1):
            require(leg.get("endFlag") == 1 and leg.get("winner") in (0, 1), "Un leg est encore en cours.")
            winner = leg["winner"]
            winners[winner] += 1
            lid = f"{match['mid']}:{index}"
            legs.append({"id": lid, "match_id": match["mid"], "leg_number": index, "status": "VALID", "winner_team_id": sides[winner]["tpid"]})
            require(len(leg["playerData"]) == 2, "Détail du leg incomplet.")
            for side, visits in enumerate(leg["playerData"]):
                require(visits and visits[0]["left"] == 501, "Format autre que 501.")
                require((visits[-1]["left"] == 0) == (side == winner), "Fin de leg incohérente.")
                by_player = defaultdict(Counter)
                for turn, visit in enumerate(visits[1:]):
                    oid = orders[side][turn % len(orders[side])]
                    require(oid in player_totals and player_totals[oid]["tpid"] == sides[side]["tpid"], "Participant absent des statistiques Nakka.")
                    row = by_player[oid]
                    score = visits[turn]["left"] - visit["left"]
                    darts = -visit["score"] if visit["score"] < 0 and visit["left"] == 0 else 3
                    require(0 <= score <= 180 and 1 <= darts <= 3, "Volée Nakka incohérente.")
                    row["score"] += score
                    row["darts"] += darts
                    row["scores_80"] += 80 <= score <= 99
                    row["no_score"] += score == 0
                    if turn < 3:
                        row["f9Score"] += score
                        row["f9Darts"] += darts
                    if visit["left"] == 0:
                        row["highOut"] = score
                    for key, low, high in [("ton00", 100, 139), ("ton40", 140, 169), ("ton70", 170, 179), ("ton80", 180, 180)]:
                        row[key] += low <= score <= high
                require(set(by_player) == set(orders[side]), "Participation incomplète dans un leg.")
                for oid, row in by_player.items():
                    total = aggregate[oid]
                    total["highOut"] = max(total["highOut"], row["highOut"])
                    for key in ("score", "darts", "f9Score", "f9Darts", "ton00", "ton40", "ton70", "ton80"):
                        total[key] += row[key]
                    total["leg"] += 1
                    total["winLeg"] += side == winner
                    stats.append({"leg_id": lid, "player_id": oid, "team_id": sides[side]["tpid"], "score": row["score"],
                                  "darts_thrown": row["darts"], "finish": row["highOut"], "scores_180": row["ton80"],
                                  "first_9_score": row["f9Score"], "first_9_darts": row["f9Darts"],
                                  "scores_170": row["ton70"], "scores_140": row["ton40"], "scores_100": row["ton00"],
                                  "scores_80": row["scores_80"], "no_score": row["no_score"], "leg_won": side == winner})
        require(len(match["legData"]) in (2, 3) and max(winners.values()) == 2, "Score de match incomplet.")
        require(all(winners[i] == sides[i]["winLegs"] for i in (0, 1)), "Score et détail des legs divergents.")
        sequence = (number if number <= 8 else number + 2) if mode == "simple" else (8 + number if number <= 2 else 16 + number)
        matches.append({"id": match["mid"], "number": sequence, "mode": "D" if mode == "double" else "S", "winner_team_id": sides[max(winners, key=winners.get)]["tpid"]})
    expected = {("simple", n) for n in range(1, 17)} | {("double", n) for n in range(1, 5)}
    require(labels == expected, "Les 16 simples et 4 doubles doivent être présents.")
    # Nakka can include an anonymous row for doubles: participation counters
    # exist, but it contains no scoring data. Only this empty-key placeholder
    # may be omitted; every real player and both team totals still reconcile.
    scoring_keys = ("score", "darts", "f9Score", "f9Darts", "ton00", "ton40",
                    "ton70", "ton80", "highOut", "highOutCount", "best", "worst",
                    "a", "acnt", "ca", "cacnt")
    active = {}
    for oid, player in player_totals.items():
        if not isinstance(player, dict) or player.get("leg", 0) <= 0:
            continue
        placeholder = (oid == "" and not player.get("oname")
                       and player.get("tpid") in names
                       and player.get("score") == 0 and player.get("darts") == 0
                       and all(player.get(k, 0) == 0 for k in scoring_keys))
        if not placeholder:
            active[oid] = player
    require(set(active) == set(aggregate), "La liste des participants diverge du détail.")
    active, team_totals, reconciliation = _reconcile_3bdc_double(
        event, data, matches, legs, stats, aggregate, active, team_totals)
    for oid, total in aggregate.items():
        require(all(total[key] == active[oid].get(key, 0) for key in total), "Les statistiques d’un joueur divergent des volées.")
    wins = Counter(m["winner_team_id"] for m in matches)
    for team in (home, away):
        rows = [r for r in stats if r["team_id"] == team]
        require(wins[team] == team_totals[team]["winSet"] and team_totals[team]["set"] == 20
                and sum(r["score"] for r in rows) == team_totals[team]["score"]
                and sum(r["darts_thrown"] for r in rows) == team_totals[team]["darts"], "Les statistiques collectives divergent du détail.")
    result = {"id": result_id, "home_team_id": home, "away_team_id": away, "home_score": wins[home], "away_score": wins[away]}
    evening = build_facts(result, {"code": code[1].upper(), "played_on": event["start_date"]},
                          {"name": season["key"]}, names, matches, legs, stats,
                          {oid: active[oid]["oname"] for oid in aggregate})
    # The detailed source is public on Nakka; there may not yet be a site match page.
    evening.update(url=event["source_url"], home_score=wins[home], away_score=wins[away], source="NAKKA", source_updated_at=data.get("updateTime"))
    if reconciliation:
        evening["source_reconciliation"] = reconciliation
    if with_details:
        return {"facts": evening, "publication": {
            **({"source_reconciliation": reconciliation} if reconciliation else {}),
            "version": 1, "event_id": data["tdid"], "source_url": event["source_url"],
            "season": season["key"], "league_id": data["lgid"], "round": code[1].upper(),
            "date": source_date, "title": data["title"], "score": [wins[home], wins[away]],
            "teams": [{"source_id": t, "name": names[t]} for t in (home, away)],
            "players": [{"source_id": oid, "source_name": active[oid]["oname"],
                         "source_opid": active[oid].get("opid"), "team_id": active[oid]["tpid"],
                         **aggregate[oid]} for oid in sorted(aggregate)],
            "matches": sorted(matches, key=lambda m: m["number"]),
            "legs": sorted(legs, key=lambda l: l["id"]),
            "stats": sorted(stats, key=lambda s: (s["leg_id"], s["player_id"]))}}
    return evening
