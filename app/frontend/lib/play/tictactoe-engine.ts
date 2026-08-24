import { buildParticipants, nextParticipantIndex, sideCount, sideName, type PlayFormat, type PlayParticipant } from "./format";

export type TicTacToeMode = "NORMAL" | "HARD";
export type TicTacToeMultiplier = 1 | 2 | 3;
export type TicTacToeCell = { id: string; target: number; owner: number | null };
export type TicTacToeLogEntry = { id: string; participant: number; side: number; dart: string; result: string };
export type TicTacToeState = {
  mode: TicTacToeMode;
  format: PlayFormat;
  cells: TicTacToeCell[];
  participants: PlayParticipant[];
  sideNames: string[];
  activeParticipant: number;
  dartsInVisit: number;
  starter: number;
  winnerSide: number | "DRAW" | null;
  log: TicTacToeLogEntry[];
};

export const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6],
] as const;

function shuffled<T>(values: T[], random = Math.random) {
  const result=[...values];
  for(let i=result.length-1;i>0;i-=1){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function targetLabel(target:number){return target===25?"BULL":String(target)}
export function createBoard(mode:TicTacToeMode, random=Math.random):TicTacToeCell[]{
  const numbers=shuffled(Array.from({length:20},(_,i)=>i+1),random);
  const targets=mode==="HARD"?[...numbers.slice(0,8),25]:numbers.slice(0,9);
  const randomized=shuffled(targets,random);
  if(mode==="HARD"){const bullIndex=randomized.indexOf(25);[randomized[4],randomized[bullIndex]]=[randomized[bullIndex],randomized[4]];}
  return randomized.slice(0,9).map((target,index)=>({id:`cell-${index}`,target,owner:null}));
}
export function createTicTacToeGame(mode:TicTacToeMode, format:PlayFormat, names:string[], starter=0, random=Math.random):TicTacToeState{
  const participants=buildParticipants(format,names);
  return {mode,format,cells:createBoard(mode,random),participants,sideNames:Array.from({length:sideCount(format)},(_,side)=>sideName(format,side,participants)),activeParticipant:Math.min(starter,participants.length-1),dartsInVisit:0,starter,winnerSide:null,log:[]};
}
function winnerFor(cells:TicTacToeCell[],side:number){return WIN_LINES.some(line=>line.every(index=>cells[index]?.owner===side));}
function cloneState(state:TicTacToeState):TicTacToeState{return {...state,cells:state.cells.map(c=>({...c})),participants:state.participants.map(p=>({...p})),sideNames:[...state.sideNames],log:state.log.map(e=>({...e}))};}
function dartLabel(target:number,m:TicTacToeMultiplier){if(target===0)return"MISS";if(target===25)return m===2?"BULL 50":"25";return `${m===1?"S":m===2?"D":"T"}${target}`;}
export function applyTicTacToeDart(current:TicTacToeState,target:number,multiplier:TicTacToeMultiplier){
  if(current.winnerSide!=null)return current;
  const state=cloneState(current);const participantIndex=state.activeParticipant;const participant=state.participants[participantIndex];const side=participant.side;const cell=state.cells.find(item=>item.target===target);const validHardHit=state.mode!=="HARD"||multiplier===2;let result="Pas de case correspondante";
  if(!validHardHit)result="Hard : seul un double compte";
  else if(cell&&cell.owner==null){cell.owner=side;result=`Case ${targetLabel(target)} gagnée`;}
  else if(cell)result=cell.owner===side?"Case déjà à votre camp":"Case déjà prise";
  state.log.unshift({id:`${Date.now()}-${Math.random()}`,participant:participantIndex,side,dart:dartLabel(target,multiplier),result});state.log=state.log.slice(0,24);state.dartsInVisit+=1;
  if(winnerFor(state.cells,side)){state.winnerSide=side;return state;}
  if(state.cells.every(item=>item.owner!=null)){state.winnerSide="DRAW";return state;}
  if(state.dartsInVisit>=3){state.activeParticipant=nextParticipantIndex(participantIndex,state.participants);state.dartsInVisit=0;}
  return state;
}
export function endTicTacToeVisit(current:TicTacToeState){if(current.winnerSide!=null)return current;const state=cloneState(current);state.activeParticipant=nextParticipantIndex(state.activeParticipant,state.participants);state.dartsInVisit=0;return state;}
