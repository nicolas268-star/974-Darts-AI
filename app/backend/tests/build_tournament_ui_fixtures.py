"""Generate offline browser-QA payloads: python -m tests.build_tournament_ui_fixtures."""
from pathlib import Path
import json

from app.services.nakka_direct_import import normalize_direct_event
from app.services.tournament_engine import build_tournament_payload


def main():
    fixtures = Path(__file__).parent / "fixtures"
    output = Path(__file__).resolve().parents[3] / "artifacts" / "ui-tests"
    output.mkdir(parents=True, exist_ok=True)
    published = json.loads((fixtures / "oc1_published.json").read_text(encoding="utf-8"))
    for key, source_id, code, metadata in (
        ("oc1", "t_ssSW_4561", "oc1-2026-10-18", {
            **published["metadata"], "results": published["results"],
            "classification": "OFFICIAL",
            "location": "Saint-Leu, La Réunion",
            "ranking_status": "PUBLISHED", "affects_committee_ranking": True,
        }),
        ("t5", "t_aKyY_3246", "T5", {
            "title": "T5 — Kaz A Darts", "classification": "COMMITTEE_RECOGNIZED",
            "event_date": "2026-09-13", "organizer": "Kaz A Darts",
            "location": "La Réunion", "season_key": "2026",
            "ranking_status": "PUBLISHED", "affects_committee_ranking": True,
        }),
    ):
        source = normalize_direct_event(
            json.loads((fixtures / f"nakka_{key}_event.json").read_text(encoding="utf-8")),
            json.loads((fixtures / f"nakka_{key}_stats.json").read_text(encoding="utf-8")),
            f"https://n01darts.com/n01/tournament/comp.php?id={source_id}",
            2027 if key == "oc1" else 2026,
        )
        payload = build_tournament_payload(source, code=code, metadata=metadata)
        target = output / f"nakka_{key}_hub.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{target}: {payload['summary']['matches']} matches")


if __name__ == "__main__":
    main()
