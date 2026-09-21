import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { sameTeam } from "@/lib/team-identity";
import { getTeamTheme } from "@/lib/team-themes";
import type { PlayerOverview } from "@/lib/types/sprint4";
import type { ChampionshipHub, CompetitionCatalog } from "@/lib/types/sprint14";
import { TEAM_ROSTERS_2027, TEAM_ROSTERS_2027_PLAYER_COUNT } from "@/lib/team-rosters-2027";
import "./teams.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

type TeamsPageData = { ranking: ChampionshipHub | null; activeSeason: CompetitionCatalog["active_championship"] };

async function getRanking(): Promise<TeamsPageData> {
  try {
    const catalogResponse = await fetch(`${backend}/api/v1/competitions`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!catalogResponse.ok) return { ranking: null, activeSeason: null };
    const catalog: CompetitionCatalog = await catalogResponse.json();
    const championship = catalog.active_championship;
    if (!championship) return { ranking: null, activeSeason: null };
    const response = await fetch(
      `${backend}/api/v1/competitions/championships/${championship.year}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    return { ranking: response.ok ? await response.json() : null, activeSeason: championship };
  } catch {
    return { ranking: null, activeSeason: null };
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
  const [{ ranking, activeSeason }, players] = await Promise.all([getRanking(), getPlayers()]);
  const standings = ranking?.standings ?? [];

  return (
    <div className="dashboard teams-shell">
      <Sidebar />

      <main className="main teams-main">
        <header className="teams-hero">
          <div>
            <span>CHAMPIONNAT 974 · ÉQUIPES</span>
            <h1>Les équipes</h1>
            <p>Classement, bilan collectif et effectifs officiellement publiés pour la saison active.</p>
          </div>
          <strong>{standings.length} équipe(s)</strong>
        </header>

        {ranking?.data_quality_notes?.length ? (
          <section className="teams-quality">
            <strong>Résultats collectifs complets</strong>
            <span>
              {ranking.summary.collective_only_encounters ?? 0} rencontre(s) sans
              détail PvP ; les statistiques individuelles restent inchangées.
            </span>
          </section>
        ) : null}

        {activeSeason && !activeSeason.has_data ? (
          <section className="teams-rosters-2027">
            <div className="teams-rosters-heading">
              <div><strong>{activeSeason.name}</strong><h2>8 équipes officielles</h2><p>{TEAM_ROSTERS_2027_PLAYER_COUNT} joueurs inscrits pour la saison 2026/2027.</p></div>
              <Link href="/championships/2026">Championnat 2026 historique →</Link>
            </div>
            <div className="teams-rosters-grid">
              {TEAM_ROSTERS_2027.map((team) => (
                <article className="team-roster-card" key={team.id}>
                  <header><span>{team.club}</span><h3>{team.name}</h3><small>{team.players.length} joueur(s)</small></header>
                  <ul>{team.players.map((player) => <li key={player.license}><span>{player.officialName}</span><small>Nakka : {player.nakkaName}</small></li>)}</ul>
                </article>
              ))}
            </div>
          </section>
        ) : !ranking ? (
          <section className="teams-empty">
            Le classement des équipes est momentanément indisponible.
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
