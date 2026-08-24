"use client";

import Link from "next/link";
import { BadgeCheck, BrainCircuit, History, ShieldCheck, UserRoundSearch } from "lucide-react";
import "./identity-access-links.css";

export function IdentityAccessLinks({
  isAdmin,
  currentPlayerId,
  compact = false,
}: {
  isAdmin: boolean;
  currentPlayerId?: string | null;
  compact?: boolean;
}) {
  return (
    <nav className={`identity-access-links ${compact ? "is-compact" : ""}`} aria-label="Identités et carrière">
      {currentPlayerId && (
        <Link href={`/players/${currentPlayerId}/career`}>
          <History size={16}/>
          <span>Ma carrière</span>
        </Link>
      )}

      {isAdmin && (
        <>
          <Link href="/admin/identities">
            <BrainCircuit size={16}/>
            <span>Identity Hub</span>
          </Link>
          <Link href="/admin/player-identities">
            <UserRoundSearch size={16}/>
            <span>Assistant de fusion</span>
          </Link>
          <Link href="/admin/identities" className="identity-admin-link">
            <ShieldCheck size={16}/>
            <span>Qualité des identités</span>
          </Link>
        </>
      )}

      {!isAdmin && !currentPlayerId && (
        <Link href="/players">
          <BadgeCheck size={16}/>
          <span>Profils joueurs</span>
        </Link>
      )}
    </nav>
  );
}
