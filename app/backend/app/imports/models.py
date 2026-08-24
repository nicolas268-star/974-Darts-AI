from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AnomalySeverity(str, Enum):
    """Severity levels used during Nakka workbook analysis."""

    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class ImportStatus(str, Enum):
    """Global status returned after workbook analysis."""

    READY = "READY"
    CHECK = "CHECK"
    BLOCKED = "BLOCKED"


class ImportAnomaly(BaseModel):
    """A validation or data-quality issue found in an imported workbook."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=50)
    severity: AnomalySeverity
    message: str = Field(min_length=1)
    row: int | None = Field(default=None, ge=1)
    field: str | None = None
    value: Any | None = None


class WorkbookAnalysis(BaseModel):
    """
    Normalized analysis returned by the Nakka parser.

    Important business rule:
    ``finish`` represents only the total of the final scoring visit.
    It must never be interpreted as a checkout route or a specific double.
    """

    model_config = ConfigDict(extra="forbid")

    filename: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")

    rows: int = Field(ge=0)
    published_rows: int = Field(default=0, ge=0)
    columns: int = Field(ge=0)

    players: list[str] = Field(default_factory=list)
    teams: list[str] = Field(default_factory=list)
    rounds: list[str] = Field(default_factory=list)
    seasons: list[str] = Field(default_factory=list)

    match_count: int = Field(default=0, ge=0)
    leg_count: int = Field(default=0, ge=0)
    valid_legs: int = Field(default=0, ge=0)
    invalid_legs: int = Field(default=0, ge=0)
    excluded_rows: int = Field(default=0, ge=0)

    status: ImportStatus
    anomalies: list[ImportAnomaly] = Field(default_factory=list)

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

    def to_api_dict(self) -> dict[str, Any]:
        """Return the camelCase structure expected by the current frontend."""

        return {
            "filename": self.filename,
            "sha256": self.sha256,
            "rows": self.rows,
            "publishedRows": self.published_rows,
            "columns": self.columns,
            "players": self.players,
            "teams": self.teams,
            "rounds": self.rounds,
            "seasons": self.seasons,
            "matchCount": self.match_count,
            "legCount": self.leg_count,
            "validLegs": self.valid_legs,
            "invalidLegs": self.invalid_legs,
            "excludedRows": self.excluded_rows,
            "status": self.status.value,
            "criticalCount": self.critical_count,
            "warningCount": self.warning_count,
            "infoCount": self.info_count,
            "anomalies": [
                {
                    "code": anomaly.code,
                    "severity": anomaly.severity.value,
                    "row": anomaly.row,
                    "field": anomaly.field,
                    "value": anomaly.value,
                    "message": anomaly.message,
                }
                for anomaly in self.anomalies
            ],
        }
