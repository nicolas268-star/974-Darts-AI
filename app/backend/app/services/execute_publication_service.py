from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter

from app.services.publication_plan import PublicationPlan
from app.services.real_publication_service import (
    ExecutePublicationCommand,
    RealPublicationService,
)
from app.services.transactional_publisher import TransactionResult


@dataclass(frozen=True)
class ExecutePublicationInput:
    import_id: str
    filename: str
    sha256: str
    administrator_user_id: str | None
    plan: PublicationPlan


@dataclass(frozen=True)
class ExecutePublicationOutcome:
    result: TransactionResult
    duration_ms: int

    def to_api_dict(self) -> dict:
        return {
            "status": self.result.status.value,
            "transactionId": self.result.transaction_id,
            "durationMs": self.duration_ms,
            "summary": {
                "inserted": self.result.inserted,
                "updated": self.result.updated,
                "unchanged": self.result.unchanged,
            },
            "message": self.result.message,
        }


class ExecutePublicationService:
    """Orchestre l'exécution réelle d'un plan déjà recalculé côté serveur."""

    def __init__(self, db):
        self.real_publication = RealPublicationService(db)

    def execute(
        self,
        publication: ExecutePublicationInput,
    ) -> ExecutePublicationOutcome:
        started_at = perf_counter()

        result = self.real_publication.execute(
            ExecutePublicationCommand(
                import_id=publication.import_id,
                filename=publication.filename,
                sha256=publication.sha256,
                administrator_user_id=(
                    publication.administrator_user_id
                ),
                plan=publication.plan,
            )
        )

        duration_ms = max(
            0,
            round((perf_counter() - started_at) * 1000),
        )

        return ExecutePublicationOutcome(
            result=result,
            duration_ms=duration_ms,
        )


__all__ = [
    "ExecutePublicationInput",
    "ExecutePublicationOutcome",
    "ExecutePublicationService",
]
