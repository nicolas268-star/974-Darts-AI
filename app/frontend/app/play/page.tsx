import Link from "next/link";
import "./play-hub.css";

export default function PlayHubPage() {
  return (
    <main className="play-hub">
      <section className="play-hub-hero">
        <div>
          <span className="play-hub-kicker">DOMAINE 02 · PLAY</span>
          <h1>Jeux</h1>
          <p>Un bloc par jeu. Entrez ensuite dans le jeu pour choisir les participants, les équipes et les options avant de commencer.</p>
        </div>
        <Link className="play-hub-switch" href="/stats">← Stats & Données</Link>
      </section>

      <section className="play-hub-grid" aria-label="Jeux disponibles">
        <Link className="play-game-card play-game-live" href="/play/501">
          <div className="play-game-status"><span /> DISPONIBLE</div><span className="play-game-icon">◎</span><small>X01</small><h2>301 · 501 · 701</h2><p>Solo à 4 joueurs ou 2 vs 2. Score par volée ou flèche par flèche, In/Out et formats de legs.</p><strong>Configurer X01 <span>→</span></strong>
        </Link>
        <Link className="play-game-card play-game-live cricket-card" href="/play/cricket">
          <div className="play-game-status"><span /> DISPONIBLE</div><span className="play-game-icon">#</span><small>CRICKET</small><h2>Cricket</h2><p>Solo à 4 joueurs ou 2 vs 2. Choisissez ensuite Basic, Cut Throat, Tactic ou Magic.</p><strong>Configurer Cricket <span>→</span></strong>
        </Link>
        <Link className="play-game-card play-game-live ttt-card" href="/play/tictactoe">
          <div className="play-game-status"><span /> DISPONIBLE</div><span className="play-game-icon">⊞</span><small>TIC TAC TOE</small><h2>Tic Tac Toe</h2><p>Solo à 4 joueurs ou 2 vs 2. Grille renouvelée à chaque partie, Normal ou Hard.</p><strong>Configurer Tic Tac Toe <span>→</span></strong>
        </Link>
        <Link className="play-game-card play-game-live bob27-card" href="/play/bob27">
          <div className="play-game-status"><span /> NOUVEAU</div><span className="play-game-icon">27</span><small>DOUBLES</small><h2>Bob’s 27</h2><p>Travail des doubles D1 à D20, score classique à partir de 27. Solo, multijoueur ou 2 vs 2.</p><strong>Configurer Bob’s 27 <span>→</span></strong>
        </Link>
        <Link className="play-game-card play-game-live clock-card" href="/play/clock">
          <div className="play-game-status"><span /> NOUVEAU</div><span className="play-game-icon">↻</span><small>AROUND THE CLOCK</small><h2>Tour de l’horloge</h2><p>Parcourez 1 à 20 en Simple, Double ou Triple. Solo à 4 joueurs et 2 vs 2.</p><strong>Configurer l’horloge <span>→</span></strong>
        </Link>
      </section>

      <section className="play-tools-section">
        <div><small>OUTIL D’ANALYSE</small><h2>Cricket Lab</h2><p>Le laboratoire de données Cricket reste séparé des jeux live.</p></div>
        <Link href="/cricket">Ouvrir Cricket Lab →</Link>
      </section>
    </main>
  );
}
