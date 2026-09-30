"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyRecord, readRecord, saveRecord, storageKey, withSession, type LocalGame, type LocalKind, type LocalRecord, type LocalSession, type SaveProblem } from "@/lib/play/local-sessions";

export const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
};
type View = { ready: boolean; record: LocalRecord; problem: SaveProblem | null; pending: number };
export type LocalControls = {
  blocked?: boolean;
  sync?: import("./useSyncedGame").SyncControls;
  ready: boolean; hasGame: boolean; sessionId: string | null; problem: SaveProblem | null; busy: boolean; updatedAt: string | null;
  reload: () => void; retry: () => void; reset: () => void; discardInvalid: () => void;
  remove: (sessionId: string) => Promise<boolean>;
};

export function useLocalGame<G extends LocalGame>(kind: LocalKind, userId: string) {
  const [view, setView] = useState<View>({ ready: false, record: emptyRecord(), problem: null, pending: 0 });
  const current = useRef(view);
  const mounted = useRef(false);
  const publish = useCallback((next: View) => { current.current = next; if (mounted.current) setView(next); }, []);
  const reload = useCallback(() => {
    const result = readRecord(browserStorage, userId, kind);
    publish({ ready: true, record: result.ok ? result.record : emptyRecord(), problem: result.ok ? null : result.problem, pending: 0 });
  }, [kind, userId, publish]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.resolve().then(() => { if (active) reload(); });
    function changed(event: StorageEvent) {
      if (event.key !== null && event.key !== storageKey(userId, kind)) return;
      const result = readRecord(browserStorage, userId, kind);
      if (!result.ok || result.record.revision !== current.current.record.revision) {
        publish({ ...current.current, problem: "conflict" });
      }
    }
    function leaving(event: BeforeUnloadEvent) {
      if (current.current.pending || (current.current.record.current && current.current.problem && current.current.problem !== "conflict")) {
        event.preventDefault(); event.returnValue = "";
      }
    }
    window.addEventListener("storage", changed);
    window.addEventListener("beforeunload", leaving);
    return () => { active = false; mounted.current = false; window.removeEventListener("storage", changed); window.removeEventListener("beforeunload", leaving); };
  }, [kind, userId, publish, reload]);

  function dispatch(change: (session: LocalSession<G> | null) => LocalSession<G> | null) {
    if (!current.current.ready || current.current.problem === "conflict") return;
    publish({ ...current.current, pending: current.current.pending + 1 });
    const work = () => {
      const previous = current.current;
      if (previous.problem === "conflict") { publish({ ...previous, pending: Math.max(0, previous.pending - 1) }); return; }
      const session = change(previous.record.current as LocalSession<G> | null);
      if (session === previous.record.current && !previous.problem) { publish({ ...previous, pending: Math.max(0, previous.pending - 1) }); return; }
      const result = saveRecord(browserStorage, userId, kind, previous.record.revision, session);
      const memory = { ...withSession(previous.record, session), revision: previous.record.revision };
      publish({
        ready: true, record: result.ok ? result.record : result.problem === "conflict" ? previous.record : memory,
        problem: result.ok ? null : result.problem, pending: Math.max(0, previous.pending - 1),
      });
    };
    const saving = navigator.locks ? navigator.locks.request(storageKey(userId, kind), work) : Promise.resolve().then(work);
    void saving.catch(() => { publish({ ...current.current, problem: "unavailable", pending: Math.max(0, current.current.pending - 1) }); });
  }
  function start(game: G) {
    const now = new Date().toISOString();
    dispatch(() => ({ id: crypto.randomUUID(), startedAt: now, updatedAt: now, game, history: [] }));
  }
  function act(action: (game: G) => G) {
    dispatch((session) => {
      if (!session) return session;
      const game = action(session.game);
      return game === session.game ? session : { ...session, game, history: [...session.history.slice(-49), session.game], updatedAt: new Date().toISOString() };
    });
  }
  function undo() {
    dispatch((session) => {
      const game = session?.history.at(-1);
      return session && game ? { ...session, game, history: session.history.slice(0, -1), updatedAt: new Date().toISOString() } : session;
    });
  }
  function discardInvalid() {
    if (current.current.problem !== "invalid") return;
    try { browserStorage.removeItem(storageKey(userId, kind)); reload(); }
    catch { publish({ ...current.current, problem: "unavailable" }); }
  }
  async function remove(sessionId: string): Promise<boolean> {
    const initial = current.current;
    if (!initial.ready || initial.pending || initial.problem || initial.record.current?.id !== sessionId) return false;
    publish({ ...initial, pending: 1 });
    const work = () => {
      const previous = current.current;
      if (previous.problem || previous.record.current?.id !== sessionId) {
        publish({ ...previous, pending: 0 }); return false;
      }
      const result = saveRecord(browserStorage, userId, kind, previous.record.revision, null, sessionId);
      // A failed deletion must keep the visible game as well as its saved copy.
      publish({ ...previous, pending: 0, record: result.ok ? result.record : previous.record, problem: result.ok ? null : result.problem });
      return result.ok;
    };
    try { return navigator.locks ? await navigator.locks.request(storageKey(userId, kind), work) : work(); }
    catch { publish({ ...current.current, pending: 0, problem: "unavailable" }); return false; }
  }
  const session = view.record.current as LocalSession<G> | null;
  const controls: LocalControls = {
    ready: view.ready, hasGame: Boolean(session), sessionId: session?.id ?? null, problem: view.problem, busy: view.pending > 0, updatedAt: session?.updatedAt ?? null,
    reload, retry: () => dispatch((existing) => existing), reset: () => dispatch(() => null), discardInvalid, remove,
  };
  return { game: session?.game ?? null, history: session?.history ?? [], start, act, undo, controls, record: view.record };
}
