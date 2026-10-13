"""Read adapters only: reuse official rosters, season catalog and statistics engine."""
from datetime import datetime, timezone
import hashlib
import json
import re
from .calendar_service import STATE_PATH, list_events
from .season_registry_service import registry_status
from .competition_hub_service import CompetitionHubService
from .player_statistics_engine import PlayerStatisticsEngine
from .interclub_publication_service import ROSTERS, CLUBS, name_key, resolve_team
from .ranking_service import _all, build_ranking
from .match_day_team_stats import team_statistics

# Verified database UUIDs from the shared Player Card documentation; roster slugs stay separate.
ROSTER_TEAM_IDS = dict(zip(
    ['pdc-fournaise', 'pdc-neige', '3bdc-ambre', '3bdc-blonde', 'kaz-a', 'kaz-b', 'tdc-zarboutan', 'tdc-zarlor'],
    ['87719ebb-183e-43ac-a96a-5bf4c657939b', '4a3849c5-3096-4443-87e0-9ce5fd248a46',
     'ea7206d1-bf26-48d1-ae8d-7213ef94884c', '9b85ca85-4c9a-4bb7-8d73-c92e19ae7de3',
     '7e2f62a9-e0cc-490e-b8eb-bc19c1f182e3', '9e79f660-c8ca-411b-a5fd-5584e58f46b6',
     'a6810fe2-6469-463e-bea7-65061727e92d', '311d3ddc-a7dc-4494-9252-03b736b501ce']))


def public_dashboard(d):
    if not d or d['player'].get('public_profile') is not True:
        return None
    return {k: d[k] for k in ('player', 'season', 'kpis', 'scoring', 'meta')}


def load_source(db, season, stats_season):
    if season not in ('2026', '2027', '2028', '2029') or stats_season not in ('2026', '2027', '2028', '2029'):
        raise ValueError('Saison invalide.')
    engine = PlayerStatisticsEngine.from_db(db)
    catalog = CompetitionHubService(db)._season_cards()
    card = next((c for c in catalog if str(c.get('year')) == season), None)
    stats_card = next((c for c in catalog if str(c.get('year')) == stats_season), None)
    if not card or not stats_card:
        raise ValueError('Saison absente du catalogue officiel.')
    fetched = datetime.now(timezone.utc).isoformat()
    teams = []
    def member(pid, official_name):
        p = engine._canonical_player(pid)
        if not p or p.get('public_profile') is not True:
            return {'id': None, 'name': official_name, 'dashboard': None, 'warning': 'Identité non résolue ou profil non public.'}
        d = engine.dashboard(pid, stats_season)
        if not d or engine._season_year(d.get('season')) != int(stats_season):
            # Never allow the engine's default-season fallback to supply another season.
            d = None
        return {'id': str(p['id']), 'name': str(p['display_name']), 'dashboard': public_dashboard(d),
                'warning': 'Données partielles ou faible échantillon.' if d and (d['kpis'].get('legs_played', 0) < 12 or d['meta'].get('data_quality', {}).get('player_stat_rows') == 0) else None}
    if season == '2027':
        licensed = _all(db, 'committee_licensed_players', 'season_key,official_display_name,identity_id,license_status,club_code')
        identities = {i['id']: i for i in _all(db, 'player_identities', 'id,canonical_player_id,status') if i['status'] == 'ACTIVE'}
        for roster in ROSTERS:
            tid = ROSTER_TEAM_IDS[roster['id']]
            official_team = engine.team_by_id.get(tid)
            if not official_team:
                continue
            players = []
            for r in roster['players']:
                rows = [l for l in licensed if l['season_key'] == '2026-2027' and l['license_status'] == 'ACTIVE'
                        and l['club_code'] == CLUBS[roster['id'].split('-')[0]] and name_key(l['official_display_name']) == name_key(r['officialName'])]
                identity = identities.get(rows[0].get('identity_id')) if len(rows) == 1 else None
                players.append(member(identity['canonical_player_id'], r['officialName']) if identity else
                               {'id': None, 'name': r['officialName'], 'dashboard': None, 'warning': 'Identité officielle à vérifier.'})
            teams.append({'id': tid, 'name': official_team['name'], 'club': roster['club'], 'players': players, 'roster_complete': True})
    else:
        # Memberships and observed season-specific affiliations only. Never global players.team_id.
        memberships = _all(db, 'player_team_memberships', 'identity_id,team_id,season_id')
        identities = {i['id']: i for i in _all(db, 'player_identities', 'id,canonical_player_id,status') if i['status'] == 'ACTIVE'}
        pairs = {(str(identities[m['identity_id']]['canonical_player_id']), str(m['team_id'])) for m in memberships
                 if m.get('season_id') == card.get('id') and m.get('identity_id') in identities}
        pairs.update((pid, affiliation[1]) for (pid, sid), affiliation in engine.played_team_by_season.items() if sid == card.get('id'))
        for tid in sorted({tid for _, tid in pairs}):
            team = engine.team_by_id.get(tid)
            if not team:
                continue
            club = engine.club_by_id.get(str(team.get('club_id')), {})
            players = [member(pid, engine.player_by_id.get(pid, {}).get('display_name', 'Identité à vérifier')) for pid, teamid in sorted(pairs) if teamid == tid]
            teams.append({'id': tid, 'name': team['name'], 'club': club.get('name'), 'players': players, 'roster_complete': False})
    # Reuse the public championship ranking and the existing statistics engine.
    # Never fall back to the active season when an archive has no season ID.
    ranking, overview, statistical_members = None, [], {}
    if stats_card.get('id') and any(str(row.get('id')) == str(stats_card['id']) for row in engine.data.seasons):
        overview = [row for row in engine.overview(str(stats_card['id']))
                    if engine._canonical_player(row['player_id']).get('public_profile') is True]
        try:
            ranking = build_ranking(db, str(stats_card['id']))
            if str((ranking.get('season') or {}).get('id')) != str(stats_card['id']): ranking = None
        except Exception:
            ranking = None  # Player figures remain usable if collective ranking is unavailable.
        if stats_season == '2027':
            statistical_licenses = licensed if season == '2027' else _all(db, 'committee_licensed_players', 'season_key,official_display_name,identity_id,license_status,club_code')
            statistical_identities = identities if season == '2027' else {i['id']: i for i in _all(db, 'player_identities', 'id,canonical_player_id,status') if i['status'] == 'ACTIVE'}
            for roster in ROSTERS:
                members = set()
                for player in roster['players']:
                    matches = [l for l in statistical_licenses if l['season_key'] == '2026-2027' and l['license_status'] == 'ACTIVE'
                               and l['club_code'] == CLUBS[roster['id'].split('-')[0]] and name_key(l['official_display_name']) == name_key(player['officialName'])]
                    identity = statistical_identities.get(matches[0].get('identity_id')) if len(matches) == 1 else None
                    if identity: members.add(str(identity['canonical_player_id']))
                statistical_members[ROSTER_TEAM_IDS[roster['id']]] = members
        else:
            statistical_identities = {i['id']: i for i in _all(db, 'player_identities', 'id,canonical_player_id,status') if i['status'] == 'ACTIVE'}
            memberships = _all(db, 'player_team_memberships', 'identity_id,team_id,season_id')
            for member in memberships:
                identity = statistical_identities.get(member.get('identity_id'))
                if member.get('season_id') == stats_card['id'] and identity:
                    statistical_members.setdefault(str(member['team_id']), set()).add(str(identity['canonical_player_id']))
            for (pid, sid), affiliation in engine.played_team_by_season.items():
                if sid == str(stats_card['id']): statistical_members.setdefault(str(affiliation[1]), set()).add(pid)
    for team in teams:
        members = statistical_members.get(team['id'], set())
        applicable = team['id'] in statistical_members or any(str(row['team_id']) == team['id'] for row in (ranking or {}).get('standings', []))
        team['team_stats'] = team_statistics(team['id'], ranking if applicable else None, [row for row in overview if row['player_id'] in members])
    events = []
    source_seasons = {str(e.get('url')): str(s['key']).split('-')[-1] for s in registry_status()['seasons'] for e in s.get('events', [])}
    by_name = {t['name']: t['id'] for t in teams}
    for e in list_events()['events']:
        if e.get('event_type') != 'CHAMPIONSHIP':
            continue
        event_season = str(e.get('season') or e.get('season_key') or source_seasons.get(str(e.get('source_url'))) or '').split('-')[-1]
        if event_season != season:
            continue
        ids = list(e.get('team_ids') or [])
        names = list(e.get('championship_teams') or [])
        if not names:
            title = re.sub(r'^\s*J\s*\d+\s*[·:–—-]?\s*', '', e.get('title',''), flags=re.I)
            names = re.split(r'\s+(?:vs\.?|contre)\s+', title, flags=re.I)
            if len(names) != 2:
                names = re.split(r'\s+(?:–|—|-|/)\s+', title)
        if not ids and len(names) == 2:
            for name in names:
                tid = by_name.get(name)
                if not tid and season == '2027':
                    try: tid = ROSTER_TEAM_IDS[resolve_team(name)['id']]
                    except ValueError: pass
                if tid: ids.append(tid)
        round_match = re.match(r'^\s*(J\s*\d+)\b',e.get('title',''),re.I)
        events.append({**event_fingerprint(e), 'calendar_signature': event_signature(e), 'team_ids': ids if len(ids) == 2 and ids[0] != ids[1] and all(tid in {t['id'] for t in teams} for tid in ids) else [], 'season': season,
                       'round': e.get('round') or e.get('round_code') or (round_match[1].replace(' ','').upper() if round_match else ''), 'competition': card['name']})
    return {'season': season, 'stats_season': stats_season, 'stats_label': stats_card['name'], 'reference_at': fetched,
            'teams': teams, 'events': events, 'seasons': [{'value': str(c['year']), 'label': c['name']} for c in catalog if str(c['year']) in ('2026','2027','2028','2029')],
            'scope_note': 'Périmètre des profils championnat : simples et doubles selon la source. Pas de BDC. Historique à une date passée non reconstructible.'}


def event_fingerprint(e):
    return {k: e.get(k) for k in ('id','title','start_date','start_time','location','status','championship_teams','team_ids','source_url')}


def event_signature(e):
    return hashlib.sha256(json.dumps(event_fingerprint(e),sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def check_event(snapshot):
    expected = snapshot.get('event')
    if not expected:
        return
    # Unlike legacy list_events, fail closed on missing/corrupt state.
    import json
    if not STATE_PATH.exists():
        raise ValueError('Calendrier indisponible : diffusion suspendue.')
    state = json.loads(STATE_PATH.read_text())
    event = next((e for e in state['events'] if e['id'] == expected['id']), None)
    changed = (event_signature(event) != expected['calendar_signature'] if expected.get('calendar_signature') and event else not event or event_fingerprint(event) != {k: expected.get(k) for k in event_fingerprint(event)})
    if not event or changed or event.get('status') != 'SCHEDULED':
        raise ValueError('Rencontre modifiée, supprimée ou annulée : nouvelle validation requise.')


def check_visibility(db, snapshot):
    if snapshot.get('content_mode', 'players') == 'teams': return  # Only public collective figures are rendered.
    ids = [p['id'] for side in ('teamA','teamB') for p in snapshot[side]['players']]
    engine = PlayerStatisticsEngine.from_db(db)
    if any(not engine._canonical_player(pid) or engine._canonical_player(pid).get('public_profile') is not True for pid in ids):
        raise ValueError('Visibilité ou identité des joueurs modifiée : nouvelle validation requise.')
