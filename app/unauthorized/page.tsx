
import Link from "next/link";

type Props = {
  searchParams: Promise<{
    reason?: string;
    current?: string;
  }>;
};

export default async function UnauthorizedPage({ searchParams }: Props) {
  const params = await searchParams;
  const reason = params.reason ?? "unknown";

  const explanations: Record<string, string> = {
    role: `Ton compte est connecté, mais son rôle actuel (${params.current ?? "inconnu"}) n'autorise pas cette page.`,
    "profile-query":
      "Ton compte est connecté, mais Supabase n'a pas pu lire ton profil. Exécute le correctif SQL v0.6.1.",
    "profile-missing":
      "Ton compte existe dans Authentication, mais aucun profil public n'est associé.",
    unknown: "Cette page est réservée à un autre rôle utilisateur.",
  };

  return (
    <main className="container">
      <section className="card form">
        <span className="badge">Accès refusé</span>
        <h2 style={{ marginTop: 18 }}>Droits insuffisants</h2>
        <p>{explanations[reason] ?? explanations.unknown}</p>
        <p className="muted">
          Diagnostic technique : <code>{reason}</code>
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/player">
            Retour à mon espace
          </Link>
          <Link className="btn btn-secondary" href="/api/auth-diagnostic">
            Voir le diagnostic
          </Link>
        </div>
      </section>
    </main>
  );
}
