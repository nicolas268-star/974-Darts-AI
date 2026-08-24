import { Sidebar } from "@/components/Sidebar";
import { DuoListDashboard } from "@/components/duo/DuoListDashboard";
import type { DuoApiResponse } from "@/lib/duo/types";
import "./wilson-method.css";

async function getDuos(): Promise<DuoApiResponse> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";

  try {
    const response = await fetch(`${base}/api/v1/duos`, {
  cache: "no-store",
  signal: AbortSignal.timeout(5000),
});


if (!response.ok)
  return { season: null, duos: [] };

const json = await response.json();

console.log("Nombre de duos :", json.duos?.length);
console.log(json);

return json;
  } catch (e) {
    console.error("Impossible de charger les duos :", e);
    return { season: null, duos: [] };
  }
}
export default async function DuosPage() {
  const data = await getDuos();

  return (
    <div className="dashboard">
      <Sidebar />
      <main className="main duo-page duo-synergy-theme">
        <header className="duo-page-header">
          <div>
            <span className="badge">SYNERGIE · DUOS 974</span>
            <div className="duo-title-line">
              <h2>Classement des duos</h2>
              <span
                className="wilson-badge"
                title="Le classement utilise la borne basse de Wilson à 95 % afin de comparer équitablement les duos ayant joué des volumes de legs différents."
              >
                🏆 Classement statistique · Wilson 95 %
              </span>
            </div>
            <p>
              Explore les associations de joueurs, leur efficacité collective et leur
              contribution au scoring.
            </p>
          </div>
          <span className="duo-season">
            Saison active · {data.season?.name ?? "—"}
          </span>
        </header>

        {data.duos.length ? (
          <DuoListDashboard
            duos={data.duos}
            seasonName={data.season?.name ?? "—"}
          />
        ) : (
          <section className="card duo-empty">
            <strong>Les données Duos ne sont pas disponibles.</strong>
            <p>
              Vérifie que le backend est démarré sur le port 8000, puis recharge
              cette page.
            </p>
          </section>
        )}

        <section className="duo-methodology" aria-label="Méthodes statistiques">
          <article className="method-card method-card-nakka">
            <div className="method-heading">
              <span className="method-icon" aria-hidden="true">🎯</span>
              <div>
                <small>Source et limites</small>
                <h3>Données Nakka</h3>
              </div>
            </div>
            <p>
              Les statistiques affichées sont calculées exclusivement à partir des
              exports Nakka. Les routes de checkout, les doubles tentés, les doubles
              réussis et la précision au double ne sont jamais estimés lorsqu’ils ne
              figurent pas dans la source.
            </p>
            <p className="method-note">
              Le First 9 reste affiché à « — » lorsqu’il n’est pas fourni par Nakka.
            </p>
          </article>

          <article className="method-card method-card-wilson">
            <div className="method-heading">
              <span className="method-icon" aria-hidden="true">📊</span>
              <div>
                <small>Méthode de classement</small>
                <h3>Borne basse de Wilson à 95 %</h3>
              </div>
            </div>
            <p>
              Le classement ne repose pas uniquement sur le pourcentage brut de legs
              gagnés. La borne basse de l’intervalle de confiance de Wilson valorise
              les performances confirmées sur un volume important et limite la
              surévaluation des petits échantillons.
            </p>

            <ul className="wilson-benefits">
              <li>compare équitablement les duos ayant joué des volumes différents ;</li>
              <li>réduit l’avantage artificiel d’un résultat parfait sur très peu de legs ;</li>
              <li>augmente la confiance accordée aux performances répétées.</li>
            </ul>

            <div className="wilson-example" aria-label="Exemple de classement Wilson">
              <div>
                <span>Duo A</span>
                <strong>4 / 4</strong>
                <small>100 % · échantillon faible</small>
              </div>
              <span className="wilson-versus" aria-hidden="true">vs</span>
              <div className="wilson-example-winner">
                <span>Duo B</span>
                <strong>19 / 25</strong>
                <small>76 % · performance plus fiable</small>
              </div>
            </div>

            <footer className="wilson-version">
              Wilson Score (95 %) <span aria-hidden="true">•</span> v1.0
            </footer>
          </article>
        </section>
      </main>
    </div>
  );
}
