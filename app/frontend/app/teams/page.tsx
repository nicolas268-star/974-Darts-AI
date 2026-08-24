import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { sameTeam } from "@/lib/team-identity";
import { getTeamTheme } from "@/lib/team-themes";
import type { RankingPayload, PlayerOverview } from "@/lib/types/sprint4";
import "./teams.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

async function getRanking(): Promise<RankingPayload | null> {
  try {
    const response = await fetch(`${backend}/api/v1/ranking`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}

async function getPlayers(): Promise<PlayerOverview[]> {
  try {
    const response = await fetch(`${backend}/api/v1/players`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.players) ? payload.players : [];
  } catch {
    return [];
  }
}

export default async function TeamsPage() {
  const [ranking, players] = await Promise.all([getRanking(), getPlayers()]);
  const standings = ranking?.standings ?? [];

  return (
    <div className="dashboard teams-shell">
      <Sidebar />

      <main className="main teams-main">
        <header className="teams-hero">
          <div>
            <span>CHAMPIONNAT 974 · ÉQUIPES</span>
            <h1>Les équipes</h1>
            <p>Classement, bilan collectif et accès aux effectifs de la saison.</p>
          </div>
          <strong>{standings.length} équipe(s)</strong>
        </header>

        {ranking?.data_quality_notes.length ? (
          <section className="teams-quality">
            <strong>Résultats collectifs complets</strong>
            <span>
              {ranking.summary.collective_only_encounters ?? 0} rencontre(s) sans
              détail PvP ; les statistiques individuelles restent inchangées.
            </span>
          </section>
        ) : null}

        {!ranking ? (
          <section className="teams-empty">
            Le backend ne retourne actuellement aucune donnée de classement.
          </section>
        ) : (
          <section className="teams-grid">
            {standings.map((team) => {
              const roster = players.filter((player) => sameTeam(player.team, team.name));
              const theme = getTeamTheme(team.name);

              return (
                <Link
                  href={`/teams/${team.team_id}`}
                  className={`team-card team-theme-card team-theme-${theme.key}`}
                  key={team.team_id}
                >
                  <div className="team-card-top">
                    <span>#{team.rank}</span>
                    <small>{roster.length} joueur(s)</small>
                  </div>

                  <h2>{team.name}</h2>
                  <span className="team-card-identity">{theme.label}</span>
                  <strong>{team.points} pts</strong>

                  <div className="team-card-stats">
                    <div><span>MJ</span><b>{team.played}</b></div>
                    <div><span>V</span><b>{team.wins}</b></div>
                    <div><span>N</span><b>{team.draws}</b></div>
                    <div><span>D</span><b>{team.losses}</b></div>
                  </div>

                  <footer>
                    <span>Différence de sets</span>
                    <b>{team.set_difference > 0 ? `+${team.set_difference}` : team.set_difference}</b>
                  </footer>
                </Link>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
