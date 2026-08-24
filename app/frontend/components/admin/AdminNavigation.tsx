"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AdminNavigation.module.css";

const items = [
  { href: "/admin", label: "Dashboard", test: (p: string) => p === "/admin" },
  { href: "/admin/identities", label: "Identity Hub", test: (p: string) => p.startsWith("/admin/identities") },
  { href: "/admin/player-identities", label: "Assistant IA", test: (p: string) => p.startsWith("/admin/player-identities") },
  { href: "/admin/nakka-sync", label: "Agent Nakka", test: (p: string) => p.startsWith("/admin/nakka-sync") },
  { href: "/admin/seasons", label: "Saisons", test: (p: string) => p.startsWith("/admin/seasons") },
  { href: "/admin/transfers", label: "Transferts", test: (p: string) => p.startsWith("/admin/transfers") },
  { href: "/admin/calendar", label: "Calendrier", test: (p: string) => p.startsWith("/admin/calendar") },
  { href: "/admin/tournament-watch", label: "Veille tournois", test: (p: string) => p.startsWith("/admin/tournament-watch") },
  { href: "/admin/audience", label: "Audience", test: (p: string) => p.startsWith("/admin/audience") },
  { href: "/admin/visibility", label: "Visibilité", test: (p: string) => p.startsWith("/admin/visibility") },
  { href: "/admin/captain-nico", label: "Captain Nico", test: (p: string) => p.startsWith("/admin/captain-nico") },
  { href: "/admin/control", label: "Contrôle qualité", test: (p: string) => p.startsWith("/admin/control") },
  { href: "/admin/rules", label: "Règles", test: (p: string) => p.startsWith("/admin/rules") },
];

function pageLabel(pathname: string) {
  if (pathname === "/admin/identities") return "Identity Hub";
  if (pathname.startsWith("/admin/identities/")) return "Fiche identité";
  if (pathname.startsWith("/admin/player-identities")) return "Assistant IA";
  if (pathname.startsWith("/admin/nakka-sync")) return "Agent Nakka";
  if (pathname.startsWith("/admin/seasons")) return "Saisons";
  if (pathname.startsWith("/admin/transfers")) return "Joueurs & transferts";
  if (pathname.startsWith("/admin/calendar")) return "Calendrier";
  if (pathname.startsWith("/admin/tournament-watch")) return "Veille tournois";
  if (pathname.startsWith("/admin/audience")) return "Audience";
  if (pathname.startsWith("/admin/visibility")) return "Visibilité";
  if (pathname.startsWith("/admin/captain-nico")) return "Captain Nico";
  if (pathname.startsWith("/admin/control")) return "Contrôle qualité";
  if (pathname.startsWith("/admin/rules")) return "Règles";
  return "Administration";
}

export default function AdminNavigation() {
  const pathname = usePathname();

  return (
    <div className={styles.wrapper}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">
          <Link href="/admin">Administration</Link>
          <span aria-hidden="true">/</span>
          <strong>{pageLabel(pathname)}</strong>
        </nav>

        <div className={styles.actions}>
          {items.map((item) => {
            const active = item.test(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.actionLink} ${active ? styles.active : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
