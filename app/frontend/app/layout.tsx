
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteSignature } from "@/components/SiteSignature";
import AudienceTracker from "@/components/analytics/AudienceTracker";

export const metadata: Metadata = {
  metadataBase: new URL("https://974darts.re"),
  title: {
    default: "974 Darts AI — Fléchettes à La Réunion",
    template: "%s | 974 Darts AI",
  },
  description:
    "Résultats, classements, équipes, joueurs et tournois de fléchettes à La Réunion.",
  alternates: { canonical: "/" },
  keywords: [
    "fléchettes La Réunion",
    "darts 974",
    "club de fléchettes Réunion",
    "tournoi fléchettes Réunion",
    "championnat 974",
    "darts Réunion",
    "classement fléchettes",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "974 Darts AI",
    locale: "fr_RE",
    title: "974 Darts AI — Fléchettes à La Réunion",
    description:
      "Résultats, classements, équipes, joueurs et tournois de fléchettes à La Réunion.",
    images: [{ url: "/hero-reunion-darts.png", width: 1200, height: 630, alt: "974 Darts AI — Fléchettes à La Réunion" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "974 Darts AI — Fléchettes à La Réunion",
    description:
      "Résultats, classements, équipes, joueurs et tournois de fléchettes à La Réunion.",
    images: ["/hero-reunion-darts.png"],
  },
  category: "sports",
  verification: {
    google: "vP5CLyAaU73Qrk6rTqKcVixtbCfBu_xHKPpb9LPSQL8",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr-RE">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Person", "@id": "https://974darts.re/#publisher", name: "Nicolas Dupont", url: "https://974darts.re" },
            { "@type": "WebSite", "@id": "https://974darts.re/#website", url: "https://974darts.re", name: "974 Darts AI", inLanguage: "fr-RE", publisher: { "@id": "https://974darts.re/#publisher" }, areaServed: { "@type": "AdministrativeArea", name: "La Réunion" } }
          ]
        }).replace(/</g, "\\u003c") }} />
        <AudienceTracker />
        <header className="nav">
          <div className="container nav-inner">
            <Link className="brand" href="/">🎯 974 Darts <span>AI</span></Link>
            <nav className="nav-links" aria-label="Domaines 974Darts">
              <Link className="nav-domain-link" href="/stats">Stats & Données</Link>
              <Link className="nav-domain-link" href="/play">Jeux</Link>
              <Link className="nav-domain-link" href="/admin">Admin</Link>
              <Link className="nav-account-link" href="/player">Mon espace</Link>
              <Link className="btn btn-primary" href="/login">Connexion</Link>
            </nav>
          </div>
        </header>
        {children}
        <SiteSignature />
      </body>
    </html>
  );
}
