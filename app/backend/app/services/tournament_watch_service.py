from __future__ import annotations

import hashlib
import html
import ipaddress
import json
import os
import re
import socket
import smtplib
import ssl
import tempfile
import threading
import unicodedata
from difflib import SequenceMatcher
from datetime import date, datetime, timezone
from pathlib import Path
from email.message import EmailMessage
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from app.services.calendar_service import list_events, upsert_event


STATE_PATH = Path(os.getenv("TOURNAMENT_WATCH_STATE_PATH", "/app/data/tournament_watch.json"))
_lock = threading.Lock()
KEYWORDS = ("tournoi", "tournament", "open", "doublette", "individuel", "cricket", "501", "inscription")
MONTHS = {
    "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "aout": 8, "août": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12, "décembre": 12,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty() -> dict[str, Any]:
    return {"version": 2, "sources": [], "discoveries": [], "last_scan_at": None, "settings": {"automatic": True, "notification_email": "", "interval_minutes": 60, "last_email_at": None, "last_email_error": None}}


def _load_unlocked() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return _empty()
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty()
    if not isinstance(state, dict):
        return _empty()
    defaults = _empty()["settings"]
    state["settings"] = {**defaults, **(state.get("settings") or {})}
    return state


def _write_unlocked(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".tournament-watch-", suffix=".json", dir=STATE_PATH.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(state, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, STATE_PATH)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _safe_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Adresse web invalide.")
    for info in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80)):
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise ValueError("Cette adresse réseau n'est pas autorisée.")
    return parsed.geturl()




PUBLIC_CLUB_SOURCE_ALIASES: dict[str, tuple[str, ...]] = {
    "3bdc": (
        "3b darts club", "3b dart club", "3 b darts club", "3 b dart club",
        "3bdc", "3 bdc", "3 brasseurs darts club", "3 brasseurs dart club",
        "3 brasseurs", "trois brasseurs",
    ),
    "pdc": (
        "papangue darts club", "papangue dart club", "papangue", "pdc",
    ),
    "tdc": (
        "tampon darts club", "tampon dart club", "tampon darts", "tdc",
    ),
    "kazadarts": (
        "kazadarts", "kaza darts", "kaza dart", "kaza",
    ),
    "committee": (
        "comite de flechettes de la reunion", "comite flechettes reunion",
        "comite de la reunion", "ffd reunion", "comite",
    ),
    "darts974": (
        "darts974 reunion island", "darts 974 reunion island",
        "darts974 reunion", "darts 974 reunion", "darts974",
    ),
}

# Indices utiles lorsque le libellé de la source dans « Veille tournois » est
# libre (ex. « Facebook club »). On recherche alors aussi dans le hostname et
# le chemin de l'URL enregistrée.
PUBLIC_CLUB_URL_HINTS: dict[str, tuple[str, ...]] = {
    "3bdc": ("3bdartsclub", "3bdarts", "3bdc", "3brasseurs", "troisbrasseurs"),
    "pdc": ("papangue", "papanguedarts", "papangue974"),
    "tdc": ("tampondartsclub", "tampondartclub", "tampondarts", "tdc974"),
    "kazadarts": ("kazadarts", "kazadarts974", "kazadart"),
    "committee": ("comiteflechettes", "comitedeflechettes", "ffdreunion", "ffd974"),
    "darts974": ("darts974reunionisland", "darts974reunion", "darts974"),
}
PUBLIC_CLUB_SOURCE_PRIORITY = {"FACEBOOK": 0, "INSTAGRAM": 1, "WEBSITE": 2, "OTHER": 3}


def _public_source_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold()).strip()


def _public_source_compact(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", _public_source_name(value))


def _club_source_match_score(key: str, source: dict[str, Any]) -> int:
    """Retourne 0 si la source ne correspond pas au club, sinon un score.

    Le nom administrateur reste prioritaire, mais l'URL est aussi analysée.
    Cela évite de dépendre d'un libellé exact dans « Veille tournois ».
    """
    name = str(source.get("name") or "")
    url = str(source.get("url") or "")
    normalized_name = _public_source_name(name)
    normalized_url = _public_source_name(url)
    compact_name = _public_source_compact(name)
    compact_url = _public_source_compact(url)
    name_tokens = set(normalized_name.split())

    best = 0
    for alias in PUBLIC_CLUB_SOURCE_ALIASES.get(key, ()):
        normalized_alias = _public_source_name(alias)
        compact_alias = _public_source_compact(alias)
        if not normalized_alias:
            continue
        # Les abréviations courtes (PDC/TDC) doivent être des mots entiers.
        if len(normalized_alias) <= 3:
            if normalized_alias in name_tokens:
                best = max(best, 95)
        else:
            if normalized_alias == normalized_name:
                best = max(best, 120)
            elif normalized_alias in normalized_name:
                best = max(best, 110)
            elif compact_alias and compact_alias in compact_name:
                best = max(best, 105)
            elif normalized_alias in normalized_url:
                best = max(best, 92)
            elif compact_alias and compact_alias in compact_url:
                best = max(best, 90)

    for hint in PUBLIC_CLUB_URL_HINTS.get(key, ()):
        compact_hint = _public_source_compact(hint)
        if compact_hint and compact_hint in compact_url:
            best = max(best, 100)

    return best


def public_club_links() -> dict[str, Any]:
    """Expose uniquement les liens publics reconnus pour la carte des clubs.

    Les URL restent administrées depuis Veille tournois. La page d'accueil ne
    reçoit ni découvertes, ni paramètres d'automatisation, ni données admin.
    """
    with _lock:
        state = _load_unlocked()
        sources = list(state.get("sources", []))

    candidates = [
        source for source in sources
        if source.get("active")
        and source.get("source_type") in PUBLIC_CLUB_SOURCE_PRIORITY
        and source.get("url")
    ]
    links: dict[str, dict[str, str]] = {}
    for key in PUBLIC_CLUB_SOURCE_ALIASES:
        matches: list[tuple[int, int, str, dict[str, Any]]] = []
        for source in candidates:
            match_score = _club_source_match_score(key, source)
            if match_score <= 0:
                continue
            priority = PUBLIC_CLUB_SOURCE_PRIORITY.get(str(source.get("source_type")), 99)
            matches.append((-match_score, priority, str(source.get("name") or ""), source))
        if matches:
            # Kazadarts possède plusieurs réseaux dans la veille : la carte doit
            # privilégier explicitement Facebook lorsqu'une page Facebook reconnue existe.
            # Pour les autres clubs, on conserve la logique de meilleur rapprochement.
            selected = matches
            if key in {"kazadarts", "darts974"}:
                facebook_matches = [item for item in matches if str(item[3].get("source_type")) == "FACEBOOK"]
                if facebook_matches:
                    selected = facebook_matches
            _, _, _, source = sorted(selected, key=lambda item: (item[0], item[1], item[2].casefold()))[0]
            links[key] = {
                "name": str(source.get("name") or ""),
                "url": str(source.get("url") or ""),
                "source_type": str(source.get("source_type") or "OTHER"),
            }
    return {"links": links}


def status() -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
    sources = sorted(state.get("sources", []), key=lambda item: item.get("name", "").casefold())
    discoveries = sorted(state.get("discoveries", []), key=lambda item: item.get("detected_at", ""), reverse=True)
    settings = state.get("settings") or _empty()["settings"]
    return {
        "sources": sources,
        "discoveries": discoveries,
        "last_scan_at": state.get("last_scan_at"),
        "counts": {
            "sources": len(sources),
            "active": sum(1 for item in sources if item.get("active")),
            "pending": sum(1 for item in discoveries if item.get("status") == "PENDING"),
            "already_calendar": sum(1 for item in discoveries if item.get("status") == "ALREADY_CALENDAR"),
            "insufficient": sum(1 for item in discoveries if item.get("status") == "INSUFFICIENT"),
        },
        "automation": {**settings, "email_transport_configured": bool(os.getenv("SMTP_HOST") and (os.getenv("SMTP_FROM") or os.getenv("SMTP_USER"))), "worker_enabled": True},
    }


def configure_settings(notification_email: str, automatic: bool = True) -> dict[str, Any]:
    email = notification_email.strip()
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Adresse e-mail invalide.")
    with _lock:
        state = _load_unlocked()
        state["settings"].update({"notification_email": email, "automatic": bool(automatic), "interval_minutes": 60})
        _write_unlocked(state)
    return status()


def upsert_source(payload: dict[str, Any]) -> dict[str, Any]:
    url = _safe_url(str(payload["url"]))
    with _lock:
        state = _load_unlocked()
        source_id = payload.get("id") or str(uuid4())
        existing = next((item for item in state["sources"] if item.get("id") == source_id), None)
        source = {
            **(existing or {}), "id": source_id, "name": str(payload["name"]).strip(),
            "url": url, "source_type": payload.get("source_type", "WEBSITE"),
            "active": bool(payload.get("active", True)), "updated_at": _now(),
            "created_at": (existing or {}).get("created_at", _now()),
        }
        state["sources"] = [source if item.get("id") == source_id else item for item in state["sources"]]
        if existing is None:
            state["sources"].append(source)
        _write_unlocked(state)
    return {"source": source, "created": existing is None}


def delete_source(source_id: str) -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        before = len(state["sources"])
        state["sources"] = [item for item in state["sources"] if item.get("id") != source_id]
        deleted = len(state["sources"]) < before
        if deleted:
            _write_unlocked(state)
    return {"deleted": deleted}


def _plain_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(raw)).strip()


def _extract_date(text: str) -> str | None:
    today = date.today()
    numeric = re.search(r"\b([0-3]?\d)[/.-]([01]?\d)(?:[/.-](20\d{2}|\d{2}))?\b", text)
    if numeric:
        day, month = int(numeric.group(1)), int(numeric.group(2))
        year = int(numeric.group(3)) if numeric.group(3) else today.year
        if year < 100:
            year += 2000
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            pass
    named = re.search(r"\b([0-3]?\d)\s+(" + "|".join(MONTHS) + r")(?:\s+(20\d{2}))?\b", text.casefold())
    if named:
        year = int(named.group(3) or today.year)
        try:
            return date(year, MONTHS[named.group(2)], int(named.group(1))).isoformat()
        except ValueError:
            pass
    return None


def _extract_title(text: str, source_name: str) -> str:
    lowered = text.casefold()
    positions = [lowered.find(word) for word in KEYWORDS if lowered.find(word) >= 0]
    if not positions:
        return f"Tournoi détecté · {source_name}"
    start = max(0, min(positions) - 45)
    excerpt = text[start:start + 150].strip(" -–|:·")
    return excerpt[:120] or f"Tournoi détecté · {source_name}"


def _normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _calendar_match(title: str, event_date: str, source_name: str = "") -> dict[str, Any] | None:
    candidate = _normalized(title)
    source = _normalized(source_name)
    best_score, best_event = 0.0, None
    for event in list_events()["events"]:
        if event.get("start_date") != event_date:
            continue
        known = _normalized(event.get("title", ""))
        score = SequenceMatcher(None, candidate, known).ratio()
        location = _normalized(event.get("location", ""))
        if source and (source in known or source in location):
            score = max(score, 0.82)
        if score > best_score:
            best_score, best_event = score, event
    return best_event if best_score >= 0.72 else None


def _classify(discovery: dict[str, Any]) -> dict[str, Any]:
    event_date = discovery.get("start_date")
    if not event_date:
        discovery.update({"status": "INSUFFICIENT", "reason": "Aucune date identifiable dans la page."})
        return discovery
    try:
        parsed = date.fromisoformat(event_date)
    except ValueError:
        discovery.update({"status": "INSUFFICIENT", "reason": "Date invalide."})
        return discovery
    if parsed < date.today():
        discovery.update({"status": "IGNORED", "reason": "Annonce ancienne."})
        return discovery
    match = _calendar_match(discovery.get("title", ""), event_date, discovery.get("source_name", ""))
    if match:
        discovery.update({"status": "ALREADY_CALENDAR", "calendar_event_id": match.get("id"), "calendar_event_title": match.get("title"), "reason": "Événement déjà présent dans le calendrier."})
    return discovery


def _scan_source(source: dict[str, Any]) -> dict[str, Any] | None:
    url = _safe_url(source["url"])
    request = Request(url, headers={"User-Agent": "974Darts-Tournament-Watch/1.0 (+https://974darts.re)"})
    with urlopen(request, timeout=15) as response:
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            raise ValueError("Format de page non pris en charge.")
        raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError("Page trop volumineuse.")
    text = _plain_text(raw.decode("utf-8", errors="replace"))
    lowered = text.casefold()
    if source.get("source_type") in {"FACEBOOK", "INSTAGRAM"} and (
        len(text) < 500
        or "connectez-vous à facebook" in lowered
        or "log into facebook" in lowered
        or "create new account" in lowered
        or "créer nouveau compte" in lowered
    ):
        raise ValueError("Accès Meta bloqué : les publications ne sont pas visibles sans connexion. Utilise l’analyse manuelle ou une Page Meta connectée.")
    if not any(keyword in lowered for keyword in KEYWORDS):
        return None
    event_date = _extract_date(text)
    title = _extract_title(text, source["name"])
    fingerprint = hashlib.sha256(f"{source['id']}|{title.casefold()}|{event_date or ''}".encode()).hexdigest()[:24]
    return _classify({
        "id": str(uuid4()), "fingerprint": fingerprint, "source_id": source["id"],
        "source_name": source["name"], "source_url": source["url"], "title": title,
        "start_date": event_date, "start_time": None, "location": source["name"],
        "description": "Annonce détectée automatiquement. Vérifier l'affiche et les informations avant publication.",
        "status": "PENDING", "detected_at": _now(), "calendar_event_id": None,
    })


def analyze_manual(text: str, source_name: str, source_url: str | None = None) -> dict[str, Any]:
    clean = re.sub(r"\s+", " ", text).strip()
    if len(clean) < 8:
        raise ValueError("Le texte de l’annonce est trop court.")
    if len(clean) > 20_000:
        raise ValueError("Le texte de l’annonce est trop long.")
    lowered = clean.casefold()
    if not any(keyword in lowered for keyword in KEYWORDS):
        raise ValueError("Aucun mot-clé de tournoi n’a été détecté.")
    event_date = _extract_date(clean)
    title = _extract_title(clean, source_name.strip() or "Annonce manuelle")
    url = _safe_url(source_url) if source_url and source_url.strip() else "https://974darts.re/admin/tournament-watch"
    fingerprint = hashlib.sha256(f"manual|{title.casefold()}|{event_date or ''}|{clean.casefold()}".encode()).hexdigest()[:24]
    discovery = _classify({
        "id": str(uuid4()), "fingerprint": fingerprint, "source_id": "MANUAL",
        "source_name": source_name.strip() or "Annonce manuelle", "source_url": url,
        "title": title, "start_date": event_date, "start_time": None,
        "location": source_name.strip() or "Lieu à confirmer", "description": clean[:1000],
        "status": "PENDING", "detected_at": _now(), "calendar_event_id": None,
    })
    added = False
    with _lock:
        state = _load_unlocked()
        if fingerprint not in {item.get("fingerprint") for item in state["discoveries"]}:
            state["discoveries"].append(discovery); added = True; _write_unlocked(state)
    if added and discovery.get("status") == "PENDING":
        _send_email_alert([discovery])
    return {"discovery": discovery, "created": added, **status()}


def _send_email_alert(discoveries: list[dict[str, Any]]) -> None:
    if not discoveries:
        return
    with _lock:
        state = _load_unlocked()
        recipient = str((state.get("settings") or {}).get("notification_email") or os.getenv("TOURNAMENT_ALERT_EMAIL") or "").strip()
    host = os.getenv("SMTP_HOST", "").strip()
    sender = (os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "").strip()
    if not recipient or not host or not sender:
        return
    message = EmailMessage()
    message["Subject"] = f"974Darts · {len(discoveries)} nouvelle(s) annonce(s) de tournoi"
    message["From"] = sender; message["To"] = recipient
    lines = ["Le radar 974Darts a détecté de nouvelles annonces :", ""]
    for item in discoveries:
        lines.extend([f"• {item.get('title')}", f"  Date : {item.get('start_date') or 'à confirmer'}", f"  Source : {item.get('source_name')}", f"  Lien : {item.get('source_url')}", ""])
    lines.append("Vérification : https://974darts.re/admin/tournament-watch")
    message.set_content("\n".join(lines))
    port = int(os.getenv("SMTP_PORT", "465")); user = os.getenv("SMTP_USER", ""); password = os.getenv("SMTP_PASSWORD", "")
    try:
        if os.getenv("SMTP_USE_SSL", "true").casefold() in {"1", "true", "yes"}:
            with smtplib.SMTP_SSL(host, port, timeout=20, context=ssl.create_default_context()) as smtp:
                if user: smtp.login(user, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                if user: smtp.login(user, password)
                smtp.send_message(message)
        error = None
    except Exception as exc:
        error = str(exc)[:240]
    with _lock:
        state = _load_unlocked(); state["settings"].update({"last_email_at": _now() if error is None else state["settings"].get("last_email_at"), "last_email_error": error}); _write_unlocked(state)


def send_test_email() -> dict[str, Any]:
    snapshot = status()
    automation = snapshot.get("automation") or {}
    if not automation.get("notification_email"):
        raise ValueError("Enregistre d’abord l’adresse e-mail destinataire.")
    if not automation.get("email_transport_configured"):
        raise ValueError("Le serveur SMTP n’est pas encore configuré.")
    _send_email_alert([{"title": "Test du radar communautaire", "start_date": date.today().isoformat(), "source_name": "974Darts", "source_url": "https://974darts.re/admin/tournament-watch"}])
    result = status()
    error = (result.get("automation") or {}).get("last_email_error")
    if error:
        raise ValueError(f"Échec de l’envoi : {error}")
    return {"sent": True, **result}


def _reclassify_existing(state: dict[str, Any]) -> None:
    for discovery in state.get("discoveries", []):
        if discovery.get("status") in {"PENDING", "INSUFFICIENT", "ALREADY_CALENDAR"}:
            discovery["status"] = "PENDING"
            discovery.pop("reason", None)
            discovery.pop("calendar_event_title", None)
            _classify(discovery)


def scan_all() -> dict[str, Any]:
    with _lock:
        state = _load_unlocked()
        _reclassify_existing(state)
        _write_unlocked(state)
        sources = [dict(item) for item in state.get("sources", []) if item.get("active")]
    found, errors, new_pending = 0, [], []
    for source in sources:
        try:
            discovery = _scan_source(source)
            source["last_error"] = None
            if discovery:
                with _lock:
                    state = _load_unlocked()
                    known = {item.get("fingerprint") for item in state["discoveries"]}
                    if discovery["fingerprint"] not in known:
                        state["discoveries"].append(discovery)
                        if discovery.get("status") == "PENDING":
                            found += 1
                            new_pending.append(discovery)
                    for item in state["sources"]:
                        if item.get("id") == source["id"]:
                            item.update({"last_scan_at": _now(), "last_error": None})
                    _write_unlocked(state)
        except Exception as exc:
            message = str(exc)[:240]
            errors.append({"source_id": source["id"], "name": source["name"], "error": message})
            with _lock:
                state = _load_unlocked()
                for item in state["sources"]:
                    if item.get("id") == source["id"]:
                        item.update({"last_scan_at": _now(), "last_error": message})
                _write_unlocked(state)
    with _lock:
        state = _load_unlocked(); state["last_scan_at"] = _now(); _write_unlocked(state)
    _send_email_alert(new_pending)
    return {"scanned": len(sources), "new_discoveries": found, "errors": errors, **status()}


def decide(discovery_id: str, action: str, edits: dict[str, Any] | None, user_id: str | None) -> dict[str, Any]:
    edits = edits or {}
    with _lock:
        state = _load_unlocked()
        item = next((value for value in state["discoveries"] if value.get("id") == discovery_id), None)
        if item is None:
            raise KeyError("Détection introuvable.")
        if action == "IGNORE":
            item.update({"status": "IGNORED", "decided_at": _now(), "decided_by": user_id})
            _write_unlocked(state)
            return {"discovery": item}
        event_date = edits.get("start_date") or item.get("start_date")
        if not event_date:
            raise ValueError("La date doit être confirmée avant publication.")
        event = {
            "title": edits.get("title") or item["title"], "event_type": "TOURNAMENT",
            "start_date": event_date, "start_time": edits.get("start_time") or item.get("start_time"),
            "end_date": None, "location": edits.get("location") or item.get("location") or item["source_name"],
            "address": None, "description": edits.get("description") or item.get("description"),
            "source_url": item["source_url"], "status": "SCHEDULED",
        }
        duplicate = _calendar_match(event["title"], event_date, event["location"])
        if duplicate:
            raise ValueError("Un événement identique existe déjà dans le calendrier.")
        published = upsert_event(event, user_id)["event"]
        item.update({"status": "PUBLISHED", "calendar_event_id": published["id"], "decided_at": _now(), "decided_by": user_id, **edits})
        _write_unlocked(state)
    return {"discovery": item, "calendar_event": published}
