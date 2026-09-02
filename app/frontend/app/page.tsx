import Link from "next/link";
import Image from "next/image";
import { ReunionClubMap } from "@/components/home/ReunionClubMap";
import "./home.css";

const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

type Standing = {
  rank: number;
  team_id: string;
  name: string;
  points: number;
  set_difference: number;
  played: number;
};

type RankingPayload = {
  season: { id: string; name: string; is_active: boolean } | null;
  standings: Standing[];
  summary: {
    rounds?: number;
    teams?: number;
    encounters?: number;
    official_results?: number;
    valid_legs?: number;
    detailed_encounters?: number;
    collective_only_encounters?: number;
  };
};


type ClubSocialLink = {
  name: string;
  url: string;
  source_type: string;
};

type ClubLinksPayload = {
  links?: Record<string, ClubSocialLink>;
};

type PlayerOverview = {
  player_id: string;
  name: string;
  team: string;
  average_3_darts: number | null;
  win_rate?: number | null;
};

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


async function getClubLinks(): Promise<Record<string, ClubSocialLink>> {
  try {
    const response = await fetch(`${backend}/api/v1/tournament-watch/public-club-links`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return {};
    const payload: ClubLinksPayload = await response.json();
    return payload?.links ?? {};
  } catch {
    return {};
  }
}

function number(value: number | null | undefined, digits = 2) {
  if (value == null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function signed(value: number | null | undefined) {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

const features = [
  {
    number: "01",
    label: "Classement officiel",
    title: "Le classement, sans approximation",
    copy: "Points, victoires et différence de sets calculés depuis les résultats collectifs publiés.",
    href: "/dashboard",
    cta: "Voir le classement",
  },
  {
    number: "02",
    label: "Performance individuelle",
    title: "Chaque joueur a son histoire",
    copy: "Moyenne, First 9, gros scores, finishes et progression calculés à partir des résultats publiés.",
    href: "/players",
    cta: "Explorer les joueurs",
  },
  {
    number: "03",
    label: "Analyse des soirées",
    title: "Le match, leg après leg",
    copy: "Simples, doubles, finishes et pression adverse réunis dans un Hub Match dédié.",
    href: "/teams",
    cta: "Choisir une rencontre",
  },
];

export default async function HomePage() {
  const [ranking, players, clubLinks] = await Promise.all([
    getRanking(),
    getPlayers(),
    getClubLinks(),
  ]);
  const standings = ranking?.standings ?? [];
  const leaders = standings.slice(0, 3);
  const playerLeaders = players
    .filter((player) => player.average_3_darts != null)
    .sort((a, b) => (b.average_3_darts ?? 0) - (a.average_3_darts ?? 0))
    .slice(0, 4);
  const teamIds = Object.fromEntries(standings.map((team) => [team.name, team.team_id]));

  return (
    <div className="home-page">
      <header className="home-nav">
        <Link className="home-brand" href="/" aria-label="974 Darts AI — Accueil">
          <span className="brand-target">◎</span>
          <span>974 Darts</span>
          <b>AI</b>
        </Link>

        <nav aria-label="Navigation principale">
          <Link href="/stats">Stats & Données</Link>
          <Link href="/play">Jeux</Link>
          <Link href="/admin">Admin</Link>
          <Link className="login-action" href="/login">Connexion</Link>
        </nav>
      </header>

      <main>
        <section className="island-hero">
          <div className="hero-art" aria-hidden="true" />
          <div className="hero-vignette" aria-hidden="true" />

          <div className="hero-copy">
            <span className="hero-kicker">
              <i /> Championnat officiel · La Réunion
            </span>
            <h1>
              La Réunion
              <br />
              <em>vise juste.</em>
            </h1>
            <p>
              Vos matchs. Vos statistiques. Votre progression.
              <br />
              Le championnat 974 raconté par les données.
            </p>

            <div className="hero-actions hero-domain-actions" aria-label="Les quatre espaces publics 974Darts">
              <Link className="primary-action" href="/stats">
                Stats & Données <span>↗</span>
              </Link>
              <Link className="secondary-action game-action" href="/play">
                Jeux <span>→</span>
              </Link>
              <Link className="secondary-action calendar-action" href="/calendar">
                Calendrier <span>→</span>
              </Link>
              <Link className="secondary-action map-action" href="/#carte-clubs">
                Carte <span>↓</span>
              </Link>
              <Link className="secondary-action committee-action" href="/comite">
                Comité <span>→</span>
              </Link>
            </div>

          </div>

          <div className="hero-scroll" aria-hidden="true">
            <span>Découvrir</span>
            <i />
          </div>
        </section>

        <section className="home-section championship-section">
          <div className="home-section-heading">
            <div>
              <span className="section-kicker">AU CŒUR DU CHAMPIONNAT</span>
              <h2>Le championnat en mouvement</h2>
            </div>
            <p>
              Une lecture claire du classement collectif et des performances
              qui font vivre les soirées de fléchettes réunionnaises.
            </p>
          </div>

          <div className="championship-grid">
            <article className="leaders-card">
              <div className="home-card-heading">
                <div>
                  <span>TOP 3 · CLASSEMENT OFFICIEL</span>
                  <h3>La course en tête</h3>
                </div>
                <Link href="/dashboard">Classement complet →</Link>
              </div>

              {leaders.length ? (
                <div className="leader-list">
                  {leaders.map((leader) => (
                    <Link
                      className={`leader-row rank-${leader.rank}`}
                      href={`/teams/${leader.team_id}`}
                      key={leader.team_id}
                    >
                      <strong className="leader-rank">{leader.rank}</strong>
                      <div className="leader-team">
                        <span>{leader.name.slice(0, 2).toUpperCase()}</span>
                        <strong>{leader.name}</strong>
                      </div>
                      <div>
                        <span>Diff.</span>
                        <strong>{signed(leader.set_difference)}</strong>
                      </div>
                      <div>
                        <span>Points</span>
                        <strong>{leader.points}</strong>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="home-offline">
                  Démarre le backend pour afficher le classement publié.
                </p>
              )}
            </article>

            <article className="island-card">
              <span className="island-outline" aria-hidden="true">974</span>
              <div>
                <span>UNE ÎLE · UNE PASSION</span>
                <h3>Le jeu péi entre dans une nouvelle dimension.</h3>
                <p>
                  {standings.length || 6} équipes et une même cible : faire
                  rayonner les fléchettes de La Réunion.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="home-section club-map-section" id="carte-clubs">
          <div className="home-section-heading">
            <div>
              <span className="section-kicker">LA RÉUNION DES FLÉCHETTES</span>
              <h2>Une île, quatre clubs.</h2>
            </div>
            <p>
              De Saint-Paul à Saint-Pierre, découvrez les lieux qui font vivre
              le championnat et rencontrez leurs équipes.
            </p>
          </div>

          <ReunionClubMap teamIds={teamIds} socialLinks={clubLinks} />

          <div className="institutional-signature">
            <span className="institutional-logo">
              <Image alt="Comité de fléchettes de La Réunion et Fédération Française de Darts" fill sizes="220px" src="/club-map/institutions.png" />
            </span>
            <div>
              <small>LES FLÉCHETTES FÉDÉRALES À LA RÉUNION</small>
              <strong>Clubs du Comité de fléchettes de La Réunion</strong>
              <p>Une implantation locale inscrite dans le mouvement fédéral français.</p>
            </div>
          </div>
        </section>

        <section className="home-section player-section">
          <div className="home-section-heading home-compact-heading">
            <div>
              <span className="section-kicker">LES JOUEURS DU 974</span>
              <h2>Les références du moment</h2>
            </div>
            <Link className="section-link" href="/players">Tous les joueurs →</Link>
          </div>

          {playerLeaders.length ? (
            <div className="player-leader-grid">
              {playerLeaders.map((player, index) => (
                <Link
                  className="home-player-card"
                  href={`/players/${player.player_id}`}
                  key={player.player_id}
                >
                  <span className="player-rank">#{index + 1}</span>
                  <div className="home-player-avatar">
                    {player.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{player.name}</strong>
                    <small>{player.team}</small>
                  </div>
                  <div className="player-average">
                    <span>Moyenne</span>
                    <strong>{number(player.average_3_darts)}</strong>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="home-offline">
              Les performances apparaîtront lorsque les données seront disponibles.
            </p>
          )}
        </section>

        <section className="home-section feature-section">
          <div className="home-section-heading home-compact-heading">
            <div>
              <span className="section-kicker">974 DARTS AI</span>
              <h2>Plus qu’un score.</h2>
            </div>
            <p>Une plateforme pensée pour comprendre le jeu et progresser.</p>
          </div>

          <div className="home-feature-grid">
            {features.map((feature) => (
              <Link className="home-feature-card" href={feature.href} key={feature.number}>
                <span className="home-feature-number">{feature.number}</span>
                <small>{feature.label}</small>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <strong>{feature.cta} →</strong>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-identity">
          <Link className="home-brand" href="/">
            <span className="brand-target">◎</span>
            <span>974 Darts</span>
            <b>AI</b>
          </Link>
          <p>La data au service des fléchettes réunionnaises.</p>
        </div>
        <div className="home-footer-legal">
          <span>Créé et développé à La Réunion par Nicolas Dupont</span>
          <nav aria-label="Informations juridiques">
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/confidentialite">Confidentialité & traceurs</Link>
            <Link href="/conditions-utilisation">Conditions d’utilisation</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
