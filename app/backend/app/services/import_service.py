from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.imports.models import ImportAnomaly, ImportStatus, WorkbookAnalysis
from app.imports.nakka_parser import (
    NakkaParserError,
    ParsedNakkaWorkbook,
    parse_nakka_workbook,
)
from app.imports.validator import ValidationResult, validate_nakka_dataframe


@dataclass
class ImportPreview:
    """
    Résultat complet d'une analyse d'import.

    Le DataFrame normalisé reste disponible pour les futurs lots de
    publication, mais ``to_api_dict`` n'expose que le rapport d'analyse.
    """

    parsed: ParsedNakkaWorkbook

    @property
    def analysis(self) -> WorkbookAnalysis:
        return self.parsed.analysis

    @property
    def dataframe(self):
        return self.parsed.dataframe

    def to_api_dict(self) -> dict[str, Any]:
        return self.analysis.to_api_dict()


class ImportService:
    """
    Orchestre le pipeline d'analyse Nakka sans écrire dans Supabase.

    Pipeline :
        fichier -> détection -> parsing -> validation métier -> rapport

    Cette version est volontairement en lecture seule. La publication en base
    sera ajoutée dans un lot ultérieur.
    """

    def analyze(self, content: bytes, filename: str) -> ImportPreview:
        parsed = parse_nakka_workbook(content, filename)

        if parsed.analysis.status == ImportStatus.BLOCKED:
            return ImportPreview(parsed=parsed)

        validation = validate_nakka_dataframe(parsed.dataframe)
        merged_anomalies = self._merge_anomalies(
            parsed.analysis.anomalies,
            validation.anomalies,
        )

        parsed.analysis.anomalies = merged_anomalies
        parsed.analysis.status = self._merge_status(
            parsed.analysis.status,
            validation.status,
        )

        return ImportPreview(parsed=parsed)

    @staticmethod
    def _merge_status(
        parser_status: ImportStatus,
        validator_status: ImportStatus,
    ) -> ImportStatus:
        priority = {
            ImportStatus.READY: 0,
            ImportStatus.CHECK: 1,
            ImportStatus.BLOCKED: 2,
        }
        return max(
            (parser_status, validator_status),
            key=lambda status: priority[status],
        )

    @staticmethod
    def _merge_anomalies(
        parser_anomalies: list[ImportAnomaly],
        validator_anomalies: list[ImportAnomaly],
    ) -> list[ImportAnomaly]:
        """
        Fusionne les anomalies en supprimant uniquement les doublons exacts.

        Des contrôles proches mais portant des codes différents sont conservés,
        car ils peuvent représenter deux règles métier distinctes.
        """

        result: list[ImportAnomaly] = []
        seen: set[tuple[object, ...]] = set()

        for anomaly in [*parser_anomalies, *validator_anomalies]:
            key = (
                anomaly.code,
                anomaly.severity.value,
                anomaly.row,
                anomaly.field,
                repr(anomaly.value),
                anomaly.message,
            )
            if key in seen:
                continue
            seen.add(key)
            result.append(anomaly)

        return result


def analyze_import(content: bytes, filename: str) -> ImportPreview:
    """Helper fonctionnel utilisé par la future route FastAPI."""

    return ImportService().analyze(content, filename)


__all__ = [
    "ImportPreview",
    "ImportService",
    "NakkaParserError",
    "analyze_import",
]
