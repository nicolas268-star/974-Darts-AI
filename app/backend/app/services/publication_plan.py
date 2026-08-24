from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from app.services.sync_diff import EntityChange, EntityDiff, SyncDiff


class PublicationDecision(str, Enum):
    READY = "READY"
    NO_CHANGES = "NO_CHANGES"
    BLOCKED_CONFLICTS = "BLOCKED_CONFLICTS"
    BLOCKED_DELETIONS = "BLOCKED_DELETIONS"


@dataclass(frozen=True)
class PlannedOperation:
    entity: str
    action: str
    natural_key: str
    payload: dict[str, Any]
    changed_fields: tuple[str, ...] = ()

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "entity": self.entity,
            "action": self.action,
            "naturalKey": self.natural_key,
            "payload": self.payload,
            "changedFields": list(self.changed_fields),
        }


@dataclass
class PublicationPlan:
    decision: PublicationDecision
    additions: list[PlannedOperation] = field(default_factory=list)
    updates: list[PlannedOperation] = field(default_factory=list)
    unchanged_count: int = 0
    ignored_deletions: int = 0
    reason: str | None = None

    @property
    def write_count(self) -> int:
        return len(self.additions) + len(self.updates)

    @property
    def can_execute(self) -> bool:
        return self.decision in {
            PublicationDecision.READY,
            PublicationDecision.NO_CHANGES,
        }

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "decision": self.decision.value,
            "canExecute": self.can_execute,
            "writeCount": self.write_count,
            "unchangedCount": self.unchanged_count,
            "ignoredDeletions": self.ignored_deletions,
            "reason": self.reason,
            "summary": {
                "additions": len(self.additions),
                "updates": len(self.updates),
                "unchanged": self.unchanged_count,
                "ignoredDeletions": self.ignored_deletions,
            },
            "operations": {
                "additions": [
                    operation.to_api_dict()
                    for operation in self.additions
                ],
                "updates": [
                    operation.to_api_dict()
                    for operation in self.updates
                ],
            },
        }


def _addition(
    entity: str,
    change: EntityChange,
) -> PlannedOperation:
    return PlannedOperation(
        entity=entity,
        action="INSERT",
        natural_key=change.natural_key,
        payload=change.incoming or {},
    )


def _update(
    entity: str,
    change: EntityChange,
) -> PlannedOperation:
    return PlannedOperation(
        entity=entity,
        action="UPDATE",
        natural_key=change.natural_key,
        payload=change.incoming or {},
        changed_fields=tuple(
            field_change.field
            for field_change in change.changes
        ),
    )


def _collect_section(
    entity: str,
    section: EntityDiff,
) -> tuple[
    list[PlannedOperation],
    list[PlannedOperation],
    int,
    int,
]:
    additions = [
        _addition(entity, change)
        for change in section.added
    ]
    updates = [
        _update(entity, change)
        for change in section.updated
    ]

    return (
        additions,
        updates,
        len(section.unchanged),
        len(section.deleted),
    )


def build_publication_plan(
    diff: SyncDiff,
    *,
    allow_updates: bool = False,
) -> PublicationPlan:
    """
    Prépare un plan d'écriture incrémental sans toucher à Supabase.

    Règles de sécurité du Sprint 4.4.1 :
    - aucune suppression automatique ;
    - les ajouts sont autorisés ;
    - les mises à jour restent bloquées par défaut ;
    - les lignes inchangées ne génèrent aucune écriture.
    """

    additions: list[PlannedOperation] = []
    updates: list[PlannedOperation] = []
    unchanged_count = 0
    ignored_deletions = 0

    sections = (
        ("encounter", diff.encounters),
        ("match", diff.matches),
        ("leg", diff.legs),
        ("player_leg", diff.player_leg_rows),
    )

    for entity, section in sections:
        (
            entity_additions,
            entity_updates,
            entity_unchanged,
            entity_deletions,
        ) = _collect_section(entity, section)

        additions.extend(entity_additions)
        updates.extend(entity_updates)
        unchanged_count += entity_unchanged
        ignored_deletions += entity_deletions

    if ignored_deletions:
        return PublicationPlan(
            decision=PublicationDecision.BLOCKED_DELETIONS,
            additions=additions,
            updates=updates,
            unchanged_count=unchanged_count,
            ignored_deletions=ignored_deletions,
            reason=(
                "Des suppressions potentielles ont été détectées. "
                "Aucune suppression automatique n'est autorisée."
            ),
        )

    if updates and not allow_updates:
        return PublicationPlan(
            decision=PublicationDecision.BLOCKED_CONFLICTS,
            additions=additions,
            updates=updates,
            unchanged_count=unchanged_count,
            ignored_deletions=0,
            reason=(
                "Des modifications métier existent. "
                "Elles doivent être validées explicitement avant écriture."
            ),
        )

    if not additions and not updates:
        return PublicationPlan(
            decision=PublicationDecision.NO_CHANGES,
            additions=[],
            updates=[],
            unchanged_count=unchanged_count,
            ignored_deletions=0,
            reason="La base est déjà à jour. Aucune écriture nécessaire.",
        )

    return PublicationPlan(
        decision=PublicationDecision.READY,
        additions=additions,
        updates=updates,
        unchanged_count=unchanged_count,
        ignored_deletions=0,
        reason=(
            "Le plan contient uniquement les écritures nécessaires."
        ),
    )


__all__ = [
    "PlannedOperation",
    "PublicationDecision",
    "PublicationPlan",
    "build_publication_plan",
]
