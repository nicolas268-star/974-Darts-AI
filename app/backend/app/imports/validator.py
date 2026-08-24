from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Iterable

import pandas as pd

from .models import AnomalySeverity, ImportAnomaly, ImportStatus


ALLOWED_MATCH_TYPES: frozenset[str] = frozenset({"S", "D"})
EXCLUDED_ROUNDS: frozenset[str] = frozenset({"T1", "T2"})


@dataclass(frozen=True)
class ValidationResult:
    """Résultat métier produit après analyse d'un export Nakka."""

    status: ImportStatus
    anomalies: list[ImportAnomaly]

    @property
    def critical_count(self) -> int:
        return sum(
            anomaly.severity == AnomalySeverity.CRITICAL
            for anomaly in self.anomalies
        )

    @property
    def warning_count(self) -> int:
        return sum(
            anomaly.severity == AnomalySeverity.WARNING
            for anomaly in self.anomalies
        )

    @property
    def info_count(self) -> int:
        return sum(
            anomaly.severity == AnomalySeverity.INFO
            for anomaly in self.anomalies
        )


def _text(value: object) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _number(value: object) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(number):
        return None
    return number


def _status_from(anomalies: Iterable[ImportAnomaly]) -> ImportStatus:
    severities = {anomaly.severity for anomaly in anomalies}
    if AnomalySeverity.CRITICAL in severities:
        return ImportStatus.BLOCKED
    if AnomalySeverity.WARNING in severities:
        return ImportStatus.CHECK
    return ImportStatus.READY


def _excel_row(index: object) -> int | None:
    try:
        return int(index) + 2
    except (TypeError, ValueError):
        return None


def validate_nakka_dataframe(dataframe: pd.DataFrame) -> ValidationResult:
    """
    Applique les règles métier principales au DataFrame normalisé par le parser.

    Cette fonction ne contacte pas Supabase et ne modifie aucune donnée.

    Règle fondamentale :
    la colonne ``Finish`` représente uniquement le total de la dernière volée.
    Elle ne permet jamais de déduire un double ni une route de checkout.
    """

    anomalies: list[ImportAnomaly] = []

    if dataframe.empty:
        anomalies.append(
            ImportAnomaly(
                code="VAL-EMPTY",
                severity=AnomalySeverity.CRITICAL,
                message="Aucune ligne de championnat exploitable n'a été trouvée.",
            )
        )
        return ValidationResult(
            status=ImportStatus.BLOCKED,
            anomalies=anomalies,
        )

    required_columns = {
        "Saison",
        "Jour",
        "Rencontre",
        "Match",
        "S/D",
        "Team",
        "Joueur",
        "Leg",
        "Score",
    }

    missing_columns = sorted(required_columns.difference(dataframe.columns))
    for column in missing_columns:
        anomalies.append(
            ImportAnomaly(
                code="VAL-COLUMN-MISSING",
                severity=AnomalySeverity.CRITICAL,
                field=column,
                message=f"Colonne obligatoire absente : {column}",
            )
        )

    if missing_columns:
        return ValidationResult(
            status=ImportStatus.BLOCKED,
            anomalies=anomalies,
        )

    active_rows = dataframe.loc[
        ~dataframe["Jour"].map(lambda value: _text(value).upper() in EXCLUDED_ROUNDS)
    ].copy()

    if active_rows.empty:
        anomalies.append(
            ImportAnomaly(
                code="VAL-NO-CHAMPIONSHIP",
                severity=AnomalySeverity.CRITICAL,
                field="Jour",
                message="Le fichier ne contient aucune ligne de championnat hors T1/T2.",
            )
        )
        return ValidationResult(
            status=ImportStatus.BLOCKED,
            anomalies=anomalies,
        )

    seasons = sorted({_text(value) for value in active_rows["Saison"] if _text(value)})
    if not seasons:
        anomalies.append(
            ImportAnomaly(
                code="VAL-SEASON-MISSING",
                severity=AnomalySeverity.CRITICAL,
                field="Saison",
                message="Aucune saison n'est renseignée.",
            )
        )
    elif len(seasons) > 1:
        anomalies.append(
            ImportAnomaly(
                code="VAL-MULTI-SEASON",
                severity=AnomalySeverity.WARNING,
                field="Saison",
                value=seasons,
                message="Plusieurs saisons sont présentes dans le même fichier.",
            )
        )

    for index, row in active_rows.iterrows():
        row_number = _excel_row(index)

        required_values = ("Jour", "Team", "Joueur", "Leg", "Score")
        for field_name in required_values:
            if not _text(row.get(field_name)):
                anomalies.append(
                    ImportAnomaly(
                        code="VAL-VALUE-MISSING",
                        severity=(
                            AnomalySeverity.CRITICAL
                            if field_name in {"Joueur", "Team"}
                            else AnomalySeverity.WARNING
                        ),
                        row=row_number,
                        field=field_name,
                        message=f"Valeur obligatoire manquante : {field_name}",
                    )
                )

        match_type = _text(row.get("S/D")).upper()
        if match_type and match_type not in ALLOWED_MATCH_TYPES:
            anomalies.append(
                ImportAnomaly(
                    code="VAL-MATCH-TYPE",
                    severity=AnomalySeverity.WARNING,
                    row=row_number,
                    field="S/D",
                    value=match_type,
                    message="Type de match inattendu. Valeurs attendues : S ou D.",
                )
            )

        leg = _number(row.get("Leg"))
        if leg is not None and (leg < 1 or not float(leg).is_integer()):
            anomalies.append(
                ImportAnomaly(
                    code="VAL-LEG",
                    severity=AnomalySeverity.WARNING,
                    row=row_number,
                    field="Leg",
                    value=leg,
                    message="Le numéro de leg doit être un entier supérieur ou égal à 1.",
                )
            )

        score = _number(row.get("Score"))
        if score is not None and not 0 <= score <= 501:
            anomalies.append(
                ImportAnomaly(
                    code="VAL-SCORE",
                    severity=AnomalySeverity.CRITICAL,
                    row=row_number,
                    field="Score",
                    value=score,
                    message="Le score doit être compris entre 0 et 501.",
                )
            )

        average = _number(row.get("Average 3 Darts"))
        if average is not None and not 0 <= average <= 180:
            anomalies.append(
                ImportAnomaly(
                    code="VAL-AVERAGE",
                    severity=AnomalySeverity.CRITICAL,
                    row=row_number,
                    field="Average 3 Darts",
                    value=average,
                    message="La moyenne 3 fléchettes doit être comprise entre 0 et 180.",
                )
            )

        first_9 = _number(row.get("First 9"))
        if first_9 is not None and not 0 <= first_9 <= 180:
            anomalies.append(
                ImportAnomaly(
                    code="VAL-FIRST9",
                    severity=AnomalySeverity.CRITICAL,
                    row=row_number,
                    field="First 9",
                    value=first_9,
                    message="Le First 9 doit être compris entre 0 et 180.",
                )
            )

        finish = _number(row.get("Finish"))
        if finish is not None and not 0 <= finish <= 170:
            anomalies.append(
                ImportAnomaly(
                    code="VAL-FINISH",
                    severity=AnomalySeverity.CRITICAL,
                    row=row_number,
                    field="Finish",
                    value=finish,
                    message=(
                        "Le finish doit être compris entre 0 et 170. "
                        "Il représente seulement le total de la dernière volée."
                    ),
                )
            )

    duplicate_key_columns = [
        column
        for column in (
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
        if column in active_rows.columns
    ]

    duplicate_keys: list[str] = []
    for _, row in active_rows.iterrows():
        key = "|".join(_text(row.get(column)) for column in duplicate_key_columns)
        if key.strip("|"):
            duplicate_keys.append(key)

    duplicate_counts = Counter(duplicate_keys)
    for key, count in duplicate_counts.items():
        if count > 1:
            anomalies.append(
                ImportAnomaly(
                    code="VAL-DUPLICATE",
                    severity=AnomalySeverity.WARNING,
                    field="natural_key",
                    value=key,
                    message=f"Doublon probable détecté ({count} occurrences).",
                )
            )

    return ValidationResult(
        status=_status_from(anomalies),
        anomalies=anomalies,
    )
