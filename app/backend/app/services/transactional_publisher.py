from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Protocol

from app.services.publication_plan import PublicationPlan


class TransactionStatus(str, Enum):
    READY = "READY"
    COMMITTED = "COMMITTED"
    ROLLED_BACK = "ROLLED_BACK"
    NO_CHANGES = "NO_CHANGES"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class TransactionRequest:
    import_id: str
    filename: str
    sha256: str
    administrator_user_id: str | None
    plan: PublicationPlan

    def to_rpc_payload(self) -> dict[str, Any]:
        return {
            "p_import_id": self.import_id,
            "p_filename": self.filename,
            "p_sha256": self.sha256,
            "p_administrator_user_id": self.administrator_user_id,
            "p_plan": self.plan.to_api_dict(),
        }


@dataclass(frozen=True)
class TransactionResult:
    status: TransactionStatus
    transaction_id: str | None = None
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    message: str | None = None

    @classmethod
    def from_rpc_response(cls, response: dict[str, Any] | None) -> "TransactionResult":
        payload = response or {}
        raw_status = str(payload.get("status", "FAILED")).upper()
        try:
            status = TransactionStatus(raw_status)
        except ValueError:
            status = TransactionStatus.FAILED
        return cls(
            status=status,
            transaction_id=payload.get("transactionId"),
            inserted=int(payload.get("inserted", 0) or 0),
            updated=int(payload.get("updated", 0) or 0),
            unchanged=int(payload.get("unchanged", 0) or 0),
            message=payload.get("message"),
        )

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "transactionId": self.transaction_id,
            "inserted": self.inserted,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "message": self.message,
        }


class RpcClient(Protocol):
    def rpc(self, function_name: str, params: dict[str, Any]) -> Any:
        ...


class TransactionalPublisher:
    """Exécute un plan via une seule fonction PostgreSQL atomique."""

    RPC_NAME = "apply_incremental_publication"

    def __init__(self, db: RpcClient):
        self.db = db

    def execute(self, request: TransactionRequest) -> TransactionResult:
        plan = request.plan

        if not plan.can_execute:
            return TransactionResult(
                status=TransactionStatus.BLOCKED,
                unchanged=plan.unchanged_count,
                message=plan.reason,
            )

        if plan.write_count == 0:
            return TransactionResult(
                status=TransactionStatus.NO_CHANGES,
                unchanged=plan.unchanged_count,
                message="La base est déjà à jour.",
            )

        try:
            rpc_response = self.db.rpc(
                self.RPC_NAME,
                request.to_rpc_payload(),
            ).execute()
        except Exception as exc:
            return TransactionResult(
                status=TransactionStatus.FAILED,
                unchanged=plan.unchanged_count,
                message=f"La transaction PostgreSQL a échoué : {type(exc).__name__}: {exc}",
            )

        data = getattr(rpc_response, "data", rpc_response)
        if isinstance(data, list):
            data = data[0] if data else None
        return TransactionResult.from_rpc_response(data)
