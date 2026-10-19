"""Deterministic human inventory and one-row-per-association CSV export."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

from app.services.france_discovery_model import public_competitions


def safe_cell(value) -> str:
    text = "" if value is None else str(value)
    # API titles are untrusted spreadsheet cells.
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def md(value) -> str:
    return str(value or "—").replace("|", "\\|").replace("\r", " ").replace("\n", " ").replace("<", "&lt;")


def render_report(state: dict) -> tuple[str, str]:
    committees = {c["id"]: c for c in state["committees"]}
    competitions = {c["n01_id"]: c for c in state["competitions"]}
    public = public_competitions(state)
    verified_ids = {c["n01_id"] for c in public}
    candidates = state["candidates"]
    runs = sorted(state["runs"], key=lambda r: (r["started_at"], r["id"]))
    lines = ["# Comités France — inventaire initial", "",
        "Inventaire de travail issu de lectures publiques N01. Couverture partielle, non exhaustive.", "",
        f"Organismes documentés : {len(committees)}. Ligues N01 observées : {len(state['leagues'])}.",
        f"Compétitions publiques collectées : {len(competitions)}. Rattachements publiables confirmés : {len(public)}.", "",
        "Une identité d'organisme vérifiée ne prouve pas qu'il organise une compétition N01.",
        "Les titres et relations de ligue restent des pistes jusqu'à validation avec preuve ciblée.", "",
        "## Périmètre réellement exploré", ""]
    for run in runs:
        lines.extend([f"- Exécution `{run['id']}` : **{run['status']}**, {run['started_at']}.",
            f"  Fenêtre : {run['config']['since']} au {run['config']['until']} inclus ; mode {run['config']['mode']}.",
            f"  Mots-clés : {', '.join(md(w) for w in run['config']['keywords'])}.",
            f"  Tâches terminées : {sum(bool(t.get('done')) for t in run['tasks'])}/{len(run['tasks'])} ; statistiques : `{json.dumps(run['stats'], ensure_ascii=False)}`."])
        for error in run.get("last_attempt_errors", []):
            lines.append(f"  Limite/erreur : {md(error['error'])}.")
    if not runs:
        lines.append("Aucune exploration exécutée : aucun résultat de collecte ne peut être revendiqué.")
    lines.extend(["", "Les recherches portent sur les titres, pas les comptes organisateurs masqués par N01. Les dates inconnues sont exclues de la fenêtre et ne sont pas inventées. Les territoires ultramarins sont des termes de recherche, sans garantie de couverture. Une compétition compte par identifiant N01, y compris lorsque plusieurs épreuves partagent une date.", "",
                  "## Organismes documentés", "",
                  "| Organisme | Nature | Département / région confirmés | Référence | Ligue N01 candidate | Identifiées / confirmées | Vérification de l'organisme |",
                  "|---|---|---|---|---|---|---|"])
    for key, c in sorted(committees.items(), key=lambda pair: pair[1]["name"]):
        links = [l["n01_id"] for l in state["leagues"] if l.get("committee_id") == key]
        ids = {r["n01_id"] for r in candidates if r["committee_id"] == key and r["status"] != "REJECTED"}
        confirmed = sum(r.get("committee_id") == key for r in public)
        lines.append("| " + " | ".join(md(v) for v in (c["name"], c["organism_type"],
            " / ".join(filter(None, (c.get("department"), c.get("region")))),
            c.get("reference_url"), ", ".join(links), f"{len(ids)} / {confirmed}", c["verification_status"])) + " |")
    lines.extend(["", "## Compétitions et rattachements confirmés", ""])
    if not public:
        lines.append("Aucun rattachement confirmé à ce stade. Aucun comité n'est attribué sur la seule base d'un nom ou d'une similarité.")
    for c in sorted(public, key=lambda r: (r.get("competition_date") or "", r["n01_id"]), reverse=True):
        lines.append(f"- {md(c.get('competition_date'))} — {md(c['title'])} — {md(committees[c['committee_id']]['name'])} — {md(c.get('source_url'))} — VERIFIED.")
    lines.extend(["", "## Organismes et compétitions incertains — validation nécessaire", "",
                  "| Date | Compétition | Organisme proposé | Décision | Motif | Source N01 |",
                  "|---|---|---|---|---|---|"])
    unassigned_lines = ["", "## Autres observations — origine française et organisateur non établis", "",
        "Ces résultats de recherche ne sont pas présentés comme des compétitions françaises confirmées. Ils peuvent inclure des événements internationaux rencontrés via des mots génériques.", "",
        "| Date | Compétition | Organisme proposé | Décision | Motif | Source N01 |", "|---|---|---|---|---|---|"]
    stream = io.StringIO(newline="")
    columns = ["committee_id", "committee_name", "organism_status", "department", "region", "reference_url",
               "n01_league", "identified_count", "confirmed_count", "n01_id", "competition_date", "title", "season",
               "competition_status", "registered_entries", "formats", "nakka_url", "association_status", "reason", "last_synced_at"]
    writer = csv.DictWriter(stream, columns, lineterminator="\n")
    writer.writeheader()

    def export(c, committee, association):
        cid = committee.get("id")
        ids = {r["n01_id"] for r in candidates if r["committee_id"] == cid and r["status"] != "REJECTED"}
        row = {"committee_id": cid, "committee_name": committee.get("name"),
            "organism_status": committee.get("verification_status"), "department": committee.get("department"),
            "region": committee.get("region"), "reference_url": committee.get("reference_url"),
            "n01_league": c.get("lgid"), "identified_count": len(ids),
            "confirmed_count": sum(r.get("committee_id") == cid for r in public) if cid else 0,
            "n01_id": c.get("n01_id"), "competition_date": c.get("competition_date"), "title": c.get("title"),
            "season": c.get("season"), "competition_status": c.get("status"), "registered_entries": c.get("participants"),
            "formats": json.dumps(c["formats"], ensure_ascii=False) if c.get("formats") else None,
            "nakka_url": c.get("source_url"), "association_status": association.get("status", "UNASSIGNED"),
            "reason": association.get("reason"), "last_synced_at": c.get("last_synced_at")}
        writer.writerow({k: safe_cell(v) for k, v in row.items()})

    for key, c in sorted(competitions.items(), key=lambda pair: (pair[1].get("competition_date") or "", pair[0]), reverse=True):
        proposed = [r for r in candidates if r["n01_id"] == key]
        if not proposed:
            proposed = [{"status": "UNASSIGNED", "reason": "Aucune preuve de rattachement"}]
        for association in proposed:
            committee = committees.get(association.get("committee_id"), {})
            export(c, committee, association)
            if key not in verified_ids or association["status"] != "VERIFIED":
                destination = lines if committee else unassigned_lines
                destination.append("| " + " | ".join(md(v) for v in (c.get("competition_date"), c["title"],
                    committee.get("name"), association["status"], association.get("reason"), c.get("source_url"))) + " |")
    for c in committees.values():
        if not any(r["committee_id"] == c["id"] for r in candidates):
            export({}, c, {"status": "UNASSIGNED", "reason": "Aucune compétition N01 attribuée dans le périmètre exploré"})
    lines.extend(unassigned_lines)
    lines.extend(["", "## Limites et suites", "",
        "Les régions administratives et départements restent vides sans source territoriale explicite ; une ligue sportive n'est pas une région administrative. Les effectifs indiquent les entrées enregistrées, sans présumer des joueurs effectivement présents. Les résultats, poules et tableaux disponibles sont conservés en stockage privé pour une projection ultérieure ; aucun vainqueur n'est déduit dans cette phase.", "",
        "La validation d'une association exige un opérateur identifié, une justification et une source officielle visant l'identifiant exact. Les rejets, corrections manuelles et preuves sont conservés dans l'historique privé. Le CSV inclut les candidats et les organismes sans compétition, avec leurs statuts explicites.", ""])
    return "\n".join(lines), stream.getvalue()


def write_report(state: dict, directory: str | Path):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    markdown, csv_text = render_report(state)
    (directory / "inventaire-initial.md").write_text(markdown, encoding="utf-8")
    (directory / "inventaire-initial.csv").write_text(csv_text, encoding="utf-8-sig", newline="")
