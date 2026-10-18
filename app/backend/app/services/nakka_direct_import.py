from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
try:
    import fcntl
except ImportError:  # Development on Windows; production uses flock on Linux.
    fcntl = None
    import msvcrt
import hashlib
import json
import math
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
TOURNAMENT_EDITORIALS: dict[str, dict[str, Any]] = {
    "t_M317_6772": {
        "format": "DOUBLE_ELIMINATION",
        "format_label": "Double élimination",
        "winner": "Corentin",
        "runner_up": "Alex",
        "display_aliases": {"Coco": "Corentin"},
        "editorial_summary": (
            "Alex a traversé le Winner Bracket sans défaite et a envoyé "
            "Corentin dans le Loser Bracket lors de leur premier duel. "
            "Corentin a ensuite remonté tout le tableau pour retrouver Alex "
            "en Grand Final. Il s’est imposé 3–1 une première fois pour "
            "provoquer le reset, puis de nouveau 3–1 dans le match décisif "
            "pour remporter la Papangue Dart Cup nº1."
        ),
    },
    "t_aKyY_3246": {
        "format": "POOLS_AND_KNOCKOUT",
        "format_label": "Poules · Tableau principal · Consolante",
        "winner": "Manu (KAD)",
        "runner_up": "Dudul (KAD)",
        "editorial_summary": (
            "Après huit poules de qualification, Manu a remporté le tableau "
            "principal au terme d’une finale très serrée face à Dudul (4–3). "
            "Dans la consolante, Antoine s’est imposé face à "
            "Ambroise (3–1)."
        ),
    },
}
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
    except (TypeError, ValueError, OverflowError):
        return 0


def _optional_integer(value: Any) -> int | None:
    parsed = _decimal(value)
    return int(parsed) if parsed is not None and parsed >= 0 else None


def _decimal(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed or parsed in (float("inf"), float("-inf")):
        return None
    return round(parsed, 2)


def _ratio(numerator: Any, denominator: Any, multiplier: float = 1.0) -> float | None:
    top = _decimal(numerator)
    bottom = _decimal(denominator)
    if top is None or bottom is None or bottom <= 0:
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
        if fcntl is not None:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        else:
            lock_file.seek(0)
            if not lock_file.read(1):
                lock_file.write("0")
                lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            else:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)


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
    # Repeated validated aliases for the same identity are not an ambiguity.
    matches_by_id = {
        str(candidate.get("id")): candidate
        for candidate in candidates
        if candidate.get("id") and normalized
        and _normalize_name(candidate.get("name")) == normalized
    }
    matches = list(matches_by_id.values())
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
    # Nakka schedules Réunion tournaments around local midnight. UTC would
    # incorrectly show the previous date for an event starting before 04:00.
    moment = datetime.fromtimestamp(value, tz=timezone(timedelta(hours=4)))
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
        "matchesPlayed": _optional_integer(row.get("match")),
        "matchesWon": _optional_integer(row.get("winMatch")),
        "legsPlayed": _optional_integer(row.get("leg")),
        "legsWon": _optional_integer(row.get("winLeg")),
        "winRate": _ratio(row.get("winMatch"), row.get("match"), 100),
        "average3Darts": _ratio(row.get("score"), row.get("darts"), 3),
        "first9": _ratio(row.get("f9Score"), row.get("f9Darts"), 3),
        "bestFinish": _integer(row.get("highOut")) or None,
        "scores180": _optional_integer(row.get("ton80")),
        "scores170": _optional_integer(row.get("ton70")),
        "scores140": _optional_integer(row.get("ton40")),
        "scores120": _optional_integer(row.get("ton20")),
        "scores100": _optional_integer(row.get("ton00")),
        "bestLeg": _integer(row.get("best")) or None,
        "worstLeg": _integer(row.get("worst")) or None,
        "statisticsAvailable": bool(row),
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
    matches: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()
    match_number = 0
    for group_index, group in enumerate(result_groups, start=1):
        if not isinstance(group, dict):
            continue
        table_index = group_index - 1
        group_settings = _setting_for_key(settings, table_index)
        first_to = _integer(group_settings.get("limit_leg_count")) or 1
        best_of = max(1, first_to * 2 - 1)
        win_points = _integer(group_settings["point_w"]) if group_settings.get("point_w") is not None else 2
        draw_points = _integer(group_settings.get("point_d"))
        loss_points = _integer(group_settings.get("point_l"))
        include_leg_points = _integer(group_settings.get("include_leg")) == 1
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
                away_result = reverse.get(home_id, {}) if isinstance(reverse, dict) else {}
                home_result = {"r": home_result} if isinstance(home_result, (int, float)) else home_result
                away_result = {"r": away_result} if isinstance(away_result, (int, float)) else away_result
                if not isinstance(home_result, dict) or not isinstance(away_result, dict):
                    continue
                match_number += 1
                home_score = _optional_integer(home_result.get("r"))
                away_score = _optional_integer(away_result.get("r"))
                home = participant_names.get(str(home_id), str(home_id))
                away = participant_names.get(str(away_id), str(away_id))
                scored = home_score is not None and away_score is not None
                winner = (home if home_score > away_score else away if away_score > home_score else None) if scored else None
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
                    "home_source_id": str(home_id),
                    "away_source_id": str(away_id),
                    "home_score": home_score,
                    "away_score": away_score,
                    "winner": winner,
                    "legs": (home_score or 0) + (away_score or 0),
                    "unresolved_legs": 0,
                    "result_complete": bool(scored and ((home_score or 0) + (away_score or 0)) > 0 and (max(home_score or 0, away_score or 0) >= first_to or (_integer(group_settings.get("drawMode")) > 0 and home_score == away_score == first_to - 1))),
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
                    "round_robin_include_leg_points": include_leg_points,
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


def _stage_setting(setting: dict[str, Any], round_index: int, round_count: int) -> dict[str, Any]:
    key = -1 if round_index == round_count else -2 if round_index == round_count - 1 else round_index
    return _setting_for_key(setting, key)


def _setting_for_key(setting: dict[str, Any], key: int) -> dict[str, Any]:
    override = next((row for row in setting.get("game_setting") or [] if isinstance(row, dict) and row.get("round") == key), {})
    return {**setting, **override}


def _result_group_matches(
    group: Any,
    participant_names: dict[str, str],
    source_url: str,
    source_id: str,
    stage_code: str,
    stage_index: int,
    stage_label: str,
    mode: str,
    setting: dict[str, Any] | None = None,
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
            away_result = reverse.get(home_id, {}) if isinstance(reverse, dict) else {}
            home_result = {"r": home_result} if isinstance(home_result, (int, float)) else home_result
            away_result = {"r": away_result} if isinstance(away_result, (int, float)) else away_result
            if not isinstance(home_result, dict) or not isinstance(away_result, dict):
                continue
            home_score = _optional_integer(home_result.get("r"))
            away_score = _optional_integer(away_result.get("r"))
            home = participant_names.get(home_key, home_key)
            away = participant_names.get(away_key, away_key)
            scored = home_score is not None and away_score is not None
            winner = (
                home if home_score > away_score
                else away if away_score > home_score
                else None
            ) if scored else None
            digest = hashlib.sha1(
                (
                    f"{source_id}|ko|{stage_code}|{pair[0]}|{pair[1]}"
                ).encode("utf-8")
            ).hexdigest()[:16]
            limit = _integer((setting or {}).get("limit"))
            target = _integer((setting or {}).get("limit_set_count" if limit == 2 else "limit_leg_count"))
            complete = winner is not None and (not target or max(home_score or 0, away_score or 0) >= target)
            matches.append({
                "id": digest,
                "match_number": 0,
                "encounter": f"{home} vs {away}",
                "mode": mode,
                "home": home,
                "away": away,
                "home_source_id": home_key,
                "away_source_id": away_key,
                "home_score": home_score,
                "away_score": away_score,
                "winner": winner,
                "legs": (home_score or 0) + (away_score or 0),
                "unresolved_legs": 0,
                "result_complete": complete,
                "tracked_teams": [],
                "tracked_players": [home, away],
                "source_url": source_url,
                "source_tournament_id": source_id,
                "phase": "KNOCKOUT",
                "stage_code": stage_code,
                "stage_index": stage_index,
                "stage_label": stage_label,
                "bracket_kind": (
                    "GRAND_FINAL" if stage_code.startswith("grand_final_")
                    else "WINNER" if stage_code.startswith("winner_")
                    else "LOSER" if stage_code.startswith("loser_")
                    else "SECONDARY" if stage_code.startswith("secondary_")
                    else "THIRD_PLACE" if stage_code.startswith("ko_third_place_")
                    else "PRIMARY"
                ),
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
    setting = payload.get("t_setting") or {}
    if not isinstance(setting, dict):
        setting = {}
    player_count = _integer(setting.get("t_player_count"))
    round_count = round(math.log2(player_count)) if player_count > 1 else max(len(result_groups), len(payload.get("t_table") or []) - 1)
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
            _stage_setting(setting, round_index, round_count),
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
                {**setting, **next((row for row in setting.get("game_setting") or [] if row.get("round") == -3), {})},
            ))
    return matches


def _secondary_knockout_matches(
    payload: dict[str, Any],
    participant_names: dict[str, str],
    source_url: str,
    source_id: str,
) -> list[dict[str, Any]]:
    """Read N01's independent secondary draw, never as double elimination."""

    result_groups = payload.get("s2_result") or []
    if not isinstance(result_groups, list):
        return []
    setting = payload.get("s2_setting") or {}
    if not isinstance(setting, dict):
        setting = {}
    mode = (
        "Cricket"
        if str(setting.get("match_type") or "").lower() == "cricket"
        else "Simple"
    )
    player_count = _integer(setting.get("t_player_count"))
    round_count = round(math.log2(player_count)) if player_count > 1 else max(len(result_groups), len(payload.get("s2_table") or []) - 1)
    matches: list[dict[str, Any]] = []
    for round_index, group in enumerate(result_groups, start=1):
        round_label = _knockout_stage_label(round_index, round_count)
        matches.extend(_result_group_matches(
            group,
            participant_names,
            source_url,
            source_id,
            f"secondary_{round_index}",
            100 + round_index,
            f"Consolante · {round_label}",
            mode,
            _stage_setting(setting, round_index, round_count),
        ))
    return matches


def _double_elimination_matches(
    payload: dict[str, Any],
    participant_names: dict[str, str],
    source_url: str,
    source_id: str,
) -> list[dict[str, Any]]:
    """Read N01's Winner/Loser bracket payload, including a final reset."""
    winner_groups = payload.get("dw_result") or []
    loser_groups = payload.get("dl_result") or []
    if not isinstance(winner_groups, list) or not isinstance(loser_groups, list):
        return []
    if not winner_groups and not loser_groups:
        return []

    setting = payload.get("d_setting") or {}
    if not isinstance(setting, dict):
        setting = {}
    mode = (
        "Cricket"
        if str(setting.get("match_type") or "").lower() == "cricket"
        else "Simple"
    )
    completed_winner_groups = [
        group
        for group in winner_groups
        if isinstance(group, dict) and group
    ]
    completed_loser_groups = [
        group
        for group in loser_groups
        if isinstance(group, dict) and group
    ]
    # Keep source round positions, including unplayed rounds. A reset being
    # enabled is not evidence that a reset was actually played.
    player_count = _integer(setting.get("t_player_count"))
    winner_table = payload.get("dw_table") or []
    if not player_count and isinstance(winner_table, list) and winner_table and isinstance(winner_table[0], list):
        player_count = len(winner_table[0])
    source_winner_rounds = round(math.log2(player_count)) if player_count > 1 else 0
    if source_winner_rounds:
        winner_bracket_count = source_winner_rounds
    else:
        def pairs(group):
            return {
                tuple(sorted((str(home), str(away))))
                for home, opponents in group.items() if isinstance(opponents, dict)
                for away in opponents if str(home) != str(away)
            }
        repeated_final = (
            len(completed_winner_groups) >= 3
            and len(pairs(completed_winner_groups[-1])) == 1
            and pairs(completed_winner_groups[-1]) == pairs(completed_winner_groups[-2])
            and _integer(setting.get("no_reset")) == 0
        )
        final_count = (2 if repeated_final else 1) if completed_loser_groups else 0
        winner_bracket_count = max(0, len(completed_winner_groups) - final_count)
    matches: list[dict[str, Any]] = []

    winner_labels = {
        0: "Finale",
        1: "Demi-finales",
        2: "Quarts de finale",
        3: "Huitièmes de finale",
    }
    for index, group in enumerate(
        winner_groups[:winner_bracket_count],
        start=1,
    ):
        distance = winner_bracket_count - index
        label = f"Winner Bracket · {winner_labels.get(distance, f'Tour {index}')}"
        matches.extend(
            _result_group_matches(
                group,
                participant_names,
                source_url,
                source_id,
                f"winner_{index}",
                index,
                label,
                mode,
                _setting_for_key(setting, -3 if index == winner_bracket_count else -4 if index == winner_bracket_count - 1 else index),
            )
        )

    loser_round_count = 2 * (source_winner_rounds - 1) if source_winner_rounds > 1 else len(loser_groups)
    for index, group in enumerate(loser_groups, start=1):
        suffix = "Finale" if index == loser_round_count else f"Tour {index}"
        matches.extend(
            _result_group_matches(
                group,
                participant_names,
                source_url,
                source_id,
                f"loser_{index}",
                100 + index,
                f"Loser Bracket · {suffix}",
                mode,
                _setting_for_key(setting, -5 if index == loser_round_count else -6 if index == loser_round_count - 1 else -10 - index),
            )
        )

    finals = winner_groups[winner_bracket_count:]
    for index, group in enumerate(finals, start=1):
        label = "Grand Final" if index == 1 else "Grand Final Reset"
        matches.extend(
            _result_group_matches(
                group,
                participant_names,
                source_url,
                source_id,
                f"grand_final_{index}",
                200 + index,
                label,
                mode,
                _setting_for_key(setting, -2 if index == 1 else -1),
            )
        )
    winner_final = [match for match in matches if match.get("stage_code") == f"winner_{winner_bracket_count}" and match.get("result_complete")]
    winner_champion = winner_final[0].get("winner") if len(winner_final) == 1 else None
    for match in matches:
        if str(match.get("stage_code") or "").startswith("grand_final_"):
            match["is_decisive"] = bool(match.get("stage_code") == "grand_final_2" or _integer(setting.get("no_reset")) == 1 or (winner_champion and match.get("winner") == winner_champion))
    return matches


def _snapshot_hash(payload: dict[str, Any]) -> str:
    material = {
        "sourceId": payload.get("sourceId"),
        "sourceUpdatedAt": payload.get("sourceUpdatedAt"),
        "title": payload.get("title"),
        "date": payload.get("date"),
        "sourceStatus": payload.get("sourceStatus"),
        "participants": payload.get("participants"),
        "matches": payload.get("matches"),
        "format": payload.get("format"),
        "discipline": payload.get("discipline"),
        "poolSettings": payload.get("poolSettings"),
        "poolParticipants": payload.get("poolParticipants"),
        "sourcePoolStandings": payload.get("sourcePoolStandings"),
        "poolQualifiers": payload.get("poolQualifiers"),
    }
    encoded = json.dumps(
        material,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def normalize_direct_event(
    event_payload: dict[str, Any],
    stats_payload: dict[str, Any],
    source_url: str,
    season: int,
    identity_candidates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Normalize a saved or freshly collected source without I/O or publication."""
    canonical_url, source_id = validate_direct_event_url(source_url)
    if not isinstance(event_payload, dict) or event_payload.get("tdid") != source_id:
        raise NakkaDirectImportError("La réponse Nakka ne correspond pas au tournoi demandé.")
    if not isinstance(stats_payload, dict):
        stats_payload = {}

    entries = [
        item
        for item in event_payload.get("entry_list") or []
        if isinstance(item, dict) and item.get("tpid")
    ]
    if len(entries) > 256:
        raise NakkaDirectImportError("La compétition dépasse la limite de 256 participants ou duos.")
    names = {
        str(item.get("tpid")): str(item.get("name") or item.get("tpid"))
        for item in entries
    }
    participants = [
        _participant_stats(item, stats_payload, identity_candidates or [])
        for item in entries
    ]
    linked_ids: dict[str, list[dict[str, Any]]] = {}
    for participant in participants:
        canonical_id = participant["identity"].get("canonicalPlayerId")
        if canonical_id:
            linked_ids.setdefault(canonical_id, []).append(participant)
    for same_identity in linked_ids.values():
        if len(same_identity) > 1:
            for participant in same_identity:
                participant["identity"] = {"status": "AMBIGUOUS", "canonicalPlayerId": None, "canonicalName": None, "confidence": 0}
    participants.sort(key=lambda item: (-_integer(item["matchesWon"]), item["name"].lower()))
    pool_matches = _round_robin_matches(
        event_payload,
        names,
        canonical_url,
        source_id,
    )
    double_elimination_matches = _double_elimination_matches(
        event_payload, names, canonical_url, source_id
    )
    if double_elimination_matches:
        knockout_matches = double_elimination_matches
    else:
        knockout_matches = _knockout_matches(
            event_payload, names, canonical_url, source_id
        ) + _secondary_knockout_matches(
            event_payload, names, canonical_url, source_id
        )
    matches = knockout_matches + pool_matches
    if len(matches) > 4096:
        raise NakkaDirectImportError("La compétition dépasse la limite de rencontres.")
    # Nakka result dictionaries follow completion order. Its source tables
    # carry the actual bracket slots needed to align successive rounds.
    for match in knockout_matches:
        code = str(match.get("stage_code") or "")
        table_key, table_index = "", 0
        for prefix, key in (("ko_", "t_table"), ("secondary_", "s2_table"), ("winner_", "dw_table"), ("loser_", "dl_table")):
            if code.startswith(prefix) and code[len(prefix):].isdigit():
                table_key, table_index = key, int(code[len(prefix):]) - 1
        if code.startswith("grand_final_"):
            count = _integer((event_payload.get("d_setting") or {}).get("t_player_count"))
            if count > 1:
                table_key, table_index = "dw_table", round(math.log2(count)) + _integer(code.rsplit("_", 1)[-1]) - 1
        table = event_payload.get(table_key) or []
        slots = table[table_index] if isinstance(table, list) and table_index < len(table) and isinstance(table[table_index], list) else []
        positions = {str(member): index for index, member in enumerate(slots) if str(member) in names}
        home_position, away_position = positions.get(match["home_source_id"]), positions.get(match["away_source_id"])
        if home_position is not None and away_position is not None:
            match["bracket_position"] = min(home_position, away_position) // 2
            if home_position > away_position:
                for home_key, away_key in (("home", "away"), ("home_source_id", "away_source_id"), ("home_score", "away_score"), ("home_average_3_darts", "away_average_3_darts")):
                    match[home_key], match[away_key] = match.get(away_key), match.get(home_key)
                match["encounter"] = f"{match['home']} vs {match['away']}"
                match["tracked_players"] = [match["home"], match["away"]]
    matches.sort(key=lambda match: (0 if match.get("phase") == "KNOCKOUT" else 1, _integer(match.get("stage_index")), _integer(match.get("bracket_position"))))
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
    if len({item["sourceId"] for item in participants}) != len(participants):
        blocking_reasons.append("Plusieurs participants partagent le même identifiant Nakka.")
    if len({item["name"].casefold() for item in participants}) != len(participants):
        blocking_reasons.append("Plusieurs participants portent le même nom : les résultats doivent être vérifiés par identifiant Nakka.")
    if not matches:
        blocking_reasons.append("Aucun résultat de rencontre n’a été trouvé.")
    if matches and complete_matches != len(matches):
        blocking_reasons.append("Certains résultats ne sont pas complets.")
    if any(match.get(side) not in names for match in matches for side in ("home_source_id", "away_source_id")):
        blocking_reasons.append("Certains résultats référencent un participant absent de la liste Nakka.")
    expected_pool_matches = sum(
        len(members) * (len(members) - 1) // 2
        for group in event_payload.get("rr_table") or [] if isinstance(group, list)
        for members in [[member for member in group if str(member) in names]]
    )
    if expected_pool_matches > sum(bool(match.get("result_complete")) for match in pool_matches):
        blocking_reasons.append("La phase de poules est incomplète dans la source Nakka.")
    for table_key, stage_prefix in (("t_table", "ko_"), ("s2_table", "secondary_"), ("dw_table", "winner_"), ("dl_table", "loser_")):
        table = event_payload.get(table_key) or []
        if not isinstance(table, list):
            continue
        for round_index, slots in enumerate(table, start=1):
            if not isinstance(slots, list):
                continue
            for offset in range(0, len(slots) - 1, 2):
                pair = {str(slots[offset]), str(slots[offset + 1])}
                if len(pair) != 2 or not pair.issubset(names):
                    continue
                stage_code = f"{stage_prefix}{round_index}"
                if table_key == "dw_table":
                    count = _integer((event_payload.get("d_setting") or {}).get("t_player_count"))
                    wb_rounds = round(math.log2(count)) if count > 1 else 0
                    if wb_rounds and round_index > wb_rounds:
                        stage_code = f"grand_final_{round_index - wb_rounds}"
                        if stage_code == "grand_final_2" and any(match.get("stage_code") == "grand_final_1" and match.get("is_decisive") and match.get("result_complete") for match in knockout_matches):
                            continue
                found = any(match.get("stage_code") == stage_code and {match.get("home_source_id"), match.get("away_source_id")} == pair and match.get("result_complete") for match in knockout_matches)
                if not found:
                    blocking_reasons.append("Le tableau éliminatoire contient une rencontre sans résultat confirmé.")
                    break
    blocking_reasons = list(dict.fromkeys(blocking_reasons))
    status = "BLOCKED" if blocking_reasons else "REVIEW" if unresolved else "READY"
    collected_at = datetime.now(timezone.utc).isoformat()
    pool_settings = dict(event_payload.get("rr_setting")) if isinstance(event_payload.get("rr_setting"), dict) else {}
    pool_settings.update(
        ranking_strategy="NAKKA_V2",
        norank_wl=bool(event_payload.get("norank_wl")),
        norank_diff=bool(event_payload.get("norank_diff")),
        unsupported_ranking_data=bool(event_payload.get("leg_list") or event_payload.get("rr_pts") or event_payload.get("sch_pt")),
    )
    pool_participants = {
        f"rr_{index}": [names[str(member)] for member in members if str(member) in names]
        for index, members in enumerate(event_payload.get("rr_table") or [], start=1)
        if isinstance(members, list)
    }
    raw_ranks = event_payload.get("rr_rank") or []
    source_pool_standings = {
        f"rr_{index}": [{"name": names[str(member)], "rank": _integer(rank)} for member, rank in rows.items() if str(member) in names and _integer(rank) > 0]
        for index, rows in enumerate(raw_ranks, start=1)
        if isinstance(rows, dict)
    } if isinstance(raw_ranks, list) else {}
    primary_table = event_payload.get("t_table") or []
    qualified_names = {names[str(member)] for member in primary_table[0] if str(member) in names} if primary_table and isinstance(primary_table[0], list) else set()
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
        "format": (
            "POOLS_AND_DOUBLE_ELIMINATION"
            if double_elimination_matches and pool_matches
            else "DOUBLE_ELIMINATION"
            if double_elimination_matches
            else "POOLS_AND_KNOCKOUT"
            if pool_matches and knockout_matches
            else "POOLS"
            if pool_matches
            else "SINGLE_ELIMINATION"
        ),
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
            "scores180": sum(_integer(item["scores180"]) for item in participants) if any(item["scores180"] is not None for item in participants) else None,
        },
        "participants": participants,
        "matches": matches,
        "discipline": "DOUBLE" if any(
            _integer(setting.get("num_part")) == 4
            for setting in [event_payload, *entries, *[event_payload.get(key) or {} for key in ("rr_setting", "t_setting", "s2_setting", "d_setting")]]
            if isinstance(setting, dict)
        ) else "SINGLE",
        "poolParticipants": pool_participants,
        "sourcePoolStandings": source_pool_standings,
        "poolQualifiers": {code: [name for name in members if name in qualified_names] for code, members in pool_participants.items()} if qualified_names else {},
        "poolSettings": pool_settings,
        "hasSecondaryBracket": any(match.get("bracket_kind") == "SECONDARY" for match in matches),
        "hasDoubleElimination": bool(event_payload.get("dw_result") or event_payload.get("dl_result")),
        "protection": {
            "manualValidationRequired": True,
            "affectsOfficialRanking": False,
            "affectsOfficialPoints": False,
            "affectsElo": False,
            "publicationExecuted": False,
        },
    }
    preview["snapshotHash"] = _snapshot_hash(preview)
    return preview


def analyze_direct_event(
    source_url: str,
    season: int,
    identity_candidates: list[dict[str, Any]] | None = None,
    *, persist: bool = True, request_json=None,
) -> dict[str, Any]:
    canonical_url, source_id = validate_direct_event_url(source_url)
    data_url = f"{TOURNAMENT_API}?{urlencode({'cmd': 'get_data', 'tdid': source_id})}"
    stats_url = f"{TOURNAMENT_STATS_API}?{urlencode({'cmd': 'stats_list', 'tdid': source_id})}"
    fetch_json = request_json or _request_json
    preview = normalize_direct_event(
        fetch_json(data_url), fetch_json(stats_url, method="POST"),
        canonical_url, season, identity_candidates,
    )
    if not persist:
        return preview
    # Historical copy can enrich prose, but source-derived format and placings
    # always remain authoritative for newly analyzed tournaments.
    editorial = TOURNAMENT_EDITORIALS.get(source_id, {})
    preview.update({key: editorial[key] for key in ("display_aliases", "editorial_summary") if key in editorial})
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


def import_direct_event(
    snapshot_hash: str,
    confirmed: bool,
    accepted_by: str | None,
    *, publish=None,
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
                and (item.get("discipline") or "SINGLE") == (preview.get("discipline") or "SINGLE")
            ),
            None,
        )
        code = (
            str(existing.get("code"))
            if existing
            else _next_tournament_code(tournaments)
        )
        from app.services.tournament_engine import build_tournament_payload

        imported_at = datetime.now(timezone.utc).isoformat()
        tournament = build_tournament_payload(preview, code=code, existing=existing)
        tournament["imported_by"] = existing.get("imported_by") if existing else accepted_by
        # The route may reserve/persist the public projection before the local
        # cache is changed. A rejected official-source association leaves both
        # local files untouched.
        if publish is not None:
            publish(preview, tournament)
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
