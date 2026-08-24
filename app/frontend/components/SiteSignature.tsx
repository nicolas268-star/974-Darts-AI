"use client";

import { usePathname } from "next/navigation";

export function SiteSignature() {
  const pathname = usePathname();

  if (pathname === "/") {
    return null;
  }

  return (
    <footer className="site-signature">
      <span aria-hidden="true" />
      <p>
        Créé et développé à La Réunion par <strong>Nicolas Dupont</strong>
      </p>
    </footer>
  );
}
