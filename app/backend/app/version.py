import json
from pathlib import Path


RELEASE_FILE = Path(__file__).resolve().parents[1] / "RELEASE.json"
APP_VERSION = json.loads(RELEASE_FILE.read_text(encoding="utf-8"))["version"]
