"""Read adapter for the existing championship ranking and public player averages."""
from math import isfinite


def number(value, *, signed=False):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value) and (signed or value >= 0) else None


def team_statistics(team_id, ranking, players):
    """players is the full verified roster for the statistical season, not a selection."""
    row = next((r for r in (ranking or {}).get('standings', []) if str(r['team_id']) == team_id), None)
    known = bool(ranking and ranking.get('season'))
    averages = [number(p.get('average_3_darts')) for p in players if (number(p.get('legs_played')) or 0) > 0]
    averages = [v for v in averages if v is not None]
    result = {'rank': number((row or {}).get('rank')),
              'average_3_darts': sum(averages) / len(averages) if averages else None,
              'average_players': len(averages),
              'average_method': 'Moyenne arithmétique des moyennes individuelles des joueurs publics avec données.',
              'ranking_source': (ranking or {}).get('ranking_source', 'UNAVAILABLE'),
              'detail_complete': bool(row.get('detail_complete', True)) if row else known}
    for key in ('points', 'played', 'wins', 'draws', 'losses', 'sets_won', 'sets_lost', 'set_difference'):
        result[key] = number(row.get(key), signed=key == 'set_difference') if row else 0 if known else None
    played, wins = result['played'], result['wins']
    result['win_rate'] = wins / played * 100 if played and wins is not None else None
    for key in ('legs_won', 'legs_lost'):
        result[key] = (number(row.get(key)) if row else 0) if result['detail_complete'] else None
    return result
