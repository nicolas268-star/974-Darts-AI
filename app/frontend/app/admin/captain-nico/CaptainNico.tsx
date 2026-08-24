"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Printer, RotateCcw, Save, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { PlayerOverview } from "@/lib/types/sprint4";
import type { DuoOverview } from "@/lib/duo/types";
import styles from "./CaptainNico.module.css";

type Slot = "A" | "B" | "C" | "D" | "A1P1" | "A1P2" | "A2P1" | "A2P2" | "Y" | "E" | "F" | "G" | "H" | "Z";
type Assignments = Record<Slot, string>;
type Result = "" | "W" | "L";
type PairAdvice = { ids:[string,string]; index:number; observed:string; explanation:string };
const blank: Assignments = { A:"", B:"", C:"", D:"", A1P1:"", A1P2:"", A2P1:"", A2P2:"", Y:"", E:"", F:"", G:"", H:"", Z:"" };
const matches = [
  [1,"A","F",true],[2,"B","E",false],[3,"C","H",true],[4,"D","G",false],
  [5,"A","E",false],[6,"B","F",true],[7,"C","G",false],[8,"D","H",true],
  [9,"A1","E1",true],[10,"A2","E2",true],[11,"A","G",true],[12,"C","E",true],
  [13,"B","H",false],[14,"D","F",false],[15,"A","H",false],[16,"D","E",true],
  [17,"B","G",true],[18,"C","F",false],[19,"A1","E2",false],[20,"A2","E1",false],
] as const;
const singles: Slot[] = ["A","B","C","D"];
const opponents: Slot[] = ["E","F","G","H"];
const fmt=(v:number|null|undefined,d=2)=>v==null?"—":v.toFixed(d).replace(".",",");
const permutations=<T,>(values:T[]):T[][]=>values.length<2?[values]:values.flatMap((value,index)=>permutations([...values.slice(0,index),...values.slice(index+1)]).map(rest=>[value,...rest]));

export default function CaptainNico({ players, duos }: { players: PlayerOverview[]; duos: DuoOverview[] }) {
  const [slots,setSlots]=useState<Assignments>(blank);
  const [results,setResults]=useState<Record<number,Result>>({});
  const [title,setTitle]=useState("Sélection Captain Nico");
  const [saved,setSaved]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem("captain-nico-v1");if(raw){const x=JSON.parse(raw);setSlots({...blank,...x.slots});setResults(x.results??{});setTitle(x.title??title)}}catch{}},[]);
  const byId=useMemo(()=>new Map(players.map(p=>[p.player_id,p])),[players]);
  const duplicateGroups = [
    [slots.A, slots.B, slots.C, slots.D, slots.Y],
    [slots.E, slots.F, slots.G, slots.H, slots.Z],
    [slots.A1P1, slots.A1P2],
    [slots.A2P1, slots.A2P2],
  ];
  const homeSelection=[slots.A,slots.B,slots.C,slots.D,slots.Y].filter(Boolean);
  const opponentSelection=[slots.E,slots.F,slots.G,slots.H,slots.Z].filter(Boolean);
  const crossSideDuplicate=homeSelection.some(id=>opponentSelection.includes(id));
  const hasInvalidDuplicate=duplicateGroups.some(group=>group.filter(Boolean).some((id,i,a)=>a.indexOf(id)!==i))||crossSideDuplicate;
  const score=Object.values(results).filter(x=>x==="W").length;
  const opponent=Object.values(results).filter(x=>x==="L").length;
  const selectedSingles=singles.map(s=>byId.get(slots[s])).filter(Boolean) as PlayerOverview[];
  const teamCount=new Set(selectedSingles.map(p=>p.team)).size;
  const recommendation=useMemo(()=>[...players].sort((a,b)=>power(b)-power(a)).slice(0,4),[players]);
  function power(p:PlayerOverview){return (p.average_3_darts??0)*.55+(p.first_9??0)*.2+(p.win_rate??0)*.18+Math.min(p.legs_played??0,100)*.07}
  function scorer(p:PlayerOverview){return (p.average_3_darts??0)*.62+(p.first_9??p.average_3_darts??0)*.38}
  function finisher(p:PlayerOverview){const legs=Math.max(p.legs_played??0,1);return (p.win_rate??0)*.48+Math.min((p.finishes/legs)*100,100)*.34+Math.min((p.best_finish??0)/170*100,100)*.18}
  function expected(a:PlayerOverview,b:PlayerOverview){const delta=power(a)-power(b);return 1/(1+Math.exp(-delta/8))}
  function assign(slot:Slot,id:string){setSlots(current=>({...current,[slot]:id}));setSaved(false)}
  function duoScore(a:string,b:string){const found=duos.find(d=>[d.player_1.id,d.player_2.id].includes(a)&&[d.player_1.id,d.player_2.id].includes(b));return found?`${fmt(found.win_rate,1)} % · ${found.matches_played} matchs`:"Duo non observé"}
  function save(){localStorage.setItem("captain-nico-v1",JSON.stringify({title,slots,results,savedAt:new Date().toISOString()}));setSaved(true)}
  function auto(){const next={...blank};recommendation.forEach((p,i)=>next[singles[i]]=p.player_id);next.A1P1=next.A;next.A1P2=next.B;next.A2P1=next.C;next.A2P2=next.D;setSlots(next);setSaved(false)}
  function name(code:string){if(code==="A1")return `${byId.get(slots.A1P1)?.name??"?"} / ${byId.get(slots.A1P2)?.name??"?"}`;if(code==="A2")return `${byId.get(slots.A2P1)?.name??"?"} / ${byId.get(slots.A2P2)?.name??"?"}`;return byId.get(slots[code as Slot])?.name??code}
  const Select=({slot,label}:{slot:Slot,label:string})=><label className={styles.select}><span>{label}</span><select value={slots[slot]} onChange={e=>assign(slot,e.target.value)}><option value="">À sélectionner</option>{players.map(p=><option key={p.player_id} value={p.player_id}>{p.name} · {p.team}</option>)}</select>{slots[slot]&&<small>Moy. {fmt(byId.get(slots[slot])?.average_3_darts)} · First 9 {fmt(byId.get(slots[slot])?.first_9)}</small>}</label>;
  const tactical=useMemo(()=>{
    const homeIds=[slots.A,slots.B,slots.C,slots.D,slots.Y].filter(Boolean);
    const awayIds=[slots.E,slots.F,slots.G,slots.H,slots.Z].filter(Boolean);
    if(new Set(homeIds).size!==5||new Set(awayIds).size!==5||homeIds.some(id=>awayIds.includes(id)))return null;
    const away=Object.fromEntries(opponents.map(slot=>[slot,byId.get(slots[slot])])) as Record<string,PlayerOverview>;
    const singlesOrder=[["A","F"],["B","E"],["C","H"],["D","G"],["A","E"],["B","F"],["C","G"],["D","H"],["A","G"],["C","E"],["B","H"],["D","F"],["A","H"],["D","E"],["B","G"],["C","F"]] as const;
    let best:{order:string[];value:number}|null=null;
    for(const chosenOut of homeIds){
      const starters=homeIds.filter(id=>id!==chosenOut);
      for(const order of permutations(starters)){
        const map=Object.fromEntries(singles.map((slot,i)=>[slot,byId.get(order[i])])) as Record<string,PlayerOverview>;
        const value=singlesOrder.reduce((sum,[a,b])=>sum+expected(map[a],away[b]),0);
        if(!best||value>best.value)best={order:[...order,chosenOut],value};
      }
    }
    const currentMap=Object.fromEntries(singles.map(slot=>[slot,byId.get(slots[slot])])) as Record<string,PlayerOverview>;
    const current=singlesOrder.reduce((sum,[a,b])=>sum+expected(currentMap[a],away[b]),0);
    const [a,b,c,d]=best!.order;
    const pairingSets=[[[a,b],[c,d]],[[a,c],[b,d]],[[a,d],[b,c]]] as [string,string][][];
    const pairScore=(ids:[string,string]):PairAdvice=>{
      const p1=byId.get(ids[0])!,p2=byId.get(ids[1])!;
      const observed=duos.find(x=>[x.player_1.id,x.player_2.id].includes(ids[0])&&[x.player_1.id,x.player_2.id].includes(ids[1]));
      const complement=(Math.max(scorer(p1),scorer(p2))*.55+Math.max(finisher(p1),finisher(p2))*.45);
      const reliability=observed?Math.min(observed.matches_played/8,1):0;
      const index=Math.min(100,Math.max(0,complement+(observed?((observed.win_rate-50)*.18*reliability):0)));
      const scoreLeader=scorer(p1)>=scorer(p2)?p1:p2;
      const finishLeader=finisher(p1)>=finisher(p2)?p1:p2;
      return {ids,index,observed:observed?`${fmt(observed.win_rate,1)} % sur ${observed.matches_played} match(s) observé(s)`:"Aucun match commun observé",explanation:`${scoreLeader.name} apporte le meilleur profil de scoring ; ${finishLeader.name} apporte le meilleur profil de finition.`};
    };
    const pairings=pairingSets.map(set=>set.map(ids=>pairScore(ids as [string,string])).sort((x,y)=>y.index-x.index)).sort((x,y)=>(y[0].index+y[1].index)-(x[0].index+x[1].index));
    return {best:best!,current,pairs:pairings[0]};
  },[slots,byId,duos]);
  function applyTactical(){if(!tactical)return;const [A,B,C,D,Y]=tactical.best.order;const [p1,p2]=tactical.pairs;setSlots(current=>({...current,A,B,C,D,Y,A1P1:p1.ids[0],A1P2:p1.ids[1],A2P1:p2.ids[0],A2P2:p2.ids[1]}));setSaved(false)}
  return <>
    <header className={styles.hero}><div className={styles.icon}><ShieldCheck/></div><div><span>ESPACE PRIVÉ DU CAPITAINE</span><h1>Captain Nico</h1><p>Compare deux sélections de cinq joueurs, optimise l’ordre des simples et estime les doubles les plus complémentaires.</p></div><strong><ShieldCheck/> Administrateur uniquement</strong></header>
    <section className={styles.toolbar}><input value={title} onChange={e=>setTitle(e.target.value)} aria-label="Nom de la composition"/><button onClick={auto}><Sparkles/>Proposition automatique</button><button onClick={save}><Save/>{saved?"Enregistré":"Enregistrer"}</button><button onClick={()=>window.print()}><Printer/>Imprimer</button><button className={styles.ghost} onClick={()=>{setSlots(blank);setResults({});setSaved(false)}}><RotateCcw/>Réinitialiser</button></section>
    {hasInvalidDuplicate&&<p className={styles.alert}>Un même joueur apparaît deux fois dans une sélection, dans les deux camps ou dans une même paire. Vérifie la composition avant impression.</p>}
    <section className={styles.versus}>
      <article className={styles.panel}><header><Users/><div><span>VOTRE SÉLECTION</span><h2>5 joueurs disponibles</h2></div></header><div className={styles.selectGrid}>{singles.map(s=><Select key={s} slot={s} label={`Position actuelle ${s}`}/>) }<Select slot="Y" label="5e joueur / remplaçant Y"/></div></article>
      <div className={styles.vs}>VS</div>
      <article className={styles.panel}><header><Users/><div><span>ÉQUIPE ADVERSE</span><h2>5 joueurs à étudier</h2></div></header><div className={styles.selectGrid}>{opponents.map(s=><Select key={s} slot={s} label={`Position prévue ${s}`}/>) }<Select slot="Z" label="5e joueur / remplaçant Z"/></div></article>
    </section>
    <section className={styles.tactical}><header><Sparkles/><div><span>SIMULATION TACTIQUE</span><h2>Ordre et doubles recommandés</h2></div>{tactical&&<button onClick={applyTactical}>Appliquer la recommandation</button>}</header>
      {!tactical?<p className={styles.empty}>Sélectionne cinq joueurs différents dans chaque camp pour lancer automatiquement l’étude.</p>:<div className={styles.tacticalGrid}>
        <article><small>Gain tactique estimé</small><strong>{(tactical.best.value-tactical.current).toFixed(2).replace(".",",")} victoire(s)</strong><p>Projection actuelle : {tactical.current.toFixed(1).replace(".",",")} / 16 simples · ordre conseillé : {tactical.best.value.toFixed(1).replace(".",",")} / 16.</p><ol>{singles.map((slot,i)=><li key={slot}><b>{slot}</b><span>{byId.get(tactical.best.order[i])?.name}</span><em>{byId.get(tactical.best.order[i])?.team}</em></li>)}<li><b>Y</b><span>{byId.get(tactical.best.order[4])?.name}</span><em>Remplaçant conseillé</em></li></ol></article>
        {tactical.pairs.map((pair,index)=><article key={pair.ids.join("-")}><small>Double conseillé {index+1}</small><strong>{byId.get(pair.ids[0])?.name} + {byId.get(pair.ids[1])?.name}</strong><div className={styles.index}><i style={{width:`${pair.index}%`}}/><b>{pair.index.toFixed(0)}/100</b></div><p>{pair.explanation}</p><em>{pair.observed}</em></article>)}
      </div>}
      <footer>Estimation d’aide à la décision : aucune précision aux doubles ou route de checkout n’est inventée. La décision finale appartient au capitaine.</footer>
    </section>
    <section className={styles.grid}>
      <article className={styles.panel}><header><Users/><div><span>Composition retenue</span><h2>Les quatre simples</h2></div></header><div className={styles.selectGrid}>{singles.map(s=><Select key={s} slot={s} label={`Position ${s}`}/>)}</div><div className={styles.summary}><span>{selectedSingles.length}/4 titulaires</span><span>{teamCount} équipe(s) représentée(s)</span></div></article>
      <article className={styles.panel}><header><Sparkles/><div><span>Conseil statistique</span><h2>Meilleur potentiel observé</h2></div></header><ol className={styles.ranking}>{recommendation.map((p,i)=><li key={p.player_id}><b>#{i+1}</b><span><strong>{p.name}</strong><small>{p.team}</small></span><em>{power(p).toFixed(1)}</em></li>)}</ol><p className={styles.note}>Aide à la décision fondée sur moyenne, First 9, victoire et volume. Le capitaine conserve toujours la décision finale.</p></article>
      <article className={styles.panel}><header><Users/><div><span>Synergies</span><h2>Les deux paires de doubles</h2></div></header><div className={styles.duos}><div><h3>A1</h3><Select slot="A1P1" label="Joueur 1"/><Select slot="A1P2" label="Joueur 2"/><p>{duoScore(slots.A1P1,slots.A1P2)}</p></div><div><h3>A2</h3><Select slot="A2P1" label="Joueur 1"/><Select slot="A2P2" label="Joueur 2"/><p>{duoScore(slots.A2P1,slots.A2P2)}</p></div></div><Select slot="Y" label="Remplaçant Y"/></article>
    </section>
    <section className={styles.matchSheet}><header><div><span>FEUILLE OFFICIELLE RECONSTITUÉE</span><h2>Suivi de la rencontre</h2><p>16 simples et 4 doubles · coche le vainqueur à mesure que la soirée avance.</p></div><div className={styles.score}><small>Sélection</small><strong>{score} - {opponent}</strong><small>Adversaire</small></div></header><div className={styles.matches}>{matches.map(([number,home,away,starts])=><article key={number} className={results[number]?styles.done:""}><div><small>Match {number}</small><strong>{home.startsWith("A")||["B","C","D"].includes(home)?name(home):home}</strong><span>{starts?"Premier lancer":""}</span></div><b>VS</b><div><strong>{away}</strong><span>{!starts?"Premier lancer":""}</span></div><fieldset><button className={results[number]==="W"?styles.win:""} onClick={()=>setResults(r=>({...r,[number]:r[number]==="W"?"":"W"}))}>Gagné</button><button className={results[number]==="L"?styles.loss:""} onClick={()=>setResults(r=>({...r,[number]:r[number]==="L"?"":"L"}))}>Perdu</button></fieldset></article>)}</div><footer><ClipboardCheck/><span>{Object.values(results).filter(Boolean).length}/20 résultats saisis</span><div className={styles.progress}><i style={{width:`${Object.values(results).filter(Boolean).length*5}%`}}/></div></footer></section>
  </>;
}
