"""Read-only Nakka audit for BDC M2; write the public snapshot only with --write.

Player identities inside a leg come from Nakka's explicit order/oid, never from
the order of the names in the team label. Championship points remain pending:
the organizer must confirm the scale for the actual seven-team format.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SOURCE_ID = "t_sEW0_8920"
BASE = "https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/"
OUTPUT = Path(__file__).resolve().parents[1] / "lib/bdc-round-two.json"


def fetch(script, command, **params):
    url = BASE + script + "?" + urlencode({"cmd": command, **params})
    request = Request(url, data=json.dumps(params).encode() if command != "get_data" else None,
                      headers={"Content-Type": "application/json", "User-Agent": "974Darts-BDC-Audit/2"})
    with urlopen(request, timeout=45) as response:
        return json.load(response)


def average(score, darts):
    return round(score * 3 / darts, 2) if darts else None


def empty_player(oid, name, team_id):
    return {"id": oid, "name": name, "teamId": team_id, "score": 0, "darts": 0,
            "first9Score": 0, "first9Darts": 0, "visits100": 0, "visits140": 0,
            "visits170": 0, "visits180": 0, "zeroVisits": 0, "finishes": []}


def complete_player(player):
    player["average3"] = average(player["score"], player["darts"])
    player["first9"] = average(player["first9Score"], player["first9Darts"])
    player["bestFinish"] = max((f["value"] for f in player["finishes"]), default=None)
    return player


FIELDS = ["score", "darts", "first9Score", "first9Darts", "visits100", "visits140", "visits170", "visits180", "zeroVisits"]
SOURCE_FIELDS = {"score": "score", "darts": "darts", "visits100": "ton00", "visits140": "ton40", "visits170": "ton70", "visits180": "ton80"}


def build(event, teams, players, sheets):
    assert event["tdid"] == SOURCE_ID and event["status"] == 40
    assert event["lgid"] == "lg_uUz6_8343"
    entries = {e["tpid"]: e["name"] for e in event["entry_list"]}
    assert len(entries) == 7 and len(players) == 14
    assert set(teams) == set(entries)
    assert len(event["rr_table"]) == 1 and set(event["rr_table"][0]) == set(entries)
    matches = []
    aggregate = {oid: empty_player(oid, row["oname"], row["tpid"]) for oid, row in players.items()}
    for phase, key in [("Poule", "rr_result"), ("Phase finale", "t_result"), ("3e place", "t3_result")]:
        prefix = {"rr_result": "rr", "t_result": "t", "t3_result": "t3"}[key]
        for round_index, group in enumerate(event[key]):
            seen = set()
            for home, opponents in group.items():
                for away in opponents:
                    pair = tuple(sorted((home, away)))
                    if pair in seen:
                        continue
                    seen.add(pair)
                    tmid = f"{SOURCE_ID}_{prefix}_{round_index}_{pair[0]}_{pair[1]}"
                    raw = sheets[tmid]
                    assert raw, f"Missing match: {tmid}"
                    label = ("Demi-finale" if round_index == 0 else "Finale") if phase == "Phase finale" else phase
                    expected = {p: group[p][pair[1] if p == pair[0] else pair[0]]["r"] for p in pair}
                    assert max(expected.values()) == (2 if phase == "Poule" else 3)
                    recorded = Counter()
                    side_players = {p: {oid: empty_player(oid, player["oname"], p) for oid, player in players.items() if player["tpid"] == p} for p in pair}
                    start_times = []
                    leg_number = 0
                    for single in raw:
                        assert single["tmid"] == tmid and single["endMatch"] == 1
                        assert single["startScore"] == 501
                        sides = single["statsData"]
                        assert len(sides) == 2 and {s["tpid"] for s in sides} == set(pair)
                        start_times.append(single["startTime"])
                        leg_totals = {p: Counter() for p in pair}
                        for leg in single["legData"]:
                            leg_number += 1
                            assert leg["endFlag"] == 1 and leg["winner"] in [0, 1]
                            recorded[sides[leg["winner"]]["tpid"]] += 1
                            for side_index, side in enumerate(sides):
                                team_id = side["tpid"]
                                order = [p["oid"] for p in side["order"]]
                                assert len(order) == 2 and set(order) == set(side_players[team_id])
                                visits = leg["playerData"][side_index]
                                for turn, visit in enumerate(visits[1:]):
                                    previous = visits[turn]["left"]
                                    checkout = visit["score"] < 0
                                    darts = -visit["score"] if checkout else 3
                                    score = previous if checkout else visit["score"]
                                    assert 1 <= darts <= 3 and 0 <= score <= 180
                                    assert visit["left"] == previous - score
                                    player = side_players[team_id][order[turn % 2]]
                                    player["score"] += score
                                    player["darts"] += darts
                                    player["zeroVisits"] += score == 0
                                    player["visits100"] += 100 <= score <= 139
                                    player["visits140"] += 140 <= score <= 169
                                    player["visits170"] += 170 <= score <= 179
                                    player["visits180"] += score == 180
                                    if turn // 2 < 3:
                                        player["first9Score"] += score
                                        player["first9Darts"] += darts
                                    if checkout:
                                        assert leg["winner"] == side_index and visit["left"] == 0
                                        player["finishes"].append({"leg": leg_number, "value": score, "darts": darts, "matchId": tmid})
                                    leg_totals[team_id]["score"] += score
                                    leg_totals[team_id]["darts"] += darts
                        for side in sides:
                            assert leg_totals[side["tpid"]]["score"] == side["allScore"], tmid
                            assert leg_totals[side["tpid"]]["darts"] == side["allDarts"], tmid
                    assert all(recorded[p] == expected[p] for p in pair), f"Score mismatch: {tmid}"
                    sides = []
                    for p in pair:
                        rows = list(side_players[p].values())
                        for row in rows:
                            total = aggregate[row["id"]]
                            for field in FIELDS:
                                total[field] += row[field]
                            total["finishes"].extend(row["finishes"])
                            complete_player(row)
                        score = sum(r["score"] for r in rows)
                        darts = sum(r["darts"] for r in rows)
                        sides.append({"teamId": p, "name": entries[p], "score": expected[p], "average3": average(score, darts),
                                      "recordedScore": score, "recordedDarts": darts, "players": rows})
                    matches.append({"id": tmid, "phase": label, "startedAt": min(start_times), "legs": leg_number, "teamA": sides[0], "teamB": sides[1]})
    assert len(matches) == 25
    matches.sort(key=lambda m: m["startedAt"])
    for oid, row in aggregate.items():
        original = players[oid]
        for key, source_key in SOURCE_FIELDS.items():
            assert row[key] == original[source_key], f"Player total mismatch: {oid}/{key}"
        complete_player(row)
        assert (row["bestFinish"] or 0) == original["highOut"]
        relevant = [m for m in matches if row["teamId"] in (m["teamA"]["teamId"], m["teamB"]["teamId"])]
        assert len(relevant) == original["match"]
        assert sum(m["legs"] for m in relevant) == original["leg"]
        row["matches"] = len(relevant)
        row["legs"] = original["leg"]
        row["contribution"] = round(row["score"] * 100 / teams[row["teamId"]]["score"], 1)
    rr = event["rr_result"][0]
    standings = []
    for team_id, name in entries.items():
        relevant = [m for m in matches if team_id in (m["teamA"]["teamId"], m["teamB"]["teamId"])]
        own_sides = [m["teamA"] if m["teamA"]["teamId"] == team_id else m["teamB"] for m in relevant]
        source = teams[team_id]
        assert sum(s["recordedScore"] for s in own_sides) == source["score"]
        assert sum(s["recordedDarts"] for s in own_sides) == source["darts"]
        assert sum(s["score"] for s in own_sides) == source["winLeg"]
        wins = sum(row["r"] > rr[other][team_id]["r"] for other, row in rr[team_id].items())
        legs_for = sum(row["r"] for row in rr[team_id].values())
        legs_against = sum(rr[other][team_id]["r"] for other in rr[team_id])
        assert len(rr[team_id]) == 6
        pool_sides = [m["teamA"] if m["teamA"]["teamId"] == team_id else m["teamB"]
                      for m in relevant if m["phase"] == "Poule"]
        standings.append({"teamId": team_id, "name": name, "played": 6, "wins": wins, "losses": 6-wins,
                          "legsFor": legs_for, "legsAgainst": legs_against, "legsDiff": legs_for-legs_against,
                          "points": 2*wins, "average3": average(sum(s["recordedScore"] for s in pool_sides),sum(s["recordedDarts"] for s in pool_sides))})
    standings.sort(key=lambda r: (-r["points"], -r["legsDiff"]))
    for rank, row in enumerate(standings, 1):
        row["rank"] = rank
    final_order = [event["t_table"][-1][0], next(p for p in event["t_table"][-2] if p != event["t_table"][-1][0]),
                   event["t3_table"][-1][0], next(p for p in event["t3_table"][0] if p != event["t3_table"][-1][0])]
    final_order += [r["teamId"] for r in standings if r["teamId"] not in final_order]
    results = []
    for place, team_id in enumerate(final_order, 1):
        source = teams[team_id]
        if place <= 4:
            assert source["rank"] == place
        pool_wins = next(r["wins"] for r in standings if r["teamId"] == team_id)
        results.append({"teamId": team_id, "name": entries[team_id], "place": place, "poolWins": pool_wins,
                        "points": None, "pointsUnderPublishedScale": [8,6,5,4,2,2,2][place-1]+min(pool_wins,3),
                        "stats": {k: source[k] for k in ["score","darts","leg","winLeg","match","winMatch","ton00","ton40","ton70","ton80","highOut","f9Score","f9Darts"]}})
    return {"round": 2, "date": "2026-10-09", "sourceUrl": f"https://n01darts.com/n01/league/season.php?id={SOURCE_ID}",
            "sourceUpdatedAt": event["updateTime"], "retrievedOn": datetime.now(timezone.utc).date().isoformat(),
            "teamCount": 7, "playerCount": 14, "pointsStatus": "pending-format-confirmation",
            "quality": {"matches": len(matches), "poolMatches": 21, "finalMatches": 4, "recordedLegs": sum(m["legs"] for m in matches),
                        "verifiedPlayers": 14, "incompleteMatches": 0},
            "results": results, "poolStandings": standings, "matches": matches,
            "playerStats": sorted(aggregate.values(),key=lambda r: -r["average3"])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", type=Path, help="Use previously fetched read-only source responses")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    cache = args.cache_dir
    if cache:
        event = json.loads((cache / "bdc-round2-live.json").read_text())
        teams = json.loads((cache / "bdc-round2-stats.json").read_text())
        players = json.loads((cache / "bdc2-players.json").read_text())
        sheets = {p.stem: json.loads(p.read_text()) for p in (cache / "bdc2-matches").glob("*.json")}
    else:
        event = fetch("n01_tournament.php", "get_data", tdid=SOURCE_ID)
        teams = fetch("n01_stats_t.php", "stats_list", tdid=SOURCE_ID)
        players = fetch("n01_stats_t.php", "player_stats_list", tdid=SOURCE_ID)
        ids = set()
        for phase, key in [("rr", "rr_result"), ("t", "t_result"), ("t3", "t3_result")]:
            for rn, group in enumerate(event[key]):
                for a, opponents in group.items():
                    for b in opponents:
                        ids.add(f"{SOURCE_ID}_{phase}_{rn}_{'_'.join(sorted([a,b]))}")
        with ThreadPoolExecutor(max_workers=6) as pool:
            sheets = dict(pool.map(lambda mid: (mid,fetch("n01_online_t.php","get_setdata",tmid=mid)),sorted(ids)))
        after = fetch("n01_tournament.php", "get_data", tdid=SOURCE_ID)
        assert after["updateTime"] == event["updateTime"], "Source changed during audit"
    snapshot = build(event, teams, players, sheets)
    if args.write:
        OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"quality": snapshot["quality"], "ranking": [{k:r[k] for k in ["name","place","poolWins","pointsUnderPublishedScale"]} for r in snapshot["results"]]},ensure_ascii=False))


if __name__ == "__main__":
    main()
