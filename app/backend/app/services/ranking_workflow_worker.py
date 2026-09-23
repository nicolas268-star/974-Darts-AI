"""Durable analysis + transactional-outbox worker. Sending is opt-in."""

from __future__ import annotations
import logging
import os
import smtplib
import ssl
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote, urlsplit
from uuid import UUID, uuid5
from supabase import create_client
from app.config import settings
from app.services.ranking_nakka import collect_private
from app.services.ranking_workflow import (
    Metadata,
    RevisionInput,
    Recognition,
    build_snapshot,
    registry,
    rows,
    suggested_results,
)

log = logging.getLogger("ranking-workflow")


def process_analysis(db, job):
    try:
        revision = rows(
            db.table("ranking_workflow_revisions")
            .select("*")
            .eq("id", job["expected_revision"])
            .limit(1)
            .execute()
        )[0]
        metadata = Metadata.model_validate(
            {
                k: v
                for k, v in revision["snapshot"]["metadata"].items()
                if k in Metadata.model_fields
            }
        )
        source = collect_private(metadata.source_url, int(metadata.season_key[:4]))
        identities, aliases, clubs = registry(db, metadata.season_key)
        data = RevisionInput(
            metadata=metadata,
            recognition=Recognition.model_validate(
                revision["snapshot"].get("recognition", {})
            ),
            director_id=revision["director_id"],
            results=suggested_results(
                source, identities, aliases, metadata.kind == "CLUB_DOUBLE"
            ),
        )
        snapshot = build_snapshot(data, source, identities, clubs)
        db.rpc(
            "ranking_workflow_command",
            {
                "p_actor": job["actor_id"],
                "p_event_id": job["event_id"],
                "p_expected": job["expected_revision"],
                "p_key": str(uuid5(UUID(job["id"]), "analysis")),
                "p_action": "ANALYZE",
                "p_payload": {
                    "snapshot": snapshot,
                    "director_id": revision["director_id"],
                    "job_id": job["id"],
                    "lease_id": job["lease_id"],
                    "reason": "Analyse privée Nakka",
                },
            },
        ).execute()
    except Exception:
        # Never expose Nakka contents, SQL, credentials or exception messages to the UI.
        db.table("ranking_workflow_jobs").update(
            {
                "state": "FAILED",
                "error": "Analyse impossible, source incomplète ou version modifiée. Vérifiez puis relancez.",
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", job["id"]).eq("lease_id", job["lease_id"]).eq(
            "state", "RUNNING"
        ).execute()
        log.warning("Analysis failed: job=%s", job["id"])


def send_notification(db, item):
    user = db.auth.admin.get_user_by_id(item["recipient_id"]).user
    if not user or not user.email:
        raise ValueError("Recipient unavailable")
    profiles = rows(
        db.table("profiles")
        .select("role")
        .eq("user_id", item["recipient_id"])
        .execute()
    )
    expected_role = "SPORTS_DIRECTOR" if item["template"] == "SUBMIT" else "ADMIN"
    if not profiles or profiles[0]["role"] != expected_role:
        raise ValueError("Recipient no longer authorized")
    origin = os.environ["RANKING_SITE_ORIGIN"].rstrip("/")
    url = urlsplit(origin)
    if (
        url.scheme != "https"
        or not url.netloc
        or url.username
        or url.password
        or url.path
        or url.query
        or url.fragment
    ):
        raise ValueError("Invalid trusted site origin")
    path = (
        "/directeur-sportif"
        if expected_role == "SPORTS_DIRECTOR"
        else "/admin/classement-individuel"
    )
    destination = path + "?competition=" + quote(item["event_id"], safe="")
    link = origin + "/auth/landing?next=" + quote(destination, safe="")
    titles = {
        "SUBMIT": "Résultats à valider",
        "APPROVE_DS": "Résultats validés",
        "REQUEST_CORRECTION": "Correction demandée",
    }
    payload = item["payload"]
    message = EmailMessage()
    message["Subject"] = "974 Darts — " + titles[item["template"]]
    message["From"] = os.getenv("SMTP_FROM") or os.environ["SMTP_USER"]
    message["To"] = user.email
    message["Message-ID"] = f"<ranking-{item['id']}@{url.hostname}>"
    message.set_content(
        f"{payload['title']}\nDate : {payload['date']}\nOrganisateur : {payload['organizer']}\nType : {payload['kind']}\nVersion : {payload['version']}\nAction enregistrée par : {payload['actor']}\nDate de l’action : {payload['at']}\n\nConsulter après connexion : {link}\n\nLe lien ne valide ni ne publie aucun résultat."
    )
    host, port = os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "465"))
    context = ssl.create_default_context()
    use_ssl = os.getenv("SMTP_USE_SSL", "true").lower() in {"true", "1", "yes"}
    with (
        smtplib.SMTP_SSL(host, port, timeout=20, context=context)
        if use_ssl
        else smtplib.SMTP(host, port, timeout=20)
    ) as smtp:
        if not use_ssl:
            smtp.starttls(context=context)
        if os.getenv("SMTP_USER"):
            smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        refused = smtp.send_message(message)
        if refused:
            raise ValueError("SMTP refused recipient")


def process_email(db, item):
    try:
        send_notification(db, item)
        update = {
            "state": "SMTP_ACCEPTED",
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "last_error": None,
        }
    except Exception:
        update = {
            "state": "FAILED" if item["attempts"] >= 5 else "QUEUED",
            "last_error": "Notification non acceptée. Vérifier le compte destinataire et la configuration SMTP.",
            "next_attempt_at": (
                datetime.now(timezone.utc)
                + timedelta(seconds=min(3600, 60 * 2 ** item["attempts"]))
            ).isoformat(),
        }
    db.table("ranking_notification_outbox").update(update).eq("id", item["id"]).eq(
        "lease_id", item["lease_id"]
    ).eq("state", "SENDING").execute()


def run_once(db):
    job = db.rpc("ranking_claim_work", {"p_queue": "analysis"}).execute().data
    if job:
        process_analysis(db, job)
    if os.getenv("RANKING_EMAIL_ENABLED", "false").lower() == "true":
        email = db.rpc("ranking_claim_work", {"p_queue": "email"}).execute().data
        if email:
            process_email(db, email)


def main():
    logging.basicConfig(level=logging.INFO)
    if os.getenv("RANKING_WORKFLOW_ENABLED", "false").lower() != "true":
        raise SystemExit("Ranking workflow disabled")
    db = create_client(settings.supabase_url, settings.supabase_service_role_key)
    while True:
        try:
            run_once(db)
        except Exception:
            log.error("Workflow worker unavailable; retrying")
        time.sleep(5)


if __name__ == "__main__":
    main()
