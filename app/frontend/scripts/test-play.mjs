import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
function load(path) {
  const file = resolve(root, path.endsWith(".ts") ? path : path + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", source)((p) => load(resolve(dirname(file), p)), module, module.exports);
  return module.exports;
}
const input = load("lib/play/dart-input");
const x01 = load("lib/x01/engine");
const cricket = load("lib/play/cricket-engine");
const ttt = load("lib/play/tictactoe-engine");
const clock = load("lib/play/clock-engine");
const bob = load("lib/play/bob27-engine");
let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }
const names = ["Alice", "Bruno", "Camille", "David"];

test("Keyboard: singles, explicit doubles/triples, numeric 60, bull, misses", () => {
  for (const [value, factor, label] of [["20",1,"S20"],["20",3,"T20"],["d10",1,"D10"],["60",1,"T20"],["25",1,"25"],["50",3,"BULL"],["0",2,"MISS"],["T20",2,"T20"]]) assert.equal(input.parseDartInput(value,factor).label,label);
  for (const invalid of ["", "   ", "-20", "1.5", "20abc", "T25", "T50", "D0", "36", "999"]) assert.equal(input.parseDartInput(invalid),null,invalid);
});
test("Visit input keeps empty/invalid distinct from zero and rejects impossible scores", () => {
  for (const invalid of ["", " ", "-1", "1.5", "181", "abc", "1e2"]) assert.equal(input.parseVisitScore(invalid),null);
  assert.equal(input.parseVisitScore("0"),0);
  assert.equal(input.parseVisitScore("180"),180);
  assert.equal(input.isPossibleVisitScore(180,3),true);
  assert.equal(input.isPossibleVisitScore(179,3),false);
  assert.equal(input.isPossibleVisitScore(121,2),false);
  assert.equal(input.isPossibleVisitScore(60,1),true);
});
for (const format of ["SOLO","DUEL","THREE","FOUR","TEAMS_2V2"]) {
  test("Cricket handover / misses / triple / undo-safe immutability: " + format, () => {
    const initial=cricket.createCricketGame("BASIC","STANDARD",format,names);
    const serialized=JSON.stringify(initial);
    assert.equal(cricket.endCricketVisit(initial),initial);
    let state=cricket.applyCricketDart(initial,20,3);
    assert.equal(state.dartsInVisit,1);
    assert.equal(state.sides[0].marks[state.targets[0].id],3);
    state=cricket.applyCricketDart(state,1,1);
    state=cricket.applyCricketDart(state,0,1);
    assert.equal(state.dartsInVisit,3);
    assert.equal(state.activeParticipant,0);
    assert.equal(cricket.applyCricketDart(state,20,3),state);
    assert.deepEqual(state.log.slice(0,3).map(e=>e.dart),["MISS","S1","T20"]);
    const next=cricket.endCricketVisit(state);
    assert.equal(next.activeParticipant,format==="SOLO"?0:1);
    assert.equal(next.dartsInVisit,0);
    assert.equal(next.visitNumber,2);
    assert.equal(JSON.stringify(initial),serialized);
    assert.equal(state.dartsInVisit,3);
  });
}
test("Cut Throat allocates overflow only to open opponents", () => {
  let s=cricket.createCricketGame("BASIC","CUT_THROAT","THREE",names);
  s=cricket.applyCricketDart(s,20,3);
  s=cricket.applyCricketDart(s,20,2);
  assert.deepEqual(s.sides.map(side=>side.score),[0,40,40]);
});
test("Magic retains targets through 3/3 and changes them at handover", () => {
  let s=cricket.createCricketGame("MAGIC","STANDARD","DUEL",names,()=>0.5);
  const target=s.targets[0],value=target.value;
  s=cricket.applyCricketDart(s,value,1);
  s=cricket.applyCricketDart(s,0,1);
  s=cricket.applyCricketDart(s,0,1);
  assert.equal(s.targets[0].value,value);
  const next=cricket.endCricketVisit(s,()=>0);
  assert.notEqual(next.targets[0].value,value);
  assert.equal(next.sides[0].marks[target.id],1);
});
test("Cricket early win stops without a fourth dart", () => {
  const s=cricket.createCricketGame("BASIC","STANDARD","SOLO",names);
  for(const target of s.targets) s.sides[0].marks[target.id]=3;
  s.sides[0].marks[s.targets[0].id]=2;
  const won=cricket.applyCricketDart(s,20,1);
  assert.equal(won.winnerSide,0);
  assert.equal(won.dartsInVisit,1);
  assert.equal(cricket.applyCricketDart(won,20,1),won);
});
test("Morpion hard: invalid simple consumes a dart but does not capture", () => {
  let s=ttt.createTicTacToeGame("HARD","FOUR",names,0,()=>0.5);
  const target=s.cells[0].target;
  s=ttt.applyTicTacToeDart(s,target,1);
  assert.equal(s.dartsInVisit,1); assert.equal(s.cells[0].owner,null);
  s=ttt.applyTicTacToeDart(s,0,1); s=ttt.applyTicTacToeDart(s,0,1);
  assert.equal(s.activeParticipant,0); assert.equal(s.dartsInVisit,3);
  assert.equal(ttt.applyTicTacToeDart(s,target,2),s);
  assert.equal(ttt.endTicTacToeVisit(s).activeParticipant,1);
});
test("Clock: order, wrong multiplier and explicit handover", () => {
  let s=clock.createClockGame("DOUBLE","TEAMS_2V2",names);
  s=clock.applyClockDart(s,1,1); assert.equal(s.sides[0].target,1);
  s=clock.applyClockDart(s,1,2); assert.equal(s.sides[0].target,2);
  s=clock.applyClockDart(s,2,2); assert.equal(s.sides[0].target,3);
  assert.equal(s.dartsInVisit,3); assert.equal(s.activeParticipant,0);
  assert.equal(clock.applyClockDart(s,3,2),s);
  s=clock.endClockVisit(s); assert.equal(s.activeParticipant,1);
  assert.equal(s.participants[2].side,0);
});
test("Bob 27: penalty exactly once, next double and visible completed visit", () => {
  let s=bob.createBob27Game("DUEL",names);
  assert.equal(bob.endBob27Visit(s),s);
  for(let i=0;i<3;i++)s=bob.applyBob27Dart(s,0,1);
  assert.equal(s.sides[0].score,25);assert.equal(s.sides[0].target,2);
  assert.equal(s.dartsInVisit,3);assert.equal(s.activeParticipant,0);
  assert.equal(bob.applyBob27Dart(s,0,1),s);
  s=bob.endBob27Visit(s);assert.equal(s.activeParticipant,1);assert.equal(s.dartsInVisit,0);
});
test("Bob 27: complete solo course, no extra dart or handover after end", () => {
  let s=bob.createBob27Game("SOLO",names);
  for(let target=1;target<=20;target++){
    for(let dart=0;dart<3;dart++)s=bob.applyBob27Dart(s,target,2);
    if(target<20)s=bob.endBob27Visit(s);
  }
  assert.equal(s.finished,true);assert.equal(s.dartsInVisit,3);
  assert.deepEqual(s.winnerSides,[0]);assert.equal(s.sides[0].score,27+6*210);
  assert.equal(bob.endBob27Visit(s),s);
});
test("X01: double entry, early checkout and bust restore the initial score", () => {
  const args={scoreBefore:40,opened:true,inRule:"STRAIGHT_IN",outRule:"DOUBLE_OUT"};
  const win=x01.evaluateDarts({...args,darts:[x01.makeDart(20,2)]});
  assert.equal(win.checkout,true);assert.equal(win.dartsThrown,1);
  const bust=x01.evaluateDarts({...args,darts:[x01.makeDart(20,3)]});
  assert.equal(bust.bust,true);assert.equal(bust.scoreAfter,40);
  const entered=x01.evaluateDarts({scoreBefore:501,opened:false,inRule:"DOUBLE_IN",outRule:"DOUBLE_OUT",darts:[x01.makeDart(20,3),x01.makeDart(20,2),x01.makeDart(20,3)]});
  assert.equal(entered.scoreAfter,401);assert.equal(entered.dartsThrown,3);
});
console.log(count + " play engine tests passed.");
