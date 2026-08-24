from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
from threading import Lock
from typing import Any, Iterator
import unicodedata
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from app.services.tournament_workbook_service import (
    TOURNAMENT_CACHE,
    load_tournament_cache,
)


TOURNAMENT_API = (
    "https://tk2-228-23746.vs.sakura.ne.jp/"
    "n01/tournament/n01_tournament.php"
)
TOURNAMENT_STATS_API = (
    "https://tk2-228-23746.vs.sakura.ne.jp/"
    "n01/tournament/n01_stats_t.php"
)
STATE_PATH = Path(
    os.getenv(
        "NAKKA_DIRECT_IMPORT_STATE_PATH",
        "/app/data/nakka_direct_import_state.json",
    )
)
LOCK_PATH = Path(
    os.getenv(
        "NAKKA_DIRECT_IMPORT_LOCK_PATH",
        "/app/data/.nakka-direct-import.lock",
    )
)
SOURCE_ID_PATTERN = re.compile(r"^t_[A-Za-z0-9_]+$")
ALLOWED_PATHS = {
    "/n01/league/season.php",
    "/n01/tournament/comp.php",
}
FRENCH_MONTHS = (
    "",
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)
_STATE_LOCK = Lock()


class NakkaDirectImportError(RuntimeError):
    """Raised when a direct Nakka event cannot be analysed safely."""


def _empty_state() -> dict[str, Any]:
    return {
        "version": 1,
        "lastPreview": None,
        "imports": [],
    }


def _normalize_name(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    text = "".join(
        character
        for character in text
        if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", "", text)


def _integer(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _decimal(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        return None
    return round(parsed, 2)


def _ratio(numerator: Any, denominator: Any, multiplier: float = 1.0) -> float | None:
    top = _integer(numerator)
    bottom = _integer(denominator)
    if bottom <= 0:
        return None
    return round(top / bottom * multiplier, 2)


def _atomic_json_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False),
        encoding="utf-8",
    )
    temporary.replace(path)


@contextmanager
def _exclusive_file_lock() -> Iterator[None]:
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOCK_PATH.open("a+", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def load_direct_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return _empty_state()
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return _empty_state()
    if not isinstance(payload, dict):
        return _empty_state()
    return {
        "version": 1,
        "lastPreview": payload.get("lastPreview"),
        "imports": list(payload.get("imports") or [])[-20:],
    }


def validate_direct_event_url(value: str) -> tuple[str, str]:
    raw = str(value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme != "https" or parsed.hostname != "n01darts.com":
        raise ValueError("Utilisez une URL HTTPS officielle du domaine n01darts.com.")
    if parsed.path not in ALLOWED_PATHS:
        raise ValueError(
            "L’URL doit viser une page Nakka season.php ou comp.php."
        )
    query = parse_qs(parsed.query, keep_blank_values=False)
    source_ids = query.get("id") or []
    if len(source_ids) != 1 or not SOURCE_ID_PATTERN.fullmatch(source_ids[0]):
        raise ValueError("L’identifiant Nakka du tournoi est absent ou invalide.")
    source_id = source_ids[0]
    canonical = urlunparse((
        "https",
        "n01darts.com",
        parsed.path,
        "",
        urlencode({"id": source_id}),
        "",
    ))
    return canonical, source_id


def _request_json(url: str, method: str = "GET") -> Any:
    data = b"" if method == "POST" else None
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "User-Agent": "974-Darts-AI/15.5 (+https://974darts.re)",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise NakkaDirectImportError(
            f"Nakka est temporairement inaccessible ({type(exc).__name__})."
        ) from exc


def _identity_match(
    name: str,
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = _normalize_name(name)
    matches = [
        candidate
        for candidate in candidates
        if _normalize_name(candidate.get("name")) == normalized
    ]
    if len(matches) == 1:
        match = matches[0]
        return {
            "status": "EXACT",
            "canonicalPlayerId": str(match.get("id") or "") or None,
            "canonicalName": str(
                match.get("canonicalName") or match.get("name") or name
            ),
            "confidence": 100,
        }
    return {
        "status": "UNRESOLVED" if not matches else "AMBIGUOUS",
        "canonicalPlayerId": None,
        "canonicalName": None,
        "confidence": 0,
    }


def _date_payload(timestamp: Any) -> tuple[str | None, str | None]:
    value = _integer(timestamp)
    if value <= 0:
        return None, None
    moment = datetime.fromtimestamp(value, tz=timezone.utc)
    iso = moment.date().isoformat()
    label = f"{moment.day} {FRENCH_MONTHS[moment.month]} {moment.year}"
    return iso, label


def _participant_stats(
    participant: dict[str, Any],
    stats: dict[str, Any],
    identity_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    source_id = str(participant.get("tpid") or "")
    name = str(participant.get("name") or source_id or "Joueur").strip()
    row = stats.get(source_id) if isinstance(stats.get(source_id), dict) else {}
    return {
        "sourceId": source_id,
        "name": name,
        "identity": _identity_match(name, identity_candidates),
        "matchesPlayed": _integer(row.get("match")),
        "matchesWon": _integer(row.get("winMatch")),
        "legsPlayed": _integer(row.get("leg")),
        "legsWon": _integer(row.get("winLeg")),
        "winRate": _ratio(row.get("winMatch"), row.get("match"), 100),
        "average3Darts": _ratio(row.get("score"), row.get("darts"), 3),
        "first9": _ratio(row.get("f9Score"), row.get("f9Darts"), 3),
        "bestFinish": _integer(row.get("highOut")) or None,
        "scores180": _integer(row.get("ton80")),
        "scores170": _integer(row.get("ton70")),
        "scores140": _integer(row.get("ton40")),
        "scores100": _integer(row.get("ton00")),
        "bestLeg": _integer(row.get("best")) or None,
        "worstLeg": _integer(row.get("worst")) or None,
    }


def _round_robin_matches(
    payload: dict[str, Any],
    participant_names: dict[str, str],
    source_url: str,
    source_id: str,
) -> list[dict[str, Any]]:
    result_groups = payload.get("rr_result") or []
    if not isinstance(result_groups, list):
        return []
    settings = payload.get("rr_setting") or {}
    if not isinstance(settings, dict):
        settings = {}
    group_tables = payload.get("rr_table") or []
    if not isinstance(group_tables, list):
        group_tables = []
    first_to = _integer(settings.get("limit_leg_count")) or 1
    best_of = max(1, first_to * 2 - 1)
    win_points = _integer(settings.get("point_w")) or 2
    draw_points = _integer(settings.get("point_d"))
    loss_points = _integer(settings.get("point_l"))
    matches: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()
    match_number = 0
    for group_index, group in enumerate(result_groups, start=1):
        if not isinstance(group, dict):
            continue
        table_index = group_index - 1
        official_members = (
            {
                str(participant_id)
                for participant_id in group_tables[table_index]
                if participant_id is not None
            }
            if table_index < len(group_tables)
            and isinstance(group_tables[table_index], list)
            else set()
        )
        for home_id, opponent_rows in group.items():
            if not isinstance(opponent_rows, dict):
                continue
            for away_id, home_result in opponent_rows.items():
                if official_members and (
                    str(home_id) not in official_members
                    or str(away_id) not in official_members
                ):
                    continue
                pair = tuple(sorted((str(home_id), str(away_id))))
                key = (pair[0], pair[1], group_index)
                if key in seen or home_id == away_id:
                    continue
                seen.add(key)
                reverse = group.get(away_id) or {}
                away_result = reverse.get(home_id) if isinstance(reverse, dict) else {}
                if not isinstance(home_result, dict) or not isinstance(away_result, dict):
                    continue
                match_number += 1
                home_score = _integer(home_result.get("r"))
                away_score = _integer(away_result.get("r"))
                home = participant_names.get(str(home_id), str(home_id))
                away = participant_names.get(str(away_id), str(away_id))
                winner = home if home_score > away_score else away if away_score > home_score else None
                digest = hashlib.sha1(
                    f"{source_id}|rr|{group_index}|{pair[0]}|{pair[1]}".encode("utf-8")
                ).hexdigest()[:16]
                matches.append({
                    "id": digest,
                    "match_number": match_number,
                    "encounter": f"{home} vs {away}",
                    "mode": "Simple",
                    "home": home,
                    "away": away,
                    "home_score": home_score,
                    "away_score": away_score,
                    "winner": winner,
                    "legs": home_score + away_score,
                    "unresolved_legs": 0,
                    "result_complete": winner is not None,
                    "tracked_teams": [],
                    "tracked_players": [home, away],
                    "source_url": source_url,
                    "source_tournament_id": source_id,
                    "phase": "POOL",
                    "stage_code": f"rr_{group_index}",
                    "stage_index": group_index,
                    "stage_label": f"Poule {group_index}",
                    "round_robin_first_to": first_to,
                    "round_robin_best_of": best_of,
                    "round_robin_win_points": win_points,
                    "round_robin_draw_points": draw_points,
                    "round_robin_loss_points": loss_points,
                    "home_average_3_darts": _decimal(home_result.get("a")),
                    "away_average_3_darts": _decimal(away_result.get("a")),
                })
    return matches


def _knockout_stage_label(round_index: int, round_count: int) -> str:
    remaining = round_count - round_index
    labels = {
        0: "Finale",
        1: "Demi-finales",
        2: "Quarts de finale",
        3: "Huitièmes de finale",
        4: "Seizièmes de finale",
    }
    return labels.get(remaining, f"Tour à élimination {round_index}")


def _result_group_matches(
    group: Any,
    participant_names: dict[str, str],
    source_url: str,
    source_id: str,
    stage_code: str,
    stage_index: int,
    stage_label: str,
    mode: str,
) -> list[dict[str, Any]]:
    if not isinstance(group, dict):
        return []
    matches: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for home_id, opponent_rows in group.items():
        if not isinstance(opponent_rows, dict):
            continue
        for away_id, home_result in opponent_rows.items():
            home_key = str(home_id)
            away_key = str(away_id)
            pair = tuple(sorted((home_key, away_key)))
            if home_key == away_key or pair in seen:
                continue
            seen.add(pair)
            reverse = group.get(away_id) or group.get(away_key) or {}
            away_result = reverse.get(home_id) if isinstance(reverse, dict) else {}
            if not isinstance(home_result, dict) or not isinstance(away_result, dict):
                continue
            home_score = _integer(home_result.get("r"))
            away_score = _integer(away_result.get("r"))
            home = participant_names.get(home_key, home_key)
            away = participant_names.get(away_key, away_key)
            winner = (
                home if home_score > away_score
                else away if away_score > home_score
                else None
            )
            digest = hashlib.sha1(
                (
                    f"{source_id}|ko|{stage_code}|{pair[0]}|{pair[1]}"
                ).encode("utf-8")
            ).hexdigest()[:16]
            matches.append({
                "id": digest,
                "match_number": 0,
                "encounter": f"{home} vs {away}",
                "mode": mode,
                "home": home,
                "away": away,
                "home_score": home_score,
                "away_score": away_score,
                "winner": winner,
                "legs": home_score + away_score,
                "unresolved_legs": 0,
                "result_complete": winner is not None,
                "tracked_teams": [],
                "tracked_players": [home, away],
                "source_url": source_url,
                "source_tournament_id": source_id,
                "phase": "KNOCKOUT",
                "stage_code": stage_code,
                "stage_index": stage_index,
                "stage_label": stage_label,
                "home_average_3_darts": _decimal(home_result.get("a")),
                "away_average_3_darts": _decimal(away_result.get("a")),
            })
    return matches


def _knockout_matches(
    payload: dict[str, Any],
    participant_names: dict[str, str],
    source_url: str,
    source_id: str,
) -> list[dict[str, Any]]:
    result_groups = payload.get("t_result") or []
    if not isinstance(result_groups, list):
        result_groups = []
    round_count = len(result_groups)
    setting = payload.get("t_setting") or {}
    match_type = str(setting.get("match_type") or "").lower()
    mode = "Cricket" if match_type == "cricket" else "Simple"
    matches: list[dict[str, Any]] = []
    for round_index, group in enumerate(result_groups, start=1):
        label = _knockout_stage_label(round_index, round_count)
        matches.extend(_result_group_matches(
            group,
            participant_names,
            source_url,
            source_id,
            f"ko_{round_index}",
            round_index,
            label,
            mode,
        ))

    third_place_groups = payload.get("t3_result") or []
    if isinstance(third_place_groups, list):
        for group_index, group in enumerate(third_place_groups, start=1):
            matches.extend(_result_group_matches(
                group,
                participant_names,
                source_url,
                source_id,
                f"ko_third_place_{group_index}",
                round_count + group_index,
                "Petite finale",
                mode,
            ))
    return matches


def _snapshot_hash(payload: dict[str, Any]) -> str:
    material = {
        "sourceId": payload.get("sourceId"),
        "sourceUpdatedAt": payload.get("sourceUpdatedAt"),
        "participants": payload.get("participants"),
        "matches": payload.get("matches"),
    }
    encoded = json.dumps(
        material,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def analyze_direct_event(
    source_url: str,
    season: int,
    identity_candidates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    canonical_url, source_id = validate_direct_event_url(source_url)
    data_url = f"{TOURNAMENT_API}?{urlencode({'cmd': 'get_data', 'tdid': source_id})}"
    stats_url = f"{TOURNAMENT_STATS_API}?{urlencode({'cmd': 'stats_list', 'tdid': source_id})}"
    event_payload = _request_json(data_url)
    stats_payload = _request_json(stats_url, method="POST")
    if not isinstance(event_payload, dict) or event_payload.get("tdid") != source_id:
        raise NakkaDirectImportError("La réponse Nakka ne correspond pas au tournoi demandé.")
    if not isinstance(stats_payload, dict):
        stats_payload = {}

    entries = [
        item
        for item in event_payload.get("entry_list") or []
        if isinstance(item, dict) and item.get("tpid")
    ]
    names = {
        str(item.get("tpid")): str(item.get("name") or item.get("tpid"))
        for item in entries
    }
    participants = [
        _participant_stats(item, stats_payload, identity_candidates or [])
        for item in entries
    ]
    participants.sort(key=lambda item: (-item["matchesWon"], item["name"].lower()))
    pool_matches = _round_robin_matches(
        event_payload,
        names,
        canonical_url,
        source_id,
    )
    knockout_matches = _knockout_matches(
        event_payload,
        names,
        canonical_url,
        source_id,
    )
    matches = knockout_matches + pool_matches
    for match_number, match in enumerate(matches, start=1):
        match["match_number"] = match_number
    event_date, date_label = _date_payload(event_payload.get("t_date"))
    unresolved = sum(
        1 for item in participants if item["identity"]["status"] != "EXACT"
    )
    complete_matches = sum(1 for item in matches if item["result_complete"])
    blocking_reasons: list[str] = []
    if not participants:
        blocking_reasons.append("Aucun participant n’a été trouvé.")
    if not matches:
        blocking_reasons.append("Aucun résultat de rencontre n’a été trouvé.")
    if matches and complete_matches != len(matches):
        blocking_reasons.append("Certains résultats ne sont pas complets.")
    status = "BLOCKED" if blocking_reasons else "REVIEW" if unresolved else "READY"
    collected_at = datetime.now(timezone.utc).isoformat()
    preview: dict[str, Any] = {
        "collectedAt": collected_at,
        "sourceUrl": canonical_url,
        "sourceId": source_id,
        "sourceUpdatedAt": event_payload.get("updateTime"),
        "season": season,
        "title": str(event_payload.get("title") or "Tournoi Nakka").strip(),
        "date": event_date,
        "dateLabel": date_label,
        "sourceStatus": _integer(event_payload.get("status")),
        "status": status,
        "blockingReasons": blocking_reasons,
        "requiresIdentityConfirmation": unresolved > 0,
        "identitySummary": {
            "exact": len(participants) - unresolved,
            "unresolved": unresolved,
            "total": len(participants),
        },
        "summary": {
            "participants": len(participants),
            "matches": len(matches),
            "poolMatches": len(pool_matches),
            "knockoutMatches": len(knockout_matches),
            "completeMatches": complete_matches,
            "legs": sum(item["legs"] for item in matches),
            "scores180": sum(item["scores180"] for item in participants),
        },
        "participants": participants,
        "matches": matches,
        "protection": {
            "manualValidationRequired": True,
            "affectsOfficialRanking": False,
            "affectsOfficialPoints": False,
            "affectsElo": False,
            "publicationExecuted": False,
        },
    }
    preview["snapshotHash"] = _snapshot_hash(preview)
    with _STATE_LOCK:
        state = load_direct_state()
        state["lastPreview"] = preview
        _atomic_json_write(STATE_PATH, state)
    return state


def _next_tournament_code(tournaments: list[dict[str, Any]]) -> str:
    numbers = []
    for tournament in tournaments:
        match = re.fullmatch(r"T(\d+)", str(tournament.get("code") or "").upper())
        if match:
            numbers.append(int(match.group(1)))
    return f"T{max(numbers, default=0) + 1}"


def _public_player(participant: dict[str, Any]) -> dict[str, Any]:
    identity = participant.get("identity") or {}
    return {
        "name": participant.get("name"),
        "canonical_player_id": identity.get("canonicalPlayerId"),
        "nakka_participant_id": participant.get("sourceId"),
        "legs_played": participant.get("legsPlayed") or 0,
        "legs_won": participant.get("legsWon") or 0,
        "average_3_darts": participant.get("average3Darts"),
        "first_9": participant.get("first9"),
        "best_finish": participant.get("bestFinish"),
        "scores_180": participant.get("scores180") or 0,
        "scores_170": participant.get("scores170") or 0,
        "scores_140": participant.get("scores140") or 0,
        "scores_100": participant.get("scores100") or 0,
        "no_score": 0,
        "matches_played": participant.get("matchesPlayed") or 0,
        "matches_won": participant.get("matchesWon") or 0,
        "win_rate": participant.get("winRate"),
        "best_leg": participant.get("bestLeg"),
        "worst_leg": participant.get("worstLeg"),
        "teams": ["Tournoi individuel"],
        "team": "Tournoi individuel",
    }


def import_direct_event(
    snapshot_hash: str,
    confirmed: bool,
    accepted_by: str | None,
) -> dict[str, Any]:
    if not confirmed:
        raise ValueError("La confirmation administrateur est obligatoire.")
    with _exclusive_file_lock(), _STATE_LOCK:
        state = load_direct_state()
        preview = state.get("lastPreview")
        if not isinstance(preview, dict):
            raise ValueError("Analysez d’abord le lien Nakka.")
        if preview.get("snapshotHash") != snapshot_hash:
            raise ValueError("L’aperçu a changé. Relancez l’analyse avant de valider.")
        if preview.get("status") == "BLOCKED":
            raise ValueError("Cet aperçu contient une anomalie bloquante.")

        registry = load_tournament_cache(TOURNAMENT_CACHE)
        tournaments = list(registry.get("tournaments") or [])
        existing = next(
            (
                item for item in tournaments
                if item.get("source_tournament_id") == preview.get("sourceId")
            ),
            None,
        )
        code = (
            str(existing.get("code"))
            if existing
            else _next_tournament_code(tournaments)
        )
        matches = list(preview.get("matches") or [])
        pool_matches = [
            match for match in matches
            if str(match.get("phase") or "").upper() == "POOL"
        ]
        knockout_matches = [
            match for match in matches
            if str(match.get("phase") or "").upper() == "KNOCKOUT"
        ]
        pool_groups: dict[str, list[dict[str, Any]]] = {}
        for match in pool_matches:
            stage_code = str(match.get("stage_code") or "rr_1")
            pool_groups.setdefault(stage_code, []).append(match)
        pools = [
            {
                "code": stage_code,
                "name": group_matches[0].get("stage_label") or "Poule",
                "order": index,
                "matches": group_matches,
            }
            for index, (stage_code, group_matches) in enumerate(
                sorted(pool_groups.items()),
                start=1,
            )
        ]
        bracket_groups: dict[str, list[dict[str, Any]]] = {}
        for match in knockout_matches:
            stage_code = str(match.get("stage_code") or "ko_1")
            bracket_groups.setdefault(stage_code, []).append(match)
        bracket = [
            {
                "code": stage_code,
                "name": group_matches[0].get("stage_label") or "Tableau final",
                "order": _integer(group_matches[0].get("stage_index")) or index,
                "matches": group_matches,
            }
            for index, (stage_code, group_matches) in enumerate(
                sorted(
                    bracket_groups.items(),
                    key=lambda item: (
                        _integer(item[1][0].get("stage_index")),
                        item[0],
                    ),
                ),
                start=1,
            )
        ]
        imported_at = datetime.now(timezone.utc).isoformat()
        players = [_public_player(item) for item in preview.get("participants") or []]
        tournament = {
            "code": code,
            "source_tournament_id": preview.get("sourceId"),
            "source_type": "NAKKA_DIRECT",
            "source_url": preview.get("sourceUrl"),
            "imported_at": (
                existing.get("imported_at") if existing else imported_at
            ),
            "refreshed_at": imported_at,
            "imported_by": (
                existing.get("imported_by") if existing else accepted_by
            ),
            "name": preview.get("dateLabel") or preview.get("title"),
            "date": preview.get("date"),
            "date_label": preview.get("dateLabel"),
            "event_name": preview.get("title"),
            "season": str(preview.get("season")),
            "status": "AVAILABLE",
            "official_separation": True,
            "affects_official_ranking": False,
            "affects_official_points": False,
            "affects_elo": False,
            "summary": {
                "source_rows": len(matches),
                "matches": len(matches),
                "legs": sum(_integer(item.get("legs")) for item in matches),
                "pool_matches": len(pool_matches),
                "knockout_matches": len(knockout_matches),
                "tracked_players": len(players),
                "tracked_duos": 0,
                "complete_results": sum(
                    1 for item in matches if item.get("result_complete")
                ),
            },
            "matches": matches,
            "pools": pools,
            "bracket": bracket,
            "players": players,
            "duos": [],
            "data_quality_notes": [
                "Import direct validé manuellement depuis la page officielle Nakka.",
                "Les identités non reconnues restent propres à ce tournoi amical.",
                "Ce tournoi est exclu des points, du classement et de l’ELO officiels.",
            ],
        }
        if existing:
            tournaments = [
                tournament if item is existing else item
                for item in tournaments
            ]
        else:
            tournaments.append(tournament)
        registry.update({
            "contract_version": "16.0.3",
            "generated_at": imported_at,
            "tournaments": tournaments,
        })
        _atomic_json_write(TOURNAMENT_CACHE, registry)

        history = list(state.get("imports") or [])
        history.append({
            "importedAt": imported_at,
            "importedBy": accepted_by,
            "sourceId": preview.get("sourceId"),
            "title": preview.get("title"),
            "tournamentCode": code,
            "snapshotHash": snapshot_hash,
        })
        state["imports"] = history[-20:]
        state["lastPreview"] = {
            **preview,
            "imported": True,
            "importedAt": imported_at,
            "importedTournamentCode": code,
        }
        _atomic_json_write(STATE_PATH, state)
        return state
