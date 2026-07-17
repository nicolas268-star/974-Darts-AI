from __future__ import annotations
from collections import defaultdict
from typing import Any
from supabase import Client
from .ranking_service import _all


def player_overview(db: Client, season_id: str | None = None) -> list[dict[str, Any]]:
    players = _all(db, "players", "id,display_name,team_id,public_profile")
    teams = {t["id"]: t["name"] for t in _all(db, "teams", "id,name")}
    profiles = _all(db, "player_profiles", "player_id,season_id,legs_played,legs_won,average_3_darts,first_9,best_finish,elo")
    profile_by_player = {p["player_id"]: p for p in profiles if not season_id or p.get("season_id") == season_id}
    leg_stats = _all(db, "player_leg_stats", "player_id,finish,scores_180,scores_170,scores_140,scores_100,leg_won")
    totals = defaultdict(lambda: {"scores_180": 0, "scores_170": 0, "scores_140": 0, "scores_100": 0, "finishes": 0})
    for stat in leg_stats:
        target = totals[stat["player_id"]]
        for key in ("scores_180", "scores_170", "scores_140", "scores_100"):
            target[key] += stat.get(key) or 0
        if stat.get("finish"):
            target["finishes"] += 1
    result = []
    for player in players:
        profile = profile_by_player.get(player["id"], {})
        result.append({
            "player_id": player["id"], "name": player["display_name"],
            "team_id": player.get("team_id"), "team": teams.get(player.get("team_id"), "—"),
            **{k: profile.get(k) for k in ("legs_played", "legs_won", "average_3_darts", "first_9", "best_finish", "elo")},
            **totals[player["id"]],
            "nakka_note": "Les finishes sont des totaux de volée; aucune combinaison de fléchettes ni double précis n'est déduit.",
        })
    result.sort(key=lambda x: (-(x.get("elo") or 0), x["name"].lower()))
    return result
