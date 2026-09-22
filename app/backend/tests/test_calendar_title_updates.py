import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from app.services import calendar_service as calendar


class CalendarTitleTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.patcher = patch.object(calendar, "STATE_PATH", Path(self.directory.name) / "calendar.json")
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.original = {"id": "one", "title": "Before", "event_type": "CHAMPIONSHIP",
                         "source_url": "url", "start_date": "2026-09-29", "start_time": "19:00",
                         "location": "Club", "description": "Note manuelle"}
        calendar.upsert_event(self.original, "admin")
        self.change = {"id": "one", "previousTitle": "Before", "title": "After", "sourceUrl": "url"}

    def test_preserves_fields_and_history(self):
        self.assertEqual(calendar.update_titles([self.change], "admin")["updatedCount"], 1)
        event = calendar.list_events()["events"][0]
        for key, value in self.original.items():
            if key != "title":
                self.assertEqual(event[key], value)
        self.assertEqual(event["title"], "After")
        self.assertEqual(event["title_history"][0]["title"], "Before")

    def test_stale_preview_does_not_duplicate(self):
        calendar.update_titles([self.change], "admin")
        with self.assertRaises(ValueError):
            calendar.update_titles([self.change], "admin")
        self.assertEqual(calendar.list_events()["count"], 1)

    def test_batch_is_atomic(self):
        with self.assertRaises(ValueError):
            calendar.update_titles([self.change, {**self.change, "id": "missing"}], "admin")
        self.assertEqual(calendar.list_events()["events"][0]["title"], "Before")

    def test_non_championship_is_rejected(self):
        calendar.upsert_event({"id": "one", "event_type": "FRIENDLY"}, "admin")
        with self.assertRaises(ValueError):
            calendar.update_titles([self.change], "admin")

    def test_duplicate_id_is_rejected(self):
        with self.assertRaises(ValueError):
            calendar.update_titles([self.change, self.change], "admin")
