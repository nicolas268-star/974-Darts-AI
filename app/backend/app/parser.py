
from __future__ import annotations
from dataclasses import dataclass
from io import BytesIO
from typing import Any
import hashlib
import math
import pandas as pd

REQUIRED = ["Saison","Jour","Rencontre","Match","S/D","Team","Joueur","Leg","Score"]
EXCLUDED_ROUNDS = {"T1", "T2"}

def text(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value).strip()

def number(value: Any) -> float | None:
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None

@dataclass
class ParsedWorkbook:
    filename: str
    sha256: str
    dataframe: pd.DataFrame
    analysis: dict[str, Any]

def parse_workbook(content: bytes, filename: str) -> ParsedWorkbook:
    df = pd.read_excel(BytesIO(content), sheet_name="PvP", engine="openpyxl")
    df = df.where(pd.notna(df), None)
    headers = list(df.columns)
    anomalies: list[dict[str, Any]] = []

    for field in REQUIRED:
        if field not in headers:
            anomalies.append({
                "code": "IMP-001", "severity": "CRITICAL", "row": None,
                "field": field, "message": f"Colonne absente : {field}",
            })

    if any(a["severity"] == "CRITICAL" for a in anomalies):
        return ParsedWorkbook(filename, hashlib.sha256(content).hexdigest(), df, {
            "filename": filename, "rows": len(df), "columns": len(headers),
            "players": [], "teams": [], "rounds": [], "seasons": [],
            "matchCount": 0, "legCount": 0, "validLegs": 0, "invalidLegs": 0,
            "excludedRows": 0, "status": "BLOCKED", "anomalies": anomalies,
        })

    seen: dict[str, int] = {}
    excluded_rows = 0
    championship = df[~df["Jour"].map(lambda x: text(x).upper() in EXCLUDED_ROUNDS)].copy()

    for index, row in df.iterrows():
        excel_row = int(index) + 2
        is_tournament = text(row.get("Jour")).upper() in EXCLUDED_ROUNDS
        if is_tournament:
            excluded_rows += 1

        # Tournament warnings are informational and don't affect status.
        import_warning = text(row.get("Import Warning"))
        if import_warning:
            anomalies.append({
                "code": "DQ-IMPORT",
                "severity": "INFO" if is_tournament else "WARNING",
                "row": excel_row,
                "field": "Import Warning",
                "message": import_warning,
            })

        if is_tournament:
            continue

        for field in ["Jour", "Team", "Joueur", "Leg", "Score"]:
            if not text(row.get(field)):
                anomalies.append({
                    "code": "DQ-MISSING",
                    "severity": "CRITICAL" if field == "Joueur" else "WARNING",
                    "row": excel_row, "field": field,
                    "message": f"{field} manquant",
                })

        avg = number(row.get("Average 3 Darts"))
        if avg is not None and not 0 <= avg <= 180:
            anomalies.append({
                "code": "DQ-AVG", "severity": "CRITICAL", "row": excel_row,
                "field": "Average 3 Darts", "message": "Moyenne hors limites",
            })

        finish = number(row.get("Finish"))
        if finish is not None and not 0 <= finish <= 170:
            anomalies.append({
                "code": "DQ-FINISH", "severity": "CRITICAL", "row": excel_row,
                "field": "Finish", "message": "Finish hors limites",
            })

        key = "|".join(text(row.get(c)) for c in [
            "Saison","Jour","Rencontre","Match Nakka","Match","S/D","Team","Joueur","Leg"
        ])
        if key in seen:
            anomalies.append({
                "code": "DQ-DUP", "severity": "WARNING", "row": excel_row,
                "field": "Clé leg", "message": f"Doublon probable ligne {seen[key]}",
            })
        else:
            seen[key] = excel_row

    leg_key_cols = ["Saison","Jour","Rencontre","Match Nakka","Match","S/D","Leg"]
    scores: dict[str, dict[str, float]] = {}
    for _, row in championship.iterrows():
        key = "|".join(text(row.get(c)) for c in leg_key_cols)
        scores.setdefault(key, {})
        team = text(row.get("Team"))
        scores[key][team] = scores[key].get(team, 0.0) + (number(row.get("Score")) or 0.0)

    valid_legs = 0
    invalid_legs = 0
    for key, team_scores in scores.items():
        winners = sum(round(value) == 501 for value in team_scores.values())
        if winners == 1:
            valid_legs += 1
        else:
            invalid_legs += 1
            anomalies.append({
                "code": "DQ-LEG", "severity": "WARNING", "row": None,
                "field": "Leg", "message": f"Leg ambigu : {key}",
            })

    match_keys = {
        "|".join(text(row.get(c)) for c in [
            "Saison","Jour","Rencontre","Match Nakka","Match","S/D"
        ])
        for _, row in championship.iterrows()
    }

    def unique(column: str) -> list[str]:
        return sorted({text(value) for value in championship[column] if text(value)})

    critical = sum(a["severity"] == "CRITICAL" for a in anomalies)
    warnings = sum(a["severity"] == "WARNING" for a in anomalies)
    status = "BLOCKED" if critical else ("CHECK" if warnings else "READY")

    analysis = {
        "filename": filename,
        "sha256": hashlib.sha256(content).hexdigest(),
        "rows": len(df),
        "publishedRows": len(championship),
        "columns": len(headers),
        "players": unique("Joueur"),
        "teams": unique("Team"),
        "rounds": unique("Jour"),
        "seasons": unique("Saison"),
        "matchCount": len(match_keys),
        "legCount": len(scores),
        "validLegs": valid_legs,
        "invalidLegs": invalid_legs,
        "excludedRows": excluded_rows,
        "status": status,
        "anomalies": anomalies,
    }
    return ParsedWorkbook(filename, analysis["sha256"], championship, analysis)
