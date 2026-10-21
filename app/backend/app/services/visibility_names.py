"""Nakka names for sharing drafts; sporting identities are never modified."""
from collections import defaultdict
import json
from pathlib import Path
import re
import unicodedata


def _key(value):
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = "".join(char for char in plain if not unicodedata.combining(char))
    return " ".join(sorted(re.findall(r"[a-z0-9]+", plain.lower())))


class VisibilityNames:
    def __init__(self, rosters=None, identities=(), aliases=()):
        if rosters is None:
            rosters = json.loads(Path(__file__).with_name("interclub_rosters_2027.json").read_text())
        self.by_id, self.by_name = defaultdict(set), defaultdict(set)
        active = [row for row in identities if row.get("status") == "ACTIVE"]
        for team in rosters:
            for member in team["players"]:
                nickname = str(member.get("nakkaName") or "").strip()
                if not nickname:
                    continue
                if member.get("player_id"):
                    owners = [row for row in active if str(row.get("canonical_player_id")) == str(member["player_id"])]
                else:
                    owners = [row for row in active if _key(row.get("canonical_display_name")) == _key(member["officialName"])]
                if len(owners) > 1:
                    continue
                if not owners:
                    self._add("roster:" + _key(member["officialName"]), nickname,
                              (member["officialName"], nickname), (member.get("player_id"),))
                for owner in owners:
                    confirmed = [a for a in aliases if a.get("confirmed") is True and a["identity_id"] == owner["id"]]
                    self._add(str(owner["id"]), nickname,
                              (member["officialName"], owner.get("canonical_display_name"), nickname,
                               *(a.get("alias_name") for a in confirmed)),
                              (owner.get("canonical_player_id"), *(a.get("source_player_id") for a in confirmed)))

    def _add(self, owner, nickname, names, ids):
        for name in names:
            if _key(name):
                self.by_name[_key(name)].add((owner, nickname))
        for player_id in ids:
            if player_id:
                self.by_id[str(player_id)].add((owner, nickname))

    def name(self, value, player_id=None):
        candidates = self.by_id.get(str(player_id)) or self.by_name.get(_key(value), set())
        return next(iter(candidates))[1] if len(candidates) == 1 else str(value or "")

    def tournament(self, tournament):
        """Resolve official names through confirmed IDs or unique source spellings."""
        candidates = defaultdict(set)
        identified = defaultdict(set)
        players = tournament.get("players") or []
        for player in players:
            source = player.get("name")
            if source:
                candidates[source].add(self.name(source, player.get("canonical_player_id")))
                if len(self.by_id.get(str(player.get("canonical_player_id")), set())) == 1:
                    identified[source].add(self.name(source, player["canonical_player_id"]))
        for source, canonical in (tournament.get("display_aliases") or {}).items():
            if len(identified[source]) > 1:
                continue
            preferred = next(iter(identified[source])) if identified[source] else self.name(canonical)
            if preferred == canonical:
                preferred = self.name(source)
            candidates[canonical].add(preferred)
            if preferred != canonical or source not in candidates:
                candidates[source] = {preferred}
        for result in tournament.get("official_results") or []:
            value = result.get("name")
            if not value:
                continue
            preferred = self.name(value, result.get("canonical_player_id"))
            if preferred == value:
                source_names = {p["name"] for p in players if result.get("canonical_player_id")
                                and p.get("canonical_player_id") == result["canonical_player_id"]}
                if len(source_names) == 1:
                    preferred = self.name(next(iter(source_names)), result.get("canonical_player_id"))
            if preferred != value or not candidates[value]:
                candidates[value].add(preferred)
        resolved = {key: next(iter(values)) for key, values in candidates.items() if len(values) == 1}
        for duo in tournament.get("duos") or []:
            members = [row for row in tournament.get("official_results") or []
                       if str(row.get("source_ref") or "").rsplit(":", 1)[0] == duo.get("nakka_participant_id")]
            if len(members) == 2 and all(row.get("name") for row in members):
                resolved[duo["name"]] = " / ".join(resolved.get(row["name"], row["name"]) for row in members)
        return resolved


def load_visibility_names(db, season="2026-2027"):
    from .player_registration_service import official_rosters, season_key
    from .ranking_service import _all
    return VisibilityNames(
        official_rosters(db, season_key(season)),
        _all(db, "player_identities", "id,canonical_player_id,canonical_display_name,status"),
        _all(db, "player_aliases", "identity_id,source_player_id,alias_name,confirmed"),
    )


def render_context_names(text, replacements):
    # Only complete, multi-word names of participants; preserve the saved input.
    names = {name: nickname for name, nickname in replacements.items()
             if name != nickname and len(str(name).split()) >= 2}
    if not names:
        return text
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(name) for name in sorted(names, key=len, reverse=True)) + r")(?!\w)", re.IGNORECASE)
    folded = {name.casefold(): nickname for name, nickname in names.items()}
    return pattern.sub(lambda match: folded[match.group().casefold()], text)
