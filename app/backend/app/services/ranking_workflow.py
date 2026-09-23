"""Private sporting revisions; callers never supply points or actor identities."""

from __future__ import annotations
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID
import unicodedata
from pydantic import BaseModel, ConfigDict, Field
from app.services.nakka_direct_import import validate_direct_event_url
from app.services.committee_ranking_service import _rank_players

PLACEMENTS = (
    "WINNER",
    "RUNNER_UP",
    "SEMI_FINALIST",
    "QUARTER_FINALIST",
    "ROUND_OF_16",
    "OUTSIDE_POINTS",
)
SCALES = {
    "C": (50, 38, 28, 18, 10, 0),
    "D": (30, 24, 18, 12, 6, 0),
    "E": (10, 8, 6, 4, 2, 0),
}
CATEGORIES = {
    "COMMITTEE_CUP": "C",
    "COMMITTEE_OPEN": "D",
    "CLUB_SINGLE": "E",
    "CLUB_DOUBLE": "E",
}
RULESET = "committee-2026-2027-v1-double-10-8-6-4-2"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Metadata(StrictModel):
    title: str = Field(min_length=3, max_length=160)
    event_date: date
    season_key: str = Field(default="2026-2027", pattern=r"^20\d{2}-20\d{2}$")
    kind: Literal["COMMITTEE_OPEN", "COMMITTEE_CUP", "CLUB_SINGLE", "CLUB_DOUBLE"]
    organizer: str = Field(min_length=2, max_length=120)
    source_url: str = Field(min_length=20, max_length=500)


class Recognition(StrictModel):
    declared_on: date | None = None
    received_at: datetime | None = None
    ended_at: datetime | None = None
    logo_confirmed: bool = False
    format_confirmed: bool = False
    eligibility_confirmed: bool = False
    classification_confirmed: bool = False
    evidence: str = Field(default="", max_length=2000)
    classification_basis: str = Field(default="", max_length=2000)


class ResultInput(StrictModel):
    source_ref: str = Field(min_length=1, max_length=150)
    identity_id: UUID | None = None
    player_name: str = Field(default="", max_length=120)
    gender: Literal["M", "F", "X"] = "X"
    placement: Literal[
        "WINNER",
        "RUNNER_UP",
        "SEMI_FINALIST",
        "QUARTER_FINALIST",
        "ROUND_OF_16",
        "OUTSIDE_POINTS",
        "UNCONFIRMED",
    ] = "UNCONFIRMED"
    eligibility: Literal["ELIGIBLE", "INELIGIBLE", "UNCONFIRMED"] = "UNCONFIRMED"
    reason: str = Field(default="", max_length=500)


class RevisionInput(StrictModel):
    metadata: Metadata
    recognition: Recognition = Field(default_factory=Recognition)
    results: list[ResultInput] = Field(default_factory=list, max_length=512)
    director_id: UUID | None = None
    reason: str = Field(default="", max_length=2000)


def rows(response):
    return list(response.data or [])


def normalize(value):
    return "".join(
        c for c in unicodedata.normalize("NFKD", value).casefold() if c.isalnum()
    )


def registry(db, season):
    identities = rows(
        db.table("player_identities")
        .select("id,canonical_display_name,status")
        .eq("status", "ACTIVE")
        .execute()
    )
    licenses = rows(
        db.table("committee_licensed_players")
        .select("identity_id,club_code,license_status")
        .eq("season_key", season)
        .eq("license_status", "ACTIVE")
        .execute()
    )
    clubs = {
        x["code"]: x["name"]
        for x in rows(db.table("committee_clubs").select("code,name").execute())
    }
    by_id = {x["id"]: {**x, "club": "", "licensed": False} for x in identities}
    for item in licenses:
        if item["identity_id"] in by_id:
            by_id[item["identity_id"]].update(
                club=clubs.get(item["club_code"], item["club_code"]), licensed=True
            )
    aliases = defaultdict(set)
    for item in identities:
        aliases[normalize(item["canonical_display_name"])].add(item["id"])
    for item in rows(
        db.table("player_aliases")
        .select("identity_id,alias_name")
        .eq("confirmed", True)
        .execute()
    ):
        if item["identity_id"] in by_id:
            aliases[normalize(item["alias_name"])].add(item["identity_id"])
    return by_id, aliases, list(clubs.values())


def suggested_results(source: dict, by_id: dict, aliases: dict, double: bool):
    placements = {}
    # Only an unambiguous main single-elimination bracket is reconstructed.
    # Double elimination/pools/secondary draws always require an official manual placing.
    matches = source.get("matches", [])
    ko = [m for m in matches if m.get("stage_code", "").startswith("ko_")]
    if (
        source.get("format") in {"SINGLE_ELIMINATION", "POOLS_AND_KNOCKOUT"}
        and ko
        and all(m.get("result_complete") for m in ko)
        and not any(m.get("stage_code", "").startswith("loser_") for m in matches)
    ):
        finals = [m for m in ko if m.get("stage_label") == "Finale"]
        names = [p["name"] for p in source.get("participants", [])]
        if len(finals) == 1 and len(names) == len(set(names)):
            labels = {
                "Finale": "RUNNER_UP",
                "Demi-finales": "SEMI_FINALIST",
                "Quarts de finale": "QUARTER_FINALIST",
                "Huitièmes de finale": "ROUND_OF_16",
            }
            for match in ko:
                loser = (
                    match["away"] if match["winner"] == match["home"] else match["home"]
                )
                placements[loser] = labels.get(
                    match.get("stage_label"), "OUTSIDE_POINTS"
                )
            placements[finals[0]["winner"]] = "WINNER"
    result = []
    for participant in source.get("participants", []):
        candidates = (
            aliases.get(normalize(participant["name"]), set()) if not double else set()
        )
        identity = by_id[next(iter(candidates))] if len(candidates) == 1 else None
        for member in range(1, 3 if double else 2):
            result.append(
                {
                    "source_ref": f"{participant['sourceId']}:{member}",
                    "identity_id": identity["id"] if identity else None,
                    "player_name": (
                        identity["canonical_display_name"]
                        if identity
                        else ("" if double else participant["name"])
                    ),
                    "gender": "X",
                    "placement": placements.get(participant["name"], "UNCONFIRMED"),
                    "eligibility": (
                        "ELIGIBLE"
                        if identity and identity["licensed"]
                        else "UNCONFIRMED"
                    ),
                    "reason": "",
                }
            )
    return result


def build_snapshot(
    data: RevisionInput, source: dict | None, by_id: dict, clubs: list[str]
):
    meta = data.metadata.model_dump(mode="json")
    canonical, source_id = validate_direct_event_url(meta["source_url"])
    meta.update(source_url=canonical, category=CATEGORIES[meta["kind"]])
    if meta["season_key"] != "2026-2027":
        raise ValueError("Le barème n’est approuvé que pour la saison 2026–2027.")
    double = meta["kind"] == "CLUB_DOUBLE"
    blockers = []
    if not source:
        blockers.append("Lancer l’analyse Nakka avant l’envoi au DS.")
    elif source.get("sourceId") != source_id:
        raise ValueError("La source de cette compétition ne peut pas être remplacée.")
    participants = {p["sourceId"]: p for p in (source or {}).get("participants", [])}
    expected = {
        f"{key}:{i}" for key in participants for i in range(1, 3 if double else 2)
    }
    actual = [row.source_ref for row in data.results]
    if source and (len(actual) != len(set(actual)) or set(actual) != expected):
        raise ValueError(
            "Conserver exactement tous les participants de l’analyse (deux joueurs par duo)."
        )
    if source and source.get("blockingReasons"):
        blockers.extend(source["blockingReasons"])
    recognition = data.recognition
    if (
        not recognition.classification_confirmed
        or len(recognition.classification_basis) < 10
    ):
        blockers.append("Confirmer le classement sportif et sa pièce de référence.")
    if not recognition.eligibility_confirmed:
        blockers.append("Confirmer l’éligibilité des joueurs à la date de l’épreuve.")
    if not recognition.format_confirmed:
        blockers.append("Confirmer le format réglementaire 501 Double Out.")
    if len(recognition.evidence) < 10:
        blockers.append(
            "Renseigner les références des justificatifs de reconnaissance."
        )
    if meta["kind"].startswith("CLUB"):
        if meta["organizer"] not in clubs:
            blockers.append("Choisir un club organisateur du registre officiel.")
        if not recognition.logo_confirmed:
            blockers.append("Confirmer le logo du Comité sur l’affiche.")
        if (
            not recognition.declared_on
            or (data.metadata.event_date - recognition.declared_on).days < 15
        ):
            blockers.append(
                "La déclaration doit précéder la compétition d’au moins 15 jours."
            )
    if not recognition.received_at or not recognition.ended_at:
        blockers.append(
            "Renseigner la fin de l’épreuve et la réception réelle des résultats par le DS."
        )
    elif not recognition.received_at.tzinfo or not recognition.ended_at.tzinfo:
        raise ValueError("Les heures doivent préciser leur fuseau horaire.")
    else:
        if recognition.received_at > datetime.now(
            timezone.utc
        ) or recognition.ended_at > datetime.now(timezone.utc):
            blockers.append(
                "La fin de l’épreuve et la réception ne peuvent pas être dans le futur."
            )
        hours = (recognition.received_at - recognition.ended_at).total_seconds() / 3600
        if hours < 0 or hours > (48 if meta["kind"].startswith("CLUB") else 72):
            blockers.append(
                "Le délai réglementaire de transmission des résultats n’est pas respecté."
            )
        if recognition.ended_at.date() < data.metadata.event_date:
            blockers.append("La fin de l’épreuve précède la date de la compétition.")
    result, seen, placing_count, pairs = [], set(), defaultdict(int), defaultdict(list)
    for row in data.results:
        identity_id = str(row.identity_id) if row.identity_id else None
        identity = by_id.get(identity_id)
        if identity_id and not identity:
            raise ValueError("Identité inactive ou absente du référentiel.")
        if identity_id in seen:
            blockers.append("Une identité apparaît plusieurs fois.")
        if identity_id:
            seen.add(identity_id)
        if row.eligibility == "UNCONFIRMED" or (
            row.eligibility == "ELIGIBLE" and not identity
        ):
            blockers.append(f"Identité / éligibilité à confirmer : {row.source_ref}.")
        if row.eligibility == "ELIGIBLE" and identity and not identity["licensed"]:
            blockers.append(
                f"Licence active introuvable : {identity['canonical_display_name']}."
            )
        if row.eligibility == "INELIGIBLE" and len(row.reason) < 3:
            blockers.append(f"Motiver l’absence de points : {row.source_ref}.")
        if row.placement == "UNCONFIRMED":
            blockers.append(f"Classement à confirmer : {row.source_ref}.")
        name = identity["canonical_display_name"] if identity else row.player_name
        if not name:
            blockers.append(f"Nom du joueur à renseigner : {row.source_ref}.")
        points = (
            SCALES[meta["category"]][PLACEMENTS.index(row.placement)]
            if row.placement in PLACEMENTS
            and row.eligibility == "ELIGIBLE"
            and identity
            and identity["licensed"]
            else 0
        )
        source_key = row.source_ref.rsplit(":", 1)[0]
        placing_count[row.placement] += 1
        pairs[source_key].append(row.placement)
        result.append(
            {
                **row.model_dump(mode="json"),
                "source_name": participants.get(source_key, {}).get(
                    "name", row.player_name
                ),
                "player_name": name,
                "club": identity["club"] if identity else "Non licencié",
                "points": points,
                "duo_id": source_key if double else None,
            }
        )
    multiplier = 2 if double else 1
    for place, maximum in zip(PLACEMENTS[:5], (1, 1, 2, 4, 8)):
        if placing_count[place] > maximum * multiplier:
            blockers.append(f"Trop de joueurs dans la position {place}.")
    if (
        placing_count["WINNER"] != multiplier
        or placing_count["RUNNER_UP"] != multiplier
    ):
        blockers.append(
            "Il faut un vainqueur et un finaliste (deux joueurs chacun en double)."
        )
    if double and any(
        len(group) != 2 or len(set(group)) != 1 for group in pairs.values()
    ):
        blockers.append(
            "Chaque duo doit comporter deux joueurs avec le même classement."
        )
    result.sort(
        key=lambda x: (
            PLACEMENTS.index(x["placement"]) if x["placement"] in PLACEMENTS else 99,
            x["source_ref"],
        )
    )
    return {
        "metadata": meta,
        "recognition": recognition.model_dump(mode="json"),
        "results": result,
        "source": source,
        "ruleset": RULESET,
        "point_scale": list(SCALES[meta["category"]][:5]),
        "blockers": list(dict.fromkeys(blockers)),
        "summary": {"players": len(result), "points": sum(x["points"] for x in result)},
    }


def aggregate_public(payload, season):
    players = {}
    events = []
    for event in payload.get("events", []):
        events.append({k: v for k, v in event.items() if k != "results"})
        for row in event["results"]:
            if row["points"] <= 0:
                continue
            key = row["identity_id"] or normalize(row["player_name"])
            item = players.setdefault(
                key,
                {
                    "identity_id": key,
                    "player_name": row["player_name"],
                    "club": row["club"],
                    "gender": row["gender"],
                    "event_points": {},
                    "total": 0,
                },
            )
            item.update(
                player_name=row["player_name"], club=row["club"], gender=row["gender"]
            )
            item["event_points"][event["id"]] = row["points"]
            item["total"] += row["points"]
    return {
        "season": season,
        "events": events,
        "rankings": {
            "mixed": _rank_players(players, None),
            "men": _rank_players(players, "M"),
            "women": _rank_players(players, "F"),
        },
    }
