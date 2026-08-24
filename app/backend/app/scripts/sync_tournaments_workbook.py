from __future__ import annotations

import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.tournament_workbook_service import (
    enrich_tournament_metadata,
    parse_tournament_workbook,
    save_tournament_cache,
)


def main() -> int:
    if len(sys.argv) != 2:
        print(
            "Usage: sync_tournaments_workbook.py <classeur.xlsx>",
            file=sys.stderr,
        )
        return 2

    workbook_path = Path(sys.argv[1]).expanduser().resolve()
    if not workbook_path.is_file():
        print(
            f"Classeur introuvable : {workbook_path}",
            file=sys.stderr,
        )
        return 2

    payload = parse_tournament_workbook(
        workbook_path.read_bytes(),
        workbook_path.name,
    )
    if not payload["tournaments"]:
        print(
            "Aucune ligne T1 ou T2 trouvee dans la feuille PvP.",
            file=sys.stderr,
        )
        return 3
    payload = enrich_tournament_metadata(payload)
    cache_path = save_tournament_cache(payload)
    summary = {
        tournament["code"]: tournament["summary"]
        for tournament in payload["tournaments"]
    }
    print(json.dumps({
        "status": "SYNCED",
        "cache": str(cache_path),
        "tournaments": summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
