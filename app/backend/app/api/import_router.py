from __future__ import annotations

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, File, Header, HTTPException, UploadFile, status
from supabase import create_client

from app.api.publication_models import ExecutePublicationResponse
from app.config import settings
from app.imports.models import ImportStatus
from app.imports.nakka_parser import NakkaParserError
from app.repositories.sync_repository import SyncRepository
from app.services.execute_publication_service import (
    ExecutePublicationInput,
    ExecutePublicationService,
)
from app.services.first9_profile_service import (
    First9ProfileSyncService,
    First9SourceError,
    parse_first9_workbook,
)
from app.services.import_service import ImportService, analyze_import
from app.services.publication_plan import build_publication_plan
from app.services.sync_diff import EntityDiff, SyncDiff, calculate_sync_diff
from app.services.transactional_publisher import TransactionStatus
from app.services.sync_service import (
    build_incoming_snapshot,
    compare_with_published,
)


router = APIRouter(
    prefix="/api/v1/import",
    tags=["Import Nakka"],
)
logger = logging.getLogger(__name__)


def verify_internal_token(token: str | None) -> None:
    if not token or token != settings.internal_api_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Internal token invalid",
        )


def _supabase_client():
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


async def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = file.filename or "upload.xlsx"
    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le fichier envoyé est vide.",
        )

    return filename, content


def _conflicts_from_diff(diff: SyncDiff) -> list[dict]:
    conflicts: list[dict] = []

    sections = (
        ("encounter", diff.encounters),
        ("match", diff.matches),
        ("leg", diff.legs),
        ("player_leg", diff.player_leg_rows),
    )

    for entity_name, section in sections:
        for item in section.updated:
            conflicts.append(
                {
                    "entity": entity_name,
                    "naturalKey": item.natural_key,
                    "changedFields": {
                        change.field: {
                            "published": change.published,
                            "incoming": change.incoming,
                            "category": change.category,
                        }
                        for change in item.changes
                    },
                }
            )

    return conflicts


def _normalized_comparison_payload(
    base_comparison,
    diff: SyncDiff,
) -> dict:
    payload = base_comparison.to_api_dict()

    entity_map = (
        ("encounters", diff.encounters),
        ("matches", diff.matches),
        ("legs", diff.legs),
        ("playerLegRows", diff.player_leg_rows),
    )

    for api_name, section in entity_map:
        payload[api_name]["new"] = len(section.added)
        payload[api_name]["unchanged"] = len(section.unchanged)
        payload[api_name]["conflicts"] = len(section.updated)

    payload["totalNew"] = diff.total_added
    payload["totalUnchanged"] = diff.total_unchanged
    payload["totalConflicts"] = diff.total_updated
    payload["canPublish"] = (
        diff.total_updated == 0
        and diff.total_deleted == 0
    )
    payload["conflicts"] = _conflicts_from_diff(diff)

    return payload


def _analyze_and_diff(
    *,
    content: bytes,
    filename: str,
) -> tuple[object, SyncDiff, dict]:
    """
    Exécute l'analyse et la comparaison Supabase sans aucune écriture.
    """

    analyzed = ImportService().analyze(content, filename)

    if analyzed.analysis.status == ImportStatus.BLOCKED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Le fichier contient des anomalies critiques. "
                "Aucun plan de publication ne peut être généré."
            ),
        )

    published = SyncRepository(_supabase_client()).load_snapshot()
    incoming = build_incoming_snapshot(analyzed.parsed)

    base_comparison = compare_with_published(
        analyzed.parsed,
        published,
    )

    diff = calculate_sync_diff(
        incoming,
        published,
        include_deletes=False,
    )

    comparison_payload = _normalized_comparison_payload(
        base_comparison,
        diff,
    )

    return analyzed, diff, comparison_payload


@router.post("/analyze")
async def analyze_nakka_import(
    file: UploadFile = File(...),
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    filename, content = await _read_upload(file)

    try:
        preview = analyze_import(content, filename)
    except NakkaParserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import analysis failed: {type(exc).__name__}",
        ) from exc

    return preview.to_api_dict()


@router.post("/first9-preview")
async def preview_first9_import(
    file: UploadFile = File(...),
    x_internal_token: str | None = Header(default=None),
):
    """Validate the official Nakka First 9 sheet without writing data."""
    verify_internal_token(x_internal_token)
    filename, content = await _read_upload(file)
    try:
        parsed = parse_first9_workbook(content)
    except First9SourceError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return {
        "status": "READY",
        "filename": filename,
        "sheet": parsed.sheet_name,
        "rows_seen": parsed.rows_seen,
        "valid_source_rows": len(parsed.rows),
        "rejected_rows": parsed.rejected_rows,
        "source": "NAKKA_PLAYER_RAW",
    }


@router.post("/first9-sync")
async def sync_first9_import(
    file: UploadFile = File(...),
    x_internal_token: str | None = Header(default=None),
):
    """Synchronize official season First 9 values into player profiles."""
    verify_internal_token(x_internal_token)
    filename, content = await _read_upload(file)
    try:
        return First9ProfileSyncService(
            _supabase_client()
        ).sync_workbook(content, filename)
    except First9SourceError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"First 9 synchronization failed: {type(exc).__name__}",
        ) from exc


@router.post("/sync-preview")
async def preview_nakka_sync(
    file: UploadFile = File(...),
    x_internal_token: str | None = Header(default=None),
):
    verify_internal_token(x_internal_token)
    filename, content = await _read_upload(file)

    try:
        analyzed = ImportService().analyze(content, filename)
    except NakkaParserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import analysis failed: {type(exc).__name__}",
        ) from exc

    analysis_payload = analyzed.to_api_dict()

    if analyzed.analysis.status == ImportStatus.BLOCKED:
        return {
            "analysis": analysis_payload,
            "sync": None,
            "canPublish": False,
            "reason": (
                "La comparaison Supabase est ignorée car l'analyse "
                "contient des anomalies critiques."
            ),
        }

    try:
        published = SyncRepository(_supabase_client()).load_snapshot()
        incoming = build_incoming_snapshot(analyzed.parsed)

        base_comparison = compare_with_published(
            analyzed.parsed,
            published,
        )

        diff = calculate_sync_diff(
            incoming,
            published,
            include_deletes=False,
        )

        comparison_payload = _normalized_comparison_payload(
            base_comparison,
            diff,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Supabase snapshot failed: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    can_publish = (
        analyzed.analysis.status != ImportStatus.BLOCKED
        and diff.total_updated == 0
        and diff.total_deleted == 0
    )

    reason = None
    if diff.total_updated > 0:
        reason = (
            f"{diff.total_updated} modification(s) réelle(s) "
            "doivent être examinées avant publication."
        )
    elif diff.total_deleted > 0:
        reason = (
            "Des suppressions potentielles ont été détectées. "
            "Elles ne sont jamais appliquées automatiquement."
        )

    return {
        "analysis": analysis_payload,
        "sync": {
            "comparison": comparison_payload,
            "diff": diff.to_api_dict(),
        },
        "canPublish": can_publish,
        "reason": reason,
    }


@router.post("/publication-plan")
async def publication_plan(
    file: UploadFile = File(...),
    allow_updates: bool = False,
    x_internal_token: str | None = Header(default=None),
):
    """
    Génère un plan de publication incrémental en lecture seule.

    - aucune écriture Supabase ;
    - aucune suppression automatique ;
    - les mises à jour sont bloquées sauf si `allow_updates=true` ;
    - les données inchangées ne génèrent aucune opération.
    """

    verify_internal_token(x_internal_token)
    filename, content = await _read_upload(file)

    try:
        analyzed, diff, comparison_payload = _analyze_and_diff(
            content=content,
            filename=filename,
        )

        plan = build_publication_plan(
            diff,
            allow_updates=allow_updates,
        )

    except NakkaParserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Publication plan failed: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    return {
        "analysis": analyzed.to_api_dict(),
        "comparison": comparison_payload,
        "diff": diff.to_api_dict(),
        "plan": plan.to_api_dict(),
    }


@router.post(
    "/execute-publication",
    response_model=ExecutePublicationResponse,
)
async def execute_publication(
    file: UploadFile = File(...),
    x_publication_confirmed: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None),
    x_internal_token: str | None = Header(default=None),
):
    """
    Recalcule le plan côté serveur puis exécute la publication réelle.

    Garde-fous du Lot 3A :
    - token interne obligatoire ;
    - confirmation explicite obligatoire ;
    - aucune mise à jour métier ;
    - aucune suppression automatique ;
    - transaction PostgreSQL unique via la RPC Supabase.
    """

    verify_internal_token(x_internal_token)

    if (x_publication_confirmed or "").strip().lower() != "true":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Publication confirmation required",
        )

    administrator_user_id: str | None = None
    if x_user_id:
        try:
            administrator_user_id = str(UUID(x_user_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-User-Id must be a valid UUID",
            ) from exc

    filename, content = await _read_upload(file)

    try:
        analyzed, diff, _comparison_payload = _analyze_and_diff(
            content=content,
            filename=filename,
        )
        plan = build_publication_plan(
            diff,
            allow_updates=False,
        )

        outcome = ExecutePublicationService(
            _supabase_client()
        ).execute(
            ExecutePublicationInput(
                import_id=str(uuid4()),
                filename=filename,
                sha256=analyzed.analysis.sha256,
                administrator_user_id=administrator_user_id,
                plan=plan,
            )
        )

    except NakkaParserError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Publication execution failed: "
                f"{type(exc).__name__}: {exc}"
            ),
        ) from exc

    if outcome.result.status == TransactionStatus.BLOCKED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=outcome.result.message or "Publication blocked",
        )

    if outcome.result.status in {
        TransactionStatus.FAILED,
        TransactionStatus.ROLLED_BACK,
    }:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                outcome.result.message
                or "Publication transaction failed"
            ),
        )

    # The detailed PvP sheet does not contain the official season First 9
    # average. Synchronize it from Nakka_Player_Raw after a successful
    # publication. A First 9 issue must never invalidate match publication.
    try:
        First9ProfileSyncService(
            _supabase_client()
        ).sync_workbook(content, filename)
    except First9SourceError as exc:
        logger.warning("First 9 source skipped: %s", exc)
    except Exception:
        logger.exception(
            "First 9 synchronization failed after publication"
        )

    return outcome.to_api_dict()
