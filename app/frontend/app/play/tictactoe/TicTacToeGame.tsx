"use client";

import { useState } from "react";
import { Grid3X3, RefreshCcw, ShieldAlert, Trophy, Undo2 } from "lucide-react";
import { ParticipantSetup } from "@/components/play/ParticipantSetup";
import { type PlayFormat } from "@/lib/play/format";
import { applyTicTacToeDart, createTicTacToeGame, endTicTacToeVisit, targetLabel, type TicTacToeMode, type TicTacToeMultiplier, type TicTacToeState } from "@/lib/play/tictactoe-engine";

type Props={currentDisplayName:string};
const numbers=Array.from({length:20},(_,i)=>i+1);
const symbols=["○","×","△","◇"];
function deepCopy(state:TicTacToeState){return JSON.parse(JSON.stringify(state)) as TicTacToeState;}

export function TicTacToeGame({currentDisplayName}:Props){
  const [mode,setMode]=useState<TicTacToeMode>("NORMAL");
  const [format,setFormat]=useState<PlayFormat>("DUEL");
  const [names,setNames]=useState([currentDisplayName||"Joueur 1","Adversaire","Joueur 3","Joueur 4"]);
  const [game,setGame]=useState<TicTacToeState|null>(null);const [history,setHistory]=useState<TicTacToeState[]>([]);const [multiplier,setMultiplier]=useState<TicTacToeMultiplier>(1);const [nextStarter,setNextStarter]=useState(0);
  const updateName=(index:number,value:string)=>setNames(current=>current.map((name,i)=>i===index?value:name));
  function start(selectedMode=mode){const next=createTicTacToeGame(selectedMode,format,names,nextStarter);setGame(next);setHistory([]);setMultiplier(selectedMode==="HARD"?2:1);setNextStarter(value=>(value+1)%Math.max(1,next.participants.length));}
  function throwDart(target:number,forced?:TicTacToeMultiplier){if(!game||game.winnerSide!=null)return;setHistory(items=>[...items.slice(-49),deepCopy(game)]);setGame(applyTicTacToeDart(game,target,forced??multiplier));}
  function endVisit(){if(!game||game.winnerSide!=null)return;setHistory(items=>[...items.slice(-49),deepCopy(game)]);setGame(endTicTacToeVisit(game));}
  function undo(){const previous=history.at(-1);if(!previous)return;setGame(previous);setHistory(items=>items.slice(0,-1));}

  if(!game)return <div className="ttt-shell">
    <section className="ttt-hero"><div><span>974DARTS PLAY · TIC TAC TOE</span><h1>Tic Tac Toe</h1><p>Un seul jeu, puis choisissez le format et la difficulté avant de créer la grille.</p></div><Grid3X3 aria-hidden="true"/></section>
    <ParticipantSetup format={format} onFormatChange={setFormat} names={names} onNameChange={updateName} note="Solo, 1 vs 1, 3/4 joueurs ou 2 vs 2. En équipe, les cases sont partagées."/>
    <section className="ttt-mode-grid"><button type="button" className={mode==="NORMAL"?"selected":""} onClick={()=>setMode("NORMAL")}><Grid3X3/><small>NORMAL</small><strong>Toucher pour prendre</strong><p>9 numéros aléatoires. Simple, double ou triple : toucher la cible suffit.</p></button><button type="button" className={mode==="HARD"?"selected hard":"hard"} onClick={()=>setMode("HARD")}><ShieldAlert/><small>HARD</small><strong>Doubles uniquement + Bull</strong><p>8 numéros aléatoires et Bull au centre. Seuls les doubles et Bull 50 comptent.</p></button></section>
    <button className="ttt-start" type="button" onClick={()=>start()}>Créer la grille <span>→</span></button>
  </div>;

  const participant=game.participants[game.activeParticipant];const winnerName=typeof game.winnerSide==="number"?game.sideNames[game.winnerSide]:null;const boardTargets=new Set(game.cells.map(cell=>cell.target));
  return <div className="ttt-shell">
    <section className="ttt-matchbar"><div><span>{game.mode}</span><strong>Tic Tac Toe</strong></div><div><span>Au lancer</span><strong>{participant.name}</strong><small>{game.sideNames[participant.side]} · Flèche {game.dartsInVisit+1}/3</small></div><div className="ttt-actions"><button type="button" onClick={undo} disabled={!history.length}><Undo2/> Annuler</button><button type="button" onClick={()=>setGame(null)}><RefreshCcw/> Quitter</button></div></section>
    {game.winnerSide!=null?<section className="ttt-winner"><Trophy/><div><span>PARTIE TERMINÉE</span><h2>{game.winnerSide==="DRAW"?"Match nul":`${winnerName} gagne`}</h2><p>{game.winnerSide==="DRAW"?"La grille est complète sans alignement.":"Trois cases alignées."}</p></div><button type="button" onClick={()=>start(game.mode)}>Nouvelle grille</button></section>:null}
    <section className="ttt-side-strip">{game.sideNames.map((name,side)=><article key={side} className={participant.side===side?"active":""}><span>{symbols[side]??String(side+1)}</span><strong>{name}</strong></article>)}</section>
    <section className="ttt-game-grid ttt-game-grid-single"><div className="ttt-board" aria-label="Grille Tic Tac Toe">{game.cells.map(cell=><div key={cell.id} className={`ttt-cell owner-${cell.owner??"none"}`}><span>{targetLabel(cell.target)}</span><strong>{cell.owner==null?"·":symbols[cell.owner]??String(cell.owner+1)}</strong>{game.mode==="HARD"?<small>{cell.target===25?"BULL 50":`D${cell.target}`}</small>:<small>cible</small>}</div>)}</div></section>
    {game.winnerSide==null?<section className="ttt-entry"><header><div><span>SAISIE DE LA FLÈCHE</span><strong>{game.mode==="HARD"?"Double obligatoire":"Choisissez le multiplicateur puis le numéro"}</strong></div><button type="button" onClick={endVisit}>Fin de volée →</button></header><div className="ttt-multipliers">{([1,2,3] as TicTacToeMultiplier[]).map(value=><button type="button" key={value} disabled={game.mode==="HARD"&&value!==2} className={multiplier===value?"selected":""} onClick={()=>setMultiplier(value)}>{value===1?"SIMPLE":value===2?"DOUBLE":"TRIPLE"}</button>)}</div><div className="ttt-numbers">{numbers.map(value=><button type="button" key={value} className={boardTargets.has(value)?"on-board":""} onClick={()=>throwDart(value)}>{value}</button>)}</div><div className="ttt-specials">{game.mode==="HARD"?<button className="bull" type="button" onClick={()=>throwDart(25,2)}>BULL 50</button>:null}<button type="button" onClick={()=>throwDart(0,1)}>MISS</button></div></section>:null}
    <section className="ttt-history"><header><strong>Dernières flèches</strong><small>Les numéros présents sur la grille sont surlignés.</small></header>{game.log.length?game.log.map(entry=><div key={entry.id}><span>{game.participants[entry.participant]?.name}</span><b>{entry.dart}</b><small>{entry.result}</small></div>):<p>Aucune flèche enregistrée.</p>}</section>
  </div>;
}
