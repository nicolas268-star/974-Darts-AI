from __future__ import annotations

import os
import time

from app.services.nakka_watch_service import run_due_watches


def main() -> None:
    interval = max(60, int(os.getenv("NAKKA_WATCH_INTERVAL_SECONDS", "300")))
    while True:
        run_due_watches()
        time.sleep(interval)


if __name__ == "__main__":
    main()
