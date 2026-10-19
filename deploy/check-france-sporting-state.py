"""Read-only deployment guard; output stays in a private server backup directory."""
import hashlib
import json
import sys

from supabase import create_client
from app.config import settings


def read_rows(db, table, *, published=False):
    result = []
    for offset in range(0, 100_000, 500):
        query = db.table(table).select("*").order("id").range(offset, offset + 499)
        if published:
            query = query.eq("status", "PUBLISHED")
        page = query.execute().data or []
        result.extend(page)
        if len(page) < 500:
            return result
    raise ValueError("Sporting backup exceeded its safe bound")


db = create_client(settings.supabase_url, settings.supabase_service_role_key)
data = {table: read_rows(db, table) for table in ("committee_ranking_events", "committee_ranking_results")}
data["ranking_workflow_revisions"] = read_rows(db, "ranking_workflow_revisions", published=True)
digests = {table: {"count": len(rows), "sha256": hashlib.sha256(json.dumps(rows, sort_keys=True,
    ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()} for table, rows in data.items()}
print(json.dumps({"checksums": digests, **({"private_backup": data} if "--backup" in sys.argv else {})},
                 sort_keys=True, ensure_ascii=False, indent=2))
