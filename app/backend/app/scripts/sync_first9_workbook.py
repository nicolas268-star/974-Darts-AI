from __future__ import annotations

import json
from pathlib import Path
import sys

from supabase import create_client

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import settings
from app.services.first9_profile_service import First9ProfileSyncService


def main() -> int:
    if len(sys.argv) != 2:
        print(
            "Usage: sync_first9_workbook.py <classeur.xlsx>",
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

    db = create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
    result = First9ProfileSyncService(db).sync_workbook(
        workbook_path.read_bytes(),
        workbook_path.name,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))

    if result["profiles_updated"] <= 0:
        print(
            "Aucun profil joueur n'a été associé au First 9.",
            file=sys.stderr,
        )
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
