"use client";

import { useState } from "react";
import { useSyncedGame } from "@/components/play/useSyncedGame";
import { LocalSessionBar } from "@/components/play/LocalSessionBar";
import { Grid3X3, ShieldAlert, Trophy, Undo2 } from "lucide-react";
import { TurnPanel } from "@/components/play/TurnPanel";
import { ParticipantSetup } from "@/components/play/ParticipantSetup";
import { type PlayFormat } from "@/lib/play/format";
import { applyTicTacToeDart, createTicTacToeGame, endTicTacToeVisit, targetLabel, type TicTacToeMode, type TicTacToeMultiplier, type TicTacToeState } from "@/lib/play/tictactoe-engine";

type Props={currentDisplayName:string;userId:string};
const symbols=["○","×","△","◇"];

export function TicTacToeGame({currentDisplayName,userId}:Props){
  const [mode,setMode]=useState<TicTacToeMode>("NORMAL");
  const [format,setFormat]=useState<PlayFormat>("DUEL");
  const [names,setNames]=useState([currentDisplayName||"Joueur 1","Adversaire","Joueur 3","Joueur 4"]);
  const { game, history, start: saveStart, act, undo, controls } = useSyncedGame<TicTacToeState>("tictactoe", userId);
  const updateName=(index:number,value:string)=>setNames(current=>current.map((name,i)=>i===index?value:name));
  function start(selectedMode=game?.mode??mode){
    const starter=game?(game.starter+1)%game.participants.length:0;
    saveStart(createTicTacToeGame(selectedMode,game?.format??format,game?.participants.map(p=>p.name)??names,starter));
  }
  function throwDart(target:number,forced?:TicTacToeMultiplier){act(current=>applyTicTacToeDart(current,target,forced??1));}
  function endVisit(){act(endTicTacToeVisit);}
  if(!controls.ready)return <LocalSessionBar controls={controls}/>;

  if(!game && controls.sync?.active && controls.blocked)return <LocalSessionBar controls={controls}/>;
  if(!game)return <div className="ttt-shell"><LocalSessionBar controls={controls}/>
    <section className="ttt-hero"><div><span>974DARTS PLAY · TIC TAC TOE</span><h1>Tic Tac Toe</h1><p>Un seul jeu, puis choisissez le format et la difficulté avant de créer la grille.</p></div><Grid3X3 aria-hidden="true"/></section>
    <ParticipantSetup format={format} onFormatChange={setFormat} names={names} onNameChange={updateName} note="Solo, 1 vs 1, 3/4 joueurs ou 2 vs 2. En équipe, les cases sont partagées."/>
    <section className="ttt-mode-grid"><button type="button" className={mode==="NORMAL"?"selected":""} onClick={()=>setMode("NORMAL")}><Grid3X3/><small>NORMAL</small><strong>Toucher pour prendre</strong><p>9 numéros aléatoires. Simple, double ou triple : toucher la cible suffit.</p></button><button type="button" className={mode==="HARD"?"selected hard":"hard"} onClick={()=>setMode("HARD")}><ShieldAlert/><small>HARD</small><strong>Doubles uniquement + Bull</strong><p>8 numéros aléatoires et Bull au centre. Seuls les doubles et Bull 50 comptent.</p></button></section>
    <button className="ttt-start" type="button" disabled={controls.blocked || controls.busy} onClick={() => start()}>Créer la grille <span>→</span></button>
  </div>;

  const participant=game.participants[game.activeParticipant];const winnerName=typeof game.winnerSide==="number"?game.sideNames[game.winnerSide]:null;
  return <div className="ttt-shell"><LocalSessionBar controls={controls}/>
    <section className="ttt-matchbar"><div><span>{game.mode}</span><strong>Tic Tac Toe</strong></div><div><span>Au lancer</span><strong>{participant.name}</strong><small>{game.sideNames[participant.side]} · {game.dartsInVisit}/3 fléchettes jouées</small></div><div className="ttt-actions"><button type="button" onClick={undo} disabled={!history.length || controls.blocked || controls.busy}><Undo2/> Annuler</button></div></section>
    <TurnPanel blocked={controls.problem==="conflict" || controls.blocked} pending={controls.busy} player={participant.name} nextPlayer={game.participants[(game.activeParticipant+1)%game.participants.length].name} darts={game.log.slice(0,game.dartsInVisit).reverse().map(e=>e.dart)} finished={game.winnerSide!=null} onDart={d=>throwDart(d.segment,(d.multiplier||1) as TicTacToeMultiplier)} onNext={endVisit} onUndo={undo} canUndo={history.length>0} defaultMultiplier={game.mode==="HARD"?2:1} hint={game.mode==="HARD"?"Doubles uniquement ; un simple compte comme une fléchette sans gagner de case.":"Alignez trois cases de votre camp."}/>
    {game.winnerSide!=null?<section className="ttt-winner"><Trophy/><div><span>PARTIE TERMINÉE</span><h2>{game.winnerSide==="DRAW"?"Match nul":`${winnerName} gagne`}</h2><p>{game.winnerSide==="DRAW"?"La grille est complète sans alignement.":"Trois cases alignées."}</p></div><button type="button" disabled={controls.blocked || controls.busy} onClick={() => start(game.mode)}>Nouvelle grille</button></section>:null}
    <section className="ttt-side-strip">{game.sideNames.map((name,side)=><article key={side} className={participant.side===side?"active":""}><span>{symbols[side]??String(side+1)}</span><strong>{name}</strong></article>)}</section>
    <section className="ttt-game-grid ttt-game-grid-single"><div className="ttt-board" aria-label="Grille Tic Tac Toe">{game.cells.map(cell=><div key={cell.id} className={`ttt-cell owner-${cell.owner??"none"}`}><span>{targetLabel(cell.target)}</span><strong>{cell.owner==null?"·":symbols[cell.owner]??String(cell.owner+1)}</strong>{game.mode==="HARD"?<small>{cell.target===25?"BULL 50":`D${cell.target}`}</small>:<small>cible</small>}</div>)}</div></section>
    <section className="ttt-history"><header><strong>Dernières flèches</strong><small>Les numéros présents sur la grille sont surlignés.</small></header>{game.log.length?game.log.map(entry=><div key={entry.id}><span>{game.participants[entry.participant]?.name}</span><b>{entry.dart}</b><small>{entry.result}</small></div>):<p>Aucune flèche enregistrée.</p>}</section>
  </div>;
}
