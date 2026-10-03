import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map();
function load(path) {
  const file = resolve(root, path.endsWith(".ts") ? path : path + ".ts");
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", source)((p) => p.startsWith(".") ? load(resolve(dirname(file), p)) : nativeRequire(p), loadedModule, loadedModule.exports);
  return loadedModule.exports;
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
test("X01 quick checkout rejects impossible finish combinations", () => {
  assert.equal(input.isPossibleDoubleCheckout(170,3),true);
  assert.equal(input.isPossibleDoubleCheckout(169,3),false);
  assert.equal(input.isPossibleDoubleCheckout(159,3),false);
  assert.equal(input.isPossibleDoubleCheckout(60,1),false);
  assert.equal(input.isPossibleDoubleCheckout(50,1),true);
  assert.equal(input.isPossibleDoubleCheckout(40,1),true);
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

const fun = load("lib/play/fun-engine");
// Historical saved-state fixture: v1 map and immediate win rules stay supported.
function legacyConquest(format, playerNames, options = {}) {
  const game = fun.createFunGame("conquest", format, playerNames, options, () => 0.999999);
  delete game.campaign; game.territories = game.territories.slice(0,20);
  if (options.conquestMode === "CONNECTED") game.strategy = {version:1,goal:options.conquestPointsGoal ?? 18};
  return game;
}
const dart = (segment, multiplier = 1) => x01.makeDart(segment, multiplier);
for (const kind of ["connect4", "conquest", "bull500"]) {
  for (const format of ["SOLO", "DUEL", "THREE", "FOUR", "TEAMS_2V2"]) {
    test(kind + ": immutable misses, explicit handover and shared teams / " + format, () => {
      const initial = fun.createFunGame(kind, format, names), snapshot = JSON.stringify(initial);
      assert.equal(fun.endFunVisit(initial), initial);
      let state = initial;
      for (let i = 0; i < 3; i++) state = fun.applyFunDart(state, dart(0));
      assert.equal(state.visitDarts.length, 3); assert.equal(state.visitClosed, true); assert.equal(state.activeParticipant, 0);
      assert.equal(fun.applyFunDart(state, dart(20, 3)), state);
      const next = fun.endFunVisit(state);
      assert.equal(next.activeParticipant, format === "SOLO" ? 0 : 1);
      assert.deepEqual(next.visitDarts, []); assert.equal(next.visitClosed, false); assert.equal(next.visitNumber, 2);
      assert.equal(JSON.stringify(initial), snapshot); assert.equal(state.visitDarts.length, 3);
      if (format === "TEAMS_2V2") { assert.deepEqual(state.participants.map(p => p.side), [0, 1, 0, 1]); assert.equal(state.sideNames.length, 2); }
    });
  }
}
test("Puissance 4: one token even on a triple, gravity, early stop and undo-safe board", () => {
  const initial = fun.createFunGame("connect4", "DUEL", names);
  const first = fun.applyFunDart(initial, dart(14, 3));
  assert.equal(first.board[35], 0); assert.equal(first.board.filter(v => v !== null).length, 1);
  assert.equal(first.visitDarts.length, 1); assert.equal(first.visitClosed, true);
  assert.equal(fun.applyFunDart(first, dart(15)), first); assert.equal(initial.board[35], null);
  const second = fun.applyFunDart(fun.endFunVisit(first), dart(14));
  assert.equal(second.board[28], 1); assert.equal(first.board[28], null);
});
test("Puissance 4: doubles option and full columns consume attempts", () => {
  let s = fun.createFunGame("connect4", "DUEL", names, { connectRule: "DOUBLE" });
  s = fun.applyFunDart(s, dart(20)); assert.equal(s.visitClosed, false); assert.equal(s.board[41], null);
  s = fun.applyFunDart(s, dart(20, 2)); assert.equal(s.board[41], 0); assert.equal(s.visitDarts.length, 2); assert.equal(s.visitClosed, true);
  s = fun.createFunGame("connect4", "DUEL", names);
  for (let row = 0; row < 6; row++) s.board[row * 7] = row % 2;
  const next = fun.applyFunDart(s, dart(14));
  assert.deepEqual(next.board, s.board); assert.equal(next.visitClosed, false); assert.equal(next.visitDarts.length, 1);
});
for (const [name, cells, column, supports] of [
  ["horizontal", [35, 36, 37], 3, []],
  ["vertical", [35, 28, 21], 0, []],
  ["diagonal rising right", [35, 29, 23], 3, [38, 31, 24]],
  ["diagonal rising left", [41, 33, 25], 3, [38, 31, 24]],
]) {
  test("Puissance 4: " + name + " victory and terminal guard", () => {
    const initial = fun.createFunGame("connect4", "DUEL", names);
    for (const index of cells) initial.board[index] = 0;
    for (const index of supports) initial.board[index] = 1;
    const win = fun.applyFunDart(initial, dart(14 + column));
    assert.equal(win.winnerSide, 0); assert.equal(win.winningCells.length, 4);
    assert.equal(fun.endFunVisit(win), win); assert.equal(fun.applyFunDart(win, dart(20)), win);
  });
}
test("Puissance 4: full board draw, no horizontal wrapping", () => {
  const initial = fun.createFunGame("connect4", "DUEL", names);
  initial.board = Array.from({length:42}, (_, i) => (Math.floor(i / 7) + Math.floor((i % 7) / 2)) % 2);
  initial.board[0] = null;
  const draw = fun.applyFunDart(initial, dart(14));
  assert.equal(draw.winnerSide, "DRAW"); assert.equal(draw.winningCells.length, 0);
  const wrap = fun.createFunGame("connect4", "DUEL", names);
  for (const index of [33, 34, 35]) wrap.board[index] = 0;
  assert.equal(fun.applyFunDart(wrap, dart(15)).winnerSide, null);
});
test("Conquest: marks survive visits, capture resets all progress, opponent can recapture", () => {
  let s = legacyConquest( "THREE", names);
  const initial = JSON.stringify(s);
  s = fun.applyFunDart(s, dart(20, 2));
  assert.equal(s.territories[19].marks[0], 2); assert.equal(s.territories[19].owner, null);
  s = fun.applyFunDart(s, dart(0)); s = fun.applyFunDart(s, dart(0)); s = fun.endFunVisit(s);
  s = fun.applyFunDart(s, dart(20, 3));
  assert.equal(s.territories[19].owner, 1); assert.deepEqual(s.territories[19].marks, [0, 0, 0]);
  const same = fun.applyFunDart(s, dart(20, 3));
  assert.deepEqual(same.territories, s.territories); assert.equal(same.visitDarts.length, 2);
  s = fun.applyFunDart(same, dart(0)); s = fun.endFunVisit(s);
  s = fun.applyFunDart(s, dart(20, 3)); assert.equal(s.territories[19].owner, 2);
  assert.deepEqual(fun.conquestCounts(s), [0, 0, 1]);
  assert.equal(JSON.parse(initial).territories[19].owner, null);
});
test("Conquest: configured victory before third dart and team ownership", () => {
  let s = legacyConquest( "TEAMS_2V2", names, { conquestGoal: 5 });
  for (let i = 0; i < 4; i++) s.territories[i].owner = 0;
  s.activeParticipant = 2;
  const win = fun.applyFunDart(s, dart(5, 3));
  assert.equal(win.winnerSide, 0); assert.equal(win.visitDarts.length, 1);
  assert.equal(fun.applyFunDart(win, dart(6, 3)), win);
  assert.deepEqual(fun.conquestCounts(win), [5, 0]);
});
test("Bull 500: unlock required, no bull points, allowed targets and relock every visit", () => {
  let s = fun.createFunGame("bull500", "SOLO", names);
  s = fun.applyFunDart(s, dart(20, 3)); assert.equal(s.scores[0], 0);
  s = fun.applyFunDart(s, dart(25)); assert.equal(s.unlocked, false);
  s = fun.applyFunDart(s, dart(25, 2)); assert.equal(s.unlocked, true); assert.equal(s.scores[0], 0);
  s = fun.endFunVisit(s); assert.equal(s.unlocked, false);
  s = fun.applyFunDart(s, dart(25, 2)); s = fun.applyFunDart(s, dart(20, 3)); s = fun.applyFunDart(s, dart(19, 3));
  assert.equal(s.scores[0], 60);
  assert.equal(fun.applyFunDart(s, dart(20, 3)), s);
});
test("Bull 500: 25 option, 19 / both targets, team score and winning overshoot", () => {
  for (const target of ["19", "19_OR_20"]) {
    let s = fun.createFunGame("bull500", "TEAMS_2V2", names, { bullUnlock: "25_OR_50", bullTarget: target });
    s.activeParticipant = 2; s.scores[0] = 450;
    s = fun.applyFunDart(s, dart(25)); assert.equal(s.scores[0], 450);
    const win = fun.applyFunDart(s, dart(19, 3));
    assert.equal(win.scores[0], 507); assert.equal(win.winnerSide, 0); assert.equal(win.visitDarts.length, 2);
    assert.equal(fun.endFunVisit(win), win); assert.equal(s.scores[0], 450);
  }
  let s = fun.createFunGame("bull500", "DUEL", names, { bullTarget: "19_OR_20" });
  s = fun.applyFunDart(s, dart(25, 2)); s = fun.applyFunDart(s, dart(19, 3)); s = fun.applyFunDart(s, dart(20, 2));
  assert.equal(s.scores[0], 97);
});


const local = load("lib/play/local-sessions");
const world = load("lib/play/conquest-map");
test("Conquest world: 20 numbered regions, connected undirected graph, visible sea links and no duplicate borders", () => {
  assert.deepEqual(world.CONQUEST_REGIONS.map(r=>r.id),Array.from({length:20},(_,i)=>i+1));
  const edges=new Set();
  for(const [a,b] of world.CONQUEST_LINKS){
    assert.ok(a>=1&&b<=20&&a<b);const key=a+":"+b;assert.equal(edges.has(key),false);edges.add(key);
    assert.ok(world.conquestNeighbors(a).includes(b));assert.ok(world.conquestNeighbors(b).includes(a));
  }
  const reached=new Set([1]),queue=[1];
  while(queue.length)for(const neighbor of world.conquestNeighbors(queue.shift()))if(!reached.has(neighbor)){reached.add(neighbor);queue.push(neighbor);}
  assert.equal(reached.size,20);
  assert.ok(world.conquestNeighbors(20).includes(19));
  for(const route of world.CONQUEST_SEA_LINKS)assert.ok(route.path.startsWith("M"));
});
test("Conquest strategy: compact territory scores more, each allied border counts only once", () => {
  const connected=legacyConquest("DUEL",names,{conquestMode:"CONNECTED"});
  for(const id of [1,2,3])connected.territories[id-1].owner=0;
  assert.deepEqual(fun.conquestScores(connected),[8,0]);assert.equal(fun.conquestAlliedLinks(connected,0),2);
  assert.equal(fun.conquestCaptureValue(connected,5,0),3);assert.equal(fun.conquestCaptureValue(connected,20,0),2);assert.equal(fun.conquestCaptureValue(connected,2,0),0);
  const isolated=legacyConquest("DUEL",names,{conquestMode:"CONNECTED"});
  for(const id of [1,10,20])isolated.territories[id-1].owner=0;
  assert.deepEqual(fun.conquestScores(isolated),[6,0]);
  isolated.territories[18].owner=0;assert.equal(fun.conquestScores(isolated)[0],9,"Maritime neighbor gives one bonus");
});
test("Conquest strategy: severing a bridge removes points and recapture cannot farm points", () => {
  const original=legacyConquest("DUEL",names,{conquestMode:"CONNECTED"});
  for(const id of [1,2,5])original.territories[id-1].owner=0;
  original.activeParticipant=1;
  let cut=fun.applyFunDart(original,dart(2,3));assert.deepEqual(fun.conquestScores(cut),[4,2]);
  assert.match(cut.log[0].result,/perd 4 points/);assert.deepEqual(fun.conquestScores(original),[8,0],"Undo snapshot remains intact");
  cut=fun.applyFunDart(cut,dart(0));cut=fun.applyFunDart(cut,dart(0));cut=fun.endFunVisit(cut);
  const restored=fun.applyFunDart(cut,dart(2,3));assert.deepEqual(fun.conquestScores(restored),[8,0]);
  assert.match(restored.log[0].result,/\+4 points/);
});
for(const format of ["SOLO","DUEL","THREE","FOUR","TEAMS_2V2"]){
  test("Conquest strategy: immediate points victory and shared team ownership / "+format,()=>{
    let game=legacyConquest(format,names,{conquestMode:"CONNECTED",conquestPointsGoal:12});
    for(const id of [2,3,5])game.territories[id-1].owner=0;
    if(format==="TEAMS_2V2")game.activeParticipant=2;
    assert.equal(fun.conquestScores(game)[0],8);assert.equal(local.validGame("conquest",game),true);
    const previous=game;game=fun.applyFunDart(game,dart(6,3));
    assert.equal(fun.conquestScores(game)[0],12);assert.equal(game.winnerSide,0);assert.equal(game.visitDarts.length,1);assert.equal(game.visitClosed,true);
    assert.equal(local.validGame("conquest",game),true);assert.equal(fun.applyFunDart(game,dart(7,3)),game);assert.equal(fun.endFunVisit(game),game);
    assert.equal(fun.conquestScores(previous)[0],8);
  });
}
test("Conquest strategy: save validation accepts classic records and rejects unknown rules or inconsistent victories", () => {
  const classic=legacyConquest("DUEL",names,{conquestGoal:5});
  assert.equal(classic.strategy,undefined);assert.equal(local.validGame("conquest",classic),true);
  const game=legacyConquest("DUEL",names,{conquestMode:"CONNECTED",conquestPointsGoal:24});
  assert.equal(local.validGame("conquest",game),true);
  for(const strategy of [null,{version:2,goal:24},{version:1,goal:7},{version:1}])assert.equal(local.validGame("conquest",{...game,strategy}),false);
  assert.equal(local.validGame("conquest",{...game,winnerSide:0,visitClosed:true}),false);
  const missingWinner=structuredClone(game);for(let i=0;i<12;i++)missingWinner.territories[i].owner=0;
  assert.equal(local.validGame("conquest",missingWinner),false);
  assert.match(local.describeGame(game),/24 points/);assert.match(local.describeGame(classic),/5 territoires/);
});
function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const savedSession = (game, id = "session-1", history = []) => ({ id, startedAt: "2026-09-30T10:00:00Z", updatedAt: "2026-09-30T10:01:00Z", game, history });
const savedFixtures = {
  cricket: () => cricket.createCricketGame("MAGIC", "CUT_THROAT", "FOUR", names, () => 0.5),
  tictactoe: () => ttt.createTicTacToeGame("HARD", "TEAMS_2V2", names, 2, () => 0.5),
  clock: () => clock.createClockGame("DOUBLE", "THREE", names),
  bob27: () => bob.createBob27Game("FOUR", names),
  connect4: () => fun.createFunGame("connect4", "TEAMS_2V2", names, { connectRule: "DOUBLE" }),
  conquest: () => fun.createFunGame("conquest", "FOUR", names, { conquestGoal: 5 }),
  bull500: () => fun.createFunGame("bull500", "SOLO", names, { bullUnlock: "25_OR_50", bullTarget: "19_OR_20" }),
};
const applyMiss = (kind, game) => kind === "cricket" ? cricket.applyCricketDart(game, 0, 1) :
  kind === "tictactoe" ? ttt.applyTicTacToeDart(game, 0, 1) : kind === "clock" ? clock.applyClockDart(game, 0, 1) :
    kind === "bob27" ? bob.applyBob27Dart(game, 0, 1) : fun.applyFunDart(game, dart(0));
for (const [kind, create] of Object.entries(savedFixtures)) {
  test("Local save roundtrip preserves players, variants, board, 3/3 and undo: " + kind, () => {
    const storage = memoryStorage();
    let game = create(); const history = [];
    for (let i = 0; i < 3; i++) { history.push(game); game = applyMiss(kind, game); }
    const session = savedSession(game, "session-1", history);
    assert.equal(local.validGame(kind, game), true);
    const written = local.saveRecord(storage, "account-a", kind, 0, session);
    assert.equal(written.ok, true); assert.equal(written.record.revision, 1);
    const restored = local.readRecord(storage, "account-a", kind);
    assert.deepEqual(restored.record.current, session);
    assert.equal(restored.record.current.history.length, 3);
    assert.equal(local.readRecord(storage, "account-b", kind).record.current, null);
    const wrong = JSON.parse(JSON.stringify(game)); wrong.activeParticipant = 99;
    assert.equal(local.validGame(kind, wrong), false);
  });
}
test("Local saves: stale revision cannot overwrite a newer tab or another game", () => {
  const storage = memoryStorage(), first = savedSession(savedFixtures.cricket());
  assert.equal(local.saveRecord(storage, "a", "cricket", 0, first).ok, true);
  const before = storage.getItem(local.storageKey("a", "cricket"));
  assert.deepEqual(local.saveRecord(storage, "a", "cricket", 0, null), { ok: false, problem: "conflict" });
  assert.equal(storage.getItem(local.storageKey("a", "cricket")), before);
  assert.equal(local.saveRecord(storage, "a", "clock", 0, savedSession(savedFixtures.clock())).ok, true);
  assert.equal(storage.getItem(local.storageKey("a", "cricket")), before);
});
test("Local saves: malformed, incompatible and structurally invalid records are retained without writes", () => {
  const storage = memoryStorage(), key = local.storageKey("a", "connect4");
  const malformed = [ "{broken", JSON.stringify({version:2}), JSON.stringify({...local.emptyRecord(),current:savedSession({...savedFixtures.connect4(),board:[]})}) ];
  for (const raw of malformed) {
    storage.setItem(key, raw);
    assert.deepEqual(local.readRecord(storage, "a", "connect4"), { ok:false, problem:"invalid" });
    assert.deepEqual(local.saveRecord(storage, "a", "connect4", 0, savedSession(savedFixtures.connect4())), { ok:false, problem:"invalid" });
    assert.equal(storage.getItem(key), raw);
  }
});
test("Local saves: quota and access errors keep the last good save", () => {
  const storage = memoryStorage();
  const session = savedSession(savedFixtures.bull500());
  assert.equal(local.saveRecord(storage, "a", "bull500", 0, session).ok, true);
  const before = storage.getItem(local.storageKey("a", "bull500"));
  storage.setItem = () => { throw Error("QuotaExceededError"); };
  assert.deepEqual(local.saveRecord(storage, "a", "bull500", 1, null), {ok:false,problem:"unavailable"});
  assert.equal(storage.getItem(local.storageKey("a", "bull500")), before);
  storage.getItem = () => { throw Error("SecurityError"); };
  assert.deepEqual(local.readRecord(storage, "a", "bull500"), {ok:false,problem:"unavailable"});
});
test("Local archive: completed game deduplication, undo win, replay, ten-result retention", () => {
  const storage = memoryStorage();
  let won = fun.createFunGame("connect4", "SOLO", names), beforeWin;
  for (const target of [14,15,16,17]) { beforeWin = won; won = fun.applyFunDart(won,dart(target)); if(target !== 17) won = fun.endFunVisit(won); }
  let r = local.saveRecord(storage,"a","connect4",0,savedSession(won)).record;
  assert.equal(r.completed.length,1); assert.equal(r.completed[0].outcome,"Alice gagne");
  r = local.saveRecord(storage,"a","connect4",r.revision,savedSession(won)).record; assert.equal(r.completed.length,1);
  r = local.saveRecord(storage,"a","connect4",r.revision,savedSession(beforeWin)).record; assert.equal(r.completed.length,0);
  for(let i=0;i<12;i++)r = local.saveRecord(storage,"a","connect4",r.revision,savedSession(won,"session-"+i)).record;
  assert.equal(r.completed.length,10); assert.equal(r.completed[0].id,"session-11");
  r = local.saveRecord(storage,"a","connect4",r.revision,null).record;
  assert.equal(r.current,null); assert.equal(r.completed.length,10);
});


const cloud = load("lib/play/cloud-sessions");
for (const [kind, create] of Object.entries(savedFixtures)) {
  test("Deleting a local game is isolated and rejects stale or failed writes: " + kind, () => {
    const storage = memoryStorage(), first = savedSession(create(), "delete-me");
    let record = local.saveRecord(storage, "owner", kind, 0, first).record;
    record.completed = [
      { id: "delete-me", endedAt: first.updatedAt, players: ["Alice"], outcome: "Alice gagne" },
      { id: "keep-me", endedAt: first.updatedAt, players: ["Bruno"], outcome: "Bruno gagne" },
    ];
    storage.setItem(local.storageKey("owner", kind), JSON.stringify(record));
    local.saveRecord(storage, "other", kind, 0, savedSession(create(), "other-account"));
    const before = storage.getItem(local.storageKey("owner", kind));
    assert.deepEqual(local.saveRecord(storage,"owner",kind,0,null,"delete-me"), {ok:false,problem:"conflict"});
    assert.deepEqual(local.saveRecord(storage,"owner",kind,record.revision,null,"wrong-id"), {ok:false,problem:"conflict"});
    const setItem = storage.setItem;
    storage.setItem = () => { throw Error("QuotaExceededError"); };
    assert.deepEqual(local.saveRecord(storage,"owner",kind,record.revision,null,"delete-me"), {ok:false,problem:"unavailable"});
    storage.setItem = setItem;
    assert.equal(storage.getItem(local.storageKey("owner", kind)), before);
    const result = local.saveRecord(storage,"owner",kind,record.revision,null,"delete-me");
    assert.equal(result.ok,true); assert.equal(result.record.current,null);
    assert.deepEqual(result.record.completed.map(entry=>entry.id),["keep-me"]);
    assert.equal(result.record.revision,record.revision+1);
    assert.equal(local.readRecord(storage,"other",kind).record.current.id,"other-account");
    assert.deepEqual(local.saveRecord(storage,"owner",kind,record.revision,first),{ok:false,problem:"conflict"},"A stale tab cannot resurrect the game");
  });
}
test("Cloud commands validate identifiers, revision and the full game before upload", () => {
  const id="00000000-0000-4000-8000-000000000001";
  const command={kind:"cricket",expected:0,device:id,command:id,action:"ENABLE",record:{version:1,revision:0,current:null,completed:[]}};
  assert.equal(cloud.validCommand(command),true);
  for (const patch of [{kind:"__proto__"},{expected:-1},{expected:1.5},{device:"admin"},{action:"DELETE"},{record:{version:1,revision:0,current:{},completed:[]}}]) assert.equal(cloud.validCommand({...command,...patch}),false);
  assert.equal(cloud.validCommand({...command,action:"CLAIM",record:null}),true);
  assert.equal(cloud.validCommand({...command,action:"SAVE",record:null}),false);
});
test("Cloud responses must match the record revision and game kind", () => {
  const row={kind:"clock",revision:1,writer_device:"00000000-0000-4000-8000-000000000001",updated_at:new Date().toISOString(),record:{version:1,revision:1,current:null,completed:[]}};
  assert.equal(cloud.validCloudRow(row),true);
  assert.equal(cloud.validCloudRow({...row,revision:2}),false);
  assert.equal(cloud.validCloudRow({...row,writer_device:null}),false);
  assert.equal(cloud.validCloudRow({...row,updated_at:"invalid"}),false);
});


const campaignGame = (mode = "CONNECTED", format = "DUEL") => fun.createFunGame("conquest", format, names, {conquestMode:mode,conquestGoal:5,conquestPointsGoal:12}, () => 0.999999);
const completeVisit = game => { while(!game.visitClosed) game=fun.applyFunDart(game,dart(0)); return game; };
test("Conquest v2: shuffled permutation, fixed Bull, stable geography and four Bull routes",()=>{
  const a=fun.createFunGame("conquest","DUEL",names,{conquestMode:"FULL"},()=>0);
  const b=campaignGame("FULL");
  assert.notDeepEqual(a.territories.map(t=>t.target),b.territories.map(t=>t.target));
  assert.deepEqual(a.territories.map(t=>t.target).sort((a,b)=>a-b),[...Array.from({length:20},(_,i)=>i+1),25]);
  assert.equal(a.territories[20].target,25);assert.equal(local.validGame("conquest",a),true);
  assert.deepEqual(fun.conquestNeighborRegions(a,21),[6,9,11,13]);
  const edges=fun.conquestLinks(a);assert.equal(new Set(edges.map(([a,b])=>[a,b].sort((x,y)=>x-y).join(":"))).size,edges.length);
  for(const route of world.CONQUEST_BULL_ROUTES)assert.ok(route.path.startsWith("M"));
  const target=a.territories[0].target, hit=fun.applyFunDart(a,dart(target,3));
  assert.equal(hit.territories[0].owner,0);assert.equal(hit.territories[20].owner,null);
  assert.deepEqual(hit.territories.map(t=>t.target),a.territories.map(t=>t.target));
});
for(const mode of ["CLASSIC","CONNECTED","FULL"]){
 test("Conquest v2: defense awarded once per territory at end of visit / "+mode,()=>{
  let game=campaignGame(mode);game.territories[1].owner=1;
  const original=JSON.stringify(game);
  game=fun.applyFunDart(game,dart(2));assert.deepEqual(game.campaign.pending,[2]);assert.deepEqual(game.campaign.bonuses,[0,0]);
  game=fun.applyFunDart(game,dart(2));assert.deepEqual(game.campaign.pending,[2]);assert.equal(local.validGame("conquest",game),true);
  const beforeEnd=game;game=fun.applyFunDart(game,dart(0));
  assert.deepEqual(game.campaign.bonuses,[0,1]);assert.deepEqual(game.campaign.pending,[]);
  assert.equal(fun.conquestScores(game)[1],mode==="CLASSIC"?2:3);assert.equal(local.validGame("conquest",game),true);
  assert.equal(fun.applyFunDart(game,dart(0)),game);assert.deepEqual(beforeEnd.campaign.bonuses,[0,0],"Undo restores pending bonus");
  const passed=fun.endFunVisit(game);assert.deepEqual(passed.campaign.bonuses,[0,1]);assert.deepEqual(passed.campaign.pending,[]);
  assert.deepEqual(JSON.parse(original).campaign.bonuses,[0,0]);
 });
 test("Conquest v2: taking the attacked territory within the visit cancels defense / "+mode,()=>{
  let game=campaignGame(mode);game.territories[1].owner=1;
  game=fun.applyFunDart(game,dart(2));game=fun.applyFunDart(game,dart(2,2));
  assert.equal(game.territories[1].owner,0);assert.deepEqual(game.campaign.pending,[]);
  game=completeVisit(game);assert.deepEqual(game.campaign.bonuses,[0,0]);assert.equal(local.validGame("conquest",game),true);
 });
}
test("Conquest v2: misses, free and own territories give no defense; owners each receive their bonuses",()=>{
 let game=campaignGame("FULL","FOUR");game.territories[0].owner=1;game.territories[1].owner=1;game.territories[2].owner=2;
 for(const id of [1,2,3])game=fun.applyFunDart(game,dart(id));
 assert.deepEqual(game.campaign.bonuses,[0,2,1,0]);assert.equal(local.validGame("conquest",game),true);
 let own=campaignGame("FULL");own.territories[0].owner=0;
 for(const id of [1,4,0])own=fun.applyFunDart(own,dart(id));
 assert.deepEqual(own.campaign.bonuses,[0,0]);assert.deepEqual(own.campaign.pending,[]);
});
test("Conquest v2: Bull takes three marks, adds strategic links, can be defended and recaptured",()=>{
 let game=campaignGame("FULL");game.territories[5].owner=0;game.territories[8].owner=0;
 const before=fun.conquestScores(game)[0];assert.equal(fun.conquestCaptureValue(game,25,0),4);
 game=fun.applyFunDart(game,dart(25));assert.equal(game.territories[20].owner,null);assert.equal(game.territories[20].marks[0],1);
 game=fun.applyFunDart(game,dart(25,2));assert.equal(game.territories[20].owner,0);assert.equal(fun.conquestScores(game)[0],before+4);
 game=fun.endFunVisit(completeVisit(game));game=fun.applyFunDart(game,dart(25,2));game=completeVisit(game);
 assert.deepEqual(game.campaign.bonuses,[1,0]);assert.equal(game.territories[20].marks[1],2);
 game=fun.endFunVisit(game);game=fun.endFunVisit(completeVisit(game));game=fun.applyFunDart(game,dart(25));
 assert.equal(game.territories[20].owner,1);assert.deepEqual(game.campaign.bonuses,[1,0]);assert.equal(local.validGame("conquest",game),true);
});
for(const format of ["SOLO","DUEL","THREE","FOUR","TEAMS_2V2"]){
 test("Conquest v2: threshold waits for all three darts; teams share score / "+format,()=>{
  let game=campaignGame("CONNECTED",format);for(const id of [2,3,5])game.territories[id-1].owner=0;
  if(format==="TEAMS_2V2")game.activeParticipant=2;
  game=fun.applyFunDart(game,dart(6,3));assert.equal(fun.conquestScores(game)[0],12);assert.equal(game.winnerSide,null);
  assert.equal(local.validGame("conquest",game),true);game=completeVisit(game);
  assert.equal(game.winnerSide,0);assert.equal(local.validGame("conquest",game),true);assert.equal(fun.endFunVisit(game),game);
 });
}
test("Conquest v2: defender can win at settlement, simultaneous best scores draw",()=>{
 let game=campaignGame("CLASSIC");for(let i=0;i<4;i++)game.territories[i].owner=1;
 game=fun.applyFunDart(game,dart(1));assert.equal(game.winnerSide,null);game=completeVisit(game);
 assert.deepEqual(fun.conquestScores(game),[0,5]);assert.equal(game.winnerSide,1);assert.equal(local.validGame("conquest",game),true);
 let tie=campaignGame("CLASSIC");for(let i=0;i<4;i++)tie.territories[i].owner=1;for(let i=4;i<8;i++)tie.territories[i].owner=0;
 tie=fun.applyFunDart(tie,dart(9,3));tie=fun.applyFunDart(tie,dart(1));tie=completeVisit(tie);
 assert.deepEqual(fun.conquestScores(tie),[5,5]);assert.equal(tie.winnerSide,"DRAW");assert.equal(local.validGame("conquest",tie),true);
});
test("Conquest v2: Full waits for every territory including Bull, highest total wins, undo restores game",()=>{
 let game=campaignGame("FULL");for(let i=0;i<20;i++)game.territories[i].owner=1;
 game=completeVisit(game);assert.equal(game.winnerSide,null,"High score cannot end Full while Bull is free");
 game=fun.endFunVisit(game);game.activeParticipant=0;
 game=fun.applyFunDart(game,dart(25));const beforeFinal=game;
 game=fun.applyFunDart(game,dart(25,2));assert.equal(game.visitDarts.length,2);assert.equal(game.visitClosed,true);
 assert.equal(game.winnerSide,1,"Most points, not the final capturer, wins");assert.equal(local.validGame("conquest",game),true);
 assert.equal(beforeFinal.winnerSide,null);assert.equal(beforeFinal.territories[20].owner,null);assert.equal(fun.applyFunDart(game,dart(0)),game);
});
test("Conquest v2: final Full capture settles pending defense before comparing final scores",()=>{
 let game=campaignGame("FULL");for(let i=0;i<20;i++)game.territories[i].owner=i%2;
 // Leave the Bull free with two marks already built up by camp 0.
 game.territories[20].marks[0]=2;game.totalDarts=100;
 const finalShape=structuredClone(game);finalShape.territories[20].owner=0;
 const [a,b]=fun.conquestScores(finalShape);game.campaign.bonuses[1]=a-b;
 assert.ok(game.campaign.bonuses[1]>=0);
 game=fun.applyFunDart(game,dart(2));game=fun.applyFunDart(game,dart(25));
 assert.equal(game.winnerSide,1,"The defender's pending point breaks the final tie");assert.equal(local.validGame("conquest",game),true);
});
test("Conquest v2: pending bonuses and shuffled map survive save/reload and undo",()=>{
 let game=fun.createFunGame("conquest","DUEL",names,{conquestMode:"FULL"},()=>0.3);game.territories[4].owner=1;
 const before=game;game=fun.applyFunDart(game,dart(game.territories[4].target,2));
 const storage=memoryStorage();const saved=local.saveRecord(storage,"alice","conquest",0,savedSession(game,"full-save",[before]));assert.equal(saved.ok,true);
 const loaded=local.readRecord(storage,"alice","conquest");assert.equal(loaded.ok,true);assert.deepEqual(loaded.record.current.game,game);
 assert.deepEqual(loaded.record.current.history[0],before);
 const finished=completeVisit(loaded.record.current.game);assert.deepEqual(finished.campaign.bonuses,[0,1]);
});
test("Conquest v2: reject corrupt mapping, Bull, pending defense, modes and mixed legacy rules",()=>{
 const valid=campaignGame("FULL");assert.equal(local.validGame("conquest",valid),true);
 const mutations=[g=>g.territories[0].target=2,g=>g.territories[20].target=20,g=>g.territories.pop(),g=>g.campaign.version=3,g=>g.campaign.mode="OTHER",g=>g.campaign.bonuses[0]=-1,g=>g.campaign.bonuses[0]=1,g=>g.campaign.pending=[1],g=>g.campaign.pending=[22],g=>g.campaign.pending=[1,1],g=>g.strategy={version:1,goal:12},g=>g.winnerSide="DRAW",g=>g.visitClosed=true];
 for(const mutate of mutations){const bad=structuredClone(valid);mutate(bad);assert.equal(local.validGame("conquest",bad),false);}
 for(const goal of [5,7,10])assert.equal(local.validGame("conquest",legacyConquest("DUEL",names,{conquestGoal:goal})),true);
 assert.match(local.describeGame(valid),/Full conquête/);
});
function ultraGame(target = 40, format = "DUEL", owner = null) {
 let game=fun.createFunGame("conquest",format,names,{conquestMode:"ULTRA"},()=>0.999999);
 const region=target===50?21:1, existing=game.territories.findIndex(t=>t.target===target);
 if(existing>=0) [game.territories[region-1].target,game.territories[existing].target]=[game.territories[existing].target,game.territories[region-1].target];
 else game.territories[region-1].target=target;
 game.territories[region-1].owner=owner;
 return fun.selectConquestAttack(game,region);
}
const ultraDart=(game,label)=>fun.applyFunDart(game,input.parseDartInput(label));
test("Conquest Ultra: 20 unique finishes in 2–78 plus fixed Bull 50, fresh draw and stable links",()=>{
 const first=fun.createFunGame("conquest","DUEL",names,{conquestMode:"ULTRA"},()=>0.2);
 const second=fun.createFunGame("conquest","DUEL",names,{conquestMode:"ULTRA"},()=>0.8);
 assert.equal(first.campaign.version,3);assert.equal(first.campaign.attackRegion,null);
 assert.equal(first.territories.length,21);assert.equal(new Set(first.territories.map(t=>t.target)).size,21);
 assert.ok(first.territories.every(t=>t.target>=2&&t.target<=78&&input.isPossibleDoubleCheckout(t.target,3)));
 assert.equal(first.territories[20].target,50);assert.notDeepEqual(first.territories,second.territories);
 assert.deepEqual(fun.conquestNeighborRegions(first,21),[6,9,11,13]);assert.equal(fun.conquestGoal(first),null);
 assert.equal(fun.conquestTargetLabel(25,true),"25");assert.equal(fun.conquestTargetLabel(50,true),"Bull · 50");
 assert.equal(local.validGame("conquest",first),true);assert.match(local.describeGame(first),/Ultra.*2–78/);
});
test("Conquest Ultra: every finish 2–78 is capturable with a real double-out checkout",()=>{
 for(let target=2;target<=78;target++){
  let game=ultraGame(target);const original=JSON.stringify(game),region=game.campaign.attackRegion;
  const route=x01.checkoutRoute(target,"DOUBLE_OUT");assert.ok(route,String(target));
  for(const label of route.split(" · ")){game=ultraDart(game,label);assert.equal(local.validGame("conquest",game),true,`${target} after ${label}`);}
  assert.equal(game.territories[region-1].owner,0);assert.equal(game.visitClosed,true);assert.equal(game.winnerSide,null);
  assert.equal(fun.conquestUltraAttempt(game).remaining,0);assert.equal(fun.conquestScores(game)[0],2);
  assert.equal(game.totalDarts,route.split(" · ").length);assert.equal(game.territories[region-1].marks.every(m=>m===0),true);
  assert.equal(JSON.parse(original).territories[region-1].owner,null);
  assert.equal(ultraDart(game,"D1"),game,"A checkout ends the visit immediately");
 }
});
test("Conquest Ultra: choose before first dart, no own attack, lock after any dart, immutable selection",()=>{
 const initial=fun.createFunGame("conquest","DUEL",names,{conquestMode:"ULTRA"});
 assert.equal(ultraDart(initial,"T20"),initial);
 for(const invalid of [0,22,-1,1.5,NaN])assert.equal(fun.selectConquestAttack(initial,invalid),initial);
 let game=fun.selectConquestAttack(initial,1);assert.equal(initial.campaign.attackRegion,null);assert.equal(local.validGame("conquest",game),true);
 game=fun.selectConquestAttack(game,2);assert.equal(game.campaign.attackRegion,2);
 game=ultraDart(game,"0");assert.equal(fun.selectConquestAttack(game,1),game);
 game=completeVisit(game);assert.equal(fun.selectConquestAttack(game,3),game);
 game=fun.endFunVisit(game);assert.equal(game.campaign.attackRegion,null);assert.equal(local.validGame("conquest",game),true);
 game.territories[0].owner=1;assert.equal(fun.selectConquestAttack(game,1),game);
 assert.equal(fun.selectConquestAttack(campaignGame("FULL"),1).campaign.attackRegion,undefined);
});
for(const [title,target,throws] of [["overshoot",40,["T20"]],["one remaining",40,["T13"]],["zero without a double",20,["S20"]],["simple Bull is not a double",25,["25"]],["triple cannot finish",60,["T20"]]]){
 test("Conquest Ultra: bust closes the visit / "+title,()=>{
  let game=ultraGame(target,"DUEL",1);for(const label of throws)game=ultraDart(game,label);
  assert.equal(game.visitClosed,true);assert.equal(fun.conquestUltraAttempt(game).bust,true);assert.equal(fun.conquestUltraAttempt(game).remaining,target);
  assert.equal(game.territories[0].owner,1);assert.deepEqual(game.campaign.bonuses,[0,1]);assert.deepEqual(game.campaign.pending,[]);
  assert.equal(local.validGame("conquest",game),true);assert.equal(ultraDart(game,"0"),game);
 });
}
test("Conquest Ultra: third dart settles one defense bonus; no progress carries to next visit",()=>{
 let game=ultraGame(40,"DUEL",1);game=ultraDart(game,"S1");const pending=game;
 assert.equal(fun.conquestUltraAttempt(game).remaining,39);assert.deepEqual(game.campaign.pending,[1]);assert.equal(local.validGame("conquest",game),true);
 game=ultraDart(game,"S1");game=ultraDart(game,"0");assert.equal(game.visitClosed,true);assert.deepEqual(game.campaign.bonuses,[0,1]);
 assert.deepEqual(pending.campaign.bonuses,[0,0]);assert.equal(pending.visitDarts.length,1);
 game=fun.endFunVisit(game);assert.equal(game.campaign.attackRegion,null);
 game=fun.selectConquestAttack(game,2);game=completeVisit(game);game=fun.endFunVisit(game);game=fun.selectConquestAttack(game,1);
 assert.equal(fun.conquestUltraAttempt(game).remaining,40);assert.deepEqual(game.territories[0].marks,[0,0]);assert.equal(local.validGame("conquest",game),true);
});
test("Conquest Ultra: a successful recapture cancels pending defense and preserves geographic scoring",()=>{
 let game=ultraGame(40,"DUEL",1);game.territories[1].owner=0;
 game=ultraDart(game,"S20");assert.deepEqual(game.campaign.pending,[1]);const before=game;
 game=ultraDart(game,"D10");assert.equal(game.territories[0].owner,0);assert.deepEqual(game.campaign.bonuses,[0,0]);assert.deepEqual(game.campaign.pending,[]);
 assert.equal(fun.conquestScores(game)[0],5);assert.equal(game.visitDarts.length,2);assert.equal(local.validGame("conquest",game),true);
 assert.equal(before.territories[0].owner,1);assert.deepEqual(before.campaign.pending,[1]);
});
test("Conquest Ultra: misses alone and unowned territory failures do not give defense points",()=>{
 for(const owner of [null,1]){let game=ultraGame(40,"DUEL",owner);game=completeVisit(game);assert.deepEqual(game.campaign.bonuses,[0,0]);assert.equal(local.validGame("conquest",game),true);}
 let free=ultraGame(40);free=ultraDart(free,"T20");assert.deepEqual(free.campaign.bonuses,[0,0]);
});
for(const format of ["SOLO","DUEL","THREE","FOUR","TEAMS_2V2"]){
 test("Conquest Ultra: formats, shared team ownership and explicit handover / "+format,()=>{
  let game=ultraGame(2,format);if(format==="TEAMS_2V2")game.activeParticipant=2;
  game=ultraDart(game,"D1");assert.equal(game.territories[0].owner,0);assert.equal(local.validGame("conquest",game),true);
  const next=fun.endFunVisit(game);assert.equal(next.activeParticipant,(game.activeParticipant+1)%game.participants.length);assert.equal(next.campaign.attackRegion,null);assert.equal(local.validGame("conquest",next),true);
 });
}
test("Conquest Ultra: Bull closes the full map, highest score wins, including a draw",()=>{
 let game=ultraGame(50);for(let i=0;i<20;i++)game.territories[i].owner=1;
 game=ultraDart(game,"0");assert.equal(game.winnerSide,null);const before=game;
 game=ultraDart(game,"50");assert.equal(game.winnerSide,1);assert.equal(game.visitDarts.length,2);assert.equal(local.validGame("conquest",game),true);
 assert.equal(before.territories[20].owner,null);assert.equal(fun.endFunVisit(game),game);
 let tie=ultraGame(50);tie.totalDarts=100;for(let i=0;i<20;i++)tie.territories[i].owner=i%2;
 const final=structuredClone(tie);final.territories[20].owner=0;const [a,b]=fun.conquestScores(final);
 tie.campaign.bonuses[a>b?1:0]=Math.abs(a-b);tie=ultraDart(tie,"50");assert.equal(tie.winnerSide,"DRAW");assert.equal(local.validGame("conquest",tie),true);
});
test("Conquest Ultra: declared target, partial checkout, defense and undo survive local/cloud serialization",()=>{
 const selected=ultraGame(40,"DUEL",1), partial=ultraDart(selected,"S20");
 const storage=memoryStorage();assert.equal(local.saveRecord(storage,"alice","conquest",0,savedSession(partial,"ultra-save",[selected])).ok,true);
 const loaded=local.readRecord(storage,"alice","conquest");assert.equal(loaded.ok,true);assert.deepEqual(loaded.record.current.game,partial);
 assert.deepEqual(loaded.record.current.history,[selected]);assert.equal(fun.conquestUltraAttempt(loaded.record.current.game).remaining,20);
 const won=ultraDart(loaded.record.current.game,"D10");assert.equal(won.territories[0].owner,0);assert.deepEqual(won.campaign.bonuses,[0,0]);
 const restored=loaded.record.current.history[0];assert.equal(fun.conquestUltraAttempt(restored).remaining,40);assert.equal(restored.territories[0].owner,1);
 assert.equal(local.validRecord("conquest",JSON.parse(JSON.stringify(loaded.record))),true);
});
test("Conquest Ultra: reject malformed targets, versions, marks, attacks, pending points and premature results",()=>{
 const base=ultraGame(40,"DUEL",1);
 const mutations=[g=>g.campaign.version=2,g=>g.campaign.mode="FULL",g=>g.territories[0].target=1,g=>g.territories[0].target=79,g=>g.territories[0].target=50,g=>g.territories[20].target=25,g=>g.territories[0].marks[0]=1,g=>delete g.campaign.attackRegion,g=>g.campaign.attackRegion=22,g=>g.campaign.attackRegion=1.2,g=>g.territories[0].owner=0,g=>g.campaign.pending=[1],g=>g.visitClosed=true,g=>g.winnerSide=0];
 for(const mutate of mutations){const bad=structuredClone(base);mutate(bad);assert.equal(local.validGame("conquest",bad),false);}
 const partial=ultraDart(base,"S20");
 for(const mutate of [g=>g.campaign.attackRegion=null,g=>g.campaign.pending=[],g=>g.campaign.pending=[2],g=>g.visitDarts[0]="invalid",g=>g.totalDarts=0]){const bad=structuredClone(partial);mutate(bad);assert.equal(local.validGame("conquest",bad),false);}
 const closed=ultraDart(partial,"D10");closed.visitDarts.push("MISS");closed.log.push({...closed.log[0]});closed.totalDarts++;assert.equal(local.validGame("conquest",closed),false,"No darts after checkout");
 const normal=campaignGame("FULL");normal.campaign.attackRegion=1;assert.equal(local.validGame("conquest",normal),false);
});

const dc = load("lib/play/dart-chess-engine");
const ca = load("lib/play/chess-adapter");
const chessMove = (s, from, to, promotion) => dc.requestChessMove(s, { from, to, ...(promotion ? {promotion} : {}) });
const chessDart = (s, label, source = "manual") => dc.applyChessDart(s, { source, dart: input.parseDartInput(label) });
function chessFixture(fen) {
 const state = dc.createDartChess(["Alice", "Bob"], 7654);
 state.fen = ca.chessPosition(fen).fen(); state.positions = [ca.positionKey(state.fen)];
 state.activeParticipant = ca.chessPosition(state.fen).turn() === "w" ? 0 : 1;
 return state;
}
const captureStart = () => chessMove(chessFixture("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"), "e4", "d5");
const targetDart = s => "SDT"[s.challenge.target.multipliers[0] - 1] + s.challenge.target.segment;

test("Dart Chess: legal/illegal moves, immutable board, alternating turns and validated initial state", () => {
 const initial = dc.createDartChess(names, 90), encoded = JSON.stringify(initial);
 assert.equal(local.validGame("dartchess", initial), true);
 assert.equal(chessMove(initial,"e2","e5"), initial);
 const moved = chessMove(initial,"e2","e4");
 assert.equal(moved.activeParticipant,1); assert.equal(ca.chessPosition(moved.fen).get("e4").type,"p");
 assert.equal(JSON.stringify(initial),encoded); assert.equal(dc.validDartChess(moved),true);
 assert.equal(chessMove(moved,"d2","d4"),moved);
});
for (const dartNumber of [1,2,3]) test("Dart Chess: capture success on dart " + dartNumber, () => {
 let s=captureStart(); const target=targetDart(s), before=s.fen;
 assert.equal(s.phase,"CAPTURE_CHALLENGE"); assert.equal(s.captured.length,0);
 assert.equal(chessMove(s,"e4","e5"),s);
 for(let i=1;i<dartNumber;i++) {s=chessDart(s,"0");assert.equal(s.fen,before);assert.equal(dc.validDartChess(s),true);}
 s=chessDart(s,target); assert.equal(s.phase,"SELECT_MOVE");assert.equal(s.activeParticipant,1);
 assert.deepEqual(s.captured,[{piece:"p",by:0}]); assert.equal(ca.chessPosition(s.fen).get("d5").color,"w");
 assert.equal(dc.validDartChess(s),true); assert.equal(chessDart(s,"T20"),s);
});
test("Dart Chess: three misses cancel capture and pass exactly once", () => {
 let s=captureStart();const board=s.fen.split(" ")[0];
 for(let i=0;i<3;i++)s=chessDart(s,"0");
 assert.equal(s.fen.split(" ")[0],board); assert.equal(s.activeParticipant,1);assert.equal(s.phase,"SELECT_MOVE");
 assert.equal(s.captured.length,0);assert.equal(dc.validDartChess(s),true);assert.equal(chessDart(s,"0"),s);
});
test("Dart Chess: check escape captures are automatic; no illegal pass or pinned move",()=>{
 const state=chessFixture("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
 assert.equal(ca.chessPosition(state.fen).isCheck(),true);assert.throws(()=>ca.passTurn(state.fen));
 const saved=chessMove(state,"e1","e2");assert.notEqual(saved.phase,"CAPTURE_CHALLENGE");assert.equal(saved.captured.length,1);assert.equal(saved.winnerSide,"DRAW");
 const pinned=chessFixture("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
 assert.equal(chessMove(pinned,"e2","d2"),pinned);
});
test("Dart Chess: en passant captures only on success and expires after a failed attempt",()=>{
 const initial=chessFixture("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2");
 let s=chessMove(initial,"e5","d6");assert.equal(s.phase,"CAPTURE_CHALLENGE");
 const won=chessDart(s,targetDart(s));assert.equal(ca.chessPosition(won.fen).get("d5"),undefined);assert.equal(ca.chessPosition(won.fen).get("d6").color,"w");
 for(let i=0;i<3;i++)s=chessDart(s,"0");
 assert.equal(s.fen.split(" ")[3],"-");assert.equal(ca.chessPosition(s.fen).get("d5").color,"b");assert.equal(dc.validDartChess(s),true);
});
test("Dart Chess: king-side/queen-side castling and no castling through attack",()=>{
 for(const to of ["g1","c1"]){const s=chessMove(chessFixture("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"),"e1",to);assert.equal(ca.chessPosition(s.fen).get(to).type,"k");assert.equal(ca.chessPosition(s.fen).get(to==="g1"?"f1":"d1").type,"r");assert.equal(dc.validDartChess(s),true);}
 const s=chessFixture("4kr2/8/8/8/8/8/8/4K2R w K - 0 1");assert.equal(chessMove(s,"e1","g1"),s);
});
for(const piece of ["q","r","b","n"])test("Dart Chess: explicit promotion / "+piece,()=>{
 const s=chessFixture("7k/P7/8/8/8/8/8/4K3 w - - 0 1");assert.equal(chessMove(s,"a7","a8"),s);
 const promoted=chessMove(s,"a7","a8",piece);assert.equal(ca.chessPosition(promoted.fen).get("a8").type,piece);assert.equal(dc.validDartChess(promoted),true);
});
test("Dart Chess: capture promotion is deferred until success",()=>{
 const initial=chessFixture("1r5k/P7/8/8/8/8/8/4K3 w - - 0 1");let s=chessMove(initial,"a7","b8","n");assert.equal(s.fen,initial.fen);
 s=chessDart(s,targetDart(s));assert.equal(ca.chessPosition(s.fen).get("b8").type,"n");assert.equal(s.captured[0].piece,"r");assert.equal(dc.validDartChess(s),true);
});
test("Dart Chess: mate freezes board, D20 retries do not alter chess, victory only on double",()=>{
 let s=dc.createDartChess(names);for(const [from,to] of [["f2","f3"],["e7","e5"],["g2","g4"],["d8","h4"]])s=chessMove(s,from,to);
 assert.equal(s.phase,"KING_CHECKOUT");assert.equal(s.activeParticipant,1);assert.equal(s.winnerSide,null);assert.equal(dc.validDartChess(s),true);
 const fen=s.fen;assert.equal(chessMove(s,"e1","e2"),s);assert.equal(dc.retryKingCheckout(s),s);
 for(const d of ["S20","T20","50"])s=chessDart(s,d);
 assert.equal(s.fen,fen);assert.equal(s.challenge.darts.length,3);assert.equal(dc.validDartChess(s),true);assert.equal(chessDart(s,"D20"),s);
 s=dc.retryKingCheckout(s);assert.equal(s.fen,fen);assert.equal(s.challenge.darts.length,0);
 s=chessDart(s,"D20");assert.equal(s.phase,"GAME_OVER");assert.equal(s.winnerSide,1);assert.equal(dc.validDartChess(s),true);assert.equal(dc.resignDartChess(s),s);
});
test("Dart Chess: stalemate, repetition and fifty-move draw",()=>{
 const pat=chessMove(chessFixture("7k/5K2/8/6Q1/8/8/8/8 w - - 0 1"),"g5","g6");assert.equal(pat.winnerSide,"DRAW");assert.equal(ca.chessPosition(pat.fen).isStalemate(),true);
 let repeated=dc.createDartChess(names);for(let i=0;i<2;i++)for(const [a,b] of [["g1","f3"],["g8","f6"],["f3","g1"],["f6","g8"]])repeated=chessMove(repeated,a,b);assert.equal(repeated.winnerSide,"DRAW");
 const fifty=chessMove(chessFixture("7k/8/8/8/8/8/8/R3K3 w - - 99 50"),"a1","a2");assert.equal(fifty.winnerSide,"DRAW");
});
test("Dart Chess: same seed and undo do not reroll objectives; adjacent targets vary",()=>{
 const first=captureStart();assert.deepEqual(first,captureStart());let s=first;for(let i=0;i<3;i++)s=chessDart(s,"0");
 const second=chessMove(s,"d5","e4");assert.notEqual(second.lastTarget,first.lastTarget);
 for(const [piece,multipliers] of Object.entries(dc.BATTLE_RULES))assert.deepEqual(multipliers,piece==="p"?[1,2,3]:piece==="n"?[1]:piece==="q"?[3]:[2]);
});
test("Dart Chess: validated darts, source abstraction, no total-only inputs",()=>{
 const s=captureStart(), d=input.parseDartInput(targetDart(s));assert.equal(dc.applyChessDart(s,{source:"manual",dart:{...d,score:999}}),s);
 assert.equal(dc.applyChessDart(s,{source:"unknown",dart:d}),s);
 assert.deepEqual(chessDart(s,targetDart(s),"autoscoring").fen,chessDart(s,targetDart(s)).fen);
});
test("Dart Chess: resume a partial challenge, undo completion, deletion and account isolation",()=>{
 const initial=captureStart(),partial=chessDart(initial,"0"),storage=memoryStorage();
 assert.equal(local.saveRecord(storage,"alice","dartchess",0,savedSession(partial,"chess-save",[initial])).ok,true);
 const loaded=local.readRecord(storage,"alice","dartchess");assert.equal(loaded.ok,true);assert.deepEqual(loaded.record.current.game,partial);assert.deepEqual(loaded.record.current.history[0],initial);
 assert.equal(local.readRecord(storage,"bob","dartchess").record.current,null);
 const won=chessDart(partial,targetDart(partial));assert.equal(local.saveRecord(storage,"alice","dartchess",1,savedSession(won,"chess-save",[initial,partial])).ok,true);
 assert.deepEqual(local.readRecord(storage,"alice","dartchess").record.current.history.at(-1),partial);
 assert.equal(local.saveRecord(storage,"alice","dartchess",2,null,"chess-save").ok,true);assert.equal(local.readRecord(storage,"alice","dartchess").record.current,null);
 assert.equal(cloud.isKind("dartchess"),false,"Local MVP must not enable unsupported cloud API kind");
});
test("Dart Chess: reject damaged state, contradictory turns, forged objectives and illegal captures",()=>{
 const base=captureStart();for(const mutate of [s=>s.version=2,s=>s.fen="invalid",s=>s.activeParticipant=1,s=>s.challenge.move.to="h8",s=>s.challenge.piece="q",s=>s.challenge.target.multipliers=[3],s=>s.challenge.darts=[{source:"manual",dart:input.parseDartInput(targetDart(s))}],s=>s.challenge.darts=[1,2,3],s=>s.sideNames=[],s=>s.phase="KING_CHECKOUT",s=>s.winnerSide=0,s=>s.positions=[],s=>s.lastMove={from:"z9",to:"a1"},s=>s.seed=-1]){const bad=structuredClone(base);mutate(bad);assert.equal(dc.validDartChess(bad),false);}
});

console.log(count + " play engine tests passed.");
