import json
from pathlib import Path
import unittest

from app.version import APP_VERSION


class ReleaseVersionTests(unittest.TestCase):
    def test_backend_version_uses_release_manifest(self):
        release_path = Path(__file__).resolve().parents[1] / "RELEASE.json"
        release = json.loads(release_path.read_text(encoding="utf-8"))

        self.assertEqual(APP_VERSION, release["version"])
