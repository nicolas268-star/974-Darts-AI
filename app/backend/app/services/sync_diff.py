from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Any

from app.services.sync_service import PublishedSnapshot


class DiffAction(str, Enum):
    ADD = "ADD"
    UPDATE = "UPDATE"
    UNCHANGED = "UNCHANGED"
    DELETE = "DELETE"


@dataclass(frozen=True)
class FieldChange:
    field: str
    published: Any
    incoming: Any
    category: str = "BUSINESS"

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "field": self.field,
            "published": self.published,
            "incoming": self.incoming,
            "category": self.category,
        }


@dataclass(frozen=True)
class EntityChange:
    action: DiffAction
    natural_key: str
    incoming: dict[str, Any] | None = None
    published: dict[str, Any] | None = None
    changes: tuple[FieldChange, ...] = ()

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "naturalKey": self.natural_key,
            "incoming": self.incoming,
            "published": self.published,
            "changes": [change.to_api_dict() for change in self.changes],
        }


@dataclass
class EntityDiff:
    added: list[EntityChange] = field(default_factory=list)
    updated: list[EntityChange] = field(default_factory=list)
    unchanged: list[EntityChange] = field(default_factory=list)
    deleted: list[EntityChange] = field(default_factory=list)

    @property
    def total(self) -> int:
        return sum(len(items) for items in (self.added, self.updated, self.unchanged, self.deleted))

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "added": len(self.added),
            "updated": len(self.updated),
            "unchanged": len(self.unchanged),
            "deleted": len(self.deleted),
            "items": {
                "added": [item.to_api_dict() for item in self.added],
                "updated": [item.to_api_dict() for item in self.updated],
                "unchanged": [item.to_api_dict() for item in self.unchanged],
                "deleted": [item.to_api_dict() for item in self.deleted],
            },
        }


@dataclass
class SyncDiff:
    encounters: EntityDiff = field(default_factory=EntityDiff)
    matches: EntityDiff = field(default_factory=EntityDiff)
    legs: EntityDiff = field(default_factory=EntityDiff)
    player_leg_rows: EntityDiff = field(default_factory=EntityDiff)

    def _sections(self) -> tuple[EntityDiff, ...]:
        return (self.encounters, self.matches, self.legs, self.player_leg_rows)

    @property
    def total_added(self) -> int:
        return sum(len(section.added) for section in self._sections())

    @property
    def total_updated(self) -> int:
        return sum(len(section.updated) for section in self._sections())

    @property
    def total_unchanged(self) -> int:
        return sum(len(section.unchanged) for section in self._sections())

    @property
    def total_deleted(self) -> int:
        return sum(len(section.deleted) for section in self._sections())

    @property
    def can_apply_safely(self) -> bool:
        return self.total_deleted == 0

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "encounters": self.encounters.to_api_dict(),
            "matches": self.matches.to_api_dict(),
            "legs": self.legs.to_api_dict(),
            "playerLegRows": self.player_leg_rows.to_api_dict(),
            "totals": {
                "added": self.total_added,
                "updated": self.total_updated,
                "unchanged": self.total_unchanged,
                "deleted": self.total_deleted,
            },
            "canApplySafely": self.can_apply_safely,
        }


TEXT_IDENTITY_FIELDS = {
    "season", "round", "name", "encounter", "mode", "team", "player",
    "homeTeam", "awayTeam", "team1", "team2", "winnerTeam", "status",
    "matchNaturalKey", "legNaturalKey",
}
INTEGER_FIELDS = {
    "nakkaMatchNumber", "matchNumber", "legNumber", "score", "dartsThrown",
    "finish", "scores180", "scores170", "scores140", "scores100", "scores80", "noScore",
}
BOOLEAN_FIELDS = {"legWon"}
NUMERIC_TOLERANCES: dict[str, Decimal] = {
    "average3Darts": Decimal("0.01"),
    "first9": Decimal("0.01"),
}
OPTIONAL_COMPARISON_FIELDS = {"dartsThrown", "scores80", "noScore"}
IGNORED_FIELDS = {
    "id", "createdAt", "created_at", "updatedAt", "updated_at", "importId", "import_id",
}


def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"\s+", " ", text)
    return _strip_accents(text).casefold()


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return Decimal(int(value))
    if isinstance(value, float) and not math.isfinite(value):
        return None
    try:
        return Decimal(str(value).replace(",", "."))
    except (InvalidOperation, ValueError):
        return None


def _normalize_integer(value: Any) -> int | None:
    decimal_value = _to_decimal(value)
    return None if decimal_value is None else int(decimal_value)


def _normalize_decimal(value: Any) -> Decimal | None:
    decimal_value = _to_decimal(value)
    return None if decimal_value is None else decimal_value.quantize(Decimal("0.000001"))


def _normalize_boolean(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float, Decimal)):
        return bool(value)
    normalized = _normalize_text(value)
    if normalized in {"true", "1", "yes", "oui", "vrai"}:
        return True
    if normalized in {"false", "0", "no", "non", "faux"}:
        return False
    return bool(normalized)


def normalize_value(field_name: str, value: Any) -> Any:
    if field_name in IGNORED_FIELDS:
        return None
    if field_name in BOOLEAN_FIELDS:
        return _normalize_boolean(value)
    if field_name in INTEGER_FIELDS:
        return _normalize_integer(value)
    if field_name in NUMERIC_TOLERANCES:
        return _normalize_decimal(value)
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    if field_name in TEXT_IDENTITY_FIELDS:
        return _normalize_text(value)
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _optional_missing_is_equivalent(field_name: str, published: Any, incoming: Any) -> bool:
    if field_name not in OPTIONAL_COMPARISON_FIELDS:
        return False
    left = normalize_value(field_name, published)
    right = normalize_value(field_name, incoming)
    return left is None or right is None


def values_equivalent(field_name: str, published: Any, incoming: Any) -> bool:
    if field_name in IGNORED_FIELDS:
        return True
    if _optional_missing_is_equivalent(field_name, published, incoming):
        return True
    left = normalize_value(field_name, published)
    right = normalize_value(field_name, incoming)
    if left is None and right is None:
        return True
    tolerance = NUMERIC_TOLERANCES.get(field_name)
    if tolerance is not None:
        if left is None or right is None:
            return False
        return abs(left - right) <= tolerance
    return left == right


def _normalize_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {}
    return {
        key: value
        for key, value in payload.items()
        if key not in IGNORED_FIELDS and normalize_value(key, value) is not None
    }


def _classify_change(field_name: str) -> str:
    if field_name in NUMERIC_TOLERANCES:
        return "CALCULATED"
    if field_name in OPTIONAL_COMPARISON_FIELDS:
        return "OPTIONAL"
    if field_name in {"player", "team", "winnerTeam", "score", "finish", "legWon", "status"}:
        return "BUSINESS_CRITICAL"
    return "BUSINESS"


def _field_changes(published: dict[str, Any], incoming: dict[str, Any]) -> tuple[FieldChange, ...]:
    changes: list[FieldChange] = []
    for field_name in sorted(set(published) | set(incoming)):
        if field_name in IGNORED_FIELDS:
            continue
        published_value = published.get(field_name)
        incoming_value = incoming.get(field_name)
        if not values_equivalent(field_name, published_value, incoming_value):
            changes.append(
                FieldChange(
                    field=field_name,
                    published=published_value,
                    incoming=incoming_value,
                    category=_classify_change(field_name),
                )
            )
    return tuple(changes)


def diff_entity_maps(
    incoming: dict[str, dict[str, Any]],
    published: dict[str, dict[str, Any]],
    *,
    include_deletes: bool = True,
) -> EntityDiff:
    result = EntityDiff()
    for natural_key in sorted(incoming):
        incoming_payload = _normalize_payload(incoming[natural_key])
        published_payload = published.get(natural_key)
        if published_payload is None:
            result.added.append(EntityChange(action=DiffAction.ADD, natural_key=natural_key, incoming=incoming[natural_key]))
            continue
        normalized_published = _normalize_payload(published_payload)
        changes = _field_changes(normalized_published, incoming_payload)
        if changes:
            result.updated.append(
                EntityChange(
                    action=DiffAction.UPDATE,
                    natural_key=natural_key,
                    incoming=incoming[natural_key],
                    published=published_payload,
                    changes=changes,
                )
            )
        else:
            result.unchanged.append(
                EntityChange(
                    action=DiffAction.UNCHANGED,
                    natural_key=natural_key,
                    incoming=incoming[natural_key],
                    published=published_payload,
                )
            )
    if include_deletes:
        for natural_key in sorted(set(published) - set(incoming)):
            result.deleted.append(
                EntityChange(action=DiffAction.DELETE, natural_key=natural_key, published=published[natural_key])
            )
    return result


def calculate_sync_diff(
    incoming: PublishedSnapshot,
    published: PublishedSnapshot,
    *,
    include_deletes: bool = True,
) -> SyncDiff:
    return SyncDiff(
        encounters=diff_entity_maps(incoming.encounters, published.encounters, include_deletes=include_deletes),
        matches=diff_entity_maps(incoming.matches, published.matches, include_deletes=include_deletes),
        legs=diff_entity_maps(incoming.legs, published.legs, include_deletes=include_deletes),
        player_leg_rows=diff_entity_maps(incoming.player_leg_rows, published.player_leg_rows, include_deletes=include_deletes),
    )
