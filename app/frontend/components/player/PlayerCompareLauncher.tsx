"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Search, Sparkles, Swords, Users } from "lucide-react";

type PlayerOption = {
  player_id: string;
  name: string;
  team: string | null;
  average_3_darts?: number | null;
  win_rate?: number | null;
};

export function PlayerCompareLauncher({
  currentPlayerId,
  currentPlayerName,
  players,
}: {
  currentPlayerId: string;
  currentPlayerName: string;
  players: PlayerOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const choices = useMemo(() => players
    .filter((player) => player.player_id !== currentPlayerId)
    .filter((player) => `${player.name} ${player.team ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.average_3_darts ?? 0) - (a.average_3_darts ?? 0)), [currentPlayerId, players, query]);

  const selected = players.find((player) => player.player_id === selectedId);

  return <section className="card compare-launcher">
    <div className="compare-launcher-copy">
      <span className="eyebrow"><Swords size={14}/> Comparaison Premium</span>
      <h3>Comparer {currentPlayerName}</h3>
      <p>Sélectionne un joueur pour ouvrir le face-à-face, le radar ADN superposé et les KPI en mode VS.</p>
    </div>

    <div className="compare-launcher-controls">
      <label className="compare-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un joueur ou une équipe"/></label>
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">Choisir un joueur</option>
        {choices.map((player) => <option key={player.player_id} value={player.player_id}>{player.name}{player.team ? ` · ${player.team}` : ""}</option>)}
      </select>
      <button type="button" disabled={!selectedId} onClick={() => selectedId && router.push(`/players/compare/${currentPlayerId}/${selectedId}`)}><ArrowLeftRight size={17}/> Comparer</button>
    </div>

    <div className="compare-launcher-preview">
      <div className="compare-launcher-player"><span>{currentPlayerName.slice(0,2).toUpperCase()}</span><strong>{currentPlayerName}</strong><small>Joueur actuel</small></div>
      <div className="compare-launcher-vs"><Sparkles size={17}/><strong>VS</strong></div>
      <div className={`compare-launcher-player ${selected ? "" : "is-empty"}`}><span>{selected ? selected.name.slice(0,2).toUpperCase() : <Users size={18}/>}</span><strong>{selected?.name ?? "À sélectionner"}</strong><small>{selected?.team ?? "Joueur comparé"}</small></div>
    </div>
  </section>;
}
