
from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
import math
from supabase import create_client, Client
from .config import settings
from .parser import ParsedWorkbook, text, number

def chunked(items: list[dict[str, Any]], size: int = 500):
    for index in range(0, len(items), size):
        yield items[index:index + size]

def clean_number(value: Any, integer: bool = False):
    parsed = number(value)
    if parsed is None:
        return None
    return int(parsed) if integer else parsed

class Publisher:
    def __init__(self):
        self.db: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )

    def _upsert_one(self, table: str, values: dict, on_conflict: str):
        result = (
            self.db.table(table)
            .upsert(values, on_conflict=on_conflict)
            .execute()
        )
        if not result.data:
            raise RuntimeError(f"Upsert sans résultat dans {table}")
        return result.data[0]

    def publish(self, parsed: ParsedWorkbook, uploaded_by: str | None) -> dict:
        analysis = parsed.analysis
        if analysis["status"] == "BLOCKED":
            raise ValueError("Publication interdite : anomalies critiques.")

        existing = (
            self.db.table("imports")
            .select("id,status,filename,rows_count")
            .eq("file_sha256", parsed.sha256)
            .execute()
        )
        if existing.data and existing.data[0].get("status") == "PUBLISHED":
            return {
                "status": "ALREADY_PUBLISHED",
                "importId": existing.data[0]["id"],
                "message": "Ce fichier a déjà été publié.",
            }

        import_row = self._upsert_one("imports", {
            "uploaded_by": uploaded_by,
            "filename": parsed.filename,
            "file_sha256": parsed.sha256,
            "status": "PUBLISHING",
            "rows_count": analysis["publishedRows"],
            "critical_count": sum(a["severity"] == "CRITICAL" for a in analysis["anomalies"]),
            "warning_count": sum(a["severity"] == "WARNING" for a in analysis["anomalies"]),
            "analysis_json": analysis,
        }, "file_sha256")
        import_id = import_row["id"]

        try:
            # Season references
            season_ids: dict[str, str] = {}
            for season_name in analysis["seasons"]:
                row = self._upsert_one("seasons", {
                    "name": season_name,
                    "is_active": True,
                }, "name")
                season_ids[season_name] = row["id"]

            # Teams and players
            team_ids: dict[str, str] = {}
            for team_name in analysis["teams"]:
                row = self._upsert_one("teams", {"name": team_name}, "name")
                team_ids[team_name] = row["id"]

            player_team_pairs = sorted({
                (text(row.get("Joueur")), text(row.get("Team")))
                for _, row in parsed.dataframe.iterrows()
                if text(row.get("Joueur")) and text(row.get("Team"))
            })
            player_ids: dict[tuple[str, str], str] = {}
            for player_name, team_name in player_team_pairs:
                row = self._upsert_one("players", {
                    "display_name": player_name,
                    "team_id": team_ids[team_name],
                    "public_profile": True,
                }, "display_name,team_id")
                player_ids[(player_name, team_name)] = row["id"]

            # Rounds
            round_ids: dict[tuple[str, str], str] = {}
            for season_name in analysis["seasons"]:
                season_df = parsed.dataframe[
                    parsed.dataframe["Saison"].map(text) == season_name
                ]
                for round_code in sorted({text(x) for x in season_df["Jour"] if text(x)}):
                    row = self._upsert_one("rounds", {
                        "season_id": season_ids[season_name],
                        "code": round_code,
                        "published": True,
                    }, "season_id,code")
                    round_ids[(season_name, round_code)] = row["id"]

            # Encounters
            encounter_ids: dict[tuple[str, str, str], str] = {}
            encounter_groups = parsed.dataframe.groupby(
                ["Saison", "Jour", "Rencontre"], dropna=False
            )
            for (season, round_code, encounter_name), group in encounter_groups:
                season_name = text(season)
                round_name = text(round_code)
                name = text(encounter_name)
                teams = sorted({text(x) for x in group["Team"] if text(x)})
                home_id = team_ids.get(teams[0]) if teams else None
                away_id = team_ids.get(teams[1]) if len(teams) > 1 else None
                natural_key = f"{season_name}|{round_name}|{name}"
                row = self._upsert_one("encounters", {
                    "round_id": round_ids[(season_name, round_name)],
                    "natural_key": natural_key,
                    "name": name,
                    "home_team_id": home_id,
                    "away_team_id": away_id,
                    "import_id": import_id,
                }, "natural_key")
                encounter_ids[(season_name, round_name, name)] = row["id"]

            # Matches and legs
            match_ids: dict[str, str] = {}
            match_cols = ["Saison","Jour","Rencontre","Match Nakka","Match","S/D"]
            for keys, group in parsed.dataframe.groupby(match_cols, dropna=False):
                season, round_code, encounter, nakka, match_no, mode = map(text, keys)
                natural_key = "|".join([season, round_code, encounter, nakka, match_no, mode])
                teams = sorted({text(x) for x in group["Team"] if text(x)})
                row = self._upsert_one("matches", {
                    "encounter_id": encounter_ids[(season, round_code, encounter)],
                    "natural_key": natural_key,
                    "match_number": clean_number(match_no, True),
                    "nakka_match_number": clean_number(nakka, True),
                    "mode": mode,
                    "team_1_id": team_ids.get(teams[0]) if teams else None,
                    "team_2_id": team_ids.get(teams[1]) if len(teams) > 1 else None,
                    "import_id": import_id,
                }, "natural_key")
                match_ids[natural_key] = row["id"]

            # Reconstruct winner team for each leg.
            leg_cols = match_cols + ["Leg"]
            leg_rows: list[dict] = []
            player_leg_rows: list[dict] = []
            for keys, group in parsed.dataframe.groupby(leg_cols, dropna=False):
                season, round_code, encounter, nakka, match_no, mode, leg_no = map(text, keys)
                match_key = "|".join([season, round_code, encounter, nakka, match_no, mode])
                natural_key = f"{match_key}|{leg_no}"
                scores = defaultdict(float)
                for _, source in group.iterrows():
                    scores[text(source.get("Team"))] += number(source.get("Score")) or 0
                winners = [team for team, score in scores.items() if round(score) == 501]
                winner_team_id = team_ids.get(winners[0]) if len(winners) == 1 else None
                leg_rows.append({
                    "match_id": match_ids[match_key],
                    "natural_key": natural_key,
                    "leg_number": clean_number(leg_no, True),
                    "winner_team_id": winner_team_id,
                    "status": "VALID" if winner_team_id else "AMBIGUOUS",
                    "import_id": import_id,
                })

            for batch in chunked(leg_rows):
                self.db.table("legs").upsert(batch, on_conflict="natural_key").execute()

            # Supabase/PostgREST limite souvent les réponses à 1 000 lignes.
            # Le championnat contient plus de 1 000 legs : pagination obligatoire.
            leg_data: list[dict] = []
            page_size = 1000
            offset = 0

            while True:
                page = (
                    self.db.table("legs")
                    .select("id,natural_key")
                    .eq("import_id", import_id)
                    .range(offset, offset + page_size - 1)
                    .execute()
                ).data or []

                leg_data.extend(page)

                if len(page) < page_size:
                    break

                offset += page_size

            leg_ids = {row["natural_key"]: row["id"] for row in leg_data}

            missing_leg_keys = [
                row["natural_key"]
                for row in leg_rows
                if row["natural_key"] not in leg_ids
            ]
            if missing_leg_keys:
                raise RuntimeError(
                    f"{len(missing_leg_keys)} legs publiés sont introuvables après pagination. "
                    f"Premier leg manquant : {missing_leg_keys[0]}"
                )

            for keys, group in parsed.dataframe.groupby(leg_cols, dropna=False):
                season, round_code, encounter, nakka, match_no, mode, leg_no = map(text, keys)
                match_key = "|".join([season, round_code, encounter, nakka, match_no, mode])
                leg_key = f"{match_key}|{leg_no}"
                scores = defaultdict(float)
                for _, source in group.iterrows():
                    scores[text(source.get("Team"))] += number(source.get("Score")) or 0
                winners = [team for team, score in scores.items() if round(score) == 501]
                winning_team = winners[0] if len(winners) == 1 else None

                for _, source in group.iterrows():
                    player = text(source.get("Joueur"))
                    team = text(source.get("Team"))
                    player_leg_rows.append({
                        "leg_id": leg_ids[leg_key],
                        "player_id": player_ids[(player, team)],
                        "team_id": team_ids[team],
                        "score": clean_number(source.get("Score"), True),
                        "darts_thrown": clean_number(source.get("fleches lancees"), True),
                        "average_3_darts": clean_number(source.get("Average 3 Darts")),
                        "first_9": clean_number(source.get("First 9 Average")),
                        "finish": clean_number(source.get("Finish"), True),
                        "scores_180": clean_number(source.get("180+"), True) or 0,
                        "scores_170": clean_number(source.get("170+"), True) or 0,
                        "scores_140": clean_number(source.get("140+"), True) or 0,
                        "scores_100": clean_number(source.get("100+"), True) or 0,
                        "scores_80": clean_number(source.get("80+"), True) or 0,
                        "no_score": clean_number(source.get("No Score"), True) or 0,
                        "leg_won": team == winning_team,
                        "import_id": import_id,
                    })

            for batch in chunked(player_leg_rows):
                self.db.table("player_leg_stats").upsert(
                    batch, on_conflict="leg_id,player_id"
                ).execute()

            anomalies = [{
                "import_id": import_id,
                "rule_code": item["code"],
                "severity": item["severity"],
                "source_row": item.get("row"),
                "field_name": item.get("field"),
                "observed_value": item.get("message"),
                "status": "IGNORED" if item["severity"] == "INFO" else "NEW",
            } for item in analysis["anomalies"]]
            if anomalies:
                self.db.table("data_anomalies").delete().eq("import_id", import_id).execute()
                for batch in chunked(anomalies):
                    self.db.table("data_anomalies").insert(batch).execute()

            self.db.table("imports").update({
                "status": "PUBLISHED",
                "published_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", import_id).execute()

            return {
                "status": "PUBLISHED",
                "importId": import_id,
                "filename": parsed.filename,
                "seasons": len(season_ids),
                "rounds": len(round_ids),
                "teams": len(team_ids),
                "players": len(player_ids),
                "encounters": len(encounter_ids),
                "matches": len(match_ids),
                "legs": len(leg_rows),
                "playerLegRows": len(player_leg_rows),
                "excludedTournamentRows": analysis["excludedRows"],
            }
        except Exception:
            self.db.table("imports").update({"status": "FAILED"}).eq("id", import_id).execute()
            raise
