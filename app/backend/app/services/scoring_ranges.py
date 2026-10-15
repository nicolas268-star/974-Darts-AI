"""Additive scoring ranges shared by the existing statistical read models."""
from typing import Any

from .ranking_service import _all


def is_120_139(score: int) -> bool:
    return 120 <= score <= 139


def load_scoring_rows(db, select: str) -> list[dict[str, Any]]:
    """Keep legacy statistics readable during a rolling schema deployment."""
    try:
        return _all(db, "player_leg_stats", select + ",scores_120_139")
    except Exception:
        try:
            return _all(db, "player_leg_stats", select)
        except Exception:
            # Match the dashboard's existing optional-table behaviour.
            return []


def scoring_120_139(rows: list[dict[str, Any]]) -> dict[str, Any]:
    # An unknown row is never a zero. A partial sum is exposed separately from
    # the complete KPI so callers cannot mistake it for the period's total.
    values = [row["scores_120_139"] for row in rows
              if isinstance(row.get("scores_120_139"), int)
              and not isinstance(row["scores_120_139"], bool)
              and row["scores_120_139"] >= 0]
    covered = len(values)
    complete = bool(rows) and covered == len(rows)
    return {
        "scores_120_139": sum(values) if complete else None,
        "scores_120_139_observed": sum(values) if covered else None,
        "scores_120_139_coverage": {
            "covered_player_legs": covered,
            "total_player_legs": len(rows),
            "status": "complete" if complete else "partial" if covered else "unavailable",
        },
    }
