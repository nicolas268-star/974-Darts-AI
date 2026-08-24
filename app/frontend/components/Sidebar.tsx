import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { getCurrentUser, isSoleAdministrator } from "@/lib/auth/session";

export async function Sidebar() {
  const auth = await getCurrentUser();
  const showAdministration = isSoleAdministrator(auth);

  return (
    <aside className="sidebar sidebar-domains" aria-label="Domaines 974Darts">
      <div className="sidebar-domain-nav">
        <Link className="sidebar-domain-link sidebar-domain-stats" href="/stats">
          <span className="sidebar-domain-icon">◫</span>
          <span><strong>Stats & Données</strong><small>Championnat · joueurs · records</small></span>
        </Link>
        <Link className="sidebar-domain-link sidebar-domain-games" href="/play">
          <span className="sidebar-domain-icon">◎</span>
          <span><strong>Jeux</strong><small>501 · Cricket · Tic Tac Toe</small></span>
        </Link>
        <Link className="sidebar-domain-link sidebar-domain-admin" href="/admin">
          <span className="sidebar-domain-icon">⚙</span>
          <span><strong>Admin</strong><small>Gestion de la plateforme</small></span>
        </Link>
      </div>

      {auth.user ? (
        <div className="sidebar-account-zone">
          <Link href="/player">Mon espace</Link>
          {showAdministration ? <span className="sidebar-admin-badge">Administrateur</span> : null}
          <LogoutButton />
        </div>
      ) : (
        <div className="sidebar-account-zone">
          <Link href="/login">Connexion</Link>
        </div>
      )}
    </aside>
  );
}
