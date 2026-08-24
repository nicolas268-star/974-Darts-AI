"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export type PlayerNavItem = { player_id: string; name: string; team: string | null };

export function PlayerDashboardControls({ players, currentPlayerId }: { players: PlayerNavItem[]; currentPlayerId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => [...players].sort((a, b) => a.name.localeCompare(b.name, "fr")), [players]);
  const currentIndex = sorted.findIndex((player) => player.player_id === currentPlayerId);
  const filtered = query.trim()
    ? sorted.filter((player) => `${player.name} ${player.team ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const go = (id?: string) => id && router.push(`/players/${id}`);

  return (
    <div className="player-toolbar card">
      <div className="player-search-wrap">
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un joueur ou une équipe" aria-label="Rechercher un joueur" />
        {filtered.length > 0 && (
          <div className="player-search-results">
            {filtered.map((player) => (
              <button key={player.player_id} type="button" onClick={() => go(player.player_id)}>
                <strong>{player.name}</strong><span>{player.team ?? "Équipe non renseignée"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="player-nav-actions">
        <button className="btn btn-secondary" type="button" disabled={currentIndex <= 0} onClick={() => go(sorted[currentIndex - 1]?.player_id)}>
          <ChevronLeft size={17} /> Précédent
        </button>
        <span>{currentIndex >= 0 ? `${currentIndex + 1} / ${sorted.length}` : `${sorted.length} joueurs`}</span>
        <button className="btn btn-secondary" type="button" disabled={currentIndex < 0 || currentIndex >= sorted.length - 1} onClick={() => go(sorted[currentIndex + 1]?.player_id)}>
          Suivant <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
