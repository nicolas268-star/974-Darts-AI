from __future__ import annotations

import io
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

from .file_detector import (
    DetectionStatus,
    FileDetectionError,
    FileKind,
    detect_import_file,
)
from .models import (
    AnomalySeverity,
    ImportAnomaly,
    ImportStatus,
    WorkbookAnalysis,
)


EXCLUDED_ROUNDS: frozenset[str] = frozenset({"T1", "T2"})

REQUIRED_COLUMNS: tuple[str, ...] = (
    "Saison",
    "Jour",
    "Rencontre",
    "Match",
    "S/D",
    "Team",
    "Joueur",
    "Leg",
    "Score",
)

LEG_KEY_COLUMNS: tuple[str, ...] = (
    "Saison",
    "Jour",
    "Rencontre",
    "Match Nakka",
    "Match",
    "S/D",
    "Leg",
)

PLAYER_LEG_KEY_COLUMNS: tuple[str, ...] = (
    "Saison",
    "Jour",
    "Rencontre",
    "Match Nakka",
    "Match",
    "S/D",
    "Team",
    "Joueur",
    "Leg",
)

MATCH_KEY_COLUMNS: tuple[str, ...] = (
    "Saison",
    "Jour",
    "Rencontre",
    "Match Nakka",
    "Match",
    "S/D",
)


@dataclass
class ParsedNakkaWorkbook:
    """Result of parsing and validating a Nakka export."""

    filename: str
    sha256: str
    dataframe: pd.DataFrame
    analysis: WorkbookAnalysis

    def analysis_dict(self) -> dict[str, Any]:
        return self.analysis.to_api_dict()


class NakkaParserError(ValueError):
    """Controlled parser error suitable for an HTTP 400 response."""


def _text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _normalize_dataframe(dataframe: pd.DataFrame) -> pd.DataFrame:
    normalized = dataframe.copy()
    normalized.columns = [_text(column) for column in normalized.columns]
    normalized = normalized.where(pd.notna(normalized), None)
    return normalized


def _read_dataframe(
    content: bytes,
    kind: FileKind,
    sheet_name: str | None,
    header_row: int | None,
    csv_encoding: str | None,
    csv_delimiter: str | None,
) -> pd.DataFrame:
    # pandas utilise un index d'en-tête basé sur zéro.
    pandas_header = max((header_row or 1) - 1, 0)

    if kind in (FileKind.XLSX, FileKind.XLSM):
        if not sheet_name:
            raise NakkaParserError("Aucune feuille Excel exploitable n'a été détectée.")

        return pd.read_excel(
            io.BytesIO(content),
            sheet_name=sheet_name,
            header=pandas_header,
            engine="openpyxl",
        )

    if kind == FileKind.CSV:
        return pd.read_csv(
            io.BytesIO(content),
            header=pandas_header,
            encoding=csv_encoding or "utf-8-sig",
            sep=csv_delimiter or ";",
        )

    raise NakkaParserError("Le format du fichier n'est pas pris en charge.")


def _column_exists(dataframe: pd.DataFrame, name: str) -> bool:
    return name in dataframe.columns


def _row_key(row: pd.Series, columns: tuple[str, ...]) -> str:
    return "|".join(_text(row.get(column)) for column in columns)


def _unique_values(dataframe: pd.DataFrame, column: str) -> list[str]:
    if column not in dataframe.columns:
        return []
    return sorted({_text(value) for value in dataframe[column] if _text(value)})


def _is_excluded_round(value: Any) -> bool:
    return _text(value).upper() in EXCLUDED_ROUNDS


def _status_from_anomalies(anomalies: list[ImportAnomaly]) -> ImportStatus:
    if any(
        anomaly.severity == AnomalySeverity.CRITICAL
        for anomaly in anomalies
    ):
        return ImportStatus.BLOCKED
    if any(
        anomaly.severity == AnomalySeverity.WARNING
        for anomaly in anomalies
    ):
        return ImportStatus.CHECK
    return ImportStatus.READY


def parse_nakka_workbook(content: bytes, filename: str) -> ParsedNakkaWorkbook:
    """
    Parse and validate one Nakka export without writing to Supabase.

    T1 and T2 are intentionally excluded from championship publication but
    remain counted in ``rows`` and ``excluded_rows``.

    The ``Finish`` value is only the total of the last scoring visit. No
    checkout route or double is inferred.
    """

    safe_filename = Path(filename or "upload").name

    try:
        detection = detect_import_file(content, safe_filename)
    except FileDetectionError as exc:
        raise NakkaParserError(str(exc)) from exc

    detection_anomalies = [
        ImportAnomaly(
            code=issue.code,
            severity=AnomalySeverity(issue.severity.upper()),
            message=issue.message,
            field=issue.field,
        )
        for issue in detection.issues
    ]

    if detection.status == DetectionStatus.BLOCKED:
        empty = pd.DataFrame()
        analysis = WorkbookAnalysis(
            filename=safe_filename,
            sha256=detection.sha256,
            rows=0,
            published_rows=0,
            columns=0,
            status=ImportStatus.BLOCKED,
            anomalies=detection_anomalies,
        )
        return ParsedNakkaWorkbook(
            filename=safe_filename,
            sha256=detection.sha256,
            dataframe=empty,
            analysis=analysis,
        )

    try:
        dataframe = _read_dataframe(
            content=content,
            kind=detection.kind,
            sheet_name=detection.sheet_name,
            header_row=detection.header_row,
            csv_encoding=detection.csv_encoding,
            csv_delimiter=detection.csv_delimiter,
        )
    except (OSError, ValueError, UnicodeError, pd.errors.ParserError) as exc:
        raise NakkaParserError(f"Lecture du fichier impossible : {exc}") from exc

    dataframe = _normalize_dataframe(dataframe)
    anomalies = list(detection_anomalies)

    missing_required = [
        column for column in REQUIRED_COLUMNS
        if not _column_exists(dataframe, column)
    ]
    for column in missing_required:
        anomalies.append(
            ImportAnomaly(
                code="IMP-001",
                severity=AnomalySeverity.CRITICAL,
                field=column,
                message=f"Colonne absente : {column}",
            )
        )

    if missing_required:
        analysis = WorkbookAnalysis(
            filename=safe_filename,
            sha256=detection.sha256,
            rows=len(dataframe),
            published_rows=0,
            columns=len(dataframe.columns),
            status=ImportStatus.BLOCKED,
            anomalies=anomalies,
        )
        return ParsedNakkaWorkbook(
            filename=safe_filename,
            sha256=detection.sha256,
            dataframe=dataframe,
            analysis=analysis,
        )

    excluded_mask = dataframe["Jour"].map(_is_excluded_round)
    excluded_rows = int(excluded_mask.sum())
    championship = dataframe.loc[~excluded_mask].copy()

    seen_player_legs: dict[str, int] = {}

    for index, row in dataframe.iterrows():
        # La ligne Excel réelle tient compte de la ligne d'en-tête détectée.
        excel_row = int(index) + (detection.header_row or 1) + 1
        excluded = _is_excluded_round(row.get("Jour"))

        import_warning = _text(row.get("Import Warning"))
        if import_warning:
            anomalies.append(
                ImportAnomaly(
                    code="DQ-IMPORT",
                    severity=(
                        AnomalySeverity.INFO
                        if excluded
                        else AnomalySeverity.WARNING
                    ),
                    row=excel_row,
                    field="Import Warning",
                    value=import_warning,
                    message=import_warning,
                )
            )

        if excluded:
            continue

        for column in ("Jour", "Team", "Joueur", "Leg", "Score"):
            if not _text(row.get(column)):
                anomalies.append(
                    ImportAnomaly(
                        code="DQ-MISSING",
                        severity=(
                            AnomalySeverity.CRITICAL
                            if column == "Joueur"
                            else AnomalySeverity.WARNING
                        ),
                        row=excel_row,
                        field=column,
                        message=f"{column} manquant",
                    )
                )

        average = _number(row.get("Average 3 Darts"))
        if average is not None and not 0 <= average <= 180:
            anomalies.append(
                ImportAnomaly(
                    code="DQ-AVG",
                    severity=AnomalySeverity.CRITICAL,
                    row=excel_row,
                    field="Average 3 Darts",
                    value=average,
                    message="Moyenne hors limites (0 à 180).",
                )
            )

        first_9 = _number(row.get("First 9"))
        if first_9 is not None and not 0 <= first_9 <= 180:
            anomalies.append(
                ImportAnomaly(
                    code="DQ-FIRST9",
                    severity=AnomalySeverity.CRITICAL,
                    row=excel_row,
                    field="First 9",
                    value=first_9,
                    message="First 9 hors limites (0 à 180).",
                )
            )

        finish = _number(row.get("Finish"))
        if finish is not None and not 0 <= finish <= 170:
            anomalies.append(
                ImportAnomaly(
                    code="DQ-FINISH",
                    severity=AnomalySeverity.CRITICAL,
                    row=excel_row,
                    field="Finish",
                    value=finish,
                    message=(
                        "Finish hors limites (0 à 170). Le finish représente "
                        "uniquement le total de la dernière volée."
                    ),
                )
            )

        score = _number(row.get("Score"))
        if score is not None and not 0 <= score <= 501:
            anomalies.append(
                ImportAnomaly(
                    code="DQ-SCORE",
                    severity=AnomalySeverity.CRITICAL,
                    row=excel_row,
                    field="Score",
                    value=score,
                    message="Score hors limites (0 à 501).",
                )
            )

        player_leg_key = _row_key(row, PLAYER_LEG_KEY_COLUMNS)
        if player_leg_key in seen_player_legs:
            anomalies.append(
                ImportAnomaly(
                    code="DQ-DUP",
                    severity=AnomalySeverity.WARNING,
                    row=excel_row,
                    field="Clé leg joueur",
                    value=player_leg_key,
                    message=(
                        "Doublon probable ; première occurrence ligne "
                        f"{seen_player_legs[player_leg_key]}."
                    ),
                )
            )
        else:
            seen_player_legs[player_leg_key] = excel_row

    scores_by_leg: dict[str, dict[str, float]] = {}
    for _, row in championship.iterrows():
        leg_key = _row_key(row, LEG_KEY_COLUMNS)
        team = _text(row.get("Team"))

        if not leg_key or not team:
            continue

        scores_by_leg.setdefault(leg_key, {})
        scores_by_leg[leg_key][team] = (
            scores_by_leg[leg_key].get(team, 0.0)
            + (_number(row.get("Score")) or 0.0)
        )

    valid_legs = 0
    invalid_legs = 0

    for leg_key, team_scores in scores_by_leg.items():
        winners = sum(
            round(total_score) == 501
            for total_score in team_scores.values()
        )

        if winners == 1:
            valid_legs += 1
        else:
            invalid_legs += 1
            anomalies.append(
                ImportAnomaly(
                    code="DQ-LEG",
                    severity=AnomalySeverity.WARNING,
                    field="Leg",
                    value=leg_key,
                    message=f"Leg ambigu ou incomplet : {leg_key}",
                )
            )

    match_keys = {
        _row_key(row, MATCH_KEY_COLUMNS)
        for _, row in championship.iterrows()
    }
    match_keys.discard("|||||")

    status = _status_from_anomalies(anomalies)

    analysis = WorkbookAnalysis(
        filename=safe_filename,
        sha256=detection.sha256,
        rows=len(dataframe),
        published_rows=len(championship),
        columns=len(dataframe.columns),
        players=_unique_values(championship, "Joueur"),
        teams=_unique_values(championship, "Team"),
        rounds=_unique_values(championship, "Jour"),
        seasons=_unique_values(championship, "Saison"),
        match_count=len(match_keys),
        leg_count=len(scores_by_leg),
        valid_legs=valid_legs,
        invalid_legs=invalid_legs,
        excluded_rows=excluded_rows,
        status=status,
        anomalies=anomalies,
    )

    return ParsedNakkaWorkbook(
        filename=safe_filename,
        sha256=detection.sha256,
        dataframe=championship,
        analysis=analysis,
    )
