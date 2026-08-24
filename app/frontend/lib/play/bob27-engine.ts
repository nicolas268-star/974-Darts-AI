import { buildParticipants, nextParticipantIndex, sideCount, sideName, type PlayFormat, type PlayParticipant } from "./format";

export type Bob27Multiplier = 1 | 2 | 3;
export type Bob27Side = { name: string; score: number; target: number; finished: boolean; visitHits: number };
export type Bob27LogEntry = { id: string; participant: number; dart: string; result: string };
export type Bob27State = { format: PlayFormat; participants: PlayParticipant[]; sides: Bob27Side[]; activeParticipant: number; dartsInVisit: number; finished: boolean; winnerSides: number[]; log: Bob27LogEntry[] };

export function createBob27Game(format: PlayFormat, names: string[]): Bob27State {
  const participants=buildParticipants(format,names);
  return {format,participants,sides:Array.from({length:sideCount(format)},(_,side)=>({name:sideName(format,side,participants),score:27,target:1,finished:false,visitHits:0})),activeParticipant:0,dartsInVisit:0,finished:false,winnerSides:[],log:[]};
}
function cloneState(s:Bob27State):Bob27State{return {...s,participants:s.participants.map(p=>({...p})),sides:s.sides.map(x=>({...x})),winnerSides:[...s.winnerSides],log:s.log.map(e=>({...e}))};}
function eligibleSides(state:Bob27State){return new Set(state.sides.map((side,index)=>!side.finished?index:-1).filter(index=>index>=0));}
function finishIfDone(state:Bob27State){if(!state.sides.every(side=>side.finished))return;state.finished=true;const best=Math.max(...state.sides.map(side=>side.score));state.winnerSides=state.sides.map((side,index)=>side.score===best?index:-1).filter(index=>index>=0);}
export function applyBob27Dart(current:Bob27State,value:number,multiplier:Bob27Multiplier){
  if(current.finished)return current;const state=cloneState(current);const pi=state.activeParticipant;const p=state.participants[pi];const side=state.sides[p.side];if(side.finished)return state;
  const hit=value===side.target&&multiplier===2;let result=hit?`D${side.target} touché · +${side.target*2}`:`Cible D${side.target} manquée`;
  if(hit){side.score+=side.target*2;side.visitHits+=1;}state.dartsInVisit+=1;
  const dart=value===0?"MISS":`${multiplier===1?"S":multiplier===2?"D":"T"}${value}`;
  if(state.dartsInVisit>=3){if(side.visitHits===0){side.score-=side.target*2;result+=` · aucun double : -${side.target*2}`;}else result+=` · ${side.visitHits} hit${side.visitHits>1?"s":""}`;side.target+=1;side.visitHits=0;state.dartsInVisit=0;if(side.target>20){side.finished=true;side.target=20;result+=" · parcours terminé";}finishIfDone(state);if(!state.finished)state.activeParticipant=nextParticipantIndex(pi,state.participants,eligibleSides(state));}
  state.log.unshift({id:`${Date.now()}-${Math.random()}`,participant:pi,dart,result});state.log=state.log.slice(0,24);return state;
}
export function endBob27Visit(current:Bob27State){if(current.finished)return current;let state=cloneState(current);const p=state.participants[state.activeParticipant];const side=state.sides[p.side];const remaining=Math.max(0,3-state.dartsInVisit);for(let i=0;i<remaining;i+=1)state=applyBob27Dart(state,0,1);return state;}
