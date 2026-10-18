"""Historical recognition metadata; future events come from the official workflow."""
from typing import Any


COMMITTEE_RECOGNIZED_TOURNAMENTS: dict[str, dict[str, Any]] = {
    "T5": {
        "classification": "COMMITTEE_RECOGNIZED",
        "classification_label": "Open de club reconnu",
        "affects_committee_ranking": True,
        "committee_event_key": "club-open-kaz-2026-09-13",
        "ranking_status": "PUBLISHED",
    },
}


def tournament_classification(code: str) -> dict[str, Any]:
    return dict(COMMITTEE_RECOGNIZED_TOURNAMENTS.get(
        str(code).upper(), {
            "classification": "FRIENDLY", "classification_label": "Tournoi amical",
            "affects_committee_ranking": False, "committee_event_key": None,
            "ranking_status": "NOT_APPLICABLE",
        },
    ))
