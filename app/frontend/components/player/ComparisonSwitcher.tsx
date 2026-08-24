"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, RefreshCw } from "lucide-react";

type PlayerOption = { player_id: string; name: string; team: string | null; };

export function ComparisonSwitcher({ leftPlayerId, rightPlayerId, players }: { leftPlayerId: string; rightPlayerId: string; players: PlayerOption[] }) {
  const router = useRouter();
  const [left, setLeft] = useState(leftPlayerId);
  const [right, setRight] = useState(rightPlayerId);
  const sorted = useMemo(() => [...players].sort((a,b) => a.name.localeCompare(b.name, "fr")), [players]);
  const valid = left && right && left !== right;

  return <section className="card comparison-switcher">
    <div><span className="eyebrow"><ArrowLeftRight size={14}/> Comparaison instantanée</span><strong>Changer les joueurs sans quitter l’analyse</strong></div>
    <select value={left} onChange={(event) => setLeft(event.target.value)}>{sorted.map((player) => <option key={player.player_id} value={player.player_id}>{player.name}{player.team ? ` · ${player.team}` : ""}</option>)}</select>
    <button type="button" className="comparison-invert" onClick={() => { setLeft(right); setRight(left); if(valid) router.push(`/players/compare/${right}/${left}`); }}><RefreshCw size={17}/></button>
    <select value={right} onChange={(event) => setRight(event.target.value)}>{sorted.map((player) => <option key={player.player_id} value={player.player_id}>{player.name}{player.team ? ` · ${player.team}` : ""}</option>)}</select>
    <button type="button" className="comparison-apply" disabled={!valid} onClick={() => valid && router.push(`/players/compare/${left}/${right}`)}>Comparer</button>
  </section>;
}
