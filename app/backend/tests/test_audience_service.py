import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app.services import audience_service


class AudienceServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_file = Path(self.temp_dir.name) / "audience-events.jsonl"
        audience_service._last_prune_at = None

    def tearDown(self):
        audience_service._last_prune_at = None
        self.temp_dir.cleanup()

    def test_record_event_minimizes_browser_supplied_values(self):
        with patch.object(audience_service, "DATA_FILE", self.data_file):
            accepted = audience_service.record_event(
                {
                    "path": "players/secret?email=person@example.com",
                    "device": "unexpected-device",
                    "session": "person@example.com",
                }
            )

        self.assertTrue(accepted)
        event = json.loads(self.data_file.read_text(encoding="utf-8"))
        self.assertEqual(event["path"], "/")
        self.assertEqual(event["device"], "desktop")
        self.assertEqual(event["session"], "")

    def test_record_event_prunes_data_older_than_twelve_months(self):
        now = datetime.now(timezone.utc)
        old = {
            "at": (now - timedelta(days=audience_service.RETENTION_DAYS + 1)).isoformat(),
            "event_type": "page_view",
            "path": "/old",
            "device": "desktop",
            "session": "",
        }
        recent = {
            "at": (now - timedelta(days=30)).isoformat(),
            "event_type": "page_view",
            "path": "/recent",
            "device": "mobile",
            "session": "",
        }
        self.data_file.write_text(
            f"{json.dumps(old)}\n{json.dumps(recent)}\n", encoding="utf-8"
        )

        with patch.object(audience_service, "DATA_FILE", self.data_file):
            audience_service.record_event(
                {
                    "path": "/new",
                    "device": "tablet",
                    "session": "f2a8c1b8-5ea3-4cd9-881c-592c1dcbd79b",
                }
            )

        events = [
            json.loads(line)
            for line in self.data_file.read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual([event["path"] for event in events], ["/recent", "/new"])


if __name__ == "__main__":
    unittest.main()
