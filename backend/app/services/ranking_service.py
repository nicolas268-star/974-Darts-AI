from __future__ import annotations
from collections import defaultdict
from typing import Any
from supabase import Client

DEFAULT_RULES = {
    "win_points": 3,
    "draw_points": 2,
    "loss_points": 1,
    "ranking_order": ["points", "leg_difference", "legs_won", "wins", "name"],
}


def _all(db: Client, table: str, select: str, filters: list[tuple[str, Any]] | None = None) -> list[dict]:
    rows: list[dict] = []
    start = 0
    size = 1000
    while True:
        query = db.table(table).select(select)
        for key, value in filters or []:
            query = query.eq(key, value)
        page = query.range(start, start + size - 1).execute().data or []
        rows.extend(page)
        if len(page) < size:
            return rows
        start += size


def get_rules(db: Client, season_id: str | None = None) -> dict:
    query = db.table("competition_rules").select("*")
    if season_id:
        query = query.eq("season_id", season_id)
    result = query.order("created_at", desc=True).limit(1).execute().data or []
    if result:
        row = result[0]
        row["ranking_order"] = row.get("ranking_order") or DEFAULT_RULES["ranking_order"]
        return row
    return DEFAULT_RULES.copy()


def build_ranking(db: Client, season_id: str | None = None) -> dict:
    seasons = _all(db, "seasons", "id,name,is_active")
    if not season_id:
        active = next((s for s in seasons if s.get("is_active")), None)
        active = active or (seasons[-1] if seasons else None)
        season_id = active.get("id") if active else None
    season = next((s for s in seasons if s.get("id") == season_id), None)
    rules = get_rules(db, season_id)
    if not season_id:
        return {"season": None, "rules": rules, "standings": [], "summary": {}}

    rounds = _all(db, "rounds", "id,code,season_id,published", [("season_id", season_id)])
    round_ids = {r["id"] for r in rounds if r.get("published")}
    encounters = _all(db, "encounters", "id,round_id,home_team_id,away_team_id,name")
    encounters = [e for e in encounters if e.get("round_id") in round_ids]
    encounter_ids = {e["id"] for e in encounters}
    matches = _all(db, "matches", "id,encounter_id")
    matches = [m for m in matches if m.get("encounter_id") in encounter_ids]
    match_to_encounter = {m["id"]: m["encounter_id"] for m in matches}
    legs = _all(db, "legs", "id,match_id,winner_team_id,status")
    teams = _all(db, "teams", "id,name")
    team_names = {t["id"]: t["name"] for t in teams}

    leg_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    total_valid_legs = 0
    for leg in legs:
        encounter_id = match_to_encounter.get(leg.get("match_id"))
        winner = leg.get("winner_team_id")
        if encounter_id and winner and leg.get("status") == "VALID":
            leg_counts[encounter_id][winner] += 1
            total_valid_legs += 1

    stats: dict[str, dict[str, Any]] = {}
    def row(team_id: str) -> dict[str, Any]:
        if team_id not in stats:
            stats[team_id] = {
                "team_id": team_id, "name": team_names.get(team_id, "Équipe inconnue"),
                "played": 0, "wins": 0, "draws": 0, "losses": 0,
                "legs_won": 0, "legs_lost": 0, "points": 0,
            }
        return stats[team_id]

    completed = 0
    for encounter in encounters:
        home, away = encounter.get("home_team_id"), encounter.get("away_team_id")
        if not home or not away:
            continue
        home_legs = leg_counts[encounter["id"]].get(home, 0)
        away_legs = leg_counts[encounter["id"]].get(away, 0)
        if home_legs + away_legs == 0:
            continue
        completed += 1
        h, a = row(home), row(away)
        for current, own, opp in ((h, home_legs, away_legs), (a, away_legs, home_legs)):
            current["played"] += 1
            current["legs_won"] += own
            current["legs_lost"] += opp
        if home_legs > away_legs:
            h["wins"] += 1; a["losses"] += 1
            h["points"] += rules["win_points"]; a["points"] += rules["loss_points"]
        elif away_legs > home_legs:
            a["wins"] += 1; h["losses"] += 1
            a["points"] += rules["win_points"]; h["points"] += rules["loss_points"]
        else:
            h["draws"] += 1; a["draws"] += 1
            h["points"] += rules["draw_points"]; a["points"] += rules["draw_points"]

    standings = list(stats.values())
    for item in standings:
        item["leg_difference"] = item["legs_won"] - item["legs_lost"]
        item["win_rate"] = round(item["wins"] / item["played"] * 100, 1) if item["played"] else 0
    standings.sort(key=lambda x: (-x["points"], -x["leg_difference"], -x["legs_won"], -x["wins"], x["name"].lower()))
    for index, item in enumerate(standings, 1):
        item["rank"] = index

    return {
        "season": season,
        "rules": rules,
        "standings": standings,
        "summary": {
            "rounds": len(round_ids), "teams": len(standings),
            "encounters": completed, "valid_legs": total_valid_legs,
        },
    }
