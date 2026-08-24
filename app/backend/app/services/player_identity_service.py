from __future__ import annotations

from collections import defaultdict
from datetime import date
from datetime import datetime, timezone
from difflib import SequenceMatcher
import json
from pathlib import Path
import re
from threading import Lock
import unicodedata
from typing import Any

from supabase import Client


_PAIR_DECISIONS_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "identity_pair_decisions.json"
)
_PAIR_DECISIONS_LOCK = Lock()


def _identity_pair_key(left_player_id: str, right_player_id: str) -> str:
    return "::".join(sorted((str(left_player_id), str(right_player_id))))


def _read_identity_pair_decisions() -> dict[str, dict[str, Any]]:
    if not _PAIR_DECISIONS_PATH.exists():
        return {}
    try:
        payload = json.loads(_PAIR_DECISIONS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        str(key): value
        for key, value in payload.items()
        if isinstance(value, dict) and value.get("decision") == "DISTINCT"
    }


def _write_identity_pair_decisions(
    decisions: dict[str, dict[str, Any]],
) -> None:
    _PAIR_DECISIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = _PAIR_DECISIONS_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(decisions, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    temporary_path.replace(_PAIR_DECISIONS_PATH)


def normalize_alias(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", (value or "").strip().lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", text)



TEAM_NOISE_TOKENS = {
    "pdc", "club", "darts", "dart", "fournaise", "neige", "kazadarts",
    "3bdc", "team", "equipe", "équipe", "974", "tdc", "tampon",
    "papangue", "brasseurs", "saint", "pierre", "st", "leu"
}


def identity_name_tokens(value: str | None) -> list[str]:
    text = unicodedata.normalize("NFKD", (value or "").strip().lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    tokens = re.findall(r"[a-z0-9]+", text)
    return [token for token in tokens if token not in TEAM_NOISE_TOKENS]


def identity_base_name(value: str | None) -> str:
    tokens = identity_name_tokens(value)
    return "".join(tokens) or normalize_alias(value)


def identity_similarity(left: str | None, right: str | None) -> dict[str, Any]:
    left_normalized = normalize_alias(left)
    right_normalized = normalize_alias(right)
    left_base = identity_base_name(left)
    right_base = identity_base_name(right)

    exact_normalized = left_normalized == right_normalized and bool(left_normalized)
    exact_base = left_base == right_base and bool(left_base)
    contains_base = (
        bool(left_base and right_base)
        and (left_base in right_base or right_base in left_base)
    )
    ratio = SequenceMatcher(None, left_base, right_base).ratio() if left_base and right_base else 0.0

    score = 0
    reasons: list[str] = []
    if exact_normalized:
        score = 100
        reasons.append("Nom normalisé identique")
    elif exact_base:
        score = 98
        reasons.append("Nom principal identique après retrait des mentions d’équipe")
    else:
        if contains_base:
            score += 68
            reasons.append("Un nom principal contient l’autre")
        score += int(round(ratio * 32))
        if ratio >= 0.80:
            reasons.append("Forte similarité orthographique")
        elif ratio >= 0.65:
            reasons.append("Similarité orthographique modérée")

    score = min(100, max(0, score))
    if score >= 95:
        level = "very_high"
        label = "Fusion très probable"
    elif score >= 82:
        level = "high"
        label = "Fusion probable"
    elif score >= 68:
        level = "review"
        label = "Vérification recommandée"
    else:
        level = "low"
        label = "Similarité faible"

    return {
        "score": score,
        "level": level,
        "label": label,
        "reasons": reasons,
        "left_base": left_base,
        "right_base": right_base,
    }


def _rows(response: Any) -> list[dict[str, Any]]:
    return list(getattr(response, "data", None) or [])


class IdentityConflictError(ValueError):
    pass


class PlayerIdentityService:
    def __init__(self, db: Client):
        self.db = db

    def _identity_by_canonical(self, player_id: str) -> dict[str, Any] | None:
        response = (
            self.db.table("player_identities")
            .select(
                "id,canonical_player_id,canonical_display_name,notes,status,"
                "merged_into_identity_id,merged_at"
            )
            .eq("canonical_player_id", player_id)
            .limit(1)
            .execute()
        )
        rows = _rows(response)
        return rows[0] if rows else None

    def _identity_by_source_player(self, player_id: str) -> dict[str, Any] | None:
        alias_response = (
            self.db.table("player_aliases")
            .select("identity_id")
            .eq("source_player_id", player_id)
            .eq("confirmed", True)
            .limit(1)
            .execute()
        )
        alias_rows = _rows(alias_response)
        if not alias_rows:
            return None
        response = (
            self.db.table("player_identities")
            .select(
                "id,canonical_player_id,canonical_display_name,notes,status,"
                "merged_into_identity_id,merged_at"
            )
            .eq("id", alias_rows[0]["identity_id"])
            .limit(1)
            .execute()
        )
        rows = _rows(response)
        return rows[0] if rows else None

    def _identity_by_id(self, identity_id: str) -> dict[str, Any] | None:
        response = (
            self.db.table("player_identities")
            .select(
                "id,canonical_player_id,canonical_display_name,notes,status,"
                "merged_into_identity_id,merged_at"
            )
            .eq("id", identity_id)
            .limit(1)
            .execute()
        )
        rows = _rows(response)
        return rows[0] if rows else None

    def resolve_identity(self, player_id: str) -> dict[str, Any] | None:
        identity = (
            self._identity_by_canonical(player_id)
            or self._identity_by_source_player(player_id)
        )
        visited: set[str] = set()

        while (
            identity
            and identity.get("status") == "MERGED"
            and identity.get("merged_into_identity_id")
        ):
            identity_id = str(identity.get("id"))
            if identity_id in visited:
                raise IdentityConflictError("Circular merged identity reference")
            visited.add(identity_id)
            identity = self._identity_by_id(
                str(identity["merged_into_identity_id"])
            )

        return identity

    def ensure_identity(self, player_id: str) -> dict[str, Any]:
        existing = self.resolve_identity(player_id)
        if existing:
            return existing

        player_rows = _rows(
            self.db.table("players")
            .select("id,display_name,team_id")
            .eq("id", player_id)
            .limit(1)
            .execute()
        )
        if not player_rows:
            raise ValueError("Player not found")

        player = player_rows[0]
        created = _rows(
            self.db.table("player_identities")
            .insert({
                "canonical_player_id": player["id"],
                "canonical_display_name": player["display_name"],
            })
            .execute()
        )[0]

        self.db.table("player_aliases").insert({
            "identity_id": created["id"],
            "source_player_id": player["id"],
            "alias_name": player["display_name"],
            "source": "MANUAL",
            "confirmed": True,
        }).execute()

        if player.get("team_id"):
            self.db.table("player_team_memberships").insert({
                "identity_id": created["id"],
                "team_id": player["team_id"],
                "is_current": True,
                "source": "MANUAL",
            }).execute()
        return created

    def profile(self, player_id: str) -> dict[str, Any] | None:
        identity = self.resolve_identity(player_id)
        if not identity:
            return None

        identity["is_active"] = identity.get("status") == "ACTIVE"

        aliases = _rows(
            self.db.table("player_aliases")
            .select("id,source_player_id,alias_name,normalized_alias,source,confirmed,created_at")
            .eq("identity_id", identity["id"])
            .order("created_at")
            .execute()
        )
        memberships = _rows(
            self.db.table("player_team_memberships")
            .select("id,team_id,season_id,valid_from,valid_to,is_current,source,notes,created_at")
            .eq("identity_id", identity["id"])
            .order("valid_from")
            .execute()
        )

        team_ids = list({str(row["team_id"]) for row in memberships if row.get("team_id")})
        season_ids = list({str(row["season_id"]) for row in memberships if row.get("season_id")})

        teams = {}
        if team_ids:
            for row in _rows(self.db.table("teams").select("id,name,club_id").in_("id", team_ids).execute()):
                teams[str(row["id"])] = row

        seasons = {}
        if season_ids:
            for row in _rows(self.db.table("seasons").select("id,name,is_active").in_("id", season_ids).execute()):
                seasons[str(row["id"])] = row

        history = []
        for row in memberships:
            team = teams.get(str(row.get("team_id")))
            season = seasons.get(str(row.get("season_id")))
            history.append({
                **row,
                "team": team.get("name") if team else None,
                "club_id": team.get("club_id") if team else None,
                "season": season.get("name") if season else None,
            })

        return {
            "identity": identity,
            "aliases": aliases,
            "memberships": history,
            "meta": {
                "contract_version": "7.5",
                "canonical_player_id": identity["canonical_player_id"],
                "alias_count": len(aliases),
                "membership_count": len(history),
                "non_destructive": True,
            },
        }

    def merge_preview(self, canonical_player_id: str, source_player_ids: list[str]) -> dict[str, Any]:
        canonical = self.ensure_identity(canonical_player_id)
        source_players = _rows(
            self.db.table("players")
            .select("id,display_name,team_id")
            .in_("id", source_player_ids)
            .execute()
        )
        return {
            "canonical": canonical,
            "sources": [
                {
                    **player,
                    "normalized_alias": normalize_alias(player.get("display_name")),
                    "already_linked": self.resolve_identity(str(player["id"])) is not None,
                }
                for player in source_players
                if str(player["id"]) != canonical_player_id
            ],
            "effects": {
                "statistics_rewritten": False,
                "players_deleted": False,
                "alias_mappings_created": True,
                "canonical_resolution_enabled": True,
            },
        }

    def merge_aliases(
        self,
        canonical_player_id: str,
        source_player_ids: list[str],
        alias_names: list[str],
        notes: str | None = None,
    ) -> dict[str, Any]:
        canonical = self.ensure_identity(canonical_player_id)
        identity_id = canonical["id"]

        source_players = _rows(
            self.db.table("players")
            .select("id,display_name")
            .in_("id", source_player_ids)
            .execute()
        )

        for source_player_id in source_player_ids:
            resolved = self.resolve_identity(str(source_player_id))
            if resolved and str(resolved.get("id")) != str(identity_id):
                raise IdentityConflictError(
                    f"Player {source_player_id} is already linked to another canonical identity"
                )

        inserted = []
        candidates = [
            {
                "source_player_id": player["id"],
                "alias_name": player["display_name"],
                "source": "ADMIN_MERGE",
            }
            for player in source_players
            if str(player["id"]) != canonical_player_id
        ] + [
            {
                "source_player_id": None,
                "alias_name": alias,
                "source": "ADMIN_MERGE",
            }
            for alias in alias_names
            if alias.strip()
        ]

        for candidate in candidates:
            normalized = normalize_alias(candidate["alias_name"])
            if not normalized:
                continue
            existing = _rows(
                self.db.table("player_aliases")
                .select("id")
                .eq("identity_id", identity_id)
                .eq("normalized_alias", normalized)
                .limit(1)
                .execute()
            )
            if existing:
                continue
            rows = _rows(
                self.db.table("player_aliases")
                .insert({
                    "identity_id": identity_id,
                    "source_player_id": candidate["source_player_id"],
                    "alias_name": candidate["alias_name"],
                    "source": candidate["source"],
                    "confirmed": True,
                })
                .execute()
            )
            inserted.extend(rows)

        self.db.table("player_identity_events").insert({
            "identity_id": identity_id,
            "event_type": "ALIAS_LINKED",
            "payload": {
                "source_player_ids": source_player_ids,
                "alias_names": alias_names,
                "notes": notes,
            },
        }).execute()

        return {
            "identity": canonical,
            "inserted_aliases": inserted,
            "meta": {
                "contract_version": "7.5",
                "statistics_rewritten": False,
                "players_deleted": False,
            },
        }

    def identity_hub_list(self, query: str | None = None, status: str | None = "ACTIVE") -> dict[str, Any]:
        identities = _rows(self.db.table("player_identities").select("id,canonical_player_id,canonical_display_name,notes,status,created_at,updated_at,merged_into_identity_id,merged_at").order("canonical_display_name").execute())
        if status:
            identities = [row for row in identities if row.get("status") == status]
        normalized_query = normalize_alias(query)
        identity_ids = [str(row["id"]) for row in identities]
        aliases_by_identity: dict[str, list[dict[str, Any]]] = defaultdict(list)
        memberships_by_identity: dict[str, list[dict[str, Any]]] = defaultdict(list)
        if identity_ids:
            for row in _rows(self.db.table("player_aliases").select("id,identity_id,source_player_id,alias_name,normalized_alias,source,confidence,confirmed,created_at").in_("identity_id", identity_ids).execute()):
                aliases_by_identity[str(row["identity_id"])].append(row)
            for row in _rows(self.db.table("player_team_memberships").select("id,identity_id,team_id,season_id,valid_from,valid_to,is_current,source,notes,created_at,updated_at").in_("identity_id", identity_ids).execute()):
                memberships_by_identity[str(row["identity_id"])].append(row)
        items=[]
        for identity in identities:
            iid=str(identity["id"]); aliases=aliases_by_identity.get(iid,[]); memberships=memberships_by_identity.get(iid,[])
            haystack=' '.join([str(identity.get("canonical_display_name") or ""), *[str(a.get("alias_name") or "") for a in aliases]])
            if normalized_query and normalized_query not in normalize_alias(haystack): continue
            items.append({"identity":identity,"aliases":aliases,"memberships":memberships,"summary":{"alias_count":len(aliases),"team_count":len({str(m.get("team_id")) for m in memberships if m.get("team_id")}),"season_count":len({str(m.get("season_id")) for m in memberships if m.get("season_id")}),"current_team_id":next((m.get("team_id") for m in memberships if m.get("is_current")),None)}})
        return {"items":items,"meta":{"contract_version":"7.6","count":len(items),"query":query,"status":status}}

    def identity_hub_detail(self, identity_id: str) -> dict[str, Any] | None:
        rows=_rows(self.db.table("player_identities").select("id,canonical_player_id,canonical_display_name,notes,status,created_at,updated_at,merged_into_identity_id,merged_at").eq("id",identity_id).limit(1).execute())
        if not rows: return None
        identity=rows[0]
        aliases=_rows(self.db.table("player_aliases").select("id,source_player_id,alias_name,normalized_alias,source,confidence,confirmed,created_at").eq("identity_id",identity_id).order("created_at").execute())
        memberships=_rows(self.db.table("player_team_memberships").select("id,team_id,season_id,valid_from,valid_to,is_current,source,notes,created_at,updated_at").eq("identity_id",identity_id).order("valid_from").execute())
        events=_rows(self.db.table("player_identity_events").select("id,event_type,actor_id,payload,created_at").eq("identity_id",identity_id).order("created_at",desc=True).execute())
        merges=_rows(self.db.table("player_identity_merge_history").select("*").or_(f"kept_identity_id.eq.{identity_id},merged_identity_id.eq.{identity_id}").order("created_at",desc=True).execute())
        team_ids=list({str(m["team_id"]) for m in memberships if m.get("team_id")}); season_ids=list({str(m["season_id"]) for m in memberships if m.get("season_id")})
        teams={}; seasons={}
        if team_ids: teams={str(r["id"]):r for r in _rows(self.db.table("teams").select("id,name,club_id").in_("id",team_ids).execute())}
        if season_ids: seasons={str(r["id"]):r for r in _rows(self.db.table("seasons").select("id,name,is_active").in_("id",season_ids).execute())}
        source_ids=sorted({str(a["source_player_id"]) for a in aliases if a.get("source_player_id")} | {str(identity["canonical_player_id"])})
        stats=_rows(self.db.table("player_leg_stats").select("player_id,team_id,leg_id,average_3_darts,finish,leg_won,created_at").in_("player_id",source_ids).execute()) if source_ids else []
        timeline=[{"type":"IDENTITY_CREATED","date":identity.get("created_at"),"title":"Identité créée","detail":identity.get("canonical_display_name")}]
        timeline += [{"type":"ALIAS_LINKED","date":a.get("created_at"),"title":"Alias ajouté","detail":a.get("alias_name")} for a in aliases]
        timeline += [{"type":"MEMBERSHIP_ADDED","date":m.get("valid_from") or m.get("created_at"),"title":"Équipe ajoutée","detail":((teams.get(str(m.get("team_id"))) or {}).get("name"))} for m in memberships]
        timeline += [{"type":e.get("event_type"),"date":e.get("created_at"),"title":e.get("event_type"),"detail":e.get("payload")} for e in events]
        timeline.sort(key=lambda x:str(x.get("date") or ""),reverse=True)
        dated=[s for s in stats if s.get("created_at")]
        return {"identity":identity,"aliases":aliases,"memberships":[{**m,"team":teams.get(str(m.get("team_id"))),"season":seasons.get(str(m.get("season_id")))} for m in memberships],"events":events,"merge_history":merges,"timeline":timeline,"career_overview":{"legs_total":len(stats),"legs_won":sum(1 for s in stats if bool(s.get("leg_won"))),"team_count":len(team_ids),"season_count":len(season_ids),"alias_count":len(aliases),"source_player_id_count":len(source_ids),"first_appearance":min((s["created_at"] for s in dated),default=None),"last_appearance":max((s["created_at"] for s in dated),default=None)},"meta":{"contract_version":"7.6","non_destructive":True}}

    def identity_quality_dashboard(self) -> dict[str, Any]:
        identities=_rows(self.db.table("player_identities").select("id,status,created_at,merged_at").execute())
        aliases=_rows(self.db.table("player_aliases").select("id,confidence,confirmed,created_at").execute())
        merges=_rows(self.db.table("player_identity_merge_history").select("id,created_at").order("created_at",desc=True).execute())
        confirmed=[a for a in aliases if a.get("confirmed")]
        avg=round(sum(float(a.get("confidence") or 0) for a in confirmed)/len(confirmed),1) if confirmed else 0.0
        return {"kpis":{"identities_total":len(identities),"identities_active":sum(1 for i in identities if i.get("status")=="ACTIVE"),"identities_merged":sum(1 for i in identities if i.get("status")=="MERGED"),"aliases_total":len(aliases),"aliases_confirmed":len(confirmed),"merges_total":len(merges),"average_alias_confidence":avg,"last_merge_at":merges[0].get("created_at") if merges else None},"meta":{"contract_version":"7.6","scope":"identity_data_quality"}}

    def canonical_merge_preview(
        self,
        keep_player_id: str,
        merge_player_id: str,
    ) -> dict[str, Any]:
        keep_identity = self.resolve_identity(keep_player_id)
        merge_identity = self.resolve_identity(merge_player_id)

        if not keep_identity or not merge_identity:
            raise ValueError("Identity not found")

        if str(keep_identity["id"]) == str(merge_identity["id"]):
            return {
                "already_same_identity": True,
                "keep_identity": keep_identity,
                "merge_identity": merge_identity,
                "impact": {
                    "aliases_after_merge": 0,
                    "aliases_moved": 0,
                    "duplicate_aliases_removed": 0,
                    "memberships_after_merge": 0,
                    "memberships_moved": 0,
                    "source_player_ids_after_merge": 0,
                    "legs_compiled_after_merge": 0,
                },
                "non_destructive": True,
                "statistics_rewritten": False,
            }

        response = self.db.rpc(
            "preview_player_identity_merge",
            {
                "p_keep_identity_id": keep_identity["id"],
                "p_merge_identity_id": merge_identity["id"],
            },
        ).execute()
        payload = getattr(response, "data", None)
        if not payload:
            raise ValueError("Merge preview unavailable")
        payload["already_same_identity"] = False
        return payload

    def merge_canonical_identities(
        self,
        keep_player_id: str,
        merge_player_id: str,
        actor_id: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        preview = self.canonical_merge_preview(keep_player_id, merge_player_id)
        if preview.get("already_same_identity"):
            return {
                "already_same_identity": True,
                "message": "Players already resolve to the same identity",
                "preview": preview,
            }

        keep_identity_id = preview["keep_identity"]["identity_id"]
        merge_identity_id = preview["merge_identity"]["identity_id"]

        response = self.db.rpc(
            "merge_player_identities",
            {
                "p_keep_identity_id": keep_identity_id,
                "p_merge_identity_id": merge_identity_id,
                "p_actor_id": actor_id,
                "p_notes": notes,
            },
        ).execute()
        payload = getattr(response, "data", None)
        if not payload:
            raise ValueError("Canonical identity merge failed")

        return {
            "merge": payload,
            "preview": preview,
            "meta": {
                "contract_version": "7.5.2",
                "transactional": True,
                "non_destructive": True,
                "statistics_rewritten": False,
                "players_deleted": False,
            },
        }

    def identity_suggestions(
        self,
        query: str | None = None,
        minimum_score: int = 68,
    ) -> dict[str, Any]:
        players = _rows(
            self.db.table("players")
            .select("id,display_name,team_id")
            .order("display_name")
            .execute()
        )

        identity_rows = _rows(
            self.db.table("player_identities")
            .select(
                "id,canonical_player_id,status,merged_into_identity_id"
            )
            .execute()
        )
        merged_player_ids = {
            str(row["canonical_player_id"])
            for row in identity_rows
            if row.get("canonical_player_id")
            and row.get("status") == "MERGED"
        }
        players = [
            row
            for row in players
            if str(row.get("id")) not in merged_player_ids
        ]

        team_ids = list({str(row["team_id"]) for row in players if row.get("team_id")})
        teams: dict[str, str] = {}
        if team_ids:
            team_rows = _rows(
                self.db.table("teams").select("id,name").in_("id", team_ids).execute()
            )
            teams = {str(row["id"]): str(row.get("name") or "") for row in team_rows}

        normalized_query = normalize_alias(query)
        suggestions: list[dict[str, Any]] = []
        rejected_pairs = _read_identity_pair_decisions()

        for index, left in enumerate(players):
            left_name = str(left.get("display_name") or "")
            if normalized_query and normalized_query not in normalize_alias(left_name):
                continue

            for right in players[index + 1:]:
                pair_key = _identity_pair_key(
                    str(left["id"]),
                    str(right["id"]),
                )
                if pair_key in rejected_pairs:
                    continue
                right_name = str(right.get("display_name") or "")
                analysis = identity_similarity(left_name, right_name)
                if analysis["score"] < minimum_score:
                    continue

                left_identity = self.resolve_identity(str(left["id"]))
                right_identity = self.resolve_identity(str(right["id"]))
                same_identity = (
                    left_identity is not None
                    and right_identity is not None
                    and str(left_identity.get("id")) == str(right_identity.get("id"))
                )

                suggestions.append({
                    "suggestion_id": f"{left['id']}::{right['id']}",
                    "left": {
                        "player_id": left["id"],
                        "display_name": left_name,
                        "team_id": left.get("team_id"),
                        "team": teams.get(str(left.get("team_id"))),
                        "identity_id": left_identity.get("id") if left_identity else None,
                    },
                    "right": {
                        "player_id": right["id"],
                        "display_name": right_name,
                        "team_id": right.get("team_id"),
                        "team": teams.get(str(right.get("team_id"))),
                        "identity_id": right_identity.get("id") if right_identity else None,
                    },
                    "score": analysis["score"],
                    "level": analysis["level"],
                    "label": analysis["label"],
                    "reasons": analysis["reasons"],
                    "already_same_identity": same_identity,
                    "requires_admin_confirmation": True,
                })

        suggestions.sort(
            key=lambda item: (
                item["already_same_identity"],
                -int(item["score"]),
                str(item["left"]["display_name"]).lower(),
            )
        )

        return {
            "suggestions": suggestions,
            "meta": {
                "contract_version": "7.5.1",
                "engine_type": "deterministic_identity_assistant",
                "automatic_merge": False,
                "requires_admin_confirmation": True,
                "minimum_score": minimum_score,
                "merged_players_excluded": len(merged_player_ids),
                "rejected_pairs_excluded": len(rejected_pairs),
                "no_invented_identity": True,
            },
        }

    def reject_identity_pair(
        self,
        left_player_id: str,
        right_player_id: str,
        actor_id: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        if str(left_player_id) == str(right_player_id):
            raise ValueError("The two players must be different")

        player_ids = {str(left_player_id), str(right_player_id)}
        players = _rows(
            self.db.table("players")
            .select("id,display_name,team_id")
            .in_("id", list(player_ids))
            .execute()
        )
        if {str(row.get("id")) for row in players} != player_ids:
            raise ValueError("Player not found")

        players_by_id = {
            str(row["id"]): row
            for row in players
        }
        key = _identity_pair_key(left_player_id, right_player_id)
        decision = {
            "decision": "DISTINCT",
            "left_player_id": str(left_player_id),
            "right_player_id": str(right_player_id),
            "left_display_name": players_by_id[str(left_player_id)].get(
                "display_name"
            ),
            "right_display_name": players_by_id[str(right_player_id)].get(
                "display_name"
            ),
            "left_team_id": players_by_id[str(left_player_id)].get("team_id"),
            "right_team_id": players_by_id[str(right_player_id)].get("team_id"),
            "actor_id": actor_id,
            "notes": notes,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        with _PAIR_DECISIONS_LOCK:
            decisions = _read_identity_pair_decisions()
            decisions[key] = decision
            _write_identity_pair_decisions(decisions)

        return {
            "saved": True,
            "pair_key": key,
            "decision": decision,
            "meta": {
                "contract_version": "12.6",
                "persistent": True,
                "statistics_rewritten": False,
                "players_modified": False,
            },
        }

    def identity_pair_rejections(self) -> dict[str, Any]:
        decisions = _read_identity_pair_decisions()
        return {
            "items": list(decisions.values()),
            "meta": {
                "contract_version": "12.6",
                "count": len(decisions),
                "persistent": True,
            },
        }

    def restore_identity_pair(
        self,
        left_player_id: str,
        right_player_id: str,
    ) -> dict[str, Any]:
        key = _identity_pair_key(left_player_id, right_player_id)
        with _PAIR_DECISIONS_LOCK:
            decisions = _read_identity_pair_decisions()
            restored = decisions.pop(key, None) is not None
            _write_identity_pair_decisions(decisions)
        return {
            "restored": restored,
            "pair_key": key,
            "meta": {
                "contract_version": "12.6",
                "statistics_rewritten": False,
                "players_modified": False,
            },
        }

    def apply_suggestion(
        self,
        canonical_player_id: str,
        source_player_id: str,
        notes: str | None = None,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        canonical_identity = self.resolve_identity(canonical_player_id)
        source_identity = self.resolve_identity(source_player_id)

        if not canonical_identity or not source_identity:
            raise ValueError("Identity not found")

        if str(canonical_identity["id"]) == str(source_identity["id"]):
            return {
                "already_same_identity": True,
                "message": "Players already resolve to the same identity",
            }

        similarity = identity_similarity(
            canonical_identity.get("canonical_display_name"),
            source_identity.get("canonical_display_name"),
        )

        result = self.merge_canonical_identities(
            keep_player_id=canonical_player_id,
            merge_player_id=source_player_id,
            actor_id=actor_id,
            notes=notes or (
                "Assistant 7.5.2 canonical merge: "
                f"{source_identity.get('canonical_display_name')} → "
                f"{canonical_identity.get('canonical_display_name')} "
                f"(score {similarity['score']})"
            ),
        )
        result["assistant_analysis"] = similarity
        return result
    def alias_candidates(self, query: str | None = None) -> list[dict[str, Any]]:
        players = _rows(
            self.db.table("players")
            .select("id,display_name,team_id")
            .order("display_name")
            .execute()
        )
        normalized_query = normalize_alias(query)
        result = []
        for player in players:
            normalized = normalize_alias(player.get("display_name"))
            if normalized_query and normalized_query not in normalized:
                continue
            resolved = self.resolve_identity(str(player["id"]))
            result.append({
                "player_id": player["id"],
                "display_name": player["display_name"],
                "team_id": player.get("team_id"),
                "normalized_name": normalized,
                "identity_id": resolved.get("id") if resolved else None,
                "canonical_player_id": resolved.get("canonical_player_id") if resolved else None,
                "canonical_display_name": resolved.get("canonical_display_name") if resolved else None,
            })
        return result

    def create_merge_request(
        self,
        canonical_player_id: str,
        source_player_ids: list[str],
        alias_names: list[str],
        requested_by: str | None = None,
    ) -> dict[str, Any]:
        self.ensure_identity(canonical_player_id)
        rows = _rows(
            self.db.table("player_identity_merge_requests")
            .insert({
                "canonical_player_id": canonical_player_id,
                "source_player_ids": source_player_ids,
                "alias_names": alias_names,
                "status": "PENDING",
                "requested_by": requested_by,
            })
            .execute()
        )
        return rows[0]

    def add_membership(
        self,
        player_id: str,
        team_id: str,
        season_id: str | None,
        valid_from: date | None,
        valid_to: date | None,
        is_current: bool,
        notes: str | None,
    ) -> dict[str, Any]:
        identity = self.ensure_identity(player_id)

        if is_current:
            self.db.table("player_team_memberships").update({"is_current": False}).eq(
                "identity_id", identity["id"]
            ).execute()

        created = _rows(
            self.db.table("player_team_memberships")
            .insert({
                "identity_id": identity["id"],
                "team_id": team_id,
                "season_id": season_id,
                "valid_from": valid_from.isoformat() if valid_from else None,
                "valid_to": valid_to.isoformat() if valid_to else None,
                "is_current": is_current,
                "source": "MANUAL",
                "notes": notes,
            })
            .execute()
        )[0]

        self.db.table("player_identity_events").insert({
            "identity_id": identity["id"],
            "event_type": "MEMBERSHIP_ADDED",
            "payload": created,
        }).execute()
        return created

    def career_scope(self, player_id: str) -> dict[str, Any] | None:
        profile = self.profile(player_id)
        if not profile:
            return None

        source_ids = [
            str(alias["source_player_id"])
            for alias in profile["aliases"]
            if alias.get("source_player_id")
        ]
        canonical_id = str(profile["identity"]["canonical_player_id"])
        all_player_ids = sorted(set(source_ids + [canonical_id]))

        stat_rows = _rows(
            self.db.table("player_leg_stats")
            .select("player_id,team_id,leg_id,score,darts_thrown,average_3_darts,first_9,finish,scores_180,scores_170,scores_140,scores_100,scores_80,no_score,leg_won")
            .in_("player_id", all_player_ids)
            .execute()
        )

        by_team: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in stat_rows:
            by_team[str(row.get("team_id"))].append(row)

        team_ids = [team_id for team_id in by_team if team_id not in {"None", ""}]
        teams = {}
        if team_ids:
            for row in _rows(self.db.table("teams").select("id,name").in_("id", team_ids).execute()):
                teams[str(row["id"])] = row.get("name")

        def aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
            played = len(rows)
            won = sum(1 for row in rows if bool(row.get("leg_won")))
            weighted_sum = 0.0
            total_darts = 0
            averages = []
            finishes = []
            for row in rows:
                average = row.get("average_3_darts")
                darts = int(row.get("darts_thrown") or 0)
                if average is not None:
                    averages.append(float(average))
                    if darts > 0:
                        weighted_sum += float(average) * darts
                        total_darts += darts
                if row.get("finish") not in (None, 0):
                    finishes.append(int(row["finish"]))
            average_3_darts = (
                round(weighted_sum / total_darts, 2)
                if total_darts
                else round(sum(averages) / len(averages), 2) if averages else None
            )
            return {
                "legs_played": played,
                "legs_won": won,
                "win_rate": round(won / played * 100, 1) if played else 0.0,
                "average_3_darts": average_3_darts,
                "best_finish": max(finishes) if finishes else None,
                "scores_180": sum(int(row.get("scores_180") or 0) for row in rows),
                "scores_140_plus": sum(int(row.get("scores_140") or 0) for row in rows),
                "scores_100_plus": sum(int(row.get("scores_100") or 0) for row in rows),
            }

        return {
            "identity": profile["identity"],
            "aliases": profile["aliases"],
            "memberships": profile["memberships"],
            "career": aggregate(stat_rows),
            "by_team": [
                {
                    "team_id": team_id,
                    "team": teams.get(team_id, "Équipe inconnue"),
                    **aggregate(rows),
                }
                for team_id, rows in sorted(
                    by_team.items(),
                    key=lambda item: len(item[1]),
                    reverse=True,
                )
            ],
            "source_player_ids": all_player_ids,
            "meta": {
                "contract_version": "7.5",
                "scope": "career_all_aliases_all_teams",
                "historical_team_source": "player_leg_stats.team_id",
                "no_historical_rewrite": True,
            },
        }
