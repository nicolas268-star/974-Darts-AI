"use client";

import { useState } from "react";
import { BadgeCheck, Link2, Search, Trophy, X } from "lucide-react";

const backend = "/api/admin/backend";
type Candidate = { player_id:string; display_name:string; team_id:string|null; canonical_display_name:string|null };
type Observation = { code:string; name:string; date:string|null; match_count:number; legs_played:number|null; legs_won:number|null; average_3_darts:number|null };
type Preview = { alias:string; observations:Observation[]; tournament_count:number; match_count:number };

export default function TournamentAliasLink({onLinked}:{onLinked:()=>void}) {
  const [playerQuery,setPlayerQuery]=useState("");
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [player,setPlayer]=useState<Candidate|null>(null);
  const [alias,setAlias]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function searchPlayer(){
    if(!playerQuery.trim())return; setBusy(true);setMessage("");
    try{const p=new URLSearchParams({query:playerQuery.trim()});const r=await fetch(`${backend}/api/v1/identities/candidates/list?${p}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.detail??d.error??"Recherche impossible");setCandidates(d.players??[])}catch(e){setMessage(e instanceof Error?e.message:"Recherche impossible")}finally{setBusy(false)}
  }
  async function inspectAlias(){
    if(!player||!alias.trim())return;setBusy(true);setMessage("");
    try{const p=new URLSearchParams({alias:alias.trim()});const r=await fetch(`${backend}/api/v1/identities/tournament-alias/preview?${p}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.detail??d.error??"Analyse impossible");setPreview(d);if(!d.tournament_count)setMessage(`Aucune donnée de tournoi trouvée sous le nom « ${alias.trim()} ».`)}catch(e){setMessage(e instanceof Error?e.message:"Analyse impossible")}finally{setBusy(false)}
  }
  async function linkAlias(){
    if(!player||!preview?.alias)return;setBusy(true);setMessage("");
    try{const r=await fetch(`${backend}/api/v1/identities/merge-aliases`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({canonical_player_id:player.player_id,source_player_ids:[],alias_names:[preview.alias],notes:`Alias de tournoi confirmé : ${preview.alias} → ${player.display_name} (${preview.observations.map(o=>o.code).join(", ")})`})});const d=await r.json();if(!r.ok)throw new Error(d.detail??d.error??"Rattachement impossible");setMessage(`Alias rattaché : ${preview.alias} est maintenant associé à ${player.display_name}.`);setPreview(null);setAlias("");onLinked()}catch(e){setMessage(e instanceof Error?e.message:"Rattachement impossible")}finally{setBusy(false)}
  }
  return <section className="tournament-alias-link">
    <header><div><Trophy size={18}/><div><strong>Rattacher un alias de tournoi</strong><span>Associer un nom occasionnel à un joueur officiel sans créer de doublon.</span></div></div><small>Historique conservé</small></header>
    <div className="tournament-alias-form">
      <div className="alias-player-picker"><label>Joueur officiel à conserver</label><div className="alias-search"><Search size={15}/><input value={playerQuery} onChange={e=>setPlayerQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void searchPlayer()} placeholder="Ex. Corentin"/><button type="button" onClick={()=>void searchPlayer()} disabled={busy}>Rechercher</button></div>{player&&<div className="alias-selected"><b>{player.display_name}</b><span>Identité officielle</span><button type="button" onClick={()=>{setPlayer(null);setPreview(null)}}><X size={14}/></button></div>}{!!candidates.length&&!player&&<div className="alias-candidates">{candidates.map(c=><button type="button" key={c.player_id} onClick={()=>{setPlayer(c);setCandidates([])}}><b>{c.display_name}</b><span>{c.canonical_display_name?"Identité existante":"Identité à initialiser"}</span></button>)}</div>}</div>
      <div><label>Alias utilisé pendant le tournoi</label><div className="alias-search"><Link2 size={15}/><input value={alias} onChange={e=>{setAlias(e.target.value);setPreview(null)}} placeholder="Ex. Coco"/><button type="button" onClick={()=>void inspectAlias()} disabled={busy||!player||!alias.trim()}>Prévisualiser</button></div></div>
    </div>
    {preview&&preview.tournament_count>0&&<div className="alias-preview"><div><span>Rattachement proposé</span><strong>{preview.alias} <Link2 size={15}/> {player?.display_name}</strong><small>{preview.tournament_count} tournoi(s) · {preview.match_count} match(s) détecté(s)</small></div><div className="alias-observations">{preview.observations.map(o=><article key={`${o.code}-${o.date}`}><b>{o.code} · {o.name}</b><span>{o.date??"Date inconnue"} · {o.match_count} match(s) · {o.legs_played??"—"} legs</span></article>)}</div><button type="button" onClick={()=>void linkAlias()} disabled={busy}><BadgeCheck size={16}/>Confirmer {preview.alias} → {player?.display_name}</button></div>}
    {message&&<p className="alias-message">{message}</p>}
  </section>;
}
