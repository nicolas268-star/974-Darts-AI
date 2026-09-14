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


def build_event_preview(event_id: str, db: Client | None = None) -> dict[str, Any]:
    event = EVENTS.get(event_id)
    if not event:
        raise ValueError("Compétition de classement inconnue.")

    tournament = CompetitionHubService.tournament(event["tournament_code"])
    if not tournament or tournament.get("status") != "AVAILABLE":
        raise ValueError("Les résultats T5 ne sont pas disponibles.")

    knockout = [
        match
        for match in tournament.get("matches") or []
        if match.get("phase") == "KNOCKOUT" and match.get("winner")
    ]
    if not knockout:
        raise ValueError("Aucun résultat éliminatoire exploitable dans T5.")

    losses: dict[str, float] = {}
    raw_names: dict[str, str] = {}
    final_match = max(knockout, key=lambda item: _number(item.get("match_number")))
    winner = str(final_match.get("winner") or "").strip()

    for match in knockout:
        home = str(match.get("home") or "").strip()
        away = str(match.get("away") or "").strip()
        match_winner = str(match.get("winner") or "").strip()
        loser = away if match_winner == home else home if match_winner == away else ""
        if not loser:
            continue
        display = _display_name(tournament, loser)
        key = unicodedata.normalize("NFKC", display).casefold()
        raw_names[key] = display
        losses[key] = max(losses.get(key, -1), _number(match.get("match_number")))

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
            "source_matches": len(knockout),
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

    normalized = []
    names: set[str] = set()
    for index, row in enumerate(results):
        name = str(row.get("player_name") or "").strip()
        placement = str(row.get("placement") or "")
        gender = str(row.get("gender") or "X").upper()
        if not name or placement not in POINTS or gender not in {"M", "F", "X"}:
            raise ValueError("Une ligne de résultat est invalide.")
        key = unicodedata.normalize("NFKC", name).casefold()
        if key in names:
            raise ValueError(f"Le joueur {name} apparaît plusieurs fois.")
        if expected.get(key) != placement:
            raise ValueError(f"Le résultat de {name} ne correspond pas à la source T5.")
        names.add(key)
        normalized.append({
            "event_id": event_id,
            "player_name": name,
            "club": str(row.get("club") or "").strip() or None,
            "gender": gender,
            "placement": placement,
            "points": POINTS[placement],
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
            .select("event_id,player_name,club,gender,points")
            .in_("event_id", event_ids)
            .execute()
        )

    players: dict[str, dict[str, Any]] = {}
    for row in results:
        name = str(row.get("player_name") or "").strip()
        key = unicodedata.normalize("NFKC", name).casefold()
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
        points = int(row.get("points") or 0)
        player["event_points"][str(row.get("event_id"))] += points
        player["total"] += points

    def ranking(gender: str | None) -> list[dict[str, Any]]:
        selected = [item for item in players.values() if gender is None or item["gender"] == gender]
        selected.sort(key=lambda item: (-int(item["total"]), str(item["player_name"]).casefold()))
        last_total = None
        rank_value = 0
        for index, item in enumerate(selected, start=1):
            if item["total"] != last_total:
                rank_value = index
                last_total = item["total"]
            item["rank"] = rank_value
            item["event_points"] = dict(item["event_points"])
        return selected

    return {
        "season": "2026-2027",
        "events": events,
        "rankings": {"mixed": ranking(None), "men": ranking("M"), "women": ranking("F")},
    }
