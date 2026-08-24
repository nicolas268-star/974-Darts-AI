from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse


DEFAULT_SOURCE_URL = (
    "https://n01darts.com/n01/league/portal.php?lgid=lg_QqGB_7154"
)
NAKKA_LEAGUE_API_URL = (
    "https://tk2-228-23746.vs.sakura.ne.jp/n01/league/n01_league.php"
)
NAKKA_USER_AGENT = "974-Darts-AI-Nakka-Agent/15.1.0"
KNOWN_MISSING_DETAIL_IDS = {"t_hmQR_6833"}
STATE_PATH = Path(os.getenv("NAKKA_SYNC_STATE_PATH", "/app/data/nakka_sync_state.json"))
MAX_EVENTS = 80
_state_lock = threading.Lock()


class NakkaSyncError(RuntimeError):
    pass


@dataclass(frozen=True)
class SyncIssue:
    level: str
    code: str
    message: str
    event_id: str | None = None


def validate_source_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if (
        parsed.scheme != "https"
        or parsed.hostname != "n01darts.com"
        or parsed.path != "/n01/league/portal.php"
    ):
        raise ValueError(
            "La source doit être une URL HTTPS Nakka de type "
            "https://n01darts.com/n01/league/portal.php?lgid=..."
        )
    league_ids = parse_qs(parsed.query).get("lgid", [])
    if len(league_ids) != 1 or not re.fullmatch(r"lg_[A-Za-z0-9_]+", league_ids[0]):
        raise ValueError("L’identifiant Nakka lgid est absent ou invalide.")
    return value.strip()


def _event_id(url: str) -> str | None:
    values = parse_qs(urlparse(url).query).get("id", [])
    if len(values) != 1 or not re.fullmatch(r"t_[A-Za-z0-9_]+", values[0]):
        return None
    return values[0]


def _league_id(source_url: str) -> str:
    values = parse_qs(urlparse(source_url).query).get("lgid", [])
    if len(values) != 1:
        raise NakkaSyncError("L’identifiant du championnat Nakka est introuvable.")
    return values[0]


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _empty_state() -> dict[str, Any]:
    return {
        "version": 2,
        "source": {"season": 2026, "url": DEFAULT_SOURCE_URL, "active": True},
        "reference": None,
        "lastRun": None,
        "history": [],
    }


def _migrate_state(data: dict[str, Any]) -> dict[str, Any]:
    state = {**_empty_state(), **data}
    if not isinstance(state.get("history"), list):
        state["history"] = []
    if not isinstance(state.get("source"), dict):
        state["source"] = _empty_state()["source"]

    if state.get("reference") is None:
        last_run = state.get("lastRun")
        if isinstance(last_run, dict) and isinstance(last_run.get("events"), list):
            state["reference"] = {
                "acceptedAt": last_run.get("collectedAt") or _now_iso(),
                "acceptedBy": "migration-sprint-15.1",
                "season": (state.get("source") or {}).get("season", 2026),
                "sourceUrl": last_run.get("sourceUrl")
                or (state.get("source") or {}).get("url", DEFAULT_SOURCE_URL),
                "leagueTitle": last_run.get("leagueTitle") or "",
                "eventCount": last_run.get("eventCount", len(last_run["events"])),
                "snapshotHash": last_run.get("snapshotHash") or "",
                "events": last_run["events"],
                "legacySchema": True,
            }
    state["version"] = 2
    return state


def load_state() -> dict[str, Any]:
    with _state_lock:
        if not STATE_PATH.exists():
            return _empty_state()
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return _empty_state()
    return _migrate_state(data) if isinstance(data, dict) else _empty_state()


def save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _state_lock:
        fd, temp_name = tempfile.mkstemp(
            prefix=".nakka-sync-",
            suffix=".json",
            dir=STATE_PATH.parent,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(state, stream, ensure_ascii=False, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_name, STATE_PATH)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)


def validate_snapshot(events: list[dict[str, Any]]) -> list[SyncIssue]:
    issues: list[SyncIssue] = []
    if not events:
        return [
            SyncIssue(
                "critical",
                "NO_EVENTS",
                "Aucune rencontre n’a été trouvée sur la page Nakka.",
            )
        ]

    seen: set[str] = set()
    for event in events:
        event_id = event.get("id")
        if not event_id:
            issues.append(
                SyncIssue("critical", "INVALID_EVENT", "Une rencontre n’a pas d’identifiant.")
            )
            continue
        if event_id in seen:
            issues.append(
                SyncIssue(
                    "critical",
                    "DUPLICATE_EVENT",
                    "La rencontre apparaît plusieurs fois.",
                    event_id,
                )
            )
        seen.add(event_id)

        detail = event.get("detail") or {}
        has_stats = bool(detail.get("statsText"))
        if event_id in KNOWN_MISSING_DETAIL_IDS and not has_stats:
            issues.append(
                SyncIssue(
                    "info",
                    "KNOWN_J1_COLLECTIVE_ONLY",
                    (
                        "J1 Kazadarts A–Kazadarts B : résultat collectif conservé, "
                        "aucune statistique individuelle ne sera inventée."
                    ),
                    event_id,
                )
            )
        elif event.get("deepChecked") and not has_stats:
            issues.append(
                SyncIssue(
                    "warning",
                    "MISSING_MATCH_DETAIL",
                    "La rencontre ne fournit pas de statistiques détaillées.",
                    event_id,
                )
            )
    return issues


def status_from_issues(issues: list[SyncIssue]) -> str:
    levels = {issue.level for issue in issues}
    if "critical" in levels:
        return "BLOCKED"
    if "warning" in levels:
        return "CHECK"
    return "READY"


def _request_nakka_json(
    command: str,
    league_id: str,
    *,
    body: dict[str, Any] | None = None,
) -> Any:
    url = f"{NAKKA_LEAGUE_API_URL}?cmd={command}&lgid={league_id}"
    headers = {
        "Accept": "application/json",
        "User-Agent": NAKKA_USER_AGENT,
    }
    data = None
    method = "GET"
    if body is not None:
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
        method = "POST"

    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        raise NakkaSyncError(
            "La source de données Nakka ne répond pas correctement."
        ) from exc

    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise NakkaSyncError("La réponse Nakka est illisible.") from exc


def _events_from_api_payload(
    source_url: str,
    payload: Any,
) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise NakkaSyncError("La liste des rencontres Nakka est invalide.")

    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in payload:
        if not isinstance(row, dict):
            continue
        event_id = row.get("tdid")
        if (
            not isinstance(event_id, str)
            or not re.fullmatch(r"t_[A-Za-z0-9_]+", event_id)
            or event_id in seen
        ):
            continue
        seen.add(event_id)
        events.append(
            {
                "id": event_id,
                "label": str(row.get("title") or event_id).strip(),
                "url": urljoin(source_url, f"season.php?id={event_id}"),
                "sourceMeta": {
                    "status": row.get("status"),
                    "eventDate": row.get("t_date"),
                    "createdAt": row.get("createTime"),
                    "singlesMarker": row.get("s"),
                    "doublesMarker": row.get("d"),
                },
                "deepChecked": False,
                "detail": None,
            }
        )
    return events[:MAX_EVENTS]


def _collect_official_event_list(
    source_url: str,
) -> tuple[str, list[dict[str, Any]]]:
    league_id = _league_id(source_url)
    league = _request_nakka_json("get_lg_data", league_id)
    if not isinstance(league, dict) or league.get("result", 0) < 0:
        raise NakkaSyncError("Le championnat Nakka est indisponible.")

    sort_name = league.get("sort") or "date"
    sort_order = league.get("sort_order")
    if not isinstance(sort_order, int):
        sort_order = -1

    rows = _request_nakka_json(
        "get_season_list",
        league_id,
        body={
            "skip": 0,
            "count": MAX_EVENTS + 1,
            "keyword": "",
            "status": [10, 20, 25, 30, 40],
            "sort": sort_name,
            "sort_order": sort_order,
        },
    )
    title = str(league.get("title") or f"Championnat {league_id}").strip()
    return title, _events_from_api_payload(source_url, rows)


def _collect_links(page: Any, source_url: str) -> list[dict[str, Any]]:
    raw_links = page.locator('a[href*="season.php?id="]').evaluate_all(
        """els => els.map(a => ({
          href: a.getAttribute('href') || '',
          text: (a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim()
        }))"""
    )
    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    for link in raw_links:
        absolute = urljoin(source_url, link.get("href", ""))
        event_id = _event_id(absolute)
        if not event_id or event_id in seen:
            continue
        seen.add(event_id)
        events.append(
            {
                "id": event_id,
                "label": link.get("text") or event_id,
                "url": absolute,
                "deepChecked": False,
                "detail": None,
            }
        )
    return events[:MAX_EVENTS]


def _wait_for_portal_events(page: Any) -> None:
    try:
        page.locator('a[href*="season.php?id="]').first.wait_for(
            state="attached",
            timeout=20_000,
        )
        page.wait_for_timeout(500)
    except Exception:
        # La validation NO_EVENTS reste l'autorité de sécurité si le portail
        # ne produit réellement aucune rencontre.
        return


def _expand_portal(page: Any) -> None:
    for _ in range(20):
        more = page.locator("#read_more, [id*='read_more'], button:has-text('More')")
        if more.count() == 0 or not more.first.is_visible():
            return
        before = page.locator('a[href*="season.php?id="]').count()
        more.first.click(force=True)
        after = before
        for _ in range(12):
            page.wait_for_timeout(250)
            after = page.locator('a[href*="season.php?id="]').count()
            if after > before:
                break
        if after <= before:
            return


def _collect_event_detail(page: Any, event: dict[str, Any]) -> dict[str, Any]:
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


def collect_nakka_snapshot(
    source_url: str,
    *,
    deep: bool = False,
    max_deep_events: int = 40,
) -> dict[str, Any]:
    source_url = validate_source_url(source_url)
    collected_at = _now_iso()
    title, events = _collect_official_event_list(source_url)

    if deep:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise NakkaSyncError("Le navigateur Playwright n’est pas installé.") from exc

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            try:
                page = browser.new_page(locale="fr-FR")
                for event in events[: max(0, min(max_deep_events, MAX_EVENTS))]:
                    try:
                        _collect_event_detail(page, event)
                    except Exception as exc:
                        event["deepChecked"] = True
                        event["detail"] = {"error": type(exc).__name__, "statsText": ""}
            finally:
                browser.close()

    normalized = json.dumps(events, ensure_ascii=False, sort_keys=True).encode("utf-8")
    issues = validate_snapshot(events)
    return {
        "collectedAt": collected_at,
        "sourceUrl": source_url,
        "leagueTitle": title,
        "eventCount": len(events),
        "deep": deep,
        "status": status_from_issues(issues),
        "issues": [asdict(issue) for issue in issues],
        "snapshotHash": hashlib.sha256(normalized).hexdigest(),
        "events": events,
        "publication": {
            "executed": False,
            "reason": (
                "Sprint 15.1 : aperçu et validation manuelle uniquement. "
                "La publication automatique reste désactivée."
            ),
        },
    }


def _detail_digest(event: dict[str, Any]) -> str | None:
    detail = event.get("detail")
    if not isinstance(detail, dict):
        return None
    content = {
        "matchText": detail.get("matchText") or "",
        "statsText": detail.get("statsText") or "",
    }
    if not any(content.values()):
        return None
    raw = json.dumps(content, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _event_view(event: dict[str, Any]) -> dict[str, Any]:
    meta = event.get("sourceMeta")
    if not isinstance(meta, dict):
        meta = {}
    return {
        "id": event.get("id"),
        "label": event.get("label") or event.get("id"),
        "url": event.get("url"),
        "status": meta.get("status"),
        "eventDate": meta.get("eventDate"),
        "singlesMarker": meta.get("singlesMarker"),
        "doublesMarker": meta.get("doublesMarker"),
        "deepChecked": bool(event.get("deepChecked")),
        "detailDigest": _detail_digest(event),
    }


def compare_events(
    reference_events: list[dict[str, Any]] | None,
    current_events: list[dict[str, Any]],
    *,
    reference_accepted_at: str | None = None,
) -> dict[str, Any]:
    reference_available = reference_events is not None
    reference_by_id = {
        str(event.get("id")): event
        for event in (reference_events or [])
        if event.get("id")
    }
    current_by_id = {
        str(event.get("id")): event for event in current_events if event.get("id")
    }

    added = [
        _event_view(current_by_id[event_id])
        for event_id in sorted(current_by_id.keys() - reference_by_id.keys())
    ]
    removed = [
        _event_view(reference_by_id[event_id])
        for event_id in sorted(reference_by_id.keys() - current_by_id.keys())
    ]
    modified: list[dict[str, Any]] = []
    unchanged_count = 0

    field_labels = {
        "label": "libellé",
        "status": "statut Nakka",
        "eventDate": "date",
        "singlesMarker": "résultats simples",
        "doublesMarker": "résultats doubles",
        "detailDigest": "détail approfondi",
    }
    for event_id in sorted(current_by_id.keys() & reference_by_id.keys()):
        before = _event_view(reference_by_id[event_id])
        after = _event_view(current_by_id[event_id])
        changed_fields: list[str] = []
        for field, label in field_labels.items():
            if field == "detailDigest" and not after.get("deepChecked"):
                continue
            # Une ancienne référence 15.0.x ne possédait pas encore ces
            # marqueurs. La migration dédiée l'enrichit avant comparaison.
            if before.get(field) != after.get(field):
                changed_fields.append(label)
        if changed_fields:
            modified.append(
                {
                    "id": event_id,
                    "label": after["label"],
                    "changedFields": changed_fields,
                    "before": before,
                    "after": after,
                }
            )
        else:
            unchanged_count += 1

    has_changes = bool(added or modified or removed)
    if removed:
        review_status = "BLOCKED"
    elif has_changes:
        review_status = "REVIEW"
    else:
        review_status = "UNCHANGED"
    return {
        "referenceAvailable": reference_available,
        "referenceAcceptedAt": reference_accepted_at,
        "status": review_status,
        "hasChanges": has_changes,
        "addedCount": len(added),
        "modifiedCount": len(modified),
        "removedCount": len(removed),
        "unchangedCount": unchanged_count,
        "added": added,
        "modified": modified,
        "removed": removed,
        "acceptBlocked": bool(removed),
        "acceptBlockedReason": (
            "Une disparition de rencontre doit être examinée séparément."
            if removed
            else None
        ),
    }


def _legacy_reference_can_be_enriched(
    reference: dict[str, Any],
    current_events: list[dict[str, Any]],
) -> bool:
    if not reference.get("legacySchema"):
        return False
    old = {
        str(event.get("id")): str(event.get("label") or "")
        for event in reference.get("events") or []
        if event.get("id")
    }
    new = {
        str(event.get("id")): str(event.get("label") or "")
        for event in current_events
        if event.get("id")
    }
    return old == new and bool(old)


def _reference_from_run(
    result: dict[str, Any],
    *,
    season: int,
    accepted_at: str,
    accepted_by: str,
) -> dict[str, Any]:
    return {
        "acceptedAt": accepted_at,
        "acceptedBy": accepted_by,
        "season": season,
        "sourceUrl": result["sourceUrl"],
        "leagueTitle": result["leagueTitle"],
        "eventCount": result["eventCount"],
        "snapshotHash": result["snapshotHash"],
        "events": result["events"],
        "legacySchema": False,
    }


def run_and_store(
    source_url: str,
    *,
    season: int,
    deep: bool,
    max_deep_events: int,
) -> dict[str, Any]:
    result = collect_nakka_snapshot(
        source_url,
        deep=deep,
        max_deep_events=max_deep_events,
    )
    state = load_state()
    previous_hash = (state.get("lastRun") or {}).get("snapshotHash")
    result["changedSinceLastRun"] = (
        previous_hash is not None and previous_hash != result["snapshotHash"]
    )
    reference = state.get("reference")
    if isinstance(reference, dict) and _legacy_reference_can_be_enriched(
        reference,
        result["events"],
    ):
        reference = _reference_from_run(
            result,
            season=season,
            accepted_at=str(reference.get("acceptedAt") or result["collectedAt"]),
            accepted_by=str(reference.get("acceptedBy") or "migration-sprint-15.1"),
        )
        state["reference"] = reference

    reference_events = (
        reference.get("events")
        if isinstance(reference, dict) and isinstance(reference.get("events"), list)
        else None
    )
    result["comparison"] = compare_events(
        reference_events,
        result["events"],
        reference_accepted_at=(
            str(reference.get("acceptedAt"))
            if isinstance(reference, dict) and reference.get("acceptedAt")
            else None
        ),
    )
    state["source"] = {"season": season, "url": source_url, "active": True}
    state["lastRun"] = result
    history = list(state.get("history") or [])
    history.insert(
        0,
        {
            "collectedAt": result["collectedAt"],
            "status": result["status"],
            "eventCount": result["eventCount"],
            "snapshotHash": result["snapshotHash"],
            "changeSummary": {
                "added": result["comparison"]["addedCount"],
                "modified": result["comparison"]["modifiedCount"],
                "removed": result["comparison"]["removedCount"],
            },
        },
    )
    state["history"] = history[:20]
    save_state(state)
    return result


def accept_current_reference(
    snapshot_hash: str,
    *,
    confirmed: bool,
    accepted_by: str | None = None,
) -> dict[str, Any]:
    if not confirmed:
        raise ValueError("La confirmation explicite est obligatoire.")

    state = load_state()
    last_run = state.get("lastRun")
    if not isinstance(last_run, dict):
        raise ValueError("Aucun contrôle Nakka ne peut être validé.")
    if not snapshot_hash or snapshot_hash != last_run.get("snapshotHash"):
        raise ValueError(
            "Ce contrôle n’est plus le dernier disponible. Relance le contrôle."
        )
    if last_run.get("status") == "BLOCKED":
        raise ValueError("Un contrôle bloqué ne peut pas devenir la référence.")

    comparison = last_run.get("comparison")
    if isinstance(comparison, dict) and comparison.get("acceptBlocked"):
        raise ValueError(
            str(
                comparison.get("acceptBlockedReason")
                or "La référence ne peut pas être validée."
            )
        )

    accepted_at = _now_iso()
    actor = (accepted_by or "administrateur").strip()[:120] or "administrateur"
    season = int((state.get("source") or {}).get("season") or 2026)
    state["reference"] = _reference_from_run(
        last_run,
        season=season,
        accepted_at=accepted_at,
        accepted_by=actor,
    )
    last_run["comparison"] = compare_events(
        last_run.get("events") or [],
        last_run.get("events") or [],
        reference_accepted_at=accepted_at,
    )
    last_run["referenceAccepted"] = True
    last_run["referenceAcceptedAt"] = accepted_at
    state["lastRun"] = last_run
    history = list(state.get("history") or [])
    if history and history[0].get("snapshotHash") == snapshot_hash:
        history[0]["referenceAcceptedAt"] = accepted_at
    state["history"] = history
    save_state(state)
    return state
