// Synthetic test-only data. No production fallback.
const ids = ["87719ebb-183e-43ac-a96a-5bf4c657939b", "4a3849c5-3096-4443-87e0-9ce5fd248a46"];
export function fixture() {
  const reference_at = new Date().toISOString();
  const date = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const teams = ids.map((id, i) => ({ id, name: i ? "Papangue Darts Club - Neige" : "Papangue Darts Club - Fournaise", club: "Papangue Darts Club", roster_complete: true,
    team_stats: {rank:i+1,points:i?1:4,played:1,wins:i?0:1,draws:0,losses:i?1:0,win_rate:i?0:100,sets_won:i?6:10,sets_lost:i?10:6,set_difference:i?-4:4,legs_won:i?20:28,legs_lost:i?28:20,average_3_darts:45.14,average_players:5,average_method:'Moyenne arithmétique des moyennes individuelles des joueurs publics avec données.',ranking_source:'CALENDRIER_SCORE',detail_complete:true},
    players: Array.from({ length: 5 }, (_, j) => { const pid = `player-${i}-${j}`, name = ["Nico", "Christophe Fernandez", "Etienne", "Adrien", "Fabien"][j] + (i ? " Neige" : "");
      return { id: pid, name, warning: j === 0 ? "Faible échantillon de validation." : null, dashboard: { player: { id: pid, name, team_id: id, club_id: "pdc", team: i ? "Neige" : "Fournaise", club: "Papangue Darts Club", public_profile: true }, season: { id: "season-2027", name: "2026-2027", is_active: true }, kpis: { average_3_darts: 43.14 + j, legs_won: j ? 10 : 0, legs_played: 20, best_finish: 104, first_9: 52.96, average_finish: 36 }, scoring: { scores_180: 0, scores_100_plus: 44, scores_140_plus: 9, scores_170_plus: 0, scores_80_plus: 12, no_score: 0 }, meta: { has_data: true, nakka_note: "Validation uniquement", data_quality: { player_stat_rows: 20 } } } };
    }) }));
  return { source_id: "validation-source", season: "2027", stats_season: "2027", stats_label: "Championnat 2026–2027", reference_at, teams,
    events: [0, 1].map(i => ({ id: `calendar-${i}`, title: `J${i + 2} Fournaise / Neige`, start_date: date, start_time: "20:00", location: "Papangue Darts Club · Saint-Leu", status: "SCHEDULED", championship_teams: teams.map(t => t.name), team_ids: ids, source_url: null, season: "2027", round: `J${i + 2}`, competition: "Championnat 2026–2027" })),
    seasons: ["2026", "2027", "2028"].map(value => ({ value, label: `Saison ${value}` })), scope_note: "Données synthétiques de validation — championnat, aucun BDC." };
}
