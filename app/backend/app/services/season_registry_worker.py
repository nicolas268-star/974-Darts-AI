import os
import time
from app.services.season_registry_service import scan_active

INTERVAL = max(3600, int(os.getenv("SEASON_REGISTRY_INTERVAL_SECONDS", "86400")))
def main():
    time.sleep(120)
    while True:
        try: scan_active()
        except Exception as exc: print(f"Season registry error: {exc}", flush=True)
        time.sleep(INTERVAL)
if __name__ == "__main__": main()
