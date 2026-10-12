"use client";

import Link from "next/link";

export default function Error({ retry }: { retry: () => void }) {
  return <main className="main"><section className="bp-empty" role="alert"><h2>Analyse temporairement indisponible</h2><p>Les sources BDC n’ont pas pu être affichées. Relancez la lecture pour retrouver les résultats et les statistiques conservées.</p><button className="bp-button" type="button" onClick={retry}>Réessayer</button><Link href="/tournaments/blind-draw-championship">Retour au module BDC</Link></section></main>;
}
