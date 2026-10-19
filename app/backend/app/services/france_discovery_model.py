"""Pure inventory rules. No scoring, player identities, or publication imports."""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

from app.services.nakka_competition_radar import normalize_text

STATUSES = {10: "PREPARING", 20: "ENTRIES_OPEN", 25: "BUILDING_BRACKET",
            30: "IN_PROGRESS", 40: "FINISHED"}
DECISIONS = {"VERIFIED", "REVIEW_REQUIRED", "REJECTED", "UNASSIGNED"}
ORGANISM_TYPES = {"COMMITTEE", "REGIONAL_LEAGUE", "FEDERATION", "CLUB", "INDEPENDENT", "UNKNOWN"}
KEYWORDS = (
    "comité départemental", "comité régional", "comité de darts", "comité de fléchettes",
    "championnat départemental", "championnat régional", "open comité", "coupe comité",
    "ligue de darts", "comité", "comite", "ligue", "France", "Réunion", "Guadeloupe",
    "Martinique", "Guyane", "Mayotte",
)
FORMATS = {"lg": ("league", "LEAGUE"), "rr": ("round_robin", "ROUND_ROBIN"),
           "t": ("tournament", "SINGLE_ELIMINATION"), "s2": ("tournament", "SINGLE_ELIMINATION_2"),
           "d": ("tournament", "DOUBLE_ELIMINATION"), "m": ("matchs", "SINGLE_MATCHES")}


def now() -> str:
    return datetime.now(UTC).isoformat()


def digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":")).encode()).hexdigest()


def timestamp(value: Any) -> str | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
        if number <= 0:
            return None
        if number >= 100_000_000_000:
            number /= 1000
        return datetime.fromtimestamp(number, UTC).isoformat()
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def season_key(day: str | None, start_month: int = 9) -> str | None:
    if not 1 <= start_month <= 12:
        raise ValueError("Season start must be 1..12")
    if not day:
        return None
    parsed = date.fromisoformat(day[:10])
    start = parsed.year if parsed.month >= start_month else parsed.year - 1
    return f"{start}-{start + 1}"


def source_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    return value if parsed.scheme == "https" and parsed.hostname == "n01darts.com" else None


def public_document(document: dict) -> bool:
    # Missing flags on older documents mean public; explicit private/deleted wins.
    return not any(document.get(k) not in (None, 0, False, "0", "")
                   for k in ("private", "delete", "deleted"))


def normalize_competition(envelope: dict, *, start_month: int = 9) -> dict:
    item = envelope.get("tournament")
    if not isinstance(item, dict) or not isinstance(item.get("tdid"), str):
        raise ValueError("Missing tournament document/tdid")
    day = timestamp(item.get("t_date"))
    title = item.get("title") if isinstance(item.get("title"), str) else ""
    url = source_url(envelope.get("url"))
    if url:
        parsed_url = urlparse(url)
        if parsed_url.path not in {"/n01/league/season.php", "/n01/tournament/comp.php"} or parse_qs(parsed_url.query).get("id") != [item["tdid"]]:
            raise ValueError("Source URL does not identify this tournament")
    words = normalize_text(title).split()
    kind = next((label for term, label in (("open", "OPEN"), ("championnat", "CHAMPIONSHIP"),
                 ("coupe", "CUP"), ("tournoi", "TOURNAMENT")) if term in words), "OTHER")
    formats = [label for prefix, (flag, label) in FORMATS.items()
               if isinstance(item.get(f"{prefix}_setting"), dict)
               and item[f"{prefix}_setting"].get(flag) in (1, True)]
    entries = item.get("entry_list")
    # N01 entries include unconfirmed entrants: label as registered entries, not actual starters.
    participants = len(entries) if isinstance(entries, list) else None
    return {"n01_id": item["tdid"], "lgid": item.get("lgid"), "title": title,
            "competition_date": day[:10] if day else None,
            "season": season_key(day, start_month), "competition_type": kind,
            "status": STATUSES.get(item.get("status"), "UNKNOWN"),
            "n01_status": item.get("status"), "participants": participants,
            "formats": formats or None, "source_url": url,
            "source_updated_at": timestamp(item.get("updateTime")),
            "source_public": public_document(item)}


def suggestions(competition: dict, committees: list[dict], leagues: list[dict]) -> list[dict]:
    """A name, alias, geography, or N01 relation is a lead, never a proof."""
    title = " " + normalize_text(competition["title"]) + " "
    result = []
    for committee in committees:
        aliases = [committee["name"], *committee.get("aliases", [])]
        exact = any(normalize_text(a) and " " + normalize_text(a) + " " in title for a in aliases)
        linked = any(l.get("committee_id") == committee["id"] and
                     l["n01_id"] == competition.get("lgid") for l in leagues)
        if exact or linked:
            result.append({"committee_id": committee["id"], "status": "REVIEW_REQUIRED",
                           "score": 90 if linked else 70,
                           "reason": "N01 league relation" if linked else "Exact name/alias in title"})
    return result


def validate_evidence(evidence: dict, *, target: str) -> None:
    if not isinstance(evidence, dict) or evidence.get("target") != target:
        raise ValueError("Evidence must identify the exact target")
    parsed = urlparse(str(evidence.get("url", "")))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Evidence requires a public HTTPS source")
    if evidence.get("kind") not in {"OFFICIAL_DIRECTORY", "OFFICIAL_LINK", "ORGANIZER_CONFIRMATION", "OFFICIAL_RESULT"}:
        raise ValueError("A reliable evidence type is required")
    if not str(evidence.get("justification", "")).strip() or not evidence.get("checked_at"):
        raise ValueError("Evidence requires a justification and check date")
    datetime.fromisoformat(evidence["checked_at"].replace("Z", "+00:00"))


def public_competitions(state: dict) -> list[dict]:
    committees = {c["id"]: c for c in state["committees"]}
    return [c for c in state["competitions"] if c.get("verification_status") == "VERIFIED"
            and c.get("source_public") and committees.get(c.get("committee_id"), {}).get("verification_status") == "VERIFIED"]
