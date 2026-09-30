"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cloudRequest, validCloudRow, validCommand, type CloudCommand, type CloudRow } from "@/lib/play/cloud-sessions";
import { withSession, type LocalGame, type LocalKind, type LocalSession } from "@/lib/play/local-sessions";
import { useLocalGame, type LocalControls } from "./useLocalGame";

export type SyncControls = {
  active: boolean; busy: boolean; message: string; error: boolean; remoteAvailable: boolean;
  canWrite: boolean; link: string; enable: () => void; open: () => void; claim: () => void; retry: () => void; observe: () => void;
};
type SyncView = { row: CloudRow | null; ready: boolean; busy: boolean; error: boolean; message: string; remoteAvailable: boolean; observing: boolean };
const initial: SyncView = { row: null, ready: false, busy: false, error: false, message: "", remoteAvailable: false, observing: false };
export function useSyncedGame<G extends LocalGame>(kind: LocalKind, userId: string) {
  const local = useLocalGame<G>(kind, userId);
  const [mode, setMode] = useState<"loading" | "local" | "cloud">("loading");
  const [view, setView] = useState<SyncView>(initial);
  const [link, setLink] = useState("");
  const [device, setDevice] = useState("");
  const state = useRef(initial), mounted = useRef(false), inFlight = useRef(false), reading = useRef(false), pending = useRef<CloudCommand | null>(null);
  const backupKey = "974darts:cloud:backup:v1:" + userId + ":" + kind;
  const pendingKey = "974darts:cloud:pending:v1:" + userId + ":" + kind;
  const publish = useCallback((next: SyncView) => {
    state.current = next;
    if (mounted.current) setView(next);
  }, []);
  const accept = useCallback((row: CloudRow | null, patch: Partial<SyncView> = {}) => {
    const old = state.current.row;
    if (row && old && row.revision < old.revision) return;
    if (row) { try { localStorage.setItem(backupKey, JSON.stringify(row)); } catch { /* The server already saved the state. */ } }
    publish({ ...state.current, row, ready: true, busy: false, error: false, message: "", ...patch });
  }, [backupKey, publish]);
  const activate = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("sync", "1");
    window.history.replaceState({}, "", url);
    setMode("cloud");
  }, []);
  const refresh = useCallback(async () => {
    if (inFlight.current || reading.current || pending.current) return;
    reading.current = true;
    try {
      const result = await cloudRequest(kind);
      if (inFlight.current || pending.current) return;
      accept(result.row, { message: result.row ? "" : "Aucune partie synchronisée pour ce jeu. Revenez au jeu local pour en partager une." });
    } catch (reason) {
      publish({ ...state.current, ready: true, error: true, message: reason instanceof Error ? reason.message : "Connexion interrompue." });
    } finally { reading.current = false; }
  }, [kind, accept, publish]);
  const send = useCallback(async (command: CloudCommand) => {
    if (inFlight.current) return;
    inFlight.current = true;
    pending.current = command;
    if (command.action === "ENABLE") activate();
    try { sessionStorage.setItem(pendingKey, JSON.stringify(command)); } catch { /* beforeunload protects the unconfirmed command. */ }
    publish({ ...state.current, busy: true, error: false, message: "Enregistrement en cours…" });
    try {
      const result = await cloudRequest(kind, command);
      pending.current = null;
      try { sessionStorage.removeItem(pendingKey); } catch { /* Retrying the same command is idempotent. */ }
      accept(result.row, { observing: result.conflict, message: result.conflict ? "La partie a changé sur un autre appareil. Dernier état chargé : vérifiez le dernier lancer avant de reprendre la saisie." : "" });
      if (result.row) activate();
    } catch (reason) {
      publish({ ...state.current, ready: true, busy: false, error: true, message: reason instanceof Error ? reason.message : "Enregistrement non confirmé. Réessayez." });
    } finally { inFlight.current = false; }
  }, [kind, pendingKey, publish, accept, activate]);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setDevice(crypto.randomUUID()); // New page = new writer identity, even after duplicating a tab.
      const url = new URL(window.location.href); url.searchParams.set("sync", "1"); setLink(url.toString());
      const active = new URLSearchParams(window.location.search).get("sync") === "1";
      setMode(active ? "cloud" : "local");
      try {
        const raw = sessionStorage.getItem(pendingKey), command: unknown = raw ? JSON.parse(raw) : null;
        if (validCommand(command) && command.kind === kind) {
          pending.current = command; setMode("cloud");
          publish({ ...state.current, ready: true, error: true, message: "Un enregistrement reste à confirmer. Réessayez pour connaître le score sauvegardé." });
        }
      } catch { /* Never discard the server state on storage errors. */ }
      if (active || pending.current) {
        try {
          const raw = localStorage.getItem(backupKey), saved: unknown = raw ? JSON.parse(raw) : null;
          if (validCloudRow(saved) && saved.kind === kind) publish({ ...state.current, row: saved });
        } catch { /* The remote copy remains authoritative. */ }
      }
    });
    function leaving(event: BeforeUnloadEvent) {
      if (pending.current) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", leaving);
    return () => { alive = false; mounted.current = false; window.removeEventListener("beforeunload", leaving); };
  }, [kind, pendingKey, backupKey, publish]);
  useEffect(() => {
    if (mode !== "cloud") return;
    let alive = true;
    Promise.resolve().then(() => { if (alive) void refresh(); });
    const poll = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(poll, 2000);
    window.addEventListener("online", poll); window.addEventListener("focus", poll); document.addEventListener("visibilitychange", poll);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("online", poll); window.removeEventListener("focus", poll); document.removeEventListener("visibilitychange", poll); };
  }, [mode, refresh]);
  const canWrite = mode === "cloud" && view.ready && !view.busy && !view.error && !view.observing && view.row?.writer_device === device;
  function command(action: CloudCommand["action"], record: CloudCommand["record"] = null) {
    return { kind, expected: state.current.row?.revision ?? 0, device: device, command: crypto.randomUUID(), action, record };
  }
  async function enable() {
    if (inFlight.current || local.controls.busy || local.controls.problem) return;
    inFlight.current = true; publish({ ...state.current, busy: true, error: false, message: "Recherche de votre partie synchronisée…" });
    try {
      const result = await cloudRequest(kind);
      if (result.row) {
        publish({ ...state.current, busy: false, remoteAvailable: true, message: "Une partie est déjà synchronisée pour ce jeu. Ouvrez-la pour continuer. Votre partie locale est conservée." });
        return;
      }
    } catch (reason) {
      publish({ ...state.current, busy: false, error: true, message: reason instanceof Error ? reason.message : "Connexion indisponible." }); return;
    } finally { inFlight.current = false; }
    await send({ ...command("ENABLE", local.record), expected: 0 });
  }
  function change(update: (session: LocalSession<G> | null) => LocalSession<G> | null) {
    const current = state.current;
    if (!canWrite || inFlight.current || pending.current || !current.row || current.row.writer_device !== device) return;
    const session = update(current.row.record.current as LocalSession<G> | null);
    if (session === current.row.record.current) return;
    void send(command("SAVE", withSession(current.row.record, session)));
  }
  function start(game: G) { const now = new Date().toISOString(); change(() => ({ id: crypto.randomUUID(), startedAt: now, updatedAt: now, game, history: [] })); }
  function act(action: (game: G) => G) {
    change((session) => {
      if (!session) return session;
      const game = action(session.game);
      return game === session.game ? session : { ...session, game, updatedAt: new Date().toISOString(), history: [...session.history.slice(-49), session.game] };
    });
  }
  function undo() {
    change((session) => { const game = session?.history.at(-1); return session && game ? { ...session, game, updatedAt: new Date().toISOString(), history: session.history.slice(0, -1) } : session; });
  }
  function claim() {
    if (view.busy || view.error || !view.row || pending.current) return;
    publish({ ...state.current, observing: false });
    void send(command("CLAIM"));
  }
  const sync: SyncControls = {
    active: mode === "cloud", busy: view.busy, message: view.message || (mode === "cloud" && !view.ready ? "Chargement de la partie synchronisée…" : ""), error: view.error, remoteAvailable: view.remoteAvailable,
    canWrite, link, enable: () => { void enable(); }, open: activate, claim,
    retry: () => { if (pending.current) void send(pending.current); else void refresh(); },
    observe: () => publish({ ...state.current, observing: true }),
  };
  if (mode !== "cloud") return { ...local, controls: { ...local.controls, ready: mode !== "loading" && local.controls.ready, sync } as LocalControls };
  const session = view.row?.record.current as LocalSession<G> | null;
  const controls: LocalControls = {
    ready: view.ready, hasGame: Boolean(session), problem: null, busy: view.busy, blocked: !canWrite,
    updatedAt: session?.updatedAt ?? null, sync, reload: sync.retry, retry: sync.retry, reset: () => change(() => null), discardInvalid: () => {},
  };
  return { game: session?.game ?? null, history: session?.history ?? [], start, act, undo, controls, record: view.row?.record ?? local.record };
}
