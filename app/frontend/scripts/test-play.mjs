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
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", source)((p) => load(resolve(dirname(file), p)), loadedModule, loadedModule.exports);
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
  let s = fun.createFunGame("conquest", "THREE", names);
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
  let s = fun.createFunGame("conquest", "TEAMS_2V2", names, { conquestGoal: 5 });
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

console.log(count + " play engine tests passed.");
