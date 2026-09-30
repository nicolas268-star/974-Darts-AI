import type { CricketState } from "./cricket-engine";
import type { TicTacToeState } from "./tictactoe-engine";
import type { ClockState } from "./clock-engine";
import type { Bob27State } from "./bob27-engine";
import type { Connect4State, ConquestState, Bull500State, FunState } from "./fun-engine";
import { conquestScores } from "./fun-engine";
import { participantCount, sideCount, sideForSeat, type PlayFormat } from "./format";

export type LocalGameMap = { cricket: CricketState; tictactoe: TicTacToeState; clock: ClockState; bob27: Bob27State; connect4: Connect4State; conquest: ConquestState; bull500: Bull500State };
export type LocalKind = keyof LocalGameMap;
export type LocalGame = LocalGameMap[LocalKind];
export const LOCAL_GAMES: Record<LocalKind, { title: string; href: string }> = {
  cricket: { title: "Cricket", href: "/play/cricket" }, tictactoe: { title: "Morpion", href: "/play/tictactoe" },
  clock: { title: "Tour de l’horloge", href: "/play/clock" }, bob27: { title: "Bob’s 27", href: "/play/bob27" },
  connect4: { title: "Puissance 4", href: "/play/connect4" }, conquest: { title: "Conquête", href: "/play/conquest" }, bull500: { title: "Bull 500", href: "/play/bull500" },
};
export type LocalSession<G = LocalGame> = { id: string; startedAt: string; updatedAt: string; game: G; history: G[] };
export type CompletedGame = { id: string; endedAt: string; players: string[]; outcome: string };
export type LocalRecord<G = LocalGame> = { version: 1; revision: number; current: LocalSession<G> | null; completed: CompletedGame[] };
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SaveProblem = "unavailable" | "invalid" | "conflict";
export type ReadResult = { ok: true; record: LocalRecord } | { ok: false; problem: SaveProblem };
export const storageKey = (userId: string, kind: LocalKind) => "974darts:play:v1:" + encodeURIComponent(userId) + ":" + kind;
export const emptyRecord = (): LocalRecord => ({ version: 1, revision: 0, current: null, completed: [] });

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const integer = (v: unknown, min = 0, max = 1_000_000_000): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const text = (v: unknown, max = 300): v is string => typeof v === "string" && v.length <= max;
const date = (v: unknown) => text(v, 40) && Number.isFinite(Date.parse(v));
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v);
const list = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;

export function validGame<K extends LocalKind>(kind: K, value: unknown): value is LocalGameMap[K] {
  if (!object(value) || !oneOf(value.format, ["SOLO", "DUEL", "THREE", "FOUR", "TEAMS_2V2"])) return false;
  const format = value.format as PlayFormat, count = sideCount(format);
  const owner = (v: unknown) => v === null || integer(v, 0, count - 1);
  const names = (v: unknown) => list(v, count) && v.length === count && v.every((name) => text(name));
  if (!list(value.participants, 4) || value.participants.length !== participantCount(format) ||
    !value.participants.every((p, i) => object(p) && text(p.name) && p.side === sideForSeat(format, i)) ||
    !integer(value.activeParticipant, 0, value.participants.length - 1)) return false;
  if (!list(value.log, 30) || !value.log.every((entry) => object(entry) && (text(entry.id, 100) || integer(entry.id)) &&
    integer(entry.participant, 0, participantCount(format) - 1) && text(entry.dart, 20) && text(entry.result, 500))) return false;
  if (kind === "connect4" || kind === "conquest" || kind === "bull500") {
    if (value.kind !== kind || !names(value.sideNames) || !list(value.visitDarts, 3) || !value.visitDarts.every((d) => text(d, 20)) ||
      value.log.length < value.visitDarts.length || typeof value.visitClosed !== "boolean" || !integer(value.visitNumber, 1) || !integer(value.totalDarts) ||
      !(owner(value.winnerSide) || (kind === "connect4" && value.winnerSide === "DRAW"))) return false;
    if (kind === "connect4") return oneOf(value.rule, ["ANY", "DOUBLE"]) && list(value.board, 42) && value.board.length === 42 && value.board.every(owner) &&
      list(value.winningCells, 7) && value.winningCells.every((i) => integer(i, 0, 41));
    if (kind === "conquest") {
      if (!oneOf(value.goal, [5, 7, 10]) || !list(value.territories, 20) || value.territories.length !== 20 ||
        !value.territories.every((t, i) => object(t) && t.target === i + 1 && owner(t.owner) && list(t.marks, count) && t.marks.length === count && t.marks.every((m) => integer(m, 0, 3)))) return false;
      if (value.strategy === undefined) return true; // Original saves keep their territory-count rules.
      if (!object(value.strategy) || value.strategy.version !== 1 || !oneOf(value.strategy.goal, [12, 18, 24])) return false;
      const scores = conquestScores(value as unknown as ConquestState), goal = value.strategy.goal as number;
      return scores.every((score, side) => (score >= goal) === (value.winnerSide === side)) && (value.winnerSide === null || value.visitClosed === true);
    }
    return oneOf(value.unlock, ["50", "25_OR_50"]) && oneOf(value.target, ["19", "20", "19_OR_20"]) && typeof value.unlocked === "boolean" &&
      list(value.scores, count) && value.scores.length === count && value.scores.every((s) => integer(s));
  }
  if (!integer(value.dartsInVisit, 0, 3) || value.log.length < value.dartsInVisit) return false;
  if (kind === "tictactoe") return oneOf(value.mode, ["NORMAL", "HARD"]) && names(value.sideNames) &&
    integer(value.starter, 0, participantCount(format) - 1) && (owner(value.winnerSide) || value.winnerSide === "DRAW") &&
    list(value.cells, 9) && value.cells.length === 9 && value.cells.every((cell, i) => object(cell) && cell.id === "cell-" + i &&
      (integer(cell.target, 1, 20) || cell.target === 25) && owner(cell.owner));
  if (!list(value.sides, count) || value.sides.length !== count || !value.sides.every((s) => object(s) && text(s.name))) return false;
  if (kind === "cricket") {
    if (!oneOf(value.mode, ["BASIC", "TACTIC", "MAGIC"]) || !oneOf(value.scoring, ["STANDARD", "CUT_THROAT"]) || !owner(value.winnerSide) || !integer(value.visitNumber, 1)) return false;
    const length = value.mode === "TACTIC" ? 12 : 7, prefix = value.mode === "TACTIC" ? "tactic" : value.mode === "MAGIC" ? "magic" : "cricket";
    if (!list(value.targets, length) || value.targets.length !== length || !value.targets.every((t, i) => object(t) && t.id === prefix + "-" + i &&
      (integer(t.value, 1, 20) || t.value === 25) && text(t.label, 10))) return false;
    const ids = value.targets.map((t) => (t as Record<string, unknown>).id as string);
    return list(value.magicTouchedTargetIds, length) && value.magicTouchedTargetIds.every((id) => ids.includes(id as string)) &&
      value.sides.every((s) => object(s) && integer(s.score) && object(s.marks) && ids.every((id) => integer((s.marks as Record<string, unknown>)[id], 0, 3)));
  }
  if (!value.sides.every((s) => object(s) && integer(s.target, 1, 20) && typeof s.finished === "boolean")) return false;
  if (kind === "clock") return oneOf(value.mode, ["SINGLE", "DOUBLE", "TRIPLE"]) && owner(value.winnerSide);
  return typeof value.finished === "boolean" && list(value.winnerSides, count) && value.winnerSides.every((side) => integer(side, 0, count - 1)) &&
    value.sides.every((s) => object(s) && integer(s.score, -1_000_000_000) && integer(s.visitHits, 0, 3));
}

export function isFinished(game: LocalGame): boolean {
  return "winnerSide" in game ? game.winnerSide !== null : game.finished;
}
export function outcome(game: LocalGame): string {
  const names = "sideNames" in game ? game.sideNames : game.sides.map((s) => s.name);
  if ("winnerSides" in game) return game.winnerSides.map((i) => names[i]).join(" + ") + " · " + Math.max(...game.sides.map((s) => s.score)) + " points";
  if (game.winnerSide === "DRAW") return "Match nul";
  return typeof game.winnerSide === "number" ? names[game.winnerSide] + " gagne" : "Partie en cours";
}
export function describeGame(game: LocalGame): string {
  if ("kind" in game) {
    const fun: FunState = game;
    return fun.kind === "bull500" ? "Objectif 500 · score sur " + fun.target.replace("_OR_", " / ") : fun.kind === "conquest" ? fun.strategy ? "Monde · " + fun.strategy.goal + " points · bonus de liaison" : fun.goal + " territoires · classique" : fun.rule === "DOUBLE" ? "Doubles uniquement" : "Tous impacts";
  }
  return "mode" in game ? game.mode + ("scoring" in game ? " · " + game.scoring : "") : "D1 → D20";
}
function validSession(kind: LocalKind, v: unknown): v is LocalSession {
  return object(v) && text(v.id, 100) && date(v.startedAt) && date(v.updatedAt) && validGame(kind, v.game) &&
    list(v.history, 50) && v.history.every((game) => validGame(kind, game));
}
export function validRecord(kind: LocalKind, value: unknown): value is LocalRecord {
  return object(value) && value.version === 1 && integer(value.revision) && (value.current === null || validSession(kind, value.current)) &&
    list(value.completed, 10) && value.completed.every((s) => object(s) && text(s.id, 100) && date(s.endedAt) &&
      list(s.players, 4) && s.players.every((p) => text(p)) && text(s.outcome, 1500));
}
export function readRecord(storage: StorageLike, userId: string, kind: LocalKind): ReadResult {
  let raw: string | null;
  try { raw = storage.getItem(storageKey(userId, kind)); } catch { return { ok: false, problem: "unavailable" }; }
  if (raw === null) return { ok: true, record: emptyRecord() };
  try {
    if (raw.length > 1_000_000) return { ok: false, problem: "invalid" };
    const value: unknown = JSON.parse(raw);
    if (!validRecord(kind, value)) return { ok: false, problem: "invalid" };
    return { ok: true, record: value as LocalRecord };
  } catch { return { ok: false, problem: "invalid" }; }
}
export function withSession(previous: LocalRecord, current: LocalSession | null): LocalRecord {
  let completed = previous.completed.filter((item) => item.id !== current?.id);
  if (current && isFinished(current.game)) completed = [{ id: current.id, endedAt: current.updatedAt, players: current.game.participants.map((p) => p.name), outcome: outcome(current.game) }, ...completed].slice(0, 10);
  return { version: 1, revision: previous.revision + 1, current, completed };
}
export function withoutSession(previous: LocalRecord, id: string): LocalRecord {
  return { ...previous, revision: previous.revision + 1,
    current: previous.current?.id === id ? null : previous.current,
    completed: previous.completed.filter((entry) => entry.id !== id) };
}
// Call under the browser's per-key Web Lock. The revision rejects stale tabs.
export function saveRecord(storage: StorageLike, userId: string, kind: LocalKind, expectedRevision: number, current: LocalSession | null, deleteSessionId?: string): ReadResult {
  const loaded = readRecord(storage, userId, kind);
  if (!loaded.ok) return loaded;
  if (loaded.record.revision !== expectedRevision) return { ok: false, problem: "conflict" };
  if (deleteSessionId && (current !== null || loaded.record.current?.id !== deleteSessionId)) return { ok: false, problem: "conflict" };
  if (current && !validSession(kind, current)) return { ok: false, problem: "invalid" };
  const record = deleteSessionId ? withoutSession(loaded.record, deleteSessionId) : withSession(loaded.record, current);
  try { const encoded = JSON.stringify(record); if (encoded.length > 1_000_000) return { ok: false, problem: "unavailable" }; storage.setItem(storageKey(userId, kind), encoded); return { ok: true, record }; }
  catch { return { ok: false, problem: "unavailable" }; }
}
