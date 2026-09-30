"""Disposable public statistics for responsive browser tests; never imported by production."""
from copy import deepcopy
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException
from app.services.player_statistics_engine import PlayerStatisticsEngine
from app.services.duo_statistics_engine import DuoStatisticsEngine
from app.services.competition_hub_service import CompetitionHubService
from app.services.match_hub_service import build_match_hub, team_match_history
from app.services.ranking_service import build_ranking

router = APIRouter(prefix="/api/v1")


class Query:
    def __init__(self, rows): self.rows = deepcopy(rows)
    def select(self, *args, **kwargs): return self
    def eq(self, key, value): self.rows = [r for r in self.rows if r.get(key) == value]; return self
    def in_(self, key, values): self.rows = [r for r in self.rows if r.get(key) in values]; return self
    def order(self, key, desc=False): self.rows.sort(key=lambda r: str(r.get(key) or ""), reverse=desc); return self
    def limit(self, count): self.rows = self.rows[:count]; return self
    def range(self, start, end): self.rows = self.rows[start:end + 1]; return self
    def execute(self): return SimpleNamespace(data=self.rows)


class Fixture:
    def __init__(self):
        self.rows = {"seasons": [{"id": "s", "name": "2026-2027", "is_active": True}],
                     "teams": [{"id": "a", "name": "Équipe des Hauts de La Réunion", "club_id": None},
                               {"id": "b", "name": "Équipe du Littoral", "club_id": None}],
                     "players": [{"id": f"p{i}", "display_name": name, "team_id": "a" if i < 3 else "b", "public_profile": True}
                                 for i, name in enumerate(["Alexandre Exemple de La Réunion", "Camille Démonstration", "Élodie Exemple", "Dominique Démonstration"], 1)],
                     "rounds": [], "encounters": [], "matches": [], "legs": [], "player_leg_stats": [], "championship_results": []}
        for n in range(1, 7):
            date = f"2026-09-{n:02}"
            self.rows["rounds"].append({"id": f"r{n}", "season_id": "s", "code": f"J{n}", "played_on": date, "published": True})
            self.rows["encounters"].append({"id": f"e{n}", "round_id": f"r{n}", "name": "Les Hauts — Littoral", "home_team_id": "a", "away_team_id": "b"})
            self.rows["championship_results"].append({"id": f"result{n}", "round_id": f"r{n}", "season_id": "s", "played_on": date,
                "home_team_id": "a", "away_team_id": "b", "home_score": 2, "away_score": 0, "quality_status": "VERIFIED", "detail_status": "DETAILED"})
            for mode in ("S", "D"):
                match = f"m{n}{mode}"
                self.rows["matches"].append({"id": match, "encounter_id": f"e{n}", "match_number": 1 if mode == "S" else 2,
                    "mode": mode, "team_1_id": "a", "team_2_id": "b", "winner_team_id": "a"})
                for leg in (1, 2):
                    leg_id = f"{match}-{leg}"
                    self.rows["legs"].append({"id": leg_id, "match_id": match, "leg_number": leg, "status": "VALID", "winner_team_id": "a"})
                    for player in self.rows["players"]:
                        if mode == "S" and player["id"] in ("p2", "p4"): continue
                        won = player["team_id"] == "a"
                        self.rows["player_leg_stats"].append({"id": f"{leg_id}-{player['id']}", "leg_id": leg_id, "player_id": player["id"],
                            "team_id": player["team_id"], "score": (501 if won else 430) if mode == "S" else (250 if won else 210),
                            "darts_thrown": 27 + n if mode == "S" else 15, "first_9": 57.5, "finish": 88 if won and player["id"] == "p1" else 0,
                            "scores_180": 1 if n == 1 and leg == 1 else 0, "scores_140": 1, "scores_100": 2, "scores_80": 3, "no_score": 1, "leg_won": won})

    def table(self, name): return Query(self.rows.get(name, []))


fixture = Fixture()
players = PlayerStatisticsEngine.from_db(fixture)
duos = DuoStatisticsEngine.from_db(fixture)
competitions = CompetitionHubService(fixture)


@router.get("/players")
def overview(season_id: str | None = None):
    return {"players": players.overview(season_id), "season": players.dashboard("p1", season_id)["season"]}


@router.get("/players/compare/{left}/{right}")
def compare(left: str, right: str): return players.compare(left, right)


@router.get("/identities/{player_id}/career")
def career(player_id: str):
    dashboard = players.dashboard(player_id)
    aggregate = {**dashboard["kpis"], **dashboard["scoring"]}
    return {"identity": {"id": "identity", "canonical_player_id": player_id, "canonical_display_name": dashboard["player"]["name"], "is_active": True, "notes": None},
            "career": aggregate, "aliases": [{"id": "alias", "alias_name": "Alexandre Exemple", "source": "DEMO"}],
            "memberships": [{"id": "membership", "team": "Équipe des Hauts de La Réunion", "season": "2026-2027", "is_current": True, "valid_from": "2026-09-01", "valid_to": None}],
            "by_team": [{**aggregate, "team_id": "a", "team": "Équipe des Hauts de La Réunion"}], "source_player_ids": [player_id], "meta": {}}


@router.get("/players/{player_id}/{view}")
def player_view(player_id: str, view: str, season_id: str | None = None):
    if view in ("dashboard", "network", "dna", "coach"):
        return getattr(players, view)(player_id, season_id)
    if view == "affiliations": return {"current": {}, "history": [], "upcoming": [], "has_history": False}
    if view == "tournaments":
        return {"player": {"player_id": player_id, "name": "Alexandre Exemple de La Réunion", "team": "Les Hauts"}, "participation_count": 1,
                "participations": [{"code": "demo", "name": "Tournoi de démonstration", "date": "2026-09-01", "date_label": "1 septembre 2026",
                                    "href": "/tournaments/demo", "statistics": {**players.overview()[0], "scores_140": 2, "scores_100": 4}}]}
    raise HTTPException(404)


@router.get("/duos")
def duo_list(): return duos.overview()


@router.get("/duos/{first}/{second}")
def duo(first: str, second: str): return duos.detail(first, second)


@router.get("/competitions")
def catalog(): return competitions.catalog()


@router.get("/competitions/championships/{season}")
def championship(season: str): return competitions.championship(season)


@router.get("/competitions/tournaments")
def tournaments(): return competitions.tournaments(fixture)


@router.get("/competitions/tournaments/{code}")
def tournament(code: str): return competitions.tournament(code, fixture)


@router.get("/ranking")
def ranking(): return build_ranking(fixture)


@router.get("/teams/{team_id}/matches")
def history(team_id: str): return team_match_history(fixture, team_id)


@router.get("/match-hub/{result_id}")
def match(result_id: str): return build_match_hub(fixture, result_id)
