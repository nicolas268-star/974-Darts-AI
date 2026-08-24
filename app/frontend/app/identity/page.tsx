import Link from "next/link";
import { ArrowRight, BrainCircuit, History, ShieldCheck, UserRoundSearch, Users } from "lucide-react";
import "./identity-access.css";

export default function IdentityAccessPage() {
  return (
    <main className="identity-access-page">
      <header>
        <span><BrainCircuit size={17}/> Identités & carrières</span>
        <h1>Accéder au bon espace</h1>
        <p>Les joueurs consultent leur carrière. L’administrateur gère les identités, les alias et les fusions.</p>
      </header>

      <section className="identity-access-grid">
        <Link href="/players" className="identity-access-card">
          <div><Users size={24}/></div>
          <span>Espace joueurs</span>
          <h2>Profils et carrières</h2>
          <p>Ouvrir un joueur, puis consulter sa fiche Premium et son historique de carrière.</p>
          <strong>Accéder <ArrowRight size={16}/></strong>
        </Link>

        <Link href="/admin/identities" className="identity-access-card is-admin">
          <div><ShieldCheck size={24}/></div>
          <span>Administration</span>
          <h2>Identity Hub</h2>
          <p>Rechercher une identité, consulter ses alias, ses équipes, sa timeline et la qualité des données.</p>
          <strong>Accéder <ArrowRight size={16}/></strong>
        </Link>

        <Link href="/admin/player-identities" className="identity-access-card is-admin">
          <div><UserRoundSearch size={24}/></div>
          <span>Administration</span>
          <h2>Assistant de fusion</h2>
          <p>Valider les doublons et fusionner les identités canoniques sans réécrire les statistiques.</p>
          <strong>Accéder <ArrowRight size={16}/></strong>
        </Link>
      </section>

      <div className="identity-access-note"><History size={17}/><span>Les routes d’administration doivent rester protégées par le contrôle de rôle déjà utilisé dans l’application.</span></div>
    </main>
  );
}
