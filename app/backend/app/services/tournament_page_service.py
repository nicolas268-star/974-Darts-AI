"""Durable public projections. This module never writes ranking or ELO data."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import re
import unicodedata
from uuid import uuid4

from app.services.tournament_workbook_service import load_tournament_cache
from app.services.tournament_classification import tournament_classification

log = logging.getLogger(__name__)


def _rows(query):
    return list(query.execute().data or [])


def fingerprint(value):
    """Ignore collection time; only a sporting/content change creates a revision."""
    ignored = {"collectedAt", "snapshotHash", "source_snapshot_hash", "sourceUpdatedAt",
               "source_updated_at", "imported_at", "refreshed_at", "generated_at"}
    def clean(item):
        if isinstance(item, dict):
            return {k: clean(v) for k, v in item.items() if k not in ignored}
        if isinstance(item, list):
            return [clean(v) for v in item]
        return item
    return hashlib.sha256(json.dumps(clean(value), sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()


def stable_code(source_id, metadata, discipline="SINGLE"):
    title = str(metadata.get("title") or metadata.get("event_name") or source_id)
    plain = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    committee = re.search(r"(?:open\s+(?:(?:du|de)\s+)?comite|oc)\s*(?:#\s*|n[o]?\s*)?(\d+)", plain)
    date = str(metadata.get("event_date") or metadata.get("date") or "")[:10]
    if committee and date:
        slug = f"oc{committee[1]}-{date}"
    else:
        slug = re.sub(r"[^a-z0-9]+", "-", plain).strip("-")[:65]
        slug = f"{slug}-{date + '-' if date else ''}{source_id.lower()}"
    return slug + ("-double" if discipline == "DOUBLE" else "")


def _build(source, code, metadata=None, existing=None):
    from app.services.tournament_engine import build_tournament_payload
    return build_tournament_payload(source, code=code, metadata=metadata, existing=existing)


def _sporting_core(source):
    """Compare source results across parser revisions without display metadata."""
    participants = list(source.get("participants") or [])
    ids_by_name = {}
    for player in participants:
        ids_by_name.setdefault(str(player.get("name")), []).append(str(player.get("sourceId")))
    statistics = ("matchesPlayed", "matchesWon", "legsPlayed", "legsWon", "winRate",
                  "average3Darts", "first9", "bestFinish", "bestLeg", "worstLeg",
                  "scores100", "scores140", "scores170", "scores180")
    players = sorted([
        {"id": str(player.get("sourceId")), "name": player.get("name"),
         **{key: player.get(key) for key in statistics}}
        for player in participants
    ], key=lambda row: row["id"])
    double = any(str(row.get("stage_code", "")).startswith(("winner_", "grand_final_")) for row in source.get("matches") or [])
    matches = []
    for match in source.get("matches") or []:
        stage = str(match.get("stage_code") or "")
        if not double and stage.startswith("loser_"):
            stage = stage.replace("loser_", "secondary_", 1)
        sides = []
        for side in ("home", "away"):
            aliases = ids_by_name.get(str(match.get(side)), [])
            player_id = match.get(f"{side}_source_id") or (aliases[0] if len(aliases) == 1 else f"name:{match.get(side)}")
            sides.append({"id": str(player_id), "score": match.get(f"{side}_score"),
                          "average": match.get(f"{side}_average_3_darts")})
        matches.append({"stage": stage, "mode": match.get("mode"), "sides": sorted(sides, key=lambda row: row["id"]),
                        "complete": bool(match.get("result_complete"))})
    return {"sourceId": source.get("sourceId"), "participants": players,
            "matches": sorted(matches, key=lambda row: (row["stage"], json.dumps(row["sides"], sort_keys=True)))}


def same_source_content(current, baseline):
    if _sporting_core(current) != _sporting_core(baseline):
        return False
    current_players = {str(row.get("sourceId")): row for row in current.get("participants") or []}
    for player in baseline.get("participants") or []:
        other = current_players.get(str(player.get("sourceId")), {})
        if "scores120" in player and "scores120" in other and player["scores120"] != other["scores120"]:
            return False
    # New parser metadata may enrich an old snapshot, but a correction to
    # already validated rules or manual pool ranks requires official review.
    for key in ("poolSettings", "poolParticipants", "sourcePoolStandings", "poolQualifiers"):
        if key in baseline and fingerprint(current.get(key)) != fingerprint(baseline.get(key)):
            return False
    return True


def _needs_source_enrichment(source):
    if not (source or {}).get("matches"):
        return True
    return any(match.get("phase") == "POOL" for match in source["matches"]) and not source.get("poolSettings")


def _cache_source(payload):
    """Recover only public sporting fields from an already validated cache."""
    reverse_fields = {
        "legs_played": "legsPlayed", "legs_won": "legsWon",
        "average_3_darts": "average3Darts", "first_9": "first9",
        "best_finish": "bestFinish", "scores_180": "scores180",
        "scores_170": "scores170", "scores_140": "scores140",
        "scores_120_139": "scores120", "scores_100": "scores100",
        "matches_played": "matchesPlayed", "matches_won": "matchesWon",
        "win_rate": "winRate", "best_leg": "bestLeg", "worst_leg": "worstLeg",
    }
    double = payload.get("discipline") == "DOUBLE"
    participants = []
    match_fields = {
        "id", "match_number", "encounter", "mode", "home", "away", "home_source_id", "away_source_id",
        "home_score", "away_score", "winner", "legs", "unresolved_legs", "result_complete",
        "tracked_teams", "tracked_players", "source_url", "source_tournament_id", "phase", "stage_code",
        "stage_index", "stage_label", "bracket_kind", "bracket_position", "is_decisive",
        "round_robin_first_to", "round_robin_best_of", "round_robin_win_points", "round_robin_draw_points",
        "round_robin_loss_points", "round_robin_include_leg_points", "home_average_3_darts", "away_average_3_darts",
    }
    for row in payload.get("duos" if double else "players") or []:
        canonical = row.get("canonical_player_id") if not double else None
        participant = {
            "sourceId": row.get("nakka_participant_id") or f"cache:{row.get('name')}",
            "name": row.get("name"),
            "identity": {"status": "EXACT" if canonical else "UNRESOLVED", "canonicalPlayerId": canonical,
                         "canonicalName": (payload.get("display_aliases") or {}).get(row.get("name"))},
            **{target: row.get(key) for key, target in reverse_fields.items()},
        }
        participants.append(participant)
    recovered = {
        "_validatedCache": True,
        "sourceId": payload.get("source_tournament_id"), "sourceUrl": payload.get("source_url"),
        "snapshotHash": payload.get("source_snapshot_hash"), "sourceUpdatedAt": payload.get("source_updated_at"),
        "sourceStatus": payload.get("source_status"),
        "title": payload.get("event_name") or payload.get("name"), "date": payload.get("date"),
        "dateLabel": payload.get("date_label"), "season": payload.get("season"),
        "discipline": "DOUBLE" if double else "SINGLE", "participants": participants,
        "matches": [{key: deepcopy(value) for key, value in match.items() if key in match_fields} for match in payload.get("matches") or []],
        "poolSettings": deepcopy(payload.get("pool_settings") or {}),
        "poolParticipants": deepcopy(payload.get("pool_participants") or {}),
        "sourcePoolStandings": deepcopy(payload.get("source_pool_standings") or {}),
        "poolQualifiers": deepcopy(payload.get("pool_qualifiers") or {}),
        "display_aliases": deepcopy(payload.get("display_aliases") or {}),
        "editorial_summary": payload.get("editorial_summary"),
    }
    for key in ("poolSettings", "poolParticipants", "sourcePoolStandings", "poolQualifiers"):
        if not recovered[key]:
            recovered.pop(key)
    return recovered


def records(db):
    if db is None:
        return []
    return _rows(db.table("tournament_pages").select("*"))


def official_events(db):
    if db is None:
        return []
    return [e for e in _rows(db.table("ranking_workflow_events").select("*"))
            if e.get("published_revision_id")]


def linked_event(db, source_id, discipline=None):
    query = db.table("ranking_workflow_events").select("*").eq("source_id", source_id)
    if discipline:
        query = query.eq("discipline", discipline)
    return next(iter(_rows(query.limit(1))), None)


def published_revision(db, event):
    found = _rows(db.table("ranking_workflow_revisions").select("*")
                  .eq("event_id", event["id"]).eq("id", event["published_revision_id"]).limit(1))
    if not found or found[0].get("status") != "PUBLISHED":
        raise ValueError("Aucune version officielle active publiée.")
    return found[0]


def official_payload(db, event, existing=None, *, source=None, display_metadata=None):
    revision = published_revision(db, event)
    snapshot = revision["snapshot"]
    metadata = dict(snapshot.get("metadata") or {})
    for key in ("location", "venue"):
        if not metadata.get(key) and (existing or {}).get(key):
            metadata[key] = existing[key]
    metadata.update({key: value for key, value in (display_metadata or {}).items() if key in {"location", "venue"}})
    official_results = deepcopy(snapshot.get("results") or [])
    identity_ids = list({r["identity_id"] for r in official_results if r.get("identity_id")})
    identities = {str(i["id"]): i for i in _rows(db.table("player_identities")
                  .select("id,canonical_player_id,status").in_("id", identity_ids))} if identity_ids else {}
    for result in official_results:
        identity = identities.get(str(result.get("identity_id"))) or {}
        result["canonical_player_id"] = identity.get("canonical_player_id") if identity.get("status") == "ACTIVE" else None
    metadata.update({
        "results": official_results,
        "classification": "COMMITTEE_RECOGNIZED" if metadata.get("kind", "").startswith("CLUB") else "OFFICIAL",
        "official_event_id": event["id"],
        "discipline": event["discipline"],
        "official_publication": {"event_id": event["id"], "revision_id": revision["id"],
                                 "number": revision["number"], "status": "PUBLISHED"},
    })
    prior = existing or next((t for t in load_tournament_cache().get("tournaments", [])
                              if t.get("source_tournament_id") == event["source_id"] and
                              (t.get("discipline") or "SINGLE") == event["discipline"]), None)
    for key in ("location", "venue"):
        if not metadata.get(key) and (prior or {}).get(key):
            metadata[key] = prior[key]
    code = (prior or {}).get("code") or stable_code(event["source_id"], metadata, event["discipline"])
    source = source or snapshot.get("source") or {
        "sourceId": event["source_id"], "sourceUrl": metadata.get("source_url"),
        "participants": [], "matches": [],
    }
    cache_fallback = bool(source.get("_validatedCache")) or not source.get("matches") and bool((prior or {}).get("matches"))
    if cache_fallback:
        source = _cache_source(prior)
    if source.get("sourceId") != event["source_id"]:
        raise ValueError("La source ne correspond pas à la compétition officielle.")
    payload = _build(source, code, metadata, prior)
    # Preserve historical record eligibility only for an unchanged participant
    # that predates explicit identity-status tracking. New ambiguous identities
    # always keep their status and are excluded from individual attribution.
    for player in payload.get("players") or []:
        legacy = next((row for row in (prior or {}).get("players") or []
                       if row.get("name") == player.get("name") and
                       (not row.get("nakka_participant_id") or row.get("nakka_participant_id") == player.get("nakka_participant_id"))), None)
        if legacy and "identity_status" not in legacy and player.get("identity_status") == "UNRESOLVED":
            player.pop("identity_status", None)
            alias = ((prior or {}).get("display_aliases") or {}).get(player.get("name"))
            if alias:
                payload["display_aliases"][player["name"]] = alias
    if (prior or {}).get("season"):
        # Historical tournament statistics use their original season filter;
        # committee points retain the official season_key separately.
        payload["season"] = str(prior["season"])
    payload.update({
        "source_tournament_id": event["source_id"], "discipline": event["discipline"],
        "classification": metadata["classification"],
        "classification_label": "Open de club reconnu" if metadata["classification"] == "COMMITTEE_RECOGNIZED" else "Compétition officielle du Comité",
        "committee_event_key": event["id"], "ranking_status": "PUBLISHED",
        "official_publication": metadata["official_publication"],
        "affects_committee_ranking": True,
        "affects_official_points": False, "affects_elo": False,
        "href": f"/tournaments/{str(code).lower()}",
    })
    if not source.get("matches"):
        payload.setdefault("data_quality_notes", []).append(
            "Le snapshot publié ne contient pas les rencontres. La reprise Nakka est en attente ; les résultats officiels restent disponibles.")
    elif cache_fallback and (prior or {}).get("official_publication", {}).get("revision_id") == revision["id"]:
        payload["data_quality_notes"] = deepcopy(prior.get("data_quality_notes") or [])
    elif cache_fallback:
        payload.setdefault("data_quality_notes", []).append(
            "Les rencontres et statistiques historiques validées sont conservées depuis le cache de ce tournoi ; les points proviennent de la publication officielle.")
    return payload, revision


def public_pages(db):
    """No network collection on public reads. Published snapshots fill any queue lag."""
    try:
        saved = records(db)
    except Exception:
        saved = []  # Additive migration may not be installed yet; historical cache survives.
    by_source = {(p["source_id"], p["discipline"]): deepcopy(p["payload"]) for p in saved}
    try:
        events = official_events(db)
        linked = _rows(db.table("ranking_workflow_events").select("source_id,discipline")) if db else []
    except Exception:
        events, linked = [], []
    published_keys = {(e["source_id"], e["discipline"]) for e in events}
    for item in linked:
        key = (item["source_id"], item["discipline"])
        if key not in published_keys:
            by_source.pop(key, None)  # A reserved official source is never a friendly duplicate.
    for event in events:
        key = (event["source_id"], event["discipline"])
        prior = by_source.get(key)
        try:
            # Always read published results, even when a newer draft is being reviewed.
            if (prior or {}).get("official_publication", {}).get("revision_id") != event["published_revision_id"]:
                by_source[key] = official_payload(db, event, prior)[0]
        except Exception:
            log.warning("Public tournament projection unavailable: event=%s", event["id"])
            # Retain the last validated page during a temporary backend/source outage.
    return list(by_source.values())


def all_tournaments(db):
    """One logical tournament per source and discipline, including historical URLs."""
    pages = public_pages(db)
    keys = {(p.get("source_tournament_id"), p.get("discipline") or "SINGLE") for p in pages}
    codes = {str(p.get("code", "")).lower() for p in pages}
    try:
        reserved = {(row["source_id"], row["discipline"]) for row in _rows(db.table("ranking_workflow_events").select("source_id,discipline"))} if db else set()
    except Exception:
        reserved = set()
    historical = [p for p in load_tournament_cache().get("tournaments", [])
                  if str(p.get("code", "")).lower() not in codes and
                  (p.get("source_tournament_id"), p.get("discipline") or "SINGLE") not in keys | reserved]
    return pages + historical


def commit_page(db, payload, actor=None, *, event=None, revision=None, expected_hash=None):
    payload = deepcopy(payload)
    payload["code"] = str(payload["code"]).lower()
    payload["href"] = f"/tournaments/{payload['code']}"
    source_id = payload["source_tournament_id"]
    discipline = payload.get("discipline") or "SINGLE"
    digest = fingerprint(payload)
    return db.rpc("tournament_page_commit", {
        "p_source_id": source_id, "p_discipline": discipline,
        "p_code": str(payload["code"]).lower(), "p_payload": payload,
        "p_hash": digest, "p_expected_hash": expected_hash,
        "p_event_id": event["id"] if event else None,
        "p_revision_id": revision["id"] if revision else None,
        "p_actor": actor,
    }).execute().data


def sync_friendly(db, preview, code, actor=None):
    if preview.get("status") == "BLOCKED" or preview.get("blockingReasons"):
        raise ValueError("Source Nakka incomplète : corriger les anomalies avant la publication.")
    discipline = preview.get("discipline") or "SINGLE"
    if linked_event(db, preview["sourceId"], discipline):
        raise ValueError("Cette source est réservée au workflow officiel. Aucune fiche amicale distincte n’est créée.")
    existing = next((row["payload"] for row in records(db) if row["source_id"] == preview["sourceId"] and row["discipline"] == discipline), None)
    if existing:
        def timestamp(value):
            try:
                parsed = float(value)
                return parsed if math.isfinite(parsed) else None
            except (TypeError, ValueError):
                return None
        incoming_time, saved_time = timestamp(preview.get("sourceUpdatedAt")), timestamp(existing.get("source_updated_at"))
        if incoming_time is not None and saved_time is not None and incoming_time < saved_time:
            raise ValueError("Cette analyse Nakka est périmée. Relancer l’analyse avant de publier.")
        if preview.get("imported") and preview.get("snapshotHash") != existing.get("source_snapshot_hash"):
            raise ValueError("La fiche a été actualisée depuis cet import. Relancer l’analyse pour éviter de rétablir une ancienne version.")
    historical = next((row for row in load_tournament_cache().get("tournaments") or []
                       if row.get("source_tournament_id") == preview["sourceId"] and (row.get("discipline") or "SINGLE") == discipline), None)
    prior = existing or historical or {}
    classification = prior.get("classification") or tournament_classification(prior.get("code") or code)["classification"]
    if classification != "FRIENDLY":
        raise ValueError("Ce tournoi reconnu doit être rattaché au workflow officiel avant toute actualisation.")
    existing = existing or historical
    payload = _build(preview, (existing or {}).get("code") or code, {"discipline": discipline}, existing)
    payload.update(classification="FRIENDLY", classification_label="Tournoi amical",
                   affects_committee_ranking=False, affects_official_points=False,
                   affects_elo=False, href=f"/tournaments/{str(payload['code']).lower()}")
    return commit_page(db, payload, actor)


def sync_official(db, event_id, *, collect_missing=False, actor=None, display_metadata=None):
    found = _rows(db.table("ranking_workflow_events").select("*").eq("id", event_id).limit(1))
    if not found or not found[0].get("published_revision_id"):
        raise ValueError("Compétition officielle non publiée.")
    event = found[0]
    existing = next((p["payload"] for p in records(db)
                     if p["source_id"] == event["source_id"] and p["discipline"] == event["discipline"]), None)
    if not existing:
        existing = next((row for row in load_tournament_cache().get("tournaments") or []
                         if row.get("source_tournament_id") == event["source_id"] and
                         (row.get("discipline") or "SINGLE") == event["discipline"]), None)
    revision = published_revision(db, event)
    source = revision["snapshot"].get("source")
    legacy_without_refs = not all(row.get("source_ref") for row in revision["snapshot"].get("results") or [])
    legacy_cache_fallback = not (source or {}).get("matches") and bool((existing or {}).get("matches")) and legacy_without_refs
    if legacy_cache_fallback:
        # Historical official migrations stored points without source refs.
        # Their validated detailed page is the safe baseline, including when
        # Nakka is unavailable; no identity/placing association is guessed.
        source = _cache_source(existing)
    existing_pools = (existing or {}).get("round_robin") or []
    has_pools = any(match.get("phase") == "POOL" for match in (existing or {}).get("matches") or [])
    pool_metadata_saved = bool((existing or {}).get("pool_settings")) or bool(existing_pools) and all(pool.get("ranking_confirmed") for pool in existing_pools)
    already_enriched = (existing or {}).get("official_publication", {}).get("revision_id") == revision["id"] and bool((existing or {}).get("matches")) and (not has_pools or pool_metadata_saved)
    legacy_collection_failed = False
    if collect_missing and legacy_cache_fallback and not already_enriched:
        from app.services.ranking_nakka import collect_private
        try:
            collected = collect_private(revision["snapshot"]["metadata"]["source_url"], int(event["season_key"][:4]))
        except Exception:
            legacy_collection_failed = True
            log.warning("Historical tournament source unavailable; validated cache retained: event=%s", event["id"])
        else:
            if collected.get("blockingReasons") or not same_source_content(collected, source):
                raise ValueError("La source Nakka diffère de la fiche historique validée : validation officielle nécessaire.")
            source = collected
    if collect_missing and _needs_source_enrichment(source) and not already_enriched and not legacy_cache_fallback:
        from app.services.ranking_nakka import collect_private
        collected = collect_private(revision["snapshot"]["metadata"]["source_url"], int(event["season_key"][:4]))
        _validate_source_against_official(collected, revision["snapshot"])
        if source and source.get("matches") and not same_source_content(collected, source):
            raise ValueError("La source Nakka diffère des résultats publiés : validation officielle nécessaire.")
        source = collected
    elif already_enriched and _needs_source_enrichment(source):
        source = _cache_source(existing)
    payload, revision = official_payload(db, event, existing, source=source, display_metadata=display_metadata)
    if legacy_collection_failed:
        note = "Nakka est temporairement indisponible. Les rencontres et statistiques historiques validées restent visibles ; les métadonnées de poules manquantes seront vérifiées lors d’une nouvelle actualisation."
        if note not in payload.setdefault("data_quality_notes", []):
            payload["data_quality_notes"].append(note)
    return commit_page(db, payload, actor, event=event, revision=revision)


def _validate_source_against_official(source, snapshot):
    """A legacy snapshot can be enriched only when participants and podium agree."""
    if source.get("blockingReasons"):
        raise ValueError("Source Nakka incomplète : validation officielle nécessaire.")
    results = snapshot.get("results") or []
    names = {str(p.get("name", "")).strip().casefold() for p in source.get("participants", [])}
    source_names = {str(r.get("source_name") or r.get("player_name") or "").strip().casefold() for r in results}
    source_ids = {str(p.get("sourceId") or "") for p in source.get("participants", [])}
    result_ids = {str(row.get("source_ref") or "").rsplit(":", 1)[0] for row in results}
    if not names or names != source_names or source_ids != result_ids:
        raise ValueError("Participants différents de la publication officielle : contrôler dans le workflow officiel.")
    payload = _build(source, "validation", snapshot.get("metadata"))
    double = (snapshot.get("metadata") or {}).get("kind") == "CLUB_DOUBLE"
    for placement, key in (("WINNER", "winner"), ("RUNNER_UP", "runner_up")):
        expected = [r for r in results if r.get("placement") == placement]
        expected_names = {str(row.get("source_name") or row.get("player_name") or "").strip().casefold() for row in expected}
        if len(expected) != (2 if double else 1) or len(expected_names) != 1 or str(payload.get(key) or "").strip().casefold() not in expected_names | {str(row.get("player_name") or "").strip().casefold() for row in expected}:
            raise ValueError("Palmarès Nakka différent ou ambigu : validation officielle nécessaire.")


def page_status(db, event):
    if not event.get("published_revision_id"):
        return None
    try:
        existing = next((row["payload"] for row in records(db)
                         if row["source_id"] == event["source_id"] and row["discipline"] == event["discipline"]), None)
        payload, _ = official_payload(db, event, existing)
        return {"code": payload["code"], "href": payload["href"], "status": "AVAILABLE"}
    except Exception:
        return {"code": None, "href": None, "status": "PENDING"}


def preview_refresh(db, code, actor):
    saved = next((p for p in records(db) if p["code"].lower() == code.lower()), None)
    public = next((p for p in public_pages(db) if str(p.get("code", "")).lower() == code.lower()), None)
    if not saved and not public:
        historical = next((p for p in load_tournament_cache().get("tournaments", [])
                           if str(p.get("code", "")).lower() == code.lower()), None)
        public = historical
    if not saved and not public:
        raise ValueError("Fiche introuvable.")
    before = public or saved["payload"]
    source_id = before["source_tournament_id"]
    event = linked_event(db, source_id, before.get("discipline") or "SINGLE")
    classification = before.get("classification") or tournament_classification(before["code"])["classification"]
    if not event and classification != "FRIENDLY":
        raise ValueError("Ce tournoi reconnu doit être rattaché au workflow officiel avant toute actualisation.")
    from app.services.ranking_nakka import collect_private
    source = collect_private(before.get("source_url") or f"https://n01darts.com/n01/tournament/comp.php?id={source_id}",
                             int(str(before.get("season") or "2026")[:4]))
    warnings = list(source.get("blockingReasons") or [])
    can_apply = not warnings
    revision = None
    if event:
        if not event.get("published_revision_id"):
            raise ValueError("Cette compétition officielle n’est pas publiée.")
        revision = published_revision(db, event)
        official_source = revision["snapshot"].get("source")
        if official_source and official_source.get("matches") and not same_source_content(source, official_source):
            can_apply = False
            warnings.append("La source a changé depuis la publication officielle. Analyser et valider cette correction dans le workflow officiel avant d’actualiser la fiche.")
        elif not official_source or not official_source.get("matches"):
            try:
                legacy_without_refs = not all(row.get("source_ref") for row in revision["snapshot"].get("results") or [])
                if legacy_without_refs and before.get("matches"):
                    if not same_source_content(source, _cache_source(before)):
                        raise ValueError("La source Nakka diffère de la fiche historique validée : validation officielle nécessaire.")
                else:
                    _validate_source_against_official(source, revision["snapshot"])
            except ValueError as exc:
                can_apply = False
                warnings.append(str(exc))
        candidate, _ = official_payload(db, event, before, source=source)
    else:
        candidate = _build(source, before["code"], {"discipline": before.get("discipline") or "SINGLE"}, before)
    changes = [{"field": key, "before": before.get(key), "after": candidate.get(key)}
               for key in ("event_name", "date", "format", "winner", "runner_up", "summary", "matches", "players", "duos")
               if before.get(key) != candidate.get(key)]
    preview_id = str(uuid4())
    db.table("tournament_page_previews").insert({
        "id": preview_id, "source_id": source_id, "discipline": before.get("discipline") or "SINGLE",
        "actor_id": actor, "code": str(before["code"]).lower(), "payload": candidate,
        "baseline_hash": saved["source_hash"] if saved else None,
        "official_revision_id": revision["id"] if revision else None, "can_apply": can_apply,
    }).execute()
    return {"preview_id": preview_id, "changes": changes, "warnings": warnings,
            "can_apply": can_apply, "source_revision": source.get("sourceUpdatedAt"),
            "public_url": f"/tournaments/{str(before['code']).lower()}"}


def apply_refresh(db, preview_id, actor, confirmed=False, *, code=None):
    if not confirmed:
        raise ValueError("Confirmer la mise à jour de la fiche.")
    previews = _rows(db.table("tournament_page_previews").select("*").eq("id", preview_id)
                     .eq("actor_id", actor).limit(1))
    if not previews or not previews[0]["can_apply"]:
        raise ValueError("Aperçu absent ou correction officielle non validée.")
    preview = previews[0]
    if code and preview["code"].lower() != code.lower():
        raise ValueError("Cet aperçu appartient à une autre fiche.")
    created = datetime.fromisoformat(preview["created_at"].replace("Z", "+00:00"))
    if (datetime.now(timezone.utc) - created).total_seconds() > 3600:
        raise ValueError("Aperçu expiré. Relancer l’analyse.")
    event = linked_event(db, preview["source_id"], preview["discipline"])
    revision = None
    if event:
        if event.get("published_revision_id") != preview.get("official_revision_id"):
            raise ValueError("La publication officielle a changé. Recharger l’aperçu.")
        revision = published_revision(db, event)
    elif preview.get("official_revision_id"):
        raise ValueError("Association officielle modifiée.")
    return commit_page(db, preview["payload"], actor, event=event, revision=revision,
                       expected_hash=preview.get("baseline_hash") or "ABSENT")


def process_page_job(db):
    job = db.rpc("tournament_page_claim", {}).execute().data
    if not job:
        return
    try:
        sync_official(db, job["event_id"], collect_missing=True)
        update = {"state": "SUCCEEDED", "error": None}
    except Exception:
        update = {"state": "FAILED" if job["attempts"] >= 5 else "QUEUED",
                  "error": "Fiche non actualisée. Vérifier la source et relancer la reprise."}
        log.warning("Tournament projection failed: event=%s", job["event_id"])
    db.table("tournament_page_jobs").update(update).eq("id", job["id"]).eq("lease_id", job["lease_id"]).execute()
