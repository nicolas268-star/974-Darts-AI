import os
import time

from app.services.tournament_watch_service import scan_all, status

INTERVAL = max(900, int(os.getenv("TOURNAMENT_WATCH_INTERVAL_SECONDS", "3600")))

def main() -> None:
    time.sleep(90)
    while True:
        try:
            if status().get("automation", {}).get("automatic", True):
                scan_all()
        except Exception as exc:
            print(f"Tournament watch error: {exc}", flush=True)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
