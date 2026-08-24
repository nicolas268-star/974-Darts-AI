from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.publication_plan import PublicationPlan
from app.services.transactional_publisher import (
    TransactionRequest,
    TransactionResult,
    TransactionStatus,
    TransactionalPublisher,
)


@dataclass(frozen=True)
class ExecutePublicationCommand:
    import_id: str
    filename: str
    sha256: str
    administrator_user_id: str | None
    plan: PublicationPlan


class RealPublicationService:
    """
    Façade du moteur transactionnel réel.

    Sprint 4.4.3 Lot 2 :
    - INSERT uniquement ;
    - aucune mise à jour ;
    - aucune suppression ;
    - une transaction PostgreSQL unique.
    """

    def __init__(self, db):
        self.publisher = TransactionalPublisher(db)

    def execute(
        self,
        command: ExecutePublicationCommand,
    ) -> TransactionResult:
        if command.plan.updates:
            return TransactionResult(
                status=TransactionStatus.BLOCKED,
                inserted=0,
                updated=0,
                unchanged=command.plan.unchanged_count,
                message=(
                    "Les mises à jour métier restent interdites "
                    "dans le Sprint 4.4.3 Lot 2."
                ),
            )

        if command.plan.ignored_deletions:
            return TransactionResult(
                status=TransactionStatus.BLOCKED,
                inserted=0,
                updated=0,
                unchanged=command.plan.unchanged_count,
                message=(
                    "Les suppressions automatiques sont interdites."
                ),
            )

        request = TransactionRequest(
            import_id=command.import_id,
            filename=command.filename,
            sha256=command.sha256,
            administrator_user_id=command.administrator_user_id,
            plan=command.plan,
        )

        return self.publisher.execute(request)


__all__ = [
    "ExecutePublicationCommand",
    "RealPublicationService",
]
