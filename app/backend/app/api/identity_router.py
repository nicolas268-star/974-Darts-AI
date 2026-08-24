from __future__ import annotations

from datetime import date
from secrets import compare_digest

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import settings
from app.services.player_identity_service import IdentityConflictError, PlayerIdentityService
from app.services.tournament_workbook_service import load_tournament_cache

router = APIRouter(prefix="/api/v1/identities", tags=["Player identities"])


class MergePreviewRequest(BaseModel):
    canonical_player_id: str
    source_player_ids: list[str] = Field(default_factory=list)


class MergeAliasesRequest(BaseModel):
    canonical_player_id: str
    source_player_ids: list[str] = Field(default_factory=list)
    alias_names: list[str] = Field(default_factory=list)
    notes: str | None = None


class CanonicalMergePreviewRequest(BaseModel):
    keep_player_id: str
    merge_player_id: str


class CanonicalMergeRequest(BaseModel):
    keep_player_id: str
    merge_player_id: str
    actor_id: str | None = None
    notes: str | None = None


class ApplySuggestionRequest(BaseModel):
    canonical_player_id: str
    source_player_id: str
    actor_id: str | None = None
    notes: str | None = None


class RejectSuggestionRequest(BaseModel):
    left_player_id: str
    right_player_id: str
    actor_id: str | None = None
    notes: str | None = None


class MergeRequestBody(BaseModel):
    canonical_player_id: str
    source_player_ids: list[str] = Field(default_factory=list)
    alias_names: list[str] = Field(default_factory=list)
    requested_by: str | None = None


class MembershipRequest(BaseModel):
    player_id: str
    team_id: str
    season_id: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    is_current: bool = False
    notes: str | None = None


def service() -> PlayerIdentityService:
    from app.main import db_client
    return PlayerIdentityService(db_client())


def verify_internal_token(
    x_internal_token: str | None = Header(default=None),
) -> None:
    configured = settings.internal_api_token
    if (
        not x_internal_token
        or not configured
        or not compare_digest(x_internal_token, configured)
    ):
        raise HTTPException(status_code=401, detail="Internal token invalid")


@router.get("/{player_id}")
def identity_profile(player_id: str):
    payload = service().profile(player_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Player identity not found")
    return payload


@router.get("/{player_id}/career")
def identity_career(player_id: str):
    payload = service().career_scope(player_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Player identity not found")
    return payload


@router.post(
    "/merge-preview",
    dependencies=[Depends(verify_internal_token)],
)
def merge_preview(body: MergePreviewRequest):
    try:
        return service().merge_preview(body.canonical_player_id, body.source_player_ids)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/merge-aliases",
    dependencies=[Depends(verify_internal_token)],
)
def merge_aliases(body: MergeAliasesRequest):
    try:
        return service().merge_aliases(
            canonical_player_id=body.canonical_player_id,
            source_player_ids=body.source_player_ids,
            alias_names=body.alias_names,
            notes=body.notes,
        )
    except IdentityConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/memberships",
    dependencies=[Depends(verify_internal_token)],
)
def add_membership(body: MembershipRequest):
    try:
        return service().add_membership(
            player_id=body.player_id,
            team_id=body.team_id,
            season_id=body.season_id,
            valid_from=body.valid_from,
            valid_to=body.valid_to,
            is_current=body.is_current,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get("/candidates/list")
def identity_candidates(query: str | None = None):
    return {
        "players": service().alias_candidates(query),
        "meta": {"contract_version": "7.5-enterprise"},
    }


@router.get("/tournament-alias/preview")
def tournament_alias_preview(alias: str):
    normalized = "".join(character for character in alias.casefold() if character.isalnum())
    observations = []
    if normalized:
        for tournament in load_tournament_cache().get("tournaments") or []:
            player = next((row for row in tournament.get("players") or [] if "".join(character for character in str(row.get("name") or "").casefold() if character.isalnum()) == normalized), None)
            if player is None:
                continue
            match_count = sum(
                1 for match in tournament.get("matches") or []
                if any("".join(character for character in str(name).casefold() if character.isalnum()) == normalized for name in match.get("tracked_players") or [])
            )
            observations.append({
                "code": tournament.get("code"), "name": tournament.get("name"),
                "date": tournament.get("date"), "match_count": match_count,
                "legs_played": player.get("legs_played"), "legs_won": player.get("legs_won"),
                "average_3_darts": player.get("average_3_darts"),
            })
    return {"alias": alias.strip(), "observations": observations, "tournament_count": len(observations), "match_count": sum(row["match_count"] for row in observations)}


@router.post(
    "/merge-requests",
    dependencies=[Depends(verify_internal_token)],
)
def create_merge_request(body: MergeRequestBody):
    try:
        return service().create_merge_request(
            canonical_player_id=body.canonical_player_id,
            source_player_ids=body.source_player_ids,
            alias_names=body.alias_names,
            requested_by=body.requested_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.get("/suggestions/list")
def identity_suggestions(
    query: str | None = None,
    minimum_score: int = 68,
):
    return service().identity_suggestions(query=query, minimum_score=minimum_score)


@router.post(
    "/suggestions/reject",
    dependencies=[Depends(verify_internal_token)],
)
def reject_identity_suggestion(body: RejectSuggestionRequest):
    try:
        return service().reject_identity_pair(
            left_player_id=body.left_player_id,
            right_player_id=body.right_player_id,
            actor_id=body.actor_id,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/suggestions/rejections")
def identity_suggestion_rejections():
    return service().identity_pair_rejections()


@router.delete(
    "/suggestions/reject",
    dependencies=[Depends(verify_internal_token)],
)
def restore_identity_suggestion(body: RejectSuggestionRequest):
    return service().restore_identity_pair(
        left_player_id=body.left_player_id,
        right_player_id=body.right_player_id,
    )


@router.post(
    "/suggestions/apply",
    dependencies=[Depends(verify_internal_token)],
)
def apply_identity_suggestion(body: ApplySuggestionRequest):
    try:
        return service().apply_suggestion(
            canonical_player_id=body.canonical_player_id,
            source_player_id=body.source_player_id,
            notes=body.notes,
            actor_id=body.actor_id,
        )
    except IdentityConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.post(
    "/canonical-merge/preview",
    dependencies=[Depends(verify_internal_token)],
)
def canonical_merge_preview(body: CanonicalMergePreviewRequest):
    try:
        return service().canonical_merge_preview(
            keep_player_id=body.keep_player_id,
            merge_player_id=body.merge_player_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/canonical-merge/apply",
    dependencies=[Depends(verify_internal_token)],
)
def canonical_merge_apply(body: CanonicalMergeRequest):
    try:
        return service().merge_canonical_identities(
            keep_player_id=body.keep_player_id,
            merge_player_id=body.merge_player_id,
            actor_id=body.actor_id,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

@router.get("/hub/list")
def identity_hub_list(query: str | None = None, status: str | None = "ACTIVE"):
    return service().identity_hub_list(query=query, status=status)

@router.get("/hub/{identity_id}")
def identity_hub_detail(identity_id: str):
    payload = service().identity_hub_detail(identity_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Identity not found")
    return payload

@router.get("/hub-quality/dashboard")
def identity_hub_quality():
    return service().identity_quality_dashboard()
