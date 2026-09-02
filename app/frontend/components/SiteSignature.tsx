"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export function SiteSignature() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return (
    <footer className="site-signature">
      <div className="site-signature-credit">
        <span aria-hidden="true" />
        <p>
          Créé et développé à La Réunion par <strong>Nicolas Dupont</strong>
        </p>
      </div>
      <nav className="site-legal-links" aria-label="Informations juridiques">
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité & traceurs</Link>
        <Link href="/conditions-utilisation">Conditions d’utilisation</Link>
      </nav>
    </footer>
  );
}
