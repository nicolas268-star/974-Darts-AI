from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote


LEAGUE_API = "https://tk2-228-23746.vs.sakura.ne.jp/n01/league/n01_league.php"
TOURNAMENT_API = (
    "https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_tournament.php"
)
NAKKA_HOME_URL = "https://n01darts.com/n01/"
DEFAULT_LEAGUE_ID = "lg_QqGB_7154"
USER_AGENT = "974-Darts-AI-Nakka-Radar/15.4.2"
STATE_PATH = Path(
    os.getenv("NAKKA_RADAR_STATE_PATH", "/app/data/nakka_radar_state.json")
)
TOURNAMENT_REGISTRY_PATH = Path(
    os.getenv(
        "NAKKA_TOURNAMENT_REGISTRY_PATH",
        "/app/data/sprint14_tournaments.json",
    )
)
MAX_SCAN_ITEMS = 120
STATE_VERSION = 4
_state_lock = threading.Lock()

TOURNAMENT_TITLE_SEARCH_TERMS: tuple[str, ...] = (
    "974",
    "Réunion",
    "Tampon",
    "TDC",
    "Papangue",
    "St Leu",
    "3BC",
    "St Paul",
    "Kazadarts",
    "Saint Pierre",
)


TEAM_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "id": "kazadarts-a",
        "name": "Kazadarts A",
        "aliases": ("Kazadarts A", "Kaza Darts A", "Kaz A", "Kaza A"),
    },
    {
        "id": "kazadarts-b",
        "name": "Kazadarts B",
        "aliases": ("Kazadarts B", "Kaza Darts B", "Kaz B", "Kaza B"),
    },
    {
        "id": "pdc-fournaise",
        "name": "PDC Fournaise",
        "aliases": ("PDC Fournaise",),
    },
    {
        "id": "pdc-neige",
        "name": "PDC Neige",
        "aliases": ("PDC Neige",),
    },
    {
        "id": "tdc",
        "name": "TDC",
        "aliases": (
            "TDC",
            "Tampon Dart Club",
            "Tampon Darts Club",
            "TDC Le Tampon",
        ),
    },
    {
        "id": "3bdc",
        "name": "3BDC",
        "aliases": (
            "3BDC",
            "3BC St Paul",
            "3BC Saint Paul",
            "3BC Saint-Paul",
            "3BC St-Paul",
        ),
    },
    {
        "id": "pdc-st-leu",
        "name": "PDC St-Leu",
        "aliases": (
            "PDC St Leu",
            "PDC St-Leu",
            "PDC Saint Leu",
            "PDC Saint-Leu",
            "Papangue Dart Club",
            "Papangue Darts Club",
        ),
        "titleOnly": True,
    },
    {
        "id": "kazadarts-saint-pierre",
        "name": "Kazadarts Saint-Pierre",
        "aliases": (
            "Kazadarts Saint Pierre",
            "Kazadarts Saint-Pierre",
            "Kazadarts St Pierre",
            "Kazadarts St-Pierre",
            "Kaza Darts Saint Pierre",
            "Kaza Darts Saint-Pierre",
        ),
        "titleOnly": True,
    },
    {
        "id": "reunion-974",
        "name": "La Réunion / 974",
        "aliases": (
            "La Réunion",
            "Ile de la Réunion",
            "Réunion",
            "974",
        ),
        "titleOnly": True,
    },
)


class NakkaRadarError(RuntimeError):
    pass


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _empty_state() -> dict[str, Any]:
    return {
        "version": STATE_VERSION,
        "teams": [dict(team) for team in TEAM_CATALOG],
        "lastScan": None,
        "decisions": {},
        "history": [],
        "publication": {
            "automatic": False,
            "reason": "Lecture, aperçu et validation uniquement.",
        },
    }


def load_radar_state() -> dict[str, Any]:
    with _state_lock:
        if not STATE_PATH.exists():
            return _empty_state()
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return _empty_state()
    if not isinstance(data, dict):
        return _empty_state()
    previous_version = int(data.get("version") or 1)
    state = {**_empty_state(), **data}
    state["version"] = STATE_VERSION
    state["teams"] = [dict(team) for team in TEAM_CATALOG]
    if not isinstance(state.get("decisions"), dict):
        state["decisions"] = {}
    if not isinstance(state.get("history"), list):
        state["history"] = []
    if previous_version < STATE_VERSION:
        state["lastScan"] = None
    if previous_version < 2:
        state["decisions"] = {
            key: decision
            for key, decision in state["decisions"].items()
            if not key.startswith("league:t_")
        }
    return state


def save_radar_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _state_lock:
        fd, temporary = tempfile.mkstemp(
            prefix=".nakka-radar-",
            suffix=".json",
            dir=STATE_PATH.parent,
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(state, stream, ensure_ascii=False, indent=2)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, STATE_PATH)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.casefold()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _contains_alias(text: str, alias: str) -> bool:
    normalized_text = f" {normalize_text(text)} "
    normalized_alias = normalize_text(alias)
    return bool(normalized_alias) and f" {normalized_alias} " in normalized_text


def match_known_teams(
    title: str,
    entries: list[str] | None = None,
    details: str = "",
) -> list[dict[str, Any]]:
    entries = [str(entry).strip() for entry in (entries or []) if str(entry).strip()]
    matches: list[dict[str, Any]] = []
    for team in TEAM_CATALOG:
        evidence: list[dict[str, str]] = []
        for alias in team["aliases"]:
            if not team.get("titleOnly"):
                for entry in entries:
                    if _contains_alias(entry, alias):
                        evidence.append(
                            {
                                "location": "participant",
                                "value": entry,
                                "alias": alias,
                            }
                        )
            if _contains_alias(title, alias):
                evidence.append({"location": "titre", "value": title, "alias": alias})
            if (
                not team.get("titleOnly")
                and details
                and _contains_alias(details, alias)
            ):
                evidence.append(
                    {"location": "description", "value": details, "alias": alias}
                )
        if evidence:
            unique: list[dict[str, str]] = []
            seen: set[tuple[str, str, str]] = set()
            for item in evidence:
                key = (item["location"], item["value"], item["alias"])
                if key not in seen:
                    unique.append(item)
                    seen.add(key)
            matches.append(
                {
                    "id": team["id"],
                    "name": team["name"],
                    "evidence": unique[:8],
                }
            )
    return matches


def _request_json(
    url: str,
    *,
    body: Any | None = None,
    timeout: int = 30,
) -> Any:
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    payload = None
    method = "GET"
    if body is not None:
        payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    request = urllib.request.Request(
        url,
        data=payload,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        raise NakkaRadarError("Une source officielle Nakka ne répond pas.") from exc
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise NakkaRadarError("Une réponse Nakka est illisible.") from exc


def _year_matches(timestamp: Any, season: int) -> bool:
    if not isinstance(timestamp, (int, float)) or timestamp <= 0:
        return True
    try:
        return datetime.fromtimestamp(timestamp, tz=UTC).year == season
    except (OverflowError, OSError, ValueError):
        return True


def _competition_confidence(matches: list[dict[str, Any]]) -> int:
    if len(matches) >= 2:
        return 99
    if not matches:
        return 0
    evidence = matches[0].get("evidence") or []
    if any(item.get("location") == "participant" for item in evidence):
        return 95
    if matches[0].get("id") in {"tdc", "3bdc"}:
        return 78
    return 86


def _decision_view(
    key: str,
    decisions: dict[str, Any],
    confidence: int,
    *,
    already_tracked: bool = False,
) -> dict[str, Any]:
    if already_tracked:
        return {
            "action": "TRACKED",
            "decidedAt": None,
            "decidedBy": "974 Darts AI",
            "reason": "Compétition déjà enregistrée et reliée au site.",
        }
    decision = decisions.get(key)
    if isinstance(decision, dict) and decision.get("action") in {"FOLLOW", "IGNORE"}:
        return decision
    return {
        "action": "REVIEW" if confidence < 90 else "NEW",
        "decidedAt": None,
        "decidedBy": None,
    }


def _is_already_tracked_league(league_id: str, season: int) -> bool:
    return league_id == DEFAULT_LEAGUE_ID and season == 2026


def _load_registered_tournaments() -> list[dict[str, Any]]:
    try:
        payload = json.loads(
            TOURNAMENT_REGISTRY_PATH.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        return []
    tournaments = payload.get("tournaments") if isinstance(payload, dict) else None
    return [
        item
        for item in (tournaments or [])
        if isinstance(item, dict)
        and re.fullmatch(
            r"t_[A-Za-z0-9_]+",
            str(item.get("source_tournament_id") or ""),
        )
    ]


def _date_to_timestamp(value: Any) -> float | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.strip()).replace(tzinfo=UTC).timestamp()
    except ValueError:
        return None


def _registered_tournament_discoveries(
    *,
    season: int,
    keyword: str,
    decisions: dict[str, Any],
    tournaments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    discoveries: list[dict[str, Any]] = []
    normalized_keyword = normalize_text(keyword)
    for tournament in tournaments:
        if str(tournament.get("season") or "") != str(season):
            continue
        tournament_id = str(tournament["source_tournament_id"])
        title = str(
            tournament.get("event_name")
            or tournament.get("name")
            or tournament_id
        ).strip()
        searchable = " ".join(
            str(tournament.get(field) or "")
            for field in ("event_name", "name", "date_label", "code")
        )
        if (
            normalized_keyword
            and normalized_keyword not in normalize_text(searchable)
        ):
            continue
        matches = match_known_teams(title)
        if not matches:
            matches = [
                {
                    "id": "registered-tournament",
                    "name": "Tournoi déjà enregistré",
                    "evidence": [
                        {
                            "location": "registre 974 Darts",
                            "value": title,
                            "alias": str(tournament.get("code") or tournament_id),
                        }
                    ],
                }
            ]
        key = f"tournament:{tournament_id}"
        summary = (
            tournament.get("summary")
            if isinstance(tournament.get("summary"), dict)
            else {}
        )
        discoveries.append(
            {
                "key": key,
                "sourceType": "TOURNAMENT",
                "sourceId": tournament_id,
                "parentId": None,
                "parentTitle": "Tournoi amical déjà enregistré",
                "title": title,
                "date": _date_to_timestamp(tournament.get("date")),
                "status": tournament.get("status"),
                "url": (
                    "https://n01darts.com/n01/tournament/comp.php"
                    f"?id={tournament_id}"
                ),
                "matchedTeams": matches,
                "confidence": 100,
                "eventCount": int(summary.get("matches") or 1),
                "events": [],
                "alreadyTracked": True,
                "decision": _decision_view(
                    key,
                    decisions,
                    100,
                    already_tracked=True,
                ),
            }
        )
    return discoveries


def _merge_team_matches(
    match_groups: list[list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for matches in match_groups:
        for team in matches:
            team_id = str(team.get("id") or "")
            if not team_id:
                continue
            target = merged.setdefault(
                team_id,
                {
                    "id": team_id,
                    "name": str(team.get("name") or team_id),
                    "evidence": [],
                },
            )
            seen = {
                (
                    item.get("location"),
                    item.get("value"),
                    item.get("alias"),
                )
                for item in target["evidence"]
            }
            for item in team.get("evidence") or []:
                evidence_key = (
                    item.get("location"),
                    item.get("value"),
                    item.get("alias"),
                )
                if evidence_key not in seen:
                    target["evidence"].append(item)
                    seen.add(evidence_key)
    return [
        {**team, "evidence": team["evidence"][:12]}
        for team in merged.values()
    ]


def _league_list(keyword: str, count: int) -> list[dict[str, Any]]:
    url = (
        f"{LEAGUE_API}?cmd=get_list&skip=0&count={count}"
        f"&keyword={quote(keyword)}"
    )
    payload = _request_json(url, body={})
    return payload if isinstance(payload, list) else []


def _league_events(league_id: str, count: int) -> tuple[str, list[dict[str, Any]]]:
    league = _request_json(f"{LEAGUE_API}?cmd=get_lg_data&lgid={league_id}")
    if not isinstance(league, dict) or league.get("result", 0) < 0:
        return "", []
    body = {
        "skip": 0,
        "count": count,
        "keyword": "",
        "status": [10, 20, 25, 30, 40],
        "sort": league.get("sort") or "date",
        "sort_order": league.get("sort_order")
        if isinstance(league.get("sort_order"), int)
        else -1,
    }
    events = _request_json(
        f"{LEAGUE_API}?cmd=get_season_list&lgid={league_id}",
        body=body,
    )
    return str(league.get("title") or league_id), (
        events if isinstance(events, list) else []
    )


def _scan_one_league(
    league: dict[str, Any],
    season: int,
    event_limit: int,
    decisions: dict[str, Any],
) -> tuple[list[dict[str, Any]], int]:
    league_id = str(league.get("lgid") or "")
    if not re.fullmatch(r"lg_[A-Za-z0-9_]+", league_id):
        return [], 0
    league_title, events = _league_events(league_id, event_limit)
    matched_events: list[dict[str, Any]] = []
    match_groups: list[list[dict[str, Any]]] = []
    for event in events:
        event_id = str(event.get("tdid") or "")
        if not re.fullmatch(r"t_[A-Za-z0-9_]+", event_id):
            continue
        if not _year_matches(event.get("t_date"), season):
            continue
        title = str(event.get("title") or event_id).strip()
        matches = match_known_teams(title)
        if not matches:
            continue
        match_groups.append(matches)
        matched_events.append(
            {
                "id": event_id,
                "title": title,
                "date": event.get("t_date"),
                "status": event.get("status"),
                "url": f"https://n01darts.com/n01/league/season.php?id={event_id}",
            }
        )
    if not matched_events:
        return [], len(events)

    matched_teams = _merge_team_matches(match_groups)
    confidence = _competition_confidence(matched_teams)
    key = f"league:{league_id}:{season}"
    already_tracked = _is_already_tracked_league(league_id, season)
    dates = [
        event["date"]
        for event in matched_events
        if isinstance(event.get("date"), (int, float))
    ]
    discovery = {
        "key": key,
        "sourceType": "LEAGUE",
        "sourceId": league_id,
        "parentId": None,
        "parentTitle": "Nakka League",
        "title": league_title,
        "date": max(dates) if dates else None,
        "status": None,
        "url": f"https://n01darts.com/n01/league/portal.php?lgid={league_id}",
        "matchedTeams": matched_teams,
        "confidence": confidence,
        "eventCount": len(matched_events),
        "events": matched_events,
        "alreadyTracked": already_tracked,
        "decision": _decision_view(
            key,
            decisions,
            confidence,
            already_tracked=already_tracked,
        ),
    }
    return [discovery], len(events)


def _tournament_list(keyword: str, count: int) -> list[dict[str, Any]]:
    url = (
        f"{TOURNAMENT_API}?cmd=get_list&skip=0&count={count}"
        f"&keyword={quote(keyword)}"
    )
    payload = _request_json(
        url,
        body={"status": [10, 20, 25, 30, 40], "sort": "active"},
    )
    return payload if isinstance(payload, list) else []


def _tournament_candidates(keyword: str, count: int) -> list[dict[str, Any]]:
    search_terms = (
        (keyword,)
        if keyword
        else ("", *TOURNAMENT_TITLE_SEARCH_TERMS)
    )
    collected: list[dict[str, Any]] = []
    successful_queries = 0
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(_tournament_list, term, count): term
            for term in search_terms
        }
        for future in as_completed(futures):
            term = futures[future]
            try:
                rows = future.result()
                successful_queries += 1
            except NakkaRadarError:
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                title = str(row.get("title") or "")
                if term and not match_known_teams(title):
                    continue
                collected.append(row)

    if successful_queries == 0:
        raise NakkaRadarError("La liste des tournois Nakka est indisponible.")

    unique: dict[str, dict[str, Any]] = {}
    for row in collected:
        tournament_id = str(row.get("tdid") or "")
        if re.fullmatch(r"t_[A-Za-z0-9_]+", tournament_id):
            unique[tournament_id] = row
    return list(unique.values())


def _scan_one_tournament(
    tournament: dict[str, Any],
    season: int,
    decisions: dict[str, Any],
    registered_tournament_ids: set[str] | None = None,
) -> dict[str, Any] | None:
    tournament_id = str(tournament.get("tdid") or "")
    if not re.fullmatch(r"t_[A-Za-z0-9_]+", tournament_id):
        return None
    if not _year_matches(tournament.get("t_date"), season):
        return None
    payload = _request_json(
        f"{TOURNAMENT_API}?cmd=get_data&tdid={tournament_id}"
    )
    if not isinstance(payload, dict) or payload.get("result", 0) < 0:
        return None
    title = str(payload.get("title") or tournament.get("title") or tournament_id)
    entries: list[str] = []
    for entry in payload.get("entry_list") or []:
        if isinstance(entry, dict) and entry.get("name"):
            entries.append(str(entry["name"]))
    matches = match_known_teams(title, entries, str(payload.get("details") or ""))
    if not matches:
        return None
    confidence = _competition_confidence(matches)
    key = f"tournament:{tournament_id}"
    already_tracked = tournament_id in (registered_tournament_ids or set())
    return {
        "key": key,
        "sourceType": "TOURNAMENT",
        "sourceId": tournament_id,
        "parentId": None,
        "parentTitle": "Nakka Tournament",
        "title": title,
        "date": payload.get("t_date") or tournament.get("t_date"),
        "status": payload.get("status") or tournament.get("status"),
        "url": f"https://n01darts.com/n01/tournament/comp.php?id={tournament_id}",
        "matchedTeams": matches,
        "confidence": confidence,
        "eventCount": 1,
        "events": [],
        "alreadyTracked": already_tracked,
        "decision": _decision_view(
            key,
            decisions,
            confidence,
            already_tracked=already_tracked,
        ),
    }


def run_radar_scan(
    *,
    season: int,
    keyword: str = "",
    source_types: list[str] | None = None,
    max_items: int = 30,
) -> dict[str, Any]:
    source_types = [
        value.upper()
        for value in (source_types or ["LEAGUE", "TOURNAMENT"])
        if value.upper() in {"LEAGUE", "TOURNAMENT"}
    ]
    if not source_types:
        raise ValueError("Sélectionne League, Tournament ou les deux.")
    max_items = max(1, min(max_items, MAX_SCAN_ITEMS))
    keyword = re.sub(r"\s+", " ", keyword.strip())[:80]
    state = load_radar_state()
    decisions = state["decisions"]
    registered_tournaments = _load_registered_tournaments()
    registered_tournament_ids = {
        str(item["source_tournament_id"])
        for item in registered_tournaments
    }
    discoveries: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []
    scanned = {"leaguePortals": 0, "leagueEvents": 0, "tournaments": 0}

    if "LEAGUE" in source_types:
        try:
            league_rows = _league_list(keyword, max_items)
            priority = {
                "lgid": DEFAULT_LEAGUE_ID,
                "title": "Championnat 974 · saison 2026",
            }
            league_rows = [priority] + [
                item
                for item in league_rows
                if item.get("lgid") != DEFAULT_LEAGUE_ID
            ]
            league_rows = league_rows[:max_items]
            scanned["leaguePortals"] = len(league_rows)
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = [
                    executor.submit(
                        _scan_one_league,
                        item,
                        season,
                        min(max_items, 80),
                        decisions,
                    )
                    for item in league_rows
                ]
                for future in as_completed(futures):
                    try:
                        found, event_count = future.result()
                        discoveries.extend(found)
                        scanned["leagueEvents"] += event_count
                    except NakkaRadarError:
                        issues.append(
                            {
                                "level": "warning",
                                "code": "LEAGUE_SOURCE_PARTIAL",
                                "message": "Un portail League n’a pas pu être vérifié.",
                            }
                        )
        except NakkaRadarError as exc:
            issues.append(
                {
                    "level": "critical",
                    "code": "LEAGUE_SOURCE_UNAVAILABLE",
                    "message": str(exc),
                }
            )

    if "TOURNAMENT" in source_types:
        try:
            tournaments = _tournament_candidates(keyword, max_items)
            scanned["tournaments"] = len(tournaments)
            with ThreadPoolExecutor(max_workers=6) as executor:
                futures = [
                    executor.submit(
                        _scan_one_tournament,
                        tournament,
                        season,
                        decisions,
                        registered_tournament_ids,
                    )
                    for tournament in tournaments
                ]
                for future in as_completed(futures):
                    try:
                        discovery = future.result()
                        if discovery:
                            discoveries.append(discovery)
                    except NakkaRadarError:
                        issues.append(
                            {
                                "level": "warning",
                                "code": "TOURNAMENT_DETAIL_PARTIAL",
                                "message": "Un tournoi n’a pas pu être vérifié.",
                            }
                        )
        except NakkaRadarError as exc:
            issues.append(
                {
                    "level": "critical",
                    "code": "TOURNAMENT_SOURCE_UNAVAILABLE",
                    "message": str(exc),
                }
            )
        discoveries.extend(
            _registered_tournament_discoveries(
                season=season,
                keyword=keyword,
                decisions=decisions,
                tournaments=registered_tournaments,
            )
        )

    unique = {item["key"]: item for item in discoveries}
    discoveries = sorted(
        unique.values(),
        key=lambda item: (
            {
                "TRACKED": 0,
                "FOLLOW": 1,
                "NEW": 2,
                "REVIEW": 3,
                "IGNORE": 4,
            }.get(item["decision"]["action"], 3),
            -item["confidence"],
            -(item.get("date") or 0),
            item["title"].casefold(),
        ),
    )
    critical_count = sum(issue["level"] == "critical" for issue in issues)
    status = "BLOCKED" if critical_count == len(source_types) else "READY"
    if not discoveries and status == "READY":
        issues.append(
            {
                "level": "info",
                "code": "NO_TEAM_MATCH",
                "message": (
                    "Aucune compétition de la fenêtre analysée ne contient "
                    "une équipe 974 Darts identifiée."
                ),
            }
        )

    collected_at = _now_iso()
    scan = {
        "scanId": f"radar-{collected_at}",
        "collectedAt": collected_at,
        "season": season,
        "keyword": keyword,
        "sourceTypes": source_types,
        "maxItems": max_items,
        "status": status,
        "scanned": scanned,
        "discoveries": discoveries,
        "issues": issues,
        "publication": {
            "executed": False,
            "reason": "Aucune publication automatique n’est autorisée.",
        },
    }
    state["lastScan"] = scan
    state["history"] = [
        {
            "scanId": scan["scanId"],
            "collectedAt": collected_at,
            "season": season,
            "status": status,
            "discoveryCount": len(discoveries),
            "scanned": scanned,
        },
        *state["history"],
    ][:20]
    save_radar_state(state)
    return state


def decide_discovery(
    *,
    discovery_key: str,
    action: str,
    confirmed: bool,
    decided_by: str | None,
) -> dict[str, Any]:
    if not confirmed:
        raise ValueError("La confirmation administrateur est obligatoire.")
    action = action.upper()
    if action not in {"FOLLOW", "IGNORE"}:
        raise ValueError("La décision doit être FOLLOW ou IGNORE.")
    state = load_radar_state()
    scan = state.get("lastScan") or {}
    discovery = next(
        (
            item
            for item in scan.get("discoveries") or []
            if item.get("key") == discovery_key
        ),
        None,
    )
    if not discovery:
        raise ValueError("Cette compétition n’appartient pas au dernier contrôle.")
    if discovery.get("alreadyTracked"):
        raise ValueError(
            "Cette compétition officielle est déjà suivie par 974 Darts AI."
        )
    decision = {
        "action": action,
        "decidedAt": _now_iso(),
        "decidedBy": decided_by or "administrateur",
        "title": discovery.get("title"),
        "url": discovery.get("url"),
        "matchedTeamIds": [
            team.get("id") for team in discovery.get("matchedTeams") or []
        ],
    }
    state["decisions"][discovery_key] = decision
    discovery["decision"] = decision
    save_radar_state(state)
    return state
