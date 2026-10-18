from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.api.calendar_router import verify_internal_token
from app.api.ranking_workflow_router import verified_actor_context, require_admin
from app.services.ranking_workflow import StrictModel
from app.services.tournament_page_service import preview_refresh, apply_refresh, sync_official

router = APIRouter(prefix="/api/v1/competitions/tournaments", tags=["Fiches Nakka"],
                   dependencies=[Depends(verify_internal_token)])


class ApplyRequest(StrictModel):
    preview_id: UUID
    confirmed: bool = False


class RecoveryRequest(StrictModel):
    event_id: str
    confirmed: bool = False


def admin(ctx=Depends(verified_actor_context)):
    db, actor = ctx
    require_admin(actor)
    return db, actor


@router.post("/{code}/refresh/preview")
def refresh_preview(code: str, ctx=Depends(admin)):
    db, actor = ctx
    try:
        return preview_refresh(db, code, actor["user_id"])
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Nakka est indisponible. La fiche validée reste visible.") from exc


@router.post("/{code}/refresh/apply")
def refresh_apply(code: str, request: ApplyRequest, ctx=Depends(admin)):
    db, actor = ctx
    try:
        return apply_refresh(db, str(request.preview_id), actor["user_id"], request.confirmed, code=code)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(409, "La fiche a changé. Relancer l’aperçu avant confirmation.") from exc


@router.post("/recovery/official")
def recover_official(request: RecoveryRequest, ctx=Depends(admin)):
    db, actor = ctx
    if not request.confirmed:
        raise HTTPException(422, "Confirmer la reprise de la fiche uniquement.")
    try:
        return sync_official(db, request.event_id, collect_missing=True, actor=actor["user_id"])
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, "Reprise indisponible. Les résultats officiels restent inchangés.") from exc
