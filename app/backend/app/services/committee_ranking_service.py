from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
import unicodedata

from supabase import Client

from app.services.competition_hub_service import CompetitionHubService


EVENTS = {
    "club-open-kaz-2026-09-13": {
        "tournament_code": "T5",
        "season_key": "2026-2027",
        "title": "Open de club · Kaz A Darts 974",
        "event_date": "2026-09-13",
        "ranking_category": "E",
        "ranking_kind": "CLUB_SINGLE",
        "source_url": "https://n01darts.com/n01/tournament/comp.php?id=t_aKyY_3246",
    }
}

POINTS = {
    "WINNER": 10,
    "RUNNER_UP": 8,
    "SEMI_FINALIST": 6,
    "QUARTER_FINALIST": 4,
    "ROUND_OF_16": 2,
}

PLACEMENT_LABELS = {
    "WINNER": "Vainqueur",
    "RUNNER_UP": "Finaliste",
    "SEMI_FINALIST": "½ finaliste",
    "QUARTER_FINALIST": "¼ finaliste",
    "ROUND_OF_16": "⅛ finaliste",
}

CLUBS = {
    "Kaz A Darts 974",
    "Papangue Darts Club",
    "3B Darts Club",
    "Tampon Darts Club",
    "Non licencié",
}

SEASON_KEY = "2026-2027"


def _points_for(placement: str, club: str) -> int:
    if club == "Non licencié":
        return 0
    return POINTS[placement]


def _rank_players(
    players: dict[str, dict[str, Any]],
    gender: str | None,
) -> list[dict[str, Any]]:
    """Build an independent ranking so category ranks never overwrite mixed ranks."""
    selected = [
        {
            **item,
            "event_points": dict(item.get("event_points") or {}),
        }
        for item in players.values()
        if gender is None or item.get("gender") == gender
    ]
    selected.sort(
        key=lambda item: (
            -int(item["total"]),
            str(item["player_name"]).casefold(),
        )
    )
    last_total = None
    rank_value = 0
    for index, item in enumerate(selected, start=1):
        if item["total"] != last_total:
            rank_value = index
            last_total = item["total"]
        item["rank"] = rank_value
    return selected


def _rows(response: Any) -> list[dict[str, Any]]:
    return list(getattr(response, "data", None) or [])


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return -1


def _placement(index: int) -> str | None:
    if index == 0:
        return "WINNER"
    if index == 1:
        return "RUNNER_UP"
    if index <= 3:
        return "SEMI_FINALIST"
    if index <= 7:
        return "QUARTER_FINALIST"
    if index <= 15:
        return "ROUND_OF_16"
    return None


def _display_name(tournament: dict[str, Any], name: str) -> str:
    return str((tournament.get("display_aliases") or {}).get(name) or name).strip()


def _normalized_name(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", (value or "").strip().lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return "".join(char for char in text if char.isalnum())


def _licensed_identity_map(
    db: Client,
    player_names: list[str],
) -> dict[str, dict[str, str]]:
    normalized_names = sorted({_normalized_name(name) for name in player_names if name})
    if not normalized_names:
        return {}

    aliases = _rows(
        db.table("player_aliases")
        .select("identity_id,normalized_alias")
        .in_("normalized_alias", normalized_names)
        .eq("confirmed", True)
        .execute()
    )
    identity_ids = sorted({str(row["identity_id"]) for row in aliases if row.get("identity_id")})
    if not identity_ids:
        return {}

    licensed = _rows(
        db.table("committee_licensed_players")
        .select("identity_id,official_display_name,club_code")
        .eq("season_key", SEASON_KEY)
        .eq("license_status", "ACTIVE")
        .in_("identity_id", identity_ids)
        .execute()
    )
    club_codes = sorted({str(row["club_code"]) for row in licensed if row.get("club_code")})
    clubs = {}
    if club_codes:
        clubs = {
            str(row["code"]): str(row["name"])
            for row in _rows(
                db.table("committee_clubs")
                .select("code,name")
                .in_("code", club_codes)
                .execute()
            )
        }

    official_by_identity = {
        str(row["identity_id"]): {
            "identity_id": str(row["identity_id"]),
            "official_display_name": str(row["official_display_name"]),
            "club": clubs.get(str(row.get("club_code")), ""),
        }
        for row in licensed
        if row.get("identity_id")
    }
    resolved: dict[str, dict[str, str]] = {}
    ambiguous: set[str] = set()
    for alias in aliases:
        key = str(alias.get("normalized_alias") or "")
        official = official_by_identity.get(str(alias.get("identity_id") or ""))
        if not key or not official:
            continue
        if key in resolved and resolved[key]["identity_id"] != official["identity_id"]:
            ambiguous.add(key)
            continue
        resolved[key] = official
    for key in ambiguous:
        resolved.pop(key, None)
    return resolved


def licensed_players(db: Client) -> dict[str, Any]:
    clubs = {
        str(row["code"]): str(row["name"])
        for row in _rows(
            db.table("committee_clubs").select("code,name").order("name").execute()
        )
    }
    rows = _rows(
        db.table("committee_licensed_players")
        .select(
            "identity_id,official_last_name,official_first_name,"
            "official_display_name,club_code,license_status,source_label,verified_at"
        )
        .eq("season_key", SEASON_KEY)
        .eq("license_status", "ACTIVE")
        .order("official_last_name")
        .order("official_first_name")
        .execute()
    )
    players = [
        {**row, "club": clubs.get(str(row.get("club_code")), "—")}
        for row in rows
    ]
    return {
        "season": SEASON_KEY,
        "count": len(players),
        "players": players,
    }


def build_event_preview(event_id: str, db: Client | None = None) -> dict[str, Any]:
    event = EVENTS.get(event_id)
    if not event:
        raise ValueError("Compétition de classement inconnue.")

    tournament = CompetitionHubService.tournament(event["tournament_code"])
    if not tournament or tournament.get("status") != "AVAILABLE":
        raise ValueError("Les résultats T5 ne sont pas disponibles.")

    def is_winner_bracket(match: dict[str, Any]) -> bool:
        stage_code = str(match.get("stage_code") or "")
        return stage_code.startswith("ko_") and stage_code.removeprefix("ko_").isdigit()

    winner_bracket = [
        match
        for match in tournament.get("matches") or []
        if (
            match.get("phase") == "KNOCKOUT"
            and is_winner_bracket(match)
            and match.get("winner")
        )
    ]
    if not winner_bracket:
        raise ValueError("Aucun résultat de Winner Bracket exploitable dans T5.")

    losses: dict[str, float] = {}
    raw_names: dict[str, str] = {}
    # Le cache T5 code la Winner Bracket ko_1, ko_2, etc. et la Loser
    # Bracket loser_1, loser_2, etc. N01 numérote les tours avec stage_index.
    # Le champ
    # match_number vaut parfois 0 pour tous les matchs importés et ne peut donc
    # pas, à lui seul, identifier la finale.
    def round_order(match: dict[str, Any]) -> tuple[float, float]:
        return (
            _number(match.get("stage_index")),
            _number(match.get("match_number")),
        )

    final_match = max(winner_bracket, key=round_order)
    winner = str(final_match.get("winner") or "").strip()

    for match in winner_bracket:
        home = str(match.get("home") or "").strip()
        away = str(match.get("away") or "").strip()
        match_winner = str(match.get("winner") or "").strip()
        loser = away if match_winner == home else home if match_winner == away else ""
        if not loser:
            continue
        display = _display_name(tournament, loser)
        key = unicodedata.normalize("NFKC", display).casefold()
        raw_names[key] = display
        losses[key] = max(losses.get(key, -1), _number(match.get("stage_index")))

    ordered = [_display_name(tournament, winner)]
    winner_key = unicodedata.normalize("NFKC", ordered[0]).casefold()
    ordered.extend(
        raw_names[key]
        for key, _ in sorted(losses.items(), key=lambda item: (-item[1], item[0]))
        if key != winner_key
    )

    results = []
    seen: set[str] = set()
    for name in ordered:
        key = unicodedata.normalize("NFKC", name).casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        placement = _placement(len(results))
        if not placement:
            break
        results.append({
            "player_name": name,
            "club": "",
            "gender": "X",
            "placement": placement,
            "placement_label": PLACEMENT_LABELS[placement],
            "points": POINTS[placement],
            "display_order": len(results) + 1,
        })

    status = "DRAFT"
    validated_at = None
    published_at = None
    if db is not None:
        try:
            existing = _rows(
                db.table("committee_ranking_events")
                .select("status,validated_at,published_at")
                .eq("id", event_id)
                .limit(1)
                .execute()
            )
        except Exception:
            # La prévisualisation reste disponible avant l'application de la
            # migration. Les actions d'écriture restent, elles, bloquées.
            existing = []
        if existing:
            status = str(existing[0].get("status") or "DRAFT")
            validated_at = existing[0].get("validated_at")
            published_at = existing[0].get("published_at")
            saved = _rows(
                db.table("committee_ranking_results")
                .select("player_name,club,gender,placement,points,display_order")
                .eq("event_id", event_id)
                .order("display_order")
                .execute()
            )
            if saved:
                results = [
                    {
                        **row,
                        "placement_label": PLACEMENT_LABELS.get(str(row.get("placement")), str(row.get("placement"))),
                    }
                    for row in saved
                ]

    return {
        "event": {"id": event_id, **event, "status": status, "validated_at": validated_at, "published_at": published_at},
        "results": results,
        "summary": {
            "players_awarded": len(results),
            "points_awarded": sum(int(row["points"]) for row in results),
            "source_matches": len(winner_bracket),
        },
    }


def validate_event(db: Client, event_id: str, results: list[dict[str, Any]], user_id: str | None) -> dict[str, Any]:
    event = EVENTS.get(event_id)
    if not event:
        raise ValueError("Compétition de classement inconnue.")
    if not results:
        raise ValueError("Aucun joueur à valider.")

    official_preview = build_event_preview(event_id)
    expected = {
        unicodedata.normalize("NFKC", str(row["player_name"])).casefold(): row["placement"]
        for row in official_preview["results"]
    }

    licensed_identities = _licensed_identity_map(
        db,
        [str(row.get("player_name") or "") for row in results],
    )
    normalized = []
    names: set[str] = set()
    for index, row in enumerate(results):
        name = str(row.get("player_name") or "").strip()
        placement = str(row.get("placement") or "")
        gender = str(row.get("gender") or "X").upper()
        club = str(row.get("club") or "").strip()
        if not name or placement not in POINTS or gender not in {"M", "F", "X"}:
            raise ValueError("Une ligne de résultat est invalide.")
        if club not in CLUBS:
            raise ValueError(f"Le club de {name} doit être confirmé dans la liste officielle.")
        key = unicodedata.normalize("NFKC", name).casefold()
        if key in names:
            raise ValueError(f"Le joueur {name} apparaît plusieurs fois.")
        if expected.get(key) != placement:
            raise ValueError(f"Le résultat de {name} ne correspond pas à la source T5.")
        official = licensed_identities.get(_normalized_name(name))
        if club != "Non licencié":
            if not official:
                raise ValueError(f"{name} n'est pas relié au registre officiel des licenciés.")
            if official["club"] != club:
                raise ValueError(
                    f"Le club de {name} ne correspond pas au registre officiel "
                    f"({official['club']})."
                )
        names.add(key)
        normalized.append({
            "event_id": event_id,
            "identity_id": official["identity_id"] if official else None,
            "player_name": name,
            "club": club,
            "gender": gender,
            "placement": placement,
            "points": _points_for(placement, club),
            "display_order": index + 1,
        })

    if names != set(expected):
        raise ValueError("La liste validée ne correspond pas à l'ensemble des joueurs classés dans T5.")

    now = datetime.now(timezone.utc).isoformat()
    db.table("committee_ranking_events").upsert({
        "id": event_id,
        **event,
        "status": "VALIDATED",
        "validated_by": user_id,
        "validated_at": now,
        "published_by": None,
        "published_at": None,
        "updated_at": now,
    }).execute()
    db.table("committee_ranking_results").delete().eq("event_id", event_id).execute()
    db.table("committee_ranking_results").insert(normalized).execute()
    return {"event_id": event_id, "status": "VALIDATED", "validated_at": now, "results": len(normalized)}


def publish_event(db: Client, event_id: str, user_id: str | None) -> dict[str, Any]:
    existing = _rows(
        db.table("committee_ranking_events")
        .select("status")
        .eq("id", event_id)
        .limit(1)
        .execute()
    )
    if not existing or existing[0].get("status") != "VALIDATED":
        raise ValueError("La validation du Directeur sportif doit être enregistrée avant publication.")
    now = datetime.now(timezone.utc).isoformat()
    db.table("committee_ranking_events").update({
        "status": "PUBLISHED",
        "published_by": user_id,
        "published_at": now,
        "updated_at": now,
    }).eq("id", event_id).execute()
    return {"event_id": event_id, "status": "PUBLISHED", "published_at": now}


def public_ranking(db: Client) -> dict[str, Any]:
    events = _rows(
        db.table("committee_ranking_events")
        .select("id,title,event_date,status")
        .eq("status", "PUBLISHED")
        .order("event_date")
        .execute()
    )
    event_ids = [str(event["id"]) for event in events]
    results = []
    if event_ids:
        results = _rows(
            db.table("committee_ranking_results")
            .select("event_id,identity_id,player_name,club,gender,points")
            .in_("event_id", event_ids)
            .execute()
        )

    identity_ids = sorted({str(row["identity_id"]) for row in results if row.get("identity_id")})
    canonical_names = {}
    if identity_ids:
        canonical_names = {
            str(row["id"]): str(row["canonical_display_name"])
            for row in _rows(
                db.table("player_identities")
                .select("id,canonical_display_name")
                .in_("id", identity_ids)
                .execute()
            )
        }

    players: dict[str, dict[str, Any]] = {}
    for row in results:
        points = int(row.get("points") or 0)
        if points <= 0:
            continue
        identity_id = str(row.get("identity_id") or "")
        name = canonical_names.get(identity_id) or str(row.get("player_name") or "").strip()
        key = identity_id or unicodedata.normalize("NFKC", name).casefold()
        player = players.setdefault(key, {
            "player_name": name,
            "club": row.get("club") or "—",
            "gender": row.get("gender") or "X",
            "event_points": defaultdict(int),
            "total": 0,
        })
        if row.get("club"):
            player["club"] = row["club"]
        if row.get("gender") in {"M", "F"}:
            player["gender"] = row["gender"]
        player["event_points"][str(row.get("event_id"))] += points
        player["total"] += points

    return {
        "season": "2026-2027",
        "events": events,
        "rankings": {
            "mixed": _rank_players(players, None),
            "men": _rank_players(players, "M"),
            "women": _rank_players(players, "F"),
        },
    }
