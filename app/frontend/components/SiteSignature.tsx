"use client";

import Image from "next/image";
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
        <div className="site-signature-byline">
          <p>Créé et développé à La Réunion par</p>
          <span className="ndx-signature-brand">
            <span className="ndx-signature-logo">
              <Image alt="Logo NDX Performance Lab" height={1254} src="/brand/ndx-performance-lab.png" width={1254} />
            </span>
            <strong>NDX Performance Lab</strong>
          </span>
        </div>
      </div>
      <nav className="site-legal-links" aria-label="Informations juridiques">
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité & traceurs</Link>
        <Link href="/conditions-utilisation">Conditions d’utilisation</Link>
      </nav>
    </footer>
  );
}
