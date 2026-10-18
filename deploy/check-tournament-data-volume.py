"""Validate normalized `docker compose config --format json` from stdin.

The tournament projection worker must see the API's historical cache. Otherwise
its first publication can assign a new slug to an existing /tournaments/t5 URL.
Only the API and existing import workers may write that cache.
"""
from __future__ import annotations

import json
import sys


def check(configuration: dict) -> None:
    services = configuration["services"]
    mounts = {}
    for service in ("backend", "ranking-worker"):
        candidates = [mount for mount in services[service].get("volumes", [])
                      if mount.get("target") == "/app/data"]
        if len(candidates) != 1 or candidates[0].get("type") != "bind":
            raise ValueError(f"{service} must bind the persistent /app/data cache exactly once")
        mounts[service] = candidates[0]
    if mounts["ranking-worker"].get("source") != mounts["backend"].get("source"):
        raise ValueError("API and ranking worker must read the same persistent tournament cache")
    if mounts["ranking-worker"].get("read_only") is not True:
        raise ValueError("The projection worker must mount /app/data read-only")
    if mounts["backend"].get("read_only", False):
        raise ValueError("The API must retain write access for validated Nakka imports")


if __name__ == "__main__":
    try:
        check(json.load(sys.stdin))
    except (KeyError, TypeError, ValueError) as exc:
        raise SystemExit(f"Tournament cache configuration invalid: {exc}") from exc
    print("PASS: API and ranking worker share one persistent cache; worker access is read-only")
