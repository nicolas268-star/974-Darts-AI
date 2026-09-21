from __future__ import annotations

import re
from typing import Any


def collect_event_detail(page: Any, event: dict[str, Any]) -> dict[str, Any]:
    """Collecte les textes détaillés d'une rencontre avec un navigateur Playwright."""
    page.goto(event["url"], wait_until="domcontentloaded", timeout=30_000)
    page.wait_for_timeout(650)
    event["deepChecked"] = True
    body_text = page.locator("body").inner_text(timeout=10_000)

    stats_url = f"https://n01darts.com/n01/league/t_stats.html?id={event['id']}"
    page.goto(stats_url, wait_until="domcontentloaded", timeout=30_000)
    page.wait_for_timeout(900)
    stats_text = page.locator("body").inner_text(timeout=10_000)
    meaningful_stats = stats_text
    if len(re.sub(r"\s+", "", stats_text)) < 60:
        meaningful_stats = ""

    event["detail"] = {
        "matchText": body_text[:25_000],
        "statsText": meaningful_stats[:40_000],
        "statsUrl": stats_url,
    }
    return event
