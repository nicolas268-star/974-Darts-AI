from __future__ import annotations
import os
from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import Field
from supabase import create_client
from postgrest.exceptions import APIError
from app.api.calendar_router import verify_internal_token
from app.config import settings
from app.services.ranking_workflow import (
    StrictModel,
    RevisionInput,
    Metadata,
    build_snapshot,
    registry,
    rows,
    aggregate_public,
)
from app.services.nakka_direct_import import validate_direct_event_url

router = APIRouter(
    prefix="/api/v1/ranking-workflow",
    tags=["Validation sportive"],
    dependencies=[Depends(verify_internal_token)],
)
VISIBLE_DS = {
    "PENDING_DS",
    "CORRECTION_REQUESTED",
    "DS_VALIDATED",
    "READY_TO_PUBLISH",
    "PUBLISHED",
}


def enabled():
    return os.getenv("RANKING_WORKFLOW_ENABLED", "false").lower() == "true"


def actor_context(authorization: str | None = Header(default=None)):
    if not enabled():
        raise HTTPException(503, "Le nouveau workflow n’est pas encore activé.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentification requise.")
    db = create_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        user = db.auth.get_user(authorization[7:]).user
    except Exception as exc:
        raise HTTPException(401, "Session invalide ou expirée.") from exc
    if not user:
        raise HTTPException(401, "Session invalide ou expirée.")
    profile = rows(
        db.table("profiles")
        .select("user_id,role,display_name")
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
    )
    if not profile or profile[0]["role"] not in {"ADMIN", "SPORTS_DIRECTOR"}:
        raise HTTPException(403, "Accès refusé.")
    if profile[0]["role"] == "ADMIN":
        config = rows(
            db.table("ranking_workflow_config")
            .select("administrator_id")
            .limit(1)
            .execute()
        )
        if (
            not config
            or config[0]["administrator_id"] != str(user.id)
            or os.getenv("ADMIN_USER_ID", "") != str(user.id)
        ):
            raise HTTPException(403, "Accès administrateur refusé.")
    return db, profile[0]


def require_admin(actor):
    if actor["role"] != "ADMIN":
        raise HTTPException(403, "Action réservée à l’administrateur.")


def command(db, actor, event_id, expected, key, action, payload):
    try:
        return (
            db.rpc(
                "ranking_workflow_command",
                {
                    "p_actor": actor["user_id"],
                    "p_event_id": event_id,
                    "p_expected": str(expected) if expected else None,
                    "p_key": str(key),
                    "p_action": action,
                    "p_payload": payload,
                },
            )
            .execute()
            .data
        )
    except APIError as exc:
        code = str(exc)
        messages = {
            "STALE_REVISION": "Cette version a changé. Rechargez la compétition.",
            "BLOCKING_ANOMALIES": "Corrigez les anomalies avant validation.",
            "INVALID_DIRECTOR": "Choisissez un Directeur sportif actif.",
            "CLUB_EVENT_LIMIT": "Deux tournois sont déjà reconnus pour ce club cette saison.",
            "RATE_LIMIT": "Trop d’analyses récentes. Patientez quelques minutes.",
            "IDEMPOTENCY_CONFLICT": "Cette commande a déjà été utilisée avec un autre contenu.",
            "INVALID_TRANSITION": "Cette action n’est plus disponible pour cette version.",
            "23505": "Cette source ou cette analyse existe déjà. Rechargez la liste.",
        }
        if "FORBIDDEN" in code or "SEPARATE_DIRECTOR_REQUIRED" in code:
            raise HTTPException(403, "Action non autorisée pour ce compte.") from exc
        raise HTTPException(
            409,
            next(
                (v for k, v in messages.items() if k in code),
                "Action refusée. Vérifiez les confirmations et rechargez la compétition.",
            ),
        ) from exc


def load_event(db, actor, event_id):
    events = rows(
        db.table("ranking_workflow_events")
        .select("*")
        .eq("id", event_id)
        .limit(1)
        .execute()
    )
    if not events:
        raise HTTPException(404, "Compétition introuvable.")
    event = events[0]
    revisions = rows(
        db.table("ranking_workflow_revisions")
        .select("*")
        .eq("event_id", event_id)
        .order("number", desc=True)
        .limit(100)
        .execute()
    )
    if actor["role"] == "SPORTS_DIRECTOR":
        revisions = [
            r
            for r in revisions
            if r["director_id"] == actor["user_id"] and r["status"] in VISIBLE_DS
        ]
    if not revisions:
        raise HTTPException(404, "Compétition introuvable.")
    current = revisions[0]
    return event, current, revisions


@router.get("/events")
def list_events(offset: int = Query(0, ge=0, le=10000), ctx=Depends(actor_context)):
    db, actor = ctx
    query = (
        db.table("ranking_workflow_revisions")
        .select("id,event_id,number,status,director_id,snapshot,created_at,historical")
        .order("created_at", desc=True)
    )
    if actor["role"] == "SPORTS_DIRECTOR":
        query = query.eq("director_id", actor["user_id"]).in_(
            "status", list(VISIBLE_DS)
        )
    candidates = rows(query.range(offset, offset + 99).execute())
    event_ids = list(dict.fromkeys(r["event_id"] for r in candidates))
    events = (
        {
            e["id"]: e
            for e in rows(
                db.table("ranking_workflow_events")
                .select("*")
                .in_("id", event_ids)
                .execute()
            )
        }
        if event_ids
        else {}
    )
    result, seen = [], set()
    for revision in candidates:
        event = events.get(revision["event_id"])
        if not event or event["id"] in seen:
            continue
        if actor["role"] == "ADMIN" and revision["id"] != event["current_revision_id"]:
            continue
        seen.add(event["id"])
        result.append(
            {
                **event,
                "revision_id": revision["id"],
                "number": revision["number"],
                "status": revision["status"],
                "metadata": revision["snapshot"]["metadata"],
                "blockers": len(revision["snapshot"].get("blockers", [])),
                "historical": revision["historical"],
            }
        )
    return {
        "events": result,
        "next_offset": offset + 100 if len(candidates) == 100 else None,
    }


@router.get("/options")
def options(ctx=Depends(actor_context)):
    db, actor = ctx
    require_admin(actor)
    identities, _, clubs = registry(db, "2026-2027")
    directors = rows(
        db.table("profiles")
        .select("user_id,display_name")
        .eq("role", "SPORTS_DIRECTOR")
        .execute()
    )
    return {
        "identities": list(identities.values()),
        "clubs": clubs,
        "directors": directors,
    }


@router.get("/events/{event_id}")
def detail(event_id: str, ctx=Depends(actor_context)):
    db, actor = ctx
    event, revision, revisions = load_event(db, actor, event_id)
    ids = [r["id"] for r in revisions]
    decisions = rows(
        db.table("ranking_workflow_decisions")
        .select("*")
        .in_("revision_id", ids)
        .order("created_at")
        .execute()
    )
    response = {
        "event": event,
        "revision": revision,
        "history": [
            {
                k: r[k]
                for k in (
                    "id",
                    "number",
                    "status",
                    "fingerprint",
                    "created_at",
                    "historical",
                )
            }
            for r in revisions
        ],
        "decisions": decisions,
    }
    if actor["role"] == "ADMIN":
        response["jobs"] = rows(
            db.table("ranking_workflow_jobs")
            .select("id,state,error,attempts,created_at")
            .eq("event_id", event_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        response["notifications"] = rows(
            db.table("ranking_notification_outbox")
            .select("template,state,attempts,last_error,accepted_at,created_at")
            .eq("event_id", event_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        response["audit"] = rows(
            db.table("ranking_workflow_audit")
            .select("action,actor_id,reason,before_state,after_state,created_at")
            .eq("event_id", event_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        published = (
            db.rpc("ranking_published_snapshot", {"p_season": event["season_key"]})
            .execute()
            .data
        )
        before = aggregate_public(published, event["season_key"])["rankings"]["mixed"]
        proposed = {
            "events": [e for e in published["events"] if e["id"] != event_id]
            + [
                {
                    "id": event_id,
                    **revision["snapshot"]["metadata"],
                    "results": revision["snapshot"]["results"],
                }
            ]
        }
        after = aggregate_public(proposed, event["season_key"])["rankings"]["mixed"]
        previous = {r["identity_id"]: r for r in before}
        following = {r["identity_id"]: r for r in after}
        response["impact"] = [
            {
                "player_name": (following.get(key) or previous[key])["player_name"],
                "before": previous.get(key, {}).get("total", 0),
                "after": following.get(key, {}).get("total", 0),
                "rank_before": previous.get(key, {}).get("rank"),
                "rank_after": following.get(key, {}).get("rank"),
            }
            for key in dict.fromkeys([*previous, *following])
            if previous.get(key, {}).get("total", 0)
            != following.get(key, {}).get("total", 0)
        ]
    return response


@router.get("/events/{event_id}/revisions/{revision_id}")
def historical_revision(event_id: str, revision_id: UUID, ctx=Depends(actor_context)):
    db, actor = ctx
    candidates = rows(
        db.table("ranking_workflow_revisions")
        .select("*")
        .eq("event_id", event_id)
        .eq("id", str(revision_id))
        .limit(1)
        .execute()
    )
    revision = candidates[0] if candidates else None
    if not revision or (
        actor["role"] == "SPORTS_DIRECTOR"
        and (
            revision["director_id"] != actor["user_id"]
            or revision["status"] not in VISIBLE_DS
        )
    ):
        raise HTTPException(404, "Version introuvable.")
    return {"revision": revision}


class CreateRequest(StrictModel):
    key: UUID
    data: RevisionInput


class ActionRequest(StrictModel):
    key: UUID
    expected_revision: UUID
    action: str = Field(
        pattern=r"^(SAVE|IMPORT|SUBMIT|APPROVE_DS|REQUEST_CORRECTION|APPROVE_ADMIN|PUBLISH|ARCHIVE)$"
    )
    confirmed: bool = False
    reason: str = Field(default="", max_length=2000)
    data: RevisionInput | None = None


def make_snapshot(db, data, source):
    identities, _, clubs = registry(db, data.metadata.season_key)
    try:
        return build_snapshot(data, source, identities, clubs)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/events")
def create_event(payload: CreateRequest, ctx=Depends(actor_context)):
    db, actor = ctx
    require_admin(actor)
    data = payload.data
    snapshot = make_snapshot(db, data, None)
    _, source_id = validate_direct_event_url(data.metadata.source_url)
    discipline = "DOUBLE" if data.metadata.kind == "CLUB_DOUBLE" else "SINGLE"
    event_id = f"nakka-{source_id}-{discipline.lower()}"
    return command(
        db,
        actor,
        event_id,
        None,
        payload.key,
        "CREATE",
        {
            "source_id": source_id,
            "discipline": discipline,
            "season_key": data.metadata.season_key,
            "snapshot": snapshot,
            "director_id": str(data.director_id) if data.director_id else None,
        },
    )


@router.post("/events/{event_id}/actions")
def event_action(event_id: str, payload: ActionRequest, ctx=Depends(actor_context)):
    db, actor = ctx
    if payload.action not in {"APPROVE_DS", "REQUEST_CORRECTION"}:
        require_admin(actor)
    event, revision, _ = load_event(db, actor, event_id)
    body = {"confirmed": payload.confirmed, "reason": payload.reason}
    if payload.action == "SAVE":
        if not payload.data:
            raise HTTPException(422, "Données de correction manquantes.")
        data = payload.data
        source = revision["snapshot"].get("source")
        _, source_id = validate_direct_event_url(data.metadata.source_url)
        if (
            source_id != event["source_id"]
            or data.metadata.season_key != event["season_key"]
            or (data.metadata.kind == "CLUB_DOUBLE")
            != (event["discipline"] == "DOUBLE")
        ):
            raise HTTPException(
                422,
                "La source, la saison et la discipline identifient cette compétition et ne peuvent pas changer.",
            )
        body.update(
            snapshot=make_snapshot(db, data, source),
            director_id=str(data.director_id) if data.director_id else None,
        )
    return command(
        db,
        actor,
        event_id,
        payload.expected_revision,
        payload.key,
        payload.action,
        body,
    )
