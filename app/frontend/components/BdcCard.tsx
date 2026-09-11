import Link from "next/link";
import { BDC_URL } from "@/lib/bdc";
import "@/app/tournaments/blind-draw-championship/bdc.css";

export function BdcCard() {
  return <section className="bdc-card" aria-labelledby="bdc-card-title">
    <div className="bdc-card-copy">
      <span className="bdc-eyebrow">TAMPON DARTS CLUB · SAISON 1</span>
      <h2 id="bdc-card-title">Blind Draw Championship</h2>
      <p>Un nouveau partenaire à chaque manche. Vos points restent les vôtres.</p>
      <div className="bdc-tags"><span>6 manches en double</span><span>Classement individuel</span><span>3 participations minimum</span></div>
      <p className="bdc-opening">Manche 1 terminée · Super Mario / Pierre vainqueurs · Points individuels disponibles</p>
      <p>Statistiques partielles — incident Nakka</p>
      <Link className="bdc-button" href={BDC_URL}>Voir les manches et le classement →</Link>
    </div>
    <div className="bdc-card-mark" aria-hidden="true">BDC<span>2026 — 2027</span></div>
  </section>;
}
