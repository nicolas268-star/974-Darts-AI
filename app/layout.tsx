
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "974 Darts AI",
  description: "Plateforme d'analyse du championnat de fléchettes 974",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <header className="nav">
          <div className="container nav-inner">
            <Link className="brand" href="/">🎯 974 Darts <span>AI</span></Link>
            <nav className="nav-links">
              <Link href="/dashboard">Classement</Link>
              <Link href="/player">Espace joueur</Link>
              <Link href="/team">Équipe</Link>
              <Link className="btn btn-primary" href="/login">Connexion</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
