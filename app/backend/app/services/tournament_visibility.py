"""Deterministic sharing drafts for published Committee tournaments.

The universal public tournament projection is the only sporting input. This
module never publishes results, awards points, calls an AI provider or sends a
message. Organiser context uses the existing local visibility context store.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import hashlib
import json
import math
import re
from urllib.parse import urlparse

from .tournament_classification import tournament_classification
from .tournament_page_service import all_tournaments, official_events, published_revision
from .visibility_context import CONTEXT_LIMIT, load_context, save_context
from .visibility_service import SummaryUnavailable


CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
OFFICIAL_CLASSES = {"OFFICIAL", "COMMITTEE_OFFICIAL", "COMMITTEE_RECOGNIZED"}
SUMMARY_VERSION = 1
PUBLIC_ORIGIN = "https://974darts.re"
COMMITTEE_URL = f"{PUBLIC_ORIGIN}/competitions/classement-individuel"


def _code(value):
    if not isinstance(value, str) or not CODE_PATTERN.fullmatch(value):
        raise SummaryUnavailable("Identifiant de tournoi invalide.")
    return value.lower()


def _text(value):
    return " ".join(str(value or "").split())


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def _date_label(value):
    try:
        return date.fromisoformat(str(value)[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return None


def _published_tournaments(db):
    active = {}
    for event in official_events(db):
        published_revision(db, event)
        active[(str(event["source_id"]), event["discipline"])] = event
    selected = []
    for tournament in all_tournaments(db):
        try:
            code = _code(tournament.get("code"))
        except SummaryUnavailable:
            continue
        historical = tournament_classification(code)
        classification = tournament.get("classification") or historical["classification"]
        if classification not in OFFICIAL_CLASSES:
            continue
        status = tournament.get("ranking_status") or historical.get("ranking_status")
        if status != "PUBLISHED":
            continue
        event = active.get((str(tournament.get("source_tournament_id")), tournament.get("discipline") or "SINGLE"))
        publication = tournament.get("official_publication") or {}
        if event:
            if publication.get("revision_id") != event["published_revision_id"] or publication.get("status") != "PUBLISHED":
                continue
        else:
            # Recognition metadata alone cannot replace an active published
            # Committee revision, including for historical recognized events.
            continue
        selected.append((code, tournament))
    # A code must select one public event unambiguously.
    counts = {}
    for code, _ in selected:
        counts[code] = counts.get(code, 0) + 1
    return [(code, tournament) for code, tournament in selected if counts[code] == 1]


def list_tournaments(db):
    tournaments = []
    for code, tournament in _published_tournaments(db):
        title = _text(tournament.get("event_name") or tournament.get("name") or code.upper())
        event_date = str(tournament["date"])[:10] if tournament.get("date") else None
        discipline = tournament.get("discipline") or "SINGLE"
        label = " · ".join(filter(None, (title, _date_label(event_date), "Doublettes" if discipline == "DOUBLE" else "Individuel")))
        tournaments.append({"id": f"tournament:{code}", "code": code, "label": label,
                            "title": title, "date": event_date, "discipline": discipline})
    tournaments.sort(key=lambda item: (item["date"] or "", item["code"]), reverse=True)
    return {"tournaments": tournaments, "ai_available": False}


def load_tournament(db, code):
    normalized = _code(code)
    found = [tournament for candidate, tournament in _published_tournaments(db) if candidate == normalized]
    if len(found) != 1:
        raise SummaryUnavailable("Tournoi officiel ou reconnu publié introuvable.")
    return found[0]


def _name(tournament, value):
    aliases = tournament.get("display_aliases") or {}
    return _text(aliases.get(value, value))


def _source_url(tournament):
    value = str(tournament.get("source_url") or "")
    parsed = urlparse(value)
    if parsed.scheme == "https" and parsed.hostname == "n01darts.com" and not parsed.username and not parsed.password:
        return value
    return None


def _podium(tournament, double):
    results = tournament.get("official_results") or []
    facts = []
    for placement, key, label in (
        ("WINNER", "winner", "Doublette vainqueur" if double else "Vainqueur"),
        ("RUNNER_UP", "runner_up", "Doublette finaliste" if double else "Finaliste"),
        ("SEMI_FINALIST", "semi_finalists", "Demi-finalistes"),
    ):
        rows = [row for row in results if row.get("placement") == placement and row.get("name")]
        if not rows:
            continue
        if key in {"winner", "runner_up"} and len(rows) != (2 if double else 1):
            continue
        if double:
            groups = {}
            for row in rows:
                source_ref = str(row.get("source_ref") or "")
                if ":" not in source_ref:
                    groups = {}
                    break
                groups.setdefault(source_ref.rsplit(":", 1)[0], []).append(row)
            duo_names = []
            for source_id, members in groups.items():
                if len(members) != 2:
                    continue
                duo = next((row for row in tournament.get("duos") or [] if row.get("nakka_participant_id") == source_id), None)
                if duo and duo.get("name"):
                    duo_names.append(_name(tournament, duo["name"]))
            if duo_names:
                facts.append({"id": key, "text": f"{label} : " + " · ".join(duo_names) + "."})
            elif key in {"winner", "runner_up"} and tournament.get(key):
                facts.append({"id": key, "text": f"{label} : {_name(tournament, tournament[key])}."})
            continue
        names = []
        for row in rows:
            name = _name(tournament, row["name"])
            points = _number(row.get("points"))
            names.append(name + (f" ({points:g} pts Comité)" if points is not None else ""))
        facts.append({"id": key, "text": f"{label} : " + " · ".join(names) + "."})
    if not results:
        # Historical recognition may precede the point workflow. A confirmed
        # main-bracket winner is still a sporting fact; no points are invented.
        for key, label in (("winner", "Vainqueur confirmé"), ("runner_up", "Finaliste confirmé")):
            if tournament.get(key):
                facts.append({"id": key, "text": f"{label} : {_name(tournament, tournament[key])}."})
    points = [_number(row.get("points")) for row in results]
    if double:
        individual_points = [f"{_name(tournament, row['name'])} : {row['points']:g} pts" for row in results
                             if row.get("placement") in {"WINNER", "RUNNER_UP", "SEMI_FINALIST"}
                             and row.get("name") and _number(row.get("points")) is not None]
        if individual_points:
            facts.append({"id": "individual_points", "text": "Points Comité individuels publiés : " + " · ".join(individual_points) + "."})
    if points and all(value is not None for value in points):
        facts.append({"id": "committee_points", "text": f"Points Comité publiés : {sum(points):g} au total."})
    return facts


def _performance_facts(tournament, participants):
    facts = []
    for metric, key, label, decimals in (
        ("average_3_darts", "top_average", "Meilleure moyenne disponible sur 3 fléchettes", True),
        ("first_9", "first9", "Meilleur First 9 disponible", True),
        ("best_finish", "finish", "Plus haut finish enregistré", False),
    ):
        observed = [(row, _number(row.get(metric))) for row in participants]
        observed = [(row, value) for row, value in observed if value is not None and value > 0 and row.get("name")]
        if not observed:
            continue
        best = max(value for _, value in observed)
        names = " · ".join(_name(tournament, row["name"]) for row, value in observed if value == best)
        formatted = f"{best:.2f}".replace(".", ",") if decimals else f"{best:g}"
        facts.append({"id": key, "text": f"{label} : {names}, {formatted}."})
    maximums = [_number(row.get("scores_180")) for row in participants]
    if maximums and all(value is not None for value in maximums):
        count = sum(maximums)
        leaders = " · ".join(f"{_name(tournament, row['name'])} × {value:g}" for row, value in zip(participants, maximums) if value and row.get("name"))
        text = f"180 enregistrés : {count:g} au total" + (f" ({leaders})." if leaders else ".")
        facts.append({"id": "maximums", "text": text})
    return facts


def build_tournament_facts(tournament):
    code = _code(tournament.get("code"))
    double = tournament.get("discipline") == "DOUBLE"
    participants = tournament.get("duos" if double else "players") or []
    matches = tournament.get("matches") or []
    summary = tournament.get("summary") or {}
    players = len(participants) if participants else _number(summary.get("tracked_duos" if double else "tracked_players"))
    if not players:
        players = None
    match_count = len(matches) if matches else None
    leg_counts = [_number(match.get("legs")) for match in matches]
    legs = sum(leg_counts) if leg_counts and all(value is not None for value in leg_counts) else None
    title = _text(tournament.get("event_name") or tournament.get("name") or code.upper())
    location = _text(tournament.get("location") or tournament.get("venue")) or None
    date_label = _date_label(tournament.get("date"))
    facts = []
    volume = [f"{players:g} {'doublettes' if double else 'joueurs'}" if players is not None else "",
              f"{match_count} rencontres documentées" if match_count is not None else "",
              f"{legs:g} legs enregistrés" if legs is not None else ""]
    if any(volume):
        facts.append({"id": "volume", "text": " · ".join(part for part in volume if part) + "."})
    pools = tournament.get("round_robin") or tournament.get("pools") or []
    phases = [f"{len(pools)} poules"] if pools else []
    if tournament.get("has_double_elimination"):
        phases.append("double élimination avec Winner Bracket et Loser Bracket")
    elif tournament.get("bracket"):
        phases.append("tableau principal")
        if tournament.get("has_secondary_bracket") or any(stage.get("bracket_kind") == "SECONDARY" for stage in tournament["bracket"]):
            phases.append("consolante")
    if phases:
        facts.append({"id": "format", "text": "Format : " + " · ".join(phases) + "."})
    facts.extend(_podium(tournament, double))
    facts.extend(_performance_facts(tournament, participants))
    return {"kind": "tournament", "result_id": f"tournament:{code}", "code": code,
            "title": title, "round": code.upper(), "date": date_label, "location": location,
            "season": str(tournament.get("season_key") or tournament.get("season") or ""),
            "discipline": "DOUBLE" if double else "SINGLE", "facts": facts,
            "matches": match_count, "legs": legs, "players": players,
            "playersLabel": "doublettes" if double else "joueurs",
            "url": f"{PUBLIC_ORIGIN}/tournaments/{code}", "source_url": _source_url(tournament),
            "committee_url": COMMITTEE_URL}


def compose_tournament_summary(tournament, context=None):
    evening = build_tournament_facts(tournament)
    if context is not None:
        if not isinstance(context, str) or len(context) > CONTEXT_LIMIT:
            raise ValueError("Le contexte doit contenir au maximum 1 600 caractères.")
        save_context(evening["result_id"], context)
    editorial_context = load_context(evening)
    texts = {fact["id"]: fact["text"] for fact in evening["facts"]}
    heading = f"🎯 {evening['title']}"
    details = " · ".join(filter(None, (evening["date"], evening["location"])))
    if details:
        heading += f"\n📅 {details}"
    if evening["season"]:
        heading += f"\nSaison {evening['season']}"
    common = "\n\n" + "\n".join(texts[key] for key in ("volume", "format") if key in texts) if "volume" in texts or "format" in texts else ""
    podium = "\n".join("• " + texts[key] for key in ("winner", "runner_up", "semi_finalists", "individual_points", "committee_points") if key in texts)
    if podium:
        common += "\n\n🏆 Résultats publiés\n" + podium
    around = f"\n\n🎯 Autour du tournoi\n{editorial_context}" if editorial_context else ""
    links = f"\n\nFiche du tournoi : {evening['url']}\nClassement du Comité : {COMMITTEE_URL}"
    if evening["source_url"]:
        links += f"\nSource Nakka : {evening['source_url']}"
    whatsapp_insights = [texts[key] for key in ("top_average", "first9", "finish", "maximums") if key in texts]
    facebook_insights = [texts[key] for key in ("top_average", "finish", "maximums") if key in texts]
    scope = "Performances collectives des doublettes" if evening["discipline"] == "DOUBLE" else "Performances disponibles"
    whatsapp = heading + common
    if whatsapp_insights:
        whatsapp += f"\n\n📊 {scope}\n" + "\n".join("• " + text for text in whatsapp_insights)
    whatsapp += around + "\n\nBravo à tous les participants ! 🎯" + links
    facebook = heading + common
    if facebook_insights:
        facebook += f"\n\n📊 {scope}\n" + "\n".join("• " + text for text in facebook_insights)
    facebook += around + "\n\nBravo à tous les participants !" + links
    fingerprint = hashlib.sha256(json.dumps(["tournament", SUMMARY_VERSION, evening, editorial_context], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return {"kind": "tournament", "evening": evening, "whatsapp": whatsapp, "facebook": facebook,
            "mode": "statistics", "ai_available": False,
            "note": "Résumé statistique fondé sur les résultats publiés du tournoi.",
            "context": editorial_context, "fingerprint": fingerprint, "summary_version": SUMMARY_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat()}


def tournament_summary(db, code, context=None):
    return compose_tournament_summary(load_tournament(db, code), context=context)
