"""Provisioning failure/recovery checks, with no network calls or real credentials."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

source = Path(__file__).resolve().parents[2] / "deploy/setup-ranking-preview.py"
spec = importlib.util.spec_from_file_location("setup_preview", source)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
PUBLIC = "sb_publishable_test_public_key_only"
SECRET = "sb_secret_test_server_key_only"


class FakeAPI:
    def __init__(self):
        self.users = []
        self.profiles = []
        self.config = []
        self.calls = []
        self.fail_after_create = False

    def __call__(self, key, path, method="GET", body=None, token=None):
        self.calls.append((key, path, method, body, token))
        if path == "/auth/v1/settings":
            return {}
        if path.startswith("/auth/v1/admin/users"):
            if method == "GET":
                return {"users": self.users}
            assert body["email_confirm"] is True
            assert body["email"].endswith("@974darts.invalid")
            user = {"id": str(uuid4()), **body}
            self.users.append(user)
            if self.fail_after_create:
                self.fail_after_create = False
                raise setup.SetupError("Simulated interruption after account creation")
            return user
        if path.startswith("/auth/v1/token"):
            user = next(u for u in self.users if u["email"] == body["email"])
            if body["password"] != user["password"]:
                raise setup.SetupError("Wrong stored password")
            return {"access_token": user["id"], "user": {"id": user["id"]}}
        if path.startswith("/auth/v1/logout"):
            return None
        if path.startswith("/rest/v1/profiles"):
            if method == "POST":
                if not any(p["user_id"] == body["user_id"] for p in self.profiles):
                    self.profiles.append({"user_id": body["user_id"], "role": body["role"]})
                return None
            return [p for p in self.profiles if token is None or p["user_id"] == token]
        if path.startswith("/rest/v1/ranking_workflow_config"):
            if method == "POST":
                if not self.config:
                    self.config.append({"administrator_id": body["administrator_id"]})
                return None
            return self.config
        raise AssertionError("Unexpected endpoint: " + path)


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.api = FakeAPI()

    def run_setup(self):
        setup.prepare(self.directory, PUBLIC, SECRET, call=self.api)

    def test_complete_setup_keeps_credentials_private_and_sends_no_mail(self):
        self.run_setup()
        env = (self.directory / "ranking-preview.env").read_text()
        self.assertIn("RANKING_EMAIL_ENABLED=false", env)
        self.assertIn("RANKING_WORKFLOW_ENABLED=false", env)
        self.assertIn("ADMIN_USER_ID=" + self.api.config[0]["administrator_id"], env)
        self.assertEqual(len(self.api.users), 2)
        for name in ("ranking-preview.env", "ranking-preview-access.json"):
            self.assertEqual((self.directory / name).stat().st_mode & 0o777, 0o600)
        for _, path, _, _, _ in self.api.calls:
            self.assertNotIn("invite", path)
            self.assertNotIn("signup", path)
            self.assertNotIn("recover", path)
        self.assertEqual(sum("/logout" in call[1] for call in self.api.calls), 2)

    def test_existing_environment_is_never_replaced(self):
        path = self.directory / "ranking-preview.env"
        path.write_text("existing config")
        with self.assertRaises(setup.SetupError):
            self.run_setup()
        self.assertEqual(path.read_text(), "existing config")
        self.assertEqual(self.api.calls, [])

    def test_unrelated_profile_prevents_account_creation(self):
        self.api.profiles = [{"user_id": str(uuid4()), "role": "ADMIN"}]
        with self.assertRaises(setup.SetupError):
            self.run_setup()
        self.assertEqual(self.api.users, [])
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_interruption_reuses_same_account_and_password(self):
        self.api.fail_after_create = True
        with self.assertRaises(setup.SetupError):
            self.run_setup()
        first_id = self.api.users[0]["id"]
        self.run_setup()
        self.assertEqual(len(self.api.users), 2)
        self.assertEqual(self.api.config[0]["administrator_id"], first_id)

    def test_stored_password_does_not_allow_claiming_another_account(self):
        self.api.fail_after_create = True
        with self.assertRaises(setup.SetupError):
            self.run_setup()
        self.api.users[0]["password"] = "password-modified-outside-the-script"
        with self.assertRaises(setup.SetupError):
            self.run_setup()
        self.assertEqual(self.api.profiles, [])
        self.assertEqual(self.api.config, [])

    def test_secret_key_is_never_accepted_as_public_key(self):
        with self.assertRaises(setup.SetupError):
            setup.prepare(self.directory, SECRET, SECRET, call=self.api)
        self.assertEqual(self.api.calls, [])

    def test_legacy_production_key_is_rejected_before_network(self):
        claims = base64.urlsafe_b64encode(json.dumps({"ref": "vkvdyrsrvbyugbjlmknb", "role": "service_role"}).encode()).decode().rstrip("=")
        with self.assertRaises(setup.SetupError):
            setup.prepare(self.directory, PUBLIC, "header." + claims + ".signature", call=self.api)
        self.assertEqual(self.api.calls, [])

    def test_redirect_does_not_forward_keys(self):
        with self.assertRaises(setup.SetupError):
            setup.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.org/")

    def test_symlink_is_not_followed(self):
        target = self.directory / "other-file"
        target.write_text("keep")
        (self.directory / "ranking-preview-access.json").symlink_to(target)
        with self.assertRaises(setup.SetupError):
            self.run_setup()
        self.assertEqual(target.read_text(), "keep")
        self.assertEqual(self.api.calls, [])


if __name__ == "__main__":
    unittest.main()
