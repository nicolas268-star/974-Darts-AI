"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Crosshair, Eye, Gauge, Hash, LogIn, Play, Plus, RotateCcw, Target, Trophy, Undo2, Users, Zap } from "lucide-react";
import { DartEntry } from "@/components/play/DartEntry";
import { VisitProgress } from "@/components/play/VisitProgress";
import { parseVisitScore, isPossibleVisitScore, isPossibleDoubleCheckout } from "@/lib/play/dart-input";
import { createClient } from "@/lib/supabase/client";
import { PLAY_FORMATS, participantCount, sideForSeat, type PlayFormat } from "@/lib/play/format";
import {
  checkoutSuggestions,
  evaluateDarts,
  evaluateQuickScore,
  type DartThrow,
  type InRule,
  type InputMode,
  type OutRule,
  type VisitResult,
} from "@/lib/x01/engine";

type PlayerOption = { id: string; display_name: string; team_id: string | null };
type LivePlayer = {
  id: string;
  player_id: string | null;
  display_name: string;
  seat: number;
  side: number;
  legs_won: number;
  sets_won: number;
  remaining: number;
  opened: boolean;
};
type LiveGame = {
  id: string;
  session_code: string;
  starting_score: number;
  in_rule: InRule;
  out_rule: OutRule;
  input_mode: InputMode;
  play_format: PlayFormat;
  best_of_legs: number;
  status: "IN_PROGRESS" | "COMPLETED";
  current_leg_number: number;
  current_turn: number;
};
type ActiveSession = {
  id: string;
  session_code: string;
  starting_score: number;
  play_format: PlayFormat;
  current_leg_number: number;
  current_turn: number;
  created_at: string;
  updated_at: string;
};
type VisitRow = {
  id: string;
  game_player_id: string;
  turn_number: number;
  score_before: number;
  score_scored: number;
  score_after: number;
  darts_thrown: number;
  input_mode: InputMode;
  is_bust: boolean;
  is_checkout: boolean;
  opens_scoring: boolean;
  checkout_verified: boolean;
  attempted_score: number | null;
};

type SessionRole = "HOST" | "SCORER" | "SPECTATOR";

type Props = { currentPlayerId: string | null; currentDisplayName: string };

const scoreChoices = [301, 501, 701];
const legChoices = [1, 3, 5, 7, 9];

function averageFromPlayers(playerIds: string[], visits: VisitRow[]) {
  const rows = visits.filter((visit) => playerIds.includes(visit.game_player_id));
  const darts = rows.reduce((sum, visit) => sum + visit.darts_thrown, 0);
  const points = rows.reduce((sum, visit) => sum + visit.score_scored, 0);
  return darts ? ((points / darts) * 3).toFixed(2) : "—";
}

function totalScored(startingScore: number, remaining: number) {
  return Math.max(0, startingScore - remaining);
}

function modeLabel(mode: InputMode) {
  return mode === "QUICK_SCORE" ? "Score par volée" : "Flèche par flèche";
}

export function X01Game({ currentPlayerId, currentDisplayName }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("Prêt pour une nouvelle partie.");
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [sessionCodeInput, setSessionCodeInput] = useState("");
  const [sessionOpening, setSessionOpening] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const [pendingSessionCode, setPendingSessionCode] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("HOST");

  const [startingScore, setStartingScore] = useState(501);
  const [customScore, setCustomScore] = useState(501);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [inRule, setInRule] = useState<InRule>("STRAIGHT_IN");
  const [outRule, setOutRule] = useState<OutRule>("DOUBLE_OUT");
  const [inputMode, setInputMode] = useState<InputMode>("QUICK_SCORE");
  const [bestOfLegs, setBestOfLegs] = useState(3);
  const [playFormat, setPlayFormat] = useState<PlayFormat>("DUEL");
  const [playerIds, setPlayerIds] = useState([currentPlayerId ?? "", "", "", ""]);
  const [guestNames, setGuestNames] = useState([currentDisplayName || "Joueur 1", "Adversaire", "Joueur 3", "Joueur 4"]);

  const [game, setGame] = useState<LiveGame | null>(null);
  const [livePlayers, setLivePlayers] = useState<LivePlayer[]>([]);
  const [legId, setLegId] = useState<string | null>(null);
  const [starterPlayerId, setStarterPlayerId] = useState<string | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);

  const [quickScore, setQuickScore] = useState("");
  const quickInput = useRef<HTMLInputElement>(null);
  const saveInFlight = useRef(false);
  const [quickDarts, setQuickDarts] = useState(3);
  const [quickDoubleIn, setQuickDoubleIn] = useState(false);
  const [quickCheckoutDouble, setQuickCheckoutDouble] = useState(false);
  const [draftDarts, setDraftDarts] = useState<DartThrow[]>([]);

  const selectedStart = customEnabled ? Math.max(2, Math.min(5001, customScore)) : startingScore;
  const winnerTarget = game ? Math.floor(game.best_of_legs / 2) + 1 : Math.floor(bestOfLegs / 2) + 1;
  const setupPlayerCount = participantCount(playFormat);
  const isReadOnly = sessionRole === "SPECTATOR";

  const activePlayerIndex = useMemo(() => {
    if (!game || livePlayers.length === 0 || !starterPlayerId) return 0;
    const starterIndex = Math.max(0, livePlayers.findIndex((player) => player.id === starterPlayerId));
    return (starterIndex + game.current_turn - 1) % livePlayers.length;
  }, [game, livePlayers, starterPlayerId]);

  const activePlayer = livePlayers[activePlayerIndex] ?? null;
  const finishSuggestions = activePlayer && game ? checkoutSuggestions(activePlayer.remaining, game.out_rule, 3) : [];
  const sideSummaries = useMemo(() => {
    if (!game) return [] as Array<{ side: number; name: string; subtitle: string; remaining: number; legs: number; average: string; opened: boolean; isActive: boolean; total: number; }>;
    const uniqueSides = [...new Set(livePlayers.map((player) => player.side))].sort((left, right) => left - right);
    return uniqueSides.map((side) => {
      const members = livePlayers.filter((player) => player.side === side);
      const representative = members[0];
      const remaining = representative?.remaining ?? game.starting_score;
      const legs = Math.max(0, ...members.map((player) => player.legs_won));
      return {
        side,
        name: game.play_format === "TEAMS_2V2" ? `Équipe ${side === 1 ? "A" : "B"}` : representative?.display_name ?? `Joueur ${side}`,
        subtitle: game.play_format === "TEAMS_2V2" ? members.map((player) => player.display_name).join(" + ") : `Joueur ${representative?.seat ?? side}`,
        remaining,
        legs,
        average: averageFromPlayers(members.map((player) => player.id), visits),
        opened: members.some((player) => player.opened),
        isActive: members.some((player) => player.id === activePlayer?.id),
        total: totalScored(game.starting_score, remaining),
      };
    });
  }, [activePlayer, game, livePlayers, visits]);
  const visitTableRows = useMemo(() => {
    const playerCount = Math.max(1, livePlayers.length);
    const rows = new Map<number, Record<string, VisitRow>>();
    [...visits].sort((left, right) => left.turn_number - right.turn_number).forEach((visit) => {
      const round = Math.floor((visit.turn_number - 1) / playerCount) + 1;
      const row = rows.get(round) ?? {};
      row[visit.game_player_id] = visit;
      rows.set(round, row);
    });
    return [...rows.entries()].map(([round, cells]) => ({ round, cells }));
  }, [livePlayers.length, visits]);

  const dartPreview = useMemo(() => {
    if (!game || !activePlayer || draftDarts.length === 0) return null;
    return evaluateDarts({
      scoreBefore: activePlayer.remaining,
      opened: activePlayer.opened,
      inRule: game.in_rule,
      outRule: game.out_rule,
      darts: draftDarts,
    });
  }, [activePlayer, draftDarts, game]);

  const quickValue = parseVisitScore(quickScore);
  const quickIsFinish = quickValue !== null && activePlayer?.remaining === quickValue;
  const dartVisitComplete = draftDarts.length === 3 || Boolean(dartPreview?.bust || dartPreview?.checkout);

  useEffect(() => {
    if (!saving && !isReadOnly && game?.status === "IN_PROGRESS" && window.matchMedia("(pointer: fine)").matches) {
      quickInput.current?.focus({ preventScroll: true });
    }
  }, [saving, isReadOnly, game?.status, game?.current_turn, game?.current_leg_number, game?.input_mode]);

  const refreshActiveSessions = useCallback(async () => {
    if (!supabase) return;
    const { data, error: sessionsError } = await supabase.rpc("list_my_live_game_sessions");
    if (sessionsError) throw sessionsError;
    setActiveSessions((data ?? []) as ActiveSession[]);
  }, [supabase]);

  const hydrateSession = useCallback(async (rawCode: string) => {
    if (!supabase) return false;
    const sessionCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (sessionCode.length !== 6) return false;

    const { data: gameRow, error: gameError } = await supabase
      .from("live_games")
      .select("id,session_code,starting_score,in_rule,out_rule,input_mode,play_format,best_of_legs,status,current_leg_number,current_turn")
      .eq("session_code", sessionCode)
      .eq("status", "IN_PROGRESS")
      .maybeSingle();

    if (gameError) throw gameError;
    if (!gameRow) return false;

    const [{ data: playerRows, error: playerError }, { data: legRow, error: legError }] = await Promise.all([
      supabase.from("live_game_players").select("id,player_id,display_name,seat,side,legs_won,sets_won").eq("game_id", gameRow.id).order("seat"),
      supabase.from("live_legs").select("id,starting_game_player_id").eq("game_id", gameRow.id).eq("leg_number", gameRow.current_leg_number).eq("status", "IN_PROGRESS").maybeSingle(),
    ]);
    if (playerError) throw playerError;
    if (legError) throw legError;
    if (!playerRows || playerRows.length < 1 || playerRows.length > 4 || !legRow) return false;

    const { data: visitRows, error: visitError } = await supabase
      .from("live_visits")
      .select("id,game_player_id,turn_number,score_before,score_scored,score_after,darts_thrown,input_mode,is_bust,is_checkout,opens_scoring,checkout_verified,attempted_score")
      .eq("leg_id", legRow.id)
      .order("turn_number");
    if (visitError) throw visitError;

    const typedGame = gameRow as LiveGame;
    const typedVisits = (visitRows ?? []) as VisitRow[];
    const reconstructed = playerRows.map((player) => {
      const sidePlayerIds = playerRows.filter((item) => item.side === player.side).map((item) => item.id);
      const sideVisits = typedVisits.filter((visit) => sidePlayerIds.includes(visit.game_player_id));
      const latest = sideVisits.at(-1);
      return {
        ...player,
        remaining: latest?.score_after ?? typedGame.starting_score,
        opened: typedGame.in_rule === "STRAIGHT_IN" || sideVisits.some((visit) => visit.opens_scoring),
      } as LivePlayer;
    });

    setGame(typedGame);
    setLivePlayers(reconstructed);
    setLegId(legRow.id);
    setStarterPlayerId(legRow.starting_game_player_id);
    setVisits(typedVisits);
    setInputMode(typedGame.input_mode);
    setSessionCodeInput(sessionCode);
    setMessage(`Session ${sessionCode} reprise — leg ${typedGame.current_leg_number}.`);
    return true;
  }, [supabase]);

  function writeSessionToUrl(code?: string) {
    if (typeof window === "undefined") return;
    const nextUrl = code ? `/play/501?session=${encodeURIComponent(code)}` : "/play/501";
    window.history.replaceState({}, "", nextUrl);
  }

  const openSession = useCallback(async (rawCode: string, requestedRole: "SCORER" | "SPECTATOR" = "SCORER") => {
    if (!supabase) return false;
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length !== 6) {
      setError("Le code de partie doit contenir 6 caractères.");
      return false;
    }
    setSessionOpening(true);
    setError(null);
    try {
      const { data: joinRows, error: joinError } = await supabase.rpc("join_live_game_session", { p_code: code, p_role: requestedRole });
      if (joinError) throw joinError;
      const resolvedRole = ((joinRows as Array<{ role?: SessionRole }> | null)?.[0]?.role ?? requestedRole) as SessionRole;
      const loaded = await hydrateSession(code);
      if (!loaded) throw new Error("Session introuvable ou déjà terminée.");
      setSessionRole(resolvedRole);
      setPendingSessionCode(null);
      writeSessionToUrl(code);
      await refreshActiveSessions();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d’ouvrir cette session.");
      return false;
    } finally {
      setSessionOpening(false);
    }
  }, [hydrateSession, refreshActiveSessions, supabase]);


  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!supabase) throw new Error("Connexion Supabase indisponible.");
        const { data, error: playerError } = await supabase.from("players").select("id,display_name,team_id").order("display_name");
        if (playerError) throw playerError;
        if (!active) return;
        setPlayers((data ?? []) as PlayerOption[]);
        await refreshActiveSessions();
        const initialCode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("session") : null;
        if (typeof window !== "undefined" && window.location.hash === "#sessions" && active) setSessionsExpanded(true);
        if (initialCode && active) setPendingSessionCode(initialCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [openSession, refreshActiveSessions, supabase]);


  useEffect(() => {
    if (!game || !isReadOnly) return;
    const code = game.session_code;
    const timer = window.setInterval(() => { void hydrateSession(code); }, 2000);
    return () => window.clearInterval(timer);
  }, [game?.session_code, hydrateSession, isReadOnly]);

  function setupName(playerId: string, guestName: string) {
    return players.find((player) => player.id === playerId)?.display_name ?? guestName.trim();
  }

  async function startGame() {
    if (!supabase) return;
    const count = participantCount(playFormat);
    const selectedIds = playerIds.slice(0, count);
    const names = Array.from({ length: count }, (_, index) => setupName(selectedIds[index], guestNames[index]));
    if (names.some((name) => !name)) { setError("Renseigne tous les participants."); return; }
    const linkedIds = selectedIds.filter(Boolean);
    if (new Set(linkedIds).size !== linkedIds.length) { setError("Un même joueur ne peut pas occuper deux places."); return; }

    setSaving(true); setError(null);
    try {
      const { data: gameRow, error: gameError } = await supabase.from("live_games").insert({
        starting_score: selectedStart,
        in_rule: inRule,
        out_rule: outRule,
        input_mode: inputMode,
        play_format: playFormat,
        best_of_legs: bestOfLegs,
        best_of_sets: 1,
        status: "IN_PROGRESS",
        current_leg_number: 1,
        current_turn: 1,
        started_at: new Date().toISOString(),
      }).select("id,session_code,starting_score,in_rule,out_rule,input_mode,play_format,best_of_legs,status,current_leg_number,current_turn").single();
      if (gameError) throw gameError;

      const { data: gamePlayers, error: playersError } = await supabase.from("live_game_players").insert(
        names.map((name, index) => ({ game_id: gameRow.id, player_id: selectedIds[index] || null, display_name: name, seat: index + 1, side: sideForSeat(playFormat, index) + 1 }))
      ).select("id,player_id,display_name,seat,side,legs_won,sets_won");
      if (playersError) throw playersError;
      const ordered = (gamePlayers ?? []).sort((a, b) => a.seat - b.seat);
      if (ordered.length !== count) throw new Error("Création des participants incomplète.");

      const { data: newLeg, error: legError } = await supabase.from("live_legs").insert({
        game_id: gameRow.id,
        leg_number: 1,
        set_number: 1,
        starting_game_player_id: ordered[0].id,
        status: "IN_PROGRESS",
      }).select("id,starting_game_player_id").single();
      if (legError) throw legError;

      setGame(gameRow as LiveGame);
      setSessionRole("HOST");
      setLivePlayers(ordered.map((player) => ({ ...player, remaining: selectedStart, opened: inRule === "STRAIGHT_IN" })) as LivePlayer[]);
      setLegId(newLeg.id);
      setStarterPlayerId(newLeg.starting_game_player_id);
      setVisits([]);
      setDraftDarts([]);
      setQuickScore("");
      setQuickDarts(3);
      setQuickDoubleIn(false);
      setQuickCheckoutDouble(false);
      setSessionCodeInput(gameRow.session_code);
      writeSessionToUrl(gameRow.session_code);
      await refreshActiveSessions();
      setMessage(`${names[0]} commence le leg 1 · session ${gameRow.session_code}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de créer la partie.");
    } finally { setSaving(false); }
  }

  async function changeMode(nextMode: InputMode) {
    if (isReadOnly || saving || draftDarts.length > 0 || quickScore.trim()) return;
    setInputMode(nextMode);
    setDraftDarts([]);
    if (!game || !supabase) return;
    setGame({ ...game, input_mode: nextMode });
    const { error: updateError } = await supabase.from("live_games").update({ input_mode: nextMode, updated_at: new Date().toISOString() }).eq("id", game.id);
    if (updateError) setError(updateError.message);
  }

  function sideDisplayName(side: number) {
    const members = livePlayers.filter((player) => player.side === side).map((player) => player.display_name);
    return game?.play_format === "TEAMS_2V2" ? `Équipe ${side === 1 ? "A" : "B"} · ${members.join(" + ")}` : (members[0] ?? `Camp ${side}`);
  }

  async function completeLeg(winner: LivePlayer, visitId: string) {
    if (!supabase || !game || !legId) return;
    const winnerSide = winner.side;
    const sideMembers = livePlayers.filter((player) => player.side === winnerSide);
    const currentLegsWon = Math.max(0, ...sideMembers.map((player) => player.legs_won));
    const newLegsWon = currentLegsWon + 1;
    const matchWon = newLegsWon >= winnerTarget;
    const finishedAt = new Date().toISOString();

    const { error: legError } = await supabase.from("live_legs").update({
      winner_game_player_id: winner.id,
      winner_side: winnerSide,
      status: "COMPLETED",
      finished_at: finishedAt,
    }).eq("id", legId);
    if (legError) throw legError;

    const { error: playerError } = await supabase.from("live_game_players").update({ legs_won: newLegsWon }).eq("game_id", game.id).eq("side", winnerSide);
    if (playerError) throw playerError;

    setLivePlayers((current) => current.map((player) => player.side === winnerSide ? { ...player, legs_won: newLegsWon, remaining: 0 } : player));

    if (matchWon) {
      const { error: gameError } = await supabase.from("live_games").update({ status: "COMPLETED", finished_at: finishedAt, updated_at: finishedAt }).eq("id", game.id);
      if (gameError) throw gameError;
      setGame({ ...game, status: "COMPLETED" });
      await refreshActiveSessions();
      setMessage(`${sideDisplayName(winnerSide)} remporte le match.`);
      return;
    }

    const nextLegNumber = game.current_leg_number + 1;
    const nextStarter = livePlayers[(nextLegNumber - 1) % livePlayers.length];
    const { data: newLeg, error: newLegError } = await supabase.from("live_legs").insert({
      game_id: game.id,
      leg_number: nextLegNumber,
      set_number: 1,
      starting_game_player_id: nextStarter.id,
      status: "IN_PROGRESS",
    }).select("id,starting_game_player_id").single();
    if (newLegError) throw newLegError;

    const { error: gameError } = await supabase.from("live_games").update({ current_leg_number: nextLegNumber, current_turn: 1, updated_at: finishedAt }).eq("id", game.id);
    if (gameError) throw gameError;

    setGame({ ...game, current_leg_number: nextLegNumber, current_turn: 1 });
    setLegId(newLeg.id);
    setStarterPlayerId(newLeg.starting_game_player_id);
    setVisits([]);
    setLivePlayers((current) => current.map((player) => ({
      ...player,
      legs_won: player.side === winnerSide ? newLegsWon : player.legs_won,
      remaining: game.starting_score,
      opened: game.in_rule === "STRAIGHT_IN",
    })));
    setMessage(`${sideDisplayName(winnerSide)} gagne le leg. ${nextStarter.display_name} commence le leg ${nextLegNumber}.`);
    void visitId;
  }

  async function saveVisit(result: VisitResult, darts: DartThrow[] = []) {
    if (!supabase || !game || !legId || !activePlayer || saving || saveInFlight.current || isReadOnly || game.status !== "IN_PROGRESS") return;
    saveInFlight.current = true;
    setSaving(true); setError(null);
    try {
      const visitPayload = {
        leg_id: legId,
        game_player_id: activePlayer.id,
        turn_number: game.current_turn,
        score_before: activePlayer.remaining,
        score_scored: result.creditedScore,
        score_after: result.scoreAfter,
        darts_thrown: result.dartsThrown,
        input_mode: game.input_mode,
        is_bust: result.bust,
        is_checkout: result.checkout,
        opens_scoring: result.opensScoring,
        checkout_verified: result.checkout && (game.out_rule === "STRAIGHT_OUT" || game.input_mode === "DART_BY_DART" || quickCheckoutDouble),
        attempted_score: result.attemptedScore,
      };
      const { data: visitRow, error: visitError } = await supabase.from("live_visits").insert(visitPayload)
        .select("id,game_player_id,turn_number,score_before,score_scored,score_after,darts_thrown,input_mode,is_bust,is_checkout,opens_scoring,checkout_verified,attempted_score").single();
      if (visitError) throw visitError;

      if (darts.length) {
        const { error: throwsError } = await supabase.from("live_throws").insert(darts.map((dart, index) => ({
          visit_id: visitRow.id,
          dart_number: index + 1,
          segment: dart.segment,
          multiplier: dart.multiplier,
          score: dart.score,
          is_double: dart.isDouble,
          is_bull: dart.isBull,
          is_miss: dart.isMiss,
        })));
        if (throwsError) {
          await supabase.from("live_visits").delete().eq("id", visitRow.id);
          throw throwsError;
        }
      }

      setVisits((current) => [...current, visitRow as VisitRow]);
      setLivePlayers((current) => current.map((player) => player.side === activePlayer.side ? {
        ...player,
        remaining: result.scoreAfter,
        opened: result.openedAfter,
      } : player));
      setMessage(result.message);
      setDraftDarts([]);
      setQuickScore("");
      setQuickDarts(3);
      setQuickDoubleIn(false);
      setQuickCheckoutDouble(false);

      if (result.checkout) {
        await completeLeg(activePlayer, visitRow.id);
      } else {
        const nextTurn = game.current_turn + 1;
        const { error: turnError } = await supabase.from("live_games").update({ current_turn: nextTurn, updated_at: new Date().toISOString() }).eq("id", game.id);
        if (turnError) throw turnError;
        setGame({ ...game, current_turn: nextTurn });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally { saveInFlight.current = false; setSaving(false); }
  }

  async function submitQuick(forceBust = false) {
    if (!game || !activePlayer || saving || isReadOnly) return;
    const score = parseVisitScore(quickScore);
    if (score === null || !isPossibleVisitScore(score, quickDarts)) {
      setError("Saisis un score réalisable avec le nombre de fléchettes indiqué (0 à 180).");
      return;
    }
    if (!forceBust && game.out_rule === "DOUBLE_OUT" && score === activePlayer.remaining && !isPossibleDoubleCheckout(score, quickDarts)) {
      setError("Cette sortie n’est pas réalisable sur un double avec ce nombre de fléchettes.");
      return;
    }
    if (!forceBust && game.out_rule === "DOUBLE_OUT" && score === activePlayer.remaining && !quickCheckoutDouble) {
      setError("Confirme le double ou Bull final pour valider la sortie, ou corrige le score.");
      return;
    }
    const result = evaluateQuickScore({
      scoreBefore: activePlayer.remaining,
      score,
      dartsThrown: quickDarts,
      opened: activePlayer.opened,
      inRule: game.in_rule,
      outRule: game.out_rule,
      opensScoringConfirmed: quickDoubleIn,
      checkoutDoubleConfirmed: quickCheckoutDouble,
    });
    if (forceBust && !(score > activePlayer.remaining || (game.out_rule === "DOUBLE_OUT" && score >= activePlayer.remaining - 1))) {
      setError("Ce score ne produit pas de bust. Corrige le score tenté ou valide la volée normalement.");
      return;
    }
    if (forceBust) {
      result.bust = true;
      result.checkout = false;
      result.creditedScore = 0;
      result.scoreAfter = activePlayer.remaining;
      result.message = "BUST — le score revient au début de la volée.";
    }
    if (quickDarts < 3 && !result.checkout && !result.bust) {
      setError("Une volée non terminée doit contenir trois fléchettes. Utilise le mode fléchette pour une saisie progressive.");
      return;
    }
    await saveVisit(result);
  }

  function addDart(dart: DartThrow) {
    if (saving || isReadOnly || draftDarts.length >= 3 || dartPreview?.bust || dartPreview?.checkout) return;
    setDraftDarts((current) => [...current, dart]);
  }

  async function submitDarts() {
    if (!dartPreview || !dartVisitComplete) return;
    await saveVisit(dartPreview, draftDarts);
  }

  async function correctLastVisit() {
    if (!supabase || !game || !legId || visits.length === 0 || saving || isReadOnly) return;
    const last = visits.at(-1)!;
    if (last.is_checkout) { setError("Un checkout déjà validé ne peut pas être rouvert depuis cette V1."); return; }
    setSaving(true); setError(null);
    try {
      let restoredDarts: DartThrow[] = [];
      if (last.input_mode === "DART_BY_DART") {
        const { data: throwRows, error: throwError } = await supabase
          .from("live_throws")
          .select("segment,multiplier,score,is_double,is_bull,is_miss")
          .eq("visit_id", last.id)
          .order("dart_number");
        if (throwError) throw throwError;
        restoredDarts = (throwRows ?? []).map((dart) => ({
          segment: dart.segment,
          multiplier: dart.multiplier as 0 | 1 | 2 | 3,
          score: dart.score,
          label: dart.is_miss ? "MISS" : dart.is_bull ? (dart.score === 50 ? "BULL" : "25") : `${dart.multiplier === 3 ? "T" : dart.multiplier === 2 ? "D" : "S"}${dart.segment}`,
          isDouble: dart.is_double,
          isBull: dart.is_bull,
          isMiss: dart.is_miss,
        }));
      }

      const { error: deleteError } = await supabase.from("live_visits").delete().eq("id", last.id);
      if (deleteError) throw deleteError;
      const nextTurn = Math.max(1, game.current_turn - 1);
      const { error: gameError } = await supabase.from("live_games").update({
        current_turn: nextTurn,
        input_mode: last.input_mode,
        updated_at: new Date().toISOString(),
      }).eq("id", game.id);
      if (gameError) throw gameError;

      await hydrateSession(game.session_code);
      setInputMode(last.input_mode);
      setGame((current) => current ? { ...current, input_mode: last.input_mode, current_turn: nextTurn } : current);
      if (last.input_mode === "QUICK_SCORE") {
        setQuickScore(String(last.attempted_score ?? last.score_scored));
        setQuickDarts(last.darts_thrown);
        setQuickDoubleIn(last.opens_scoring);
        setQuickCheckoutDouble(last.checkout_verified);
        setDraftDarts([]);
      } else {
        setDraftDarts(restoredDarts);
      }
      setMessage("Dernière volée chargée pour correction — modifie puis valide.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Correction impossible.");
    } finally { setSaving(false); }
  }

  async function leaveSession() {
    setGame(null);
    setLivePlayers([]);
    setVisits([]);
    setLegId(null);
    setStarterPlayerId(null);
    setDraftDarts([]);
    setSessionCodeInput("");
    setQuickScore("");
    setQuickDarts(3);
    setQuickDoubleIn(false);
    setQuickCheckoutDouble(false);
    setSessionRole("HOST");
    writeSessionToUrl();
    try { await refreshActiveSessions(); } catch { /* la liste se rechargera au prochain accès */ }
    setMessage("Session laissée active. Tu peux la reprendre ou créer une autre partie.");
  }

  async function cancelGame() {
    if (!supabase || !game || saving || isReadOnly) return;
    setSaving(true); setError(null);
    try {
      const { error: cancelError } = await supabase.from("live_games").update({ status: "CANCELLED", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", game.id);
      if (cancelError) throw cancelError;
      setGame(null); setLivePlayers([]); setVisits([]); setLegId(null); setStarterPlayerId(null); setDraftDarts([]); setSessionCodeInput("");
      writeSessionToUrl();
      await refreshActiveSessions();
      setMessage("Partie annulée. Tu peux en créer une nouvelle.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Annulation impossible."); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="x01-loading"><Target /><p>Chargement du module X01…</p></section>;

  if (!game) {
    return <div className="x01-shell">
      <section className="x01-hero">
        <div><span className="x01-kicker">974Darts · Univers Jeux</span><h1>Jouer au 501</h1><p>Chaque partie possède maintenant sa propre session. Plusieurs cibles et plusieurs téléphones peuvent jouer en parallèle sans se mélanger.</p></div>
        <div className="x01-hero-icon"><Target /></div>
      </section>

      {error && <div className="x01-alert error">{error}</div>}

      <section className="x01-session-hub">
        <article className="x01-session-join">
          <header><Hash /><div><span>Rejoindre / reprendre</span><h2>Code de partie</h2></div></header>
          <p>Entre le code à 6 caractères affiché sur l’autre appareil. Seule cette partie sera ouverte.</p>
          <div className="x01-session-form">
            <input aria-label="Code de partie" value={sessionCodeInput} maxLength={6} placeholder="Ex. A7C42F" onChange={(event) => setSessionCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter" && sessionCodeInput.length === 6) setPendingSessionCode(sessionCodeInput); }} />
            <button type="button" disabled={sessionOpening || sessionCodeInput.length !== 6} onClick={() => setPendingSessionCode(sessionCodeInput)}><LogIn />Continuer</button>
          </div>
        </article>

        <article id="sessions" className={`x01-session-list-card ${sessionsExpanded ? "expanded" : "collapsed"}`}>
          <button className="x01-session-toggle" type="button" onClick={() => setSessionsExpanded((current) => !current)} aria-expanded={sessionsExpanded}>
            <Users /><div><span>Mes sessions</span><h2>Parties en cours</h2></div><b>{activeSessions.length}</b><ChevronDown className={sessionsExpanded ? "open" : ""} />
          </button>
          {sessionsExpanded ? (activeSessions.length ? <div className="x01-session-list">{activeSessions.map((session) => <button type="button" key={session.id} onClick={() => setPendingSessionCode(session.session_code)} disabled={sessionOpening}>
            <span className="x01-session-code">{session.session_code}</span>
            <span><strong>{session.starting_score} · {session.play_format === "TEAMS_2V2" ? "2 vs 2" : session.play_format === "SOLO" ? "Solo" : session.play_format === "DUEL" ? "1 vs 1" : session.play_format === "THREE" ? "3 joueurs" : "4 joueurs"}</strong><small>Leg {session.current_leg_number} · volée {session.current_turn}</small></span>
            <em>Choisir →</em>
          </button>)}</div> : <div className="x01-session-empty">Aucune session active. Crée une nouvelle partie ci-dessous.</div>) : null}
        </article>
      </section>

      {pendingSessionCode ? <section className="x01-role-dialog" role="dialog" aria-label="Choisir le mode de session">
        <div><span>Session {pendingSessionCode}</span><h2>Comment veux-tu rejoindre ?</h2><p>Le mode observateur est strictement en lecture seule.</p></div>
        <div className="x01-role-actions">
          <button type="button" disabled={sessionOpening} onClick={() => void openSession(pendingSessionCode, "SCORER")}><Target /><strong>Joueur</strong><small>Saisir et corriger les scores</small></button>
          <button type="button" disabled={sessionOpening} onClick={() => void openSession(pendingSessionCode, "SPECTATOR")}><Eye /><strong>Observateur</strong><small>Suivre la partie sans la modifier</small></button>
          <button type="button" className="cancel" onClick={() => setPendingSessionCode(null)}>Annuler</button>
        </div>
      </section> : null}

      <div className="x01-new-session-title"><Plus /><div><span>Nouvelle session</span><h2>Créer une partie indépendante</h2></div></div>
      <section className="x01-setup-grid">
        <article className="x01-panel">
          <header><Crosshair /><div><span>Format</span><h2>Règles de la partie</h2></div></header>
          <label className="x01-field"><span>Score de départ</span><div className="x01-choice-row">
            {scoreChoices.map((score) => <button type="button" className={!customEnabled && startingScore === score ? "active" : ""} key={score} onClick={() => { setStartingScore(score); setCustomEnabled(false); }}>{score}</button>)}
            <button type="button" className={customEnabled ? "active" : ""} onClick={() => setCustomEnabled(true)}>Perso</button>
          </div></label>
          {customEnabled && <label className="x01-field"><span>Score personnalisé</span><input type="number" min="2" max="5001" value={customScore} onChange={(event) => setCustomScore(Number(event.target.value))} /></label>}
          <div className="x01-two-cols">
            <label className="x01-field"><span>Entrée</span><select value={inRule} onChange={(event) => setInRule(event.target.value as InRule)}><option value="STRAIGHT_IN">Straight In</option><option value="DOUBLE_IN">Double In</option></select></label>
            <label className="x01-field"><span>Sortie</span><select value={outRule} onChange={(event) => setOutRule(event.target.value as OutRule)}><option value="DOUBLE_OUT">Double Out</option><option value="STRAIGHT_OUT">Straight Out</option></select></label>
          </div>
          <label className="x01-field"><span>Match</span><div className="x01-choice-row">{legChoices.map((legs) => <button type="button" className={bestOfLegs === legs ? "active" : ""} key={legs} onClick={() => setBestOfLegs(legs)}>{legs === 1 ? "1 leg" : `BO${legs}`}</button>)}</div></label>
        </article>

        <article className="x01-panel">
          <header><Gauge /><div><span>Saisie</span><h2>Mode de comptage</h2></div></header>
          <div className="x01-mode-cards">
            <button type="button" className={inputMode === "QUICK_SCORE" ? "active" : ""} onClick={() => setInputMode("QUICK_SCORE")}><Zap /><strong>Score par volée</strong><small>Ex. 60, 85, 100…</small></button>
            <button type="button" className={inputMode === "DART_BY_DART" ? "active" : ""} onClick={() => setInputMode("DART_BY_DART")}><Target /><strong>Flèche par flèche</strong><small>S20 · T20 · D10…</small></button>
          </div>
          <p className="x01-info">Le mode peut être changé entre deux volées. Chaque volée conserve son mode de saisie dans l’historique.</p>
        </article>

        <article className="x01-panel x01-players-setup">
          <header><Users /><div><span>Participants</span><h2>Format de jeu</h2></div></header>
          <div className="x01-format-grid">{PLAY_FORMATS.map((item) => <button type="button" key={item.id} className={playFormat === item.id ? "active" : ""} onClick={() => setPlayFormat(item.id)}><strong>{item.label}</strong><small>{item.subtitle}</small></button>)}</div>
          <div className="x01-player-grid">
            {Array.from({ length: setupPlayerCount }, (_, index) => <label className="x01-field" key={index}><span>{playFormat === "TEAMS_2V2" ? `${index % 2 === 0 ? "Équipe A" : "Équipe B"} · Joueur ${Math.floor(index / 2) + 1}` : `Joueur ${index + 1}`}</span><select value={playerIds[index] ?? ""} onChange={(event) => setPlayerIds((current) => current.map((value, i) => i === index ? event.target.value : value))}><option value="">Invité / nom libre</option>{players.map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}</select>{!playerIds[index] && <input value={guestNames[index] ?? ""} onChange={(event) => setGuestNames((current) => current.map((value, i) => i === index ? event.target.value : value))} maxLength={80} />}</label>)}
          </div>
          {playFormat === "TEAMS_2V2" ? <p className="x01-info">Équipe A : joueurs 1 et 3 · Équipe B : joueurs 2 et 4. Le score X01 est partagé par l’équipe, les joueurs alternent les volées.</p> : null}
        </article>
      </section>

      <button className="x01-start" type="button" disabled={saving} onClick={startGame}><Play />{saving ? "Création…" : `Créer la session · ${selectedStart}`}</button>
    </div>;
  }

  return <div className="x01-shell x01-universe">
    <section className="x01-matchbar">
      <div><span>SESSION {game.session_code}</span><strong>{game.starting_score} · {game.play_format === "TEAMS_2V2" ? "2 vs 2" : livePlayers.length + " joueur(s)"} · {game.in_rule === "DOUBLE_IN" ? "Double In" : "Straight In"} · {game.out_rule === "DOUBLE_OUT" ? "Double Out" : "Straight Out"}</strong></div>
      <div className="x01-leg-pill">LEG {game.current_leg_number} · BO{game.best_of_legs}</div>
      <div className="x01-match-actions"><button type="button" onClick={() => void leaveSession()} disabled={saving}><Users />Mes parties</button>{!isReadOnly ? <button type="button" onClick={cancelGame} disabled={saving}><RotateCcw />Annuler la partie</button> : null}</div>
    </section>

    {error ? <div className="x01-alert error" role="alert">{error}</div> : null}
    <div className="x01-alert" role="status">{message}</div>

    <section className="play-score-strip" aria-label="Scores des joueurs">
      {sideSummaries.map((summary) => <article key={summary.side} className={summary.isActive ? "active" : ""}>
        <small>{summary.isActive && game.status === "IN_PROGRESS" ? "AU LANCER" : summary.legs + " / " + winnerTarget + " legs"}</small>
        <h2>{summary.name}</h2><strong>{summary.remaining}</strong><span>points restants</span>
        <p>{summary.subtitle}</p><small>Moy. 3 flèches : {summary.average} · {summary.legs} leg(s)</small>
      </article>)}
    </section>

    {game.status === "COMPLETED" ? <section className="x01-winner"><Trophy /><div><span>Match terminé</span><h2>{sideDisplayName(livePlayers.slice().sort((a, b) => b.legs_won - a.legs_won)[0]?.side ?? 1)}</h2><p>La partie est enregistrée.</p></div><button type="button" onClick={() => void leaveSession()}>Mes parties</button></section>
    : isReadOnly ? <section className="x01-observer-panel"><Eye /><div><strong>Mode observateur</strong><span>Les scores se mettent à jour automatiquement.</span></div></section>
    : <section className="play-turn-panel">
      <header><div><small>AU LANCER · VOLÉE {game.current_turn}</small><h2>{activePlayer?.display_name}</h2><p>Reste <b>{activePlayer?.remaining}</b></p></div><span>Ensuite : <b>{livePlayers[(activePlayerIndex + 1) % livePlayers.length]?.display_name}</b></span></header>
      <div className="play-mode-toggle" aria-label="Mode de saisie">{(["QUICK_SCORE", "DART_BY_DART"] as InputMode[]).map((mode) => <button key={mode} type="button" aria-pressed={game.input_mode === mode} disabled={saving || draftDarts.length > 0 || Boolean(quickScore.trim())} onClick={() => void changeMode(mode)}>{modeLabel(mode)}</button>)}</div>
      {game.input_mode === "QUICK_SCORE" ? <form className="play-quick-form" onSubmit={(event) => { event.preventDefault(); void submitQuick(); }}>
        <label htmlFor="x01-visit-score">Score de la volée</label>
        <div className="play-input-row"><input ref={quickInput} id="x01-visit-score" value={quickScore} type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" placeholder="Ex. 100" maxLength={3} disabled={saving} onChange={(event) => { setQuickScore(event.target.value); setError(null); }} onFocus={(event) => event.currentTarget.select()} aria-describedby="x01-entry-help" /><button type="submit" disabled={saving || quickValue === null}>{saving ? "Enregistrement…" : "Valider la volée"}</button></div>
        <p id="x01-entry-help" className="play-input-hint">Tape le total puis Entrée. 0 enregistre une volée sans point.</p>
        <button type="button" disabled={saving || quickValue === null} onClick={() => void submitQuick(true)}>Enregistrer cette volée comme bust</button>
        <label className="play-dart-count">Fléchettes jouées<select value={quickDarts} disabled={saving} onChange={(event) => setQuickDarts(Number(event.target.value))}><option value={3}>3</option><option value={2}>2 — sortie / bust</option><option value={1}>1 — sortie / bust</option></select></label>
        {game.in_rule === "DOUBLE_IN" && !activePlayer?.opened ? <label className="x01-check"><input type="checkbox" disabled={saving} checked={quickDoubleIn} onChange={(event) => setQuickDoubleIn(event.target.checked)} /><span><b>Double In touché</b><small>Saisis les points à partir du double d’entrée.</small></span></label> : null}
        {game.out_rule === "DOUBLE_OUT" && quickIsFinish ? <label className="x01-check"><input type="checkbox" disabled={saving} checked={quickCheckoutDouble} onChange={(event) => setQuickCheckoutDouble(event.target.checked)} /><span><b>Dernière fléchette : Double / Bull</b><small>Confirme la sortie et le nombre de fléchettes jouées.</small></span></label> : null}
      </form> : <>
        <VisitProgress darts={draftDarts.map((dart) => dart.label)} complete={dartVisitComplete} />
        <DartEntry onDart={addDart} disabled={saving || dartVisitComplete} focusKey={game.current_turn + "-" + draftDarts.length} />
        {dartPreview ? <div className={"x01-preview " + (dartPreview.bust ? "bust" : dartPreview.checkout ? "checkout" : "")}><strong>{dartPreview.bust ? "BUST" : dartPreview.creditedScore + " pts → reste " + dartPreview.scoreAfter}</strong><small>{dartPreview.message}</small></div> : null}
        <div className="play-turn-actions"><button type="button" disabled={!draftDarts.length || saving} onClick={() => setDraftDarts((current) => current.slice(0, -1))}>Annuler la dernière fléchette</button><button className="play-next" type="button" disabled={saving || !dartVisitComplete} onClick={() => void submitDarts()}>{saving ? "Enregistrement…" : "Valider la volée"}</button></div>
      </>}
    </section>}

    {game.status === "IN_PROGRESS" && finishSuggestions.length ? <section className="x01-finish-box"><span>Finitions possibles · {activePlayer?.display_name}</span><ol>{finishSuggestions.map((suggestion, index) => <li key={suggestion}><b>{index + 1}.</b><span>{suggestion}</span></li>)}</ol></section> : null}

    <details className="play-history" open={game.status === "COMPLETED"}>
      <summary>Historique des volées · leg {game.current_leg_number}</summary>
      {!isReadOnly && game.status === "IN_PROGRESS" ? <button type="button" disabled={!visits.length || saving || draftDarts.length > 0 || Boolean(quickScore.trim())} onClick={() => void correctLastVisit()}><Undo2 />Corriger la dernière volée</button> : null}
      <div className="play-table-scroll" role="region" aria-label="Historique de tous les joueurs" tabIndex={0}><table>
        <thead><tr><th scope="col">Volée</th>{livePlayers.map((player) => <th scope="col" key={player.id}>{player.display_name}</th>)}</tr></thead>
        <tbody>{visitTableRows.map((row) => <tr key={row.round}><th scope="row">{row.round}</th>{livePlayers.map((player) => { const visit = row.cells[player.id]; return <td key={player.id}>{visit ? <><b>{visit.is_bust ? "BUST" : visit.score_scored}</b><small>reste {visit.score_after} · {visit.darts_thrown} fl.</small></> : "—"}</td>; })}</tr>)}</tbody>
      </table></div>
      {!visits.length ? <p>Aucune volée enregistrée dans ce leg.</p> : null}
    </details>
  </div>;
}
