from datetime import UTC, datetime
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from app.services import nakka_watch_service as service


class NakkaWatchServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.state = Path(self.temp.name) / "watch.json"
        self.path_patch = patch.object(service, "STATE_PATH", self.state)
        self.path_patch.start()

    def tearDown(self):
        self.path_patch.stop()
        self.temp.cleanup()

    def test_schedule_uses_reunion_time_and_first_slot(self):
        state = service.upsert_watch({
            "title": "Tournoi du 28 août", "season": 2026,
            "source_url": "https://n01darts.com/n01/tournament/comp.php?id=t_M317_6772",
            "event_date": "2026-08-28", "event_time": "09:00", "active": True,
        }, "admin")
        watch = state["watches"][0]
        self.assertEqual(watch["sourceId"], "t_M317_6772")
        self.assertEqual(watch["nextCheckAt"], "2026-08-21T05:00:00+00:00")

    def test_due_watch_is_selected(self):
        watch = {
            "id": "watch-1", "title": "Test", "eventDate": "2026-08-28",
            "eventTime": "09:00", "active": True, "status": "SCHEDULED",
            "completedSlots": [],
        }
        due = service._next_check(watch, datetime(2026, 8, 22, tzinfo=UTC))
        self.assertEqual(due.isoformat(), "2026-08-21T05:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
