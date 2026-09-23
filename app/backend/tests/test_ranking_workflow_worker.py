import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from app.services.ranking_workflow_worker import process_email, run_once
from app.services.nakka_direct_import import analyze_direct_event


class WorkflowWorkerTests(unittest.TestCase):
    def test_smtp_failure_is_redacted_and_retried_with_lease(self):
        db = MagicMock()
        item = {"id": "mail-test", "lease_id": "lease-test", "attempts": 2}
        with patch(
            "app.services.ranking_workflow_worker.send_notification",
            side_effect=RuntimeError("password=DO-NOT-LOG"),
        ):
            process_email(db, item)
        update = db.table.return_value.update.call_args.args[0]
        self.assertEqual(update["state"], "QUEUED")
        self.assertNotIn("DO-NOT-LOG", str(update))
        db.table.return_value.update.return_value.eq.assert_called_with(
            "id", "mail-test"
        )
        db.table.return_value.update.return_value.eq.return_value.eq.assert_called_with(
            "lease_id", "lease-test"
        )

    def test_final_smtp_failure_stops_automatic_retries(self):
        db = MagicMock()
        with patch(
            "app.services.ranking_workflow_worker.send_notification",
            side_effect=RuntimeError("failure"),
        ):
            process_email(
                db, {"id": "mail-test", "lease_id": "lease-test", "attempts": 5}
            )
        self.assertEqual(
            db.table.return_value.update.call_args.args[0]["state"], "FAILED"
        )

    def test_email_disabled_never_claims_or_sends(self):
        db = MagicMock()
        db.rpc.return_value.execute.return_value = SimpleNamespace(data=None)
        with patch.dict(os.environ, {"RANKING_EMAIL_ENABLED": "false"}), patch(
            "app.services.ranking_workflow_worker.send_notification"
        ) as send:
            run_once(db)
        db.rpc.assert_called_once_with("ranking_claim_work", {"p_queue": "analysis"})
        send.assert_not_called()

    def test_private_analysis_does_not_write_existing_public_or_last_preview_cache(
        self,
    ):
        payload = {"tdid": "t_test", "entry_list": [], "title": "Privé"}
        with patch("app.services.nakka_direct_import._atomic_json_write") as write:
            result = analyze_direct_event(
                "https://n01darts.com/n01/tournament/comp.php?id=t_test",
                2026,
                persist=False,
                request_json=lambda *a, **k: payload,
            )
        write.assert_not_called()
        self.assertEqual(result["status"], "BLOCKED")
        self.assertNotIn("lastPreview", result)
        self.assertFalse(result["protection"]["publicationExecuted"])
