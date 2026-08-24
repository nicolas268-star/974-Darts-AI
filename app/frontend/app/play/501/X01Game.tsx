"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Crosshair, Eye, Gauge, Hash, LogIn, Play, Plus, RotateCcw, Save, Target, Trophy, Undo2, Users, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PLAY_FORMATS, participantCount, sideForSeat, type PlayFormat } from "@/lib/play/format";
import {
  checkoutRoute,
  checkoutSuggestions,
  evaluateDarts,
  evaluateQuickScore,
  makeDart,
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
const segmentNumbers = Array.from({ length: 20 }, (_, index) => index + 1);

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

  const [quickScore, setQuickScore] = useState(60);
  const [quickDarts, setQuickDarts] = useState(3);
  const [quickDoubleIn, setQuickDoubleIn] = useState(false);
  const [quickCheckoutDouble, setQuickCheckoutDouble] = useState(false);
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1);
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
  const checkout = activePlayer && game ? checkoutRoute(activePlayer.remaining, game.out_rule) : null;
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
  const leftSummaries = sideSummaries.slice(0, Math.ceil(sideSummaries.length / 2));
  const rightSummaries = sideSummaries.slice(Math.ceil(sideSummaries.length / 2));
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
      setSessionCodeInput(gameRow.session_code);
      writeSessionToUrl(gameRow.session_code);
      await refreshActiveSessions();
      setMessage(`${names[0]} commence le leg 1 · session ${gameRow.session_code}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de créer la partie.");
    } finally { setSaving(false); }
  }

  async function changeMode(nextMode: InputMode) {
    if (isReadOnly) return;
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
    if (!supabase || !game || !legId || !activePlayer || saving || isReadOnly) return;
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
    } finally { setSaving(false); }
  }

  async function submitQuick() {
    if (!game || !activePlayer) return;
    const result = evaluateQuickScore({
      scoreBefore: activePlayer.remaining,
      score: quickScore,
      dartsThrown: quickDarts,
      opened: activePlayer.opened,
      inRule: game.in_rule,
      outRule: game.out_rule,
      opensScoringConfirmed: quickDoubleIn,
      checkoutDoubleConfirmed: quickCheckoutDouble,
    });
    await saveVisit(result);
  }

  function addDart(dart: DartThrow) {
    if (draftDarts.length >= 3 || dartPreview?.bust || dartPreview?.checkout) return;
    setDraftDarts((current) => [...current, dart]);
  }

  async function submitDarts() {
    if (!dartPreview || draftDarts.length === 0) return;
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
        setQuickScore(last.attempted_score ?? last.score_scored);
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
        <div><span className="x01-kicker">974Darts Play · V19 Sessions</span><h1>Jouer au 501</h1><p>Chaque partie possède maintenant sa propre session. Plusieurs cibles et plusieurs téléphones peuvent jouer en parallèle sans se mélanger.</p></div>
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

        <article className={`x01-session-list-card ${sessionsExpanded ? "expanded" : "collapsed"}`}>
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
          <p className="x01-info">Le mode peut être changé pendant la partie. Une volée garde toujours son mode d’origine dans Supabase.</p>
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

  return <div className="x01-shell">
    <section className="x01-matchbar">
      <div><span>974Darts Play · Session {game.session_code}</span><strong>{game.starting_score} · {game.play_format === "TEAMS_2V2" ? "2 vs 2" : `${livePlayers.length} joueur${livePlayers.length > 1 ? "s" : ""}`} · {game.in_rule === "DOUBLE_IN" ? "Double In" : "Straight In"} · {game.out_rule === "DOUBLE_OUT" ? "Double Out" : "Straight Out"}</strong></div>
      <div className="x01-session-badge"><Hash />{game.session_code}</div><div className={`x01-role-badge ${isReadOnly ? "spectator" : "player"}`}>{isReadOnly ? <><Eye />Observateur</> : <><Target />Joueur</>}</div>
      <div className="x01-leg-pill">LEG {game.current_leg_number} · BO{game.best_of_legs}</div>
      <div className="x01-match-actions"><button type="button" className="x01-leave" onClick={() => void leaveSession()} disabled={saving}><Users />Mes parties</button>{!isReadOnly ? <button type="button" className="x01-cancel" onClick={cancelGame} disabled={saving}><RotateCcw />Annuler</button> : null}</div>
    </section>

    {error && <div className="x01-alert error">{error}</div>}
    <div className={`x01-alert ${message.includes("BUST") ? "bust" : message.includes("CHECKOUT") || message.includes("gagne") || message.includes("remporte") ? "success" : ""}`}>{message}</div>

    {!isReadOnly && game.status === "IN_PROGRESS" && game.input_mode === "QUICK_SCORE" ? <section className="x01-mobile-score-entry">
      <div><span>VOLÉE {game.current_turn}</span><strong>{activePlayer?.display_name}</strong><small>Reste {activePlayer?.remaining ?? game.starting_score}</small></div>
      <input aria-label="Score de la volée" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={quickScore} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 3); setQuickScore(Math.max(0, Math.min(180, Number(digits || 0)))); }} />
      <button type="button" onClick={submitQuick} disabled={saving}><Save />Valider</button>
    </section> : null}

    <section className="x01-scoreboard-board">
      <div className="x01-board-column">
        {leftSummaries.map((summary) => <article className={`x01-board-side ${summary.isActive ? "active" : ""}`} key={`left-${summary.side}`}>
          <div className="x01-board-side-top"><span>{summary.isActive ? "AU PAS DE TIR" : summary.name}</span><strong>{summary.legs} / {winnerTarget} legs</strong></div>
          <h2>{summary.name}</h2>
          <p>{summary.subtitle}</p>
          <div className="x01-board-values">
            <div><span>PLAYER SCORE</span><strong>{summary.total}</strong></div>
            <div><span>SCORE LEFT</span><strong>{summary.remaining}</strong></div>
          </div>
          <div className="x01-board-meta"><span>AVG 3D <b>{summary.average}</b></span><span>{game.in_rule === "DOUBLE_IN" ? (summary.opened ? "IN ✓" : "DOUBLE IN…") : "STRAIGHT IN"}</span></div>
          {summary.isActive && checkout ? <div className="x01-board-checkout">Finish prioritaire : <strong>{checkout}</strong></div> : null}
        </article>)}
      </div>

      <div className="x01-board-center">
        <div className="x01-board-clip" />
        <div className="x01-board-title"><span>974Darts Play</span><h2>Darts Scoreboard</h2><p>{game.starting_score} · {game.play_format === "TEAMS_2V2" ? "2 vs 2" : `${livePlayers.length} joueur${livePlayers.length > 1 ? "s" : ""}`} · {game.in_rule === "DOUBLE_IN" ? "Double In" : "Straight In"} · {game.out_rule === "DOUBLE_OUT" ? "Double Out" : "Straight Out"}</p></div>
        <div className={`x01-finish-box ${finishSuggestions.length ? "" : "empty"}`}>
          <span>Finitions possibles</span>
          {finishSuggestions.length ? <><strong>{activePlayer?.display_name}</strong><ol>{finishSuggestions.map((suggestion, index) => <li key={suggestion}><b>{index + 1}.</b><span>{suggestion}</span></li>)}</ol></> : <p>Aucune finition immédiate pour le moment.</p>}
        </div>
      </div>

      <div className="x01-board-column">
        {rightSummaries.map((summary) => <article className={`x01-board-side ${summary.isActive ? "active" : ""}`} key={`right-${summary.side}`}>
          <div className="x01-board-side-top"><span>{summary.isActive ? "AU PAS DE TIR" : summary.name}</span><strong>{summary.legs} / {winnerTarget} legs</strong></div>
          <h2>{summary.name}</h2>
          <p>{summary.subtitle}</p>
          <div className="x01-board-values">
            <div><span>PLAYER SCORE</span><strong>{summary.total}</strong></div>
            <div><span>SCORE LEFT</span><strong>{summary.remaining}</strong></div>
          </div>
          <div className="x01-board-meta"><span>AVG 3D <b>{summary.average}</b></span><span>{game.in_rule === "DOUBLE_IN" ? (summary.opened ? "IN ✓" : "DOUBLE IN…") : "STRAIGHT IN"}</span></div>
          {summary.isActive && checkout ? <div className="x01-board-checkout">Finish prioritaire : <strong>{checkout}</strong></div> : null}
        </article>)}
      </div>

      <div className="x01-visit-board">
        <div className="x01-visit-table" style={{ gridTemplateColumns: `74px repeat(${Math.max(1, livePlayers.length)}, minmax(120px, 1fr))` }}>
          <strong className="x01-visit-head">VOLÉE</strong>
          {livePlayers.map((player) => <strong className="x01-visit-head" key={`head-${player.id}`}>{player.display_name}</strong>)}
          {visitTableRows.length ? visitTableRows.flatMap((row) => [
            <strong className="x01-visit-round" key={`round-${row.round}`}>{row.round}</strong>,
            ...livePlayers.map((player) => {
              const visit = row.cells[player.id];
              return <div className={`x01-visit-cell ${visit?.is_bust ? "bust" : visit?.is_checkout ? "checkout" : ""}`} key={`round-${row.round}-${player.id}`}>
                {visit ? <><b>{visit.is_bust ? "BUST" : visit.score_scored}</b><small>reste {visit.score_after}</small></> : <span>—</span>}
              </div>;
            }),
          ]) : <div className="x01-visit-empty" style={{ gridColumn: `1 / span ${livePlayers.length + 1}` }}>Les volées s’afficheront ici, ligne par ligne.</div>}
        </div>
        <div className="x01-visit-mobile">
          {visitTableRows.length ? visitTableRows.map((row) => <article key={`mobile-round-${row.round}`}><strong>VOLÉE {row.round}</strong><div>{livePlayers.map((player) => { const visit = row.cells[player.id]; return <span key={`mobile-${row.round}-${player.id}`}><b>{player.display_name}</b><em className={visit?.is_bust ? "bust" : visit?.is_checkout ? "checkout" : ""}>{visit ? (visit.is_bust ? "BUST" : `${visit.score_scored} · reste ${visit.score_after}`) : "—"}</em></span>; })}</div></article>) : <p>Les volées s’afficheront ici.</p>}
        </div>
      </div>
    </section>

    {isReadOnly && game.status === "IN_PROGRESS" ? <div className="x01-spectator-note"><Eye />Mode observateur · lecture seule · actualisation automatique</div> : null}

    {game.status === "COMPLETED" ? <section className="x01-winner"><Trophy /><div><span>Match terminé</span><h2>{sideDisplayName(livePlayers.slice().sort((a, b) => b.legs_won - a.legs_won)[0]?.side ?? 1)}</h2><p>La partie est enregistrée dans 974Darts AI.</p></div><button type="button" onClick={() => void leaveSession()}>Mes parties</button></section> : isReadOnly ? <section className="x01-observer-panel"><Eye /><div><strong>Tu observes cette partie</strong><span>Les scores se mettent à jour automatiquement. Aucun contrôle de saisie n’est affiché.</span></div></section> : <>
      <section className="x01-mode-switch"><span>Mode de saisie</span><div><button type="button" className={game.input_mode === "QUICK_SCORE" ? "active" : ""} onClick={() => changeMode("QUICK_SCORE")}><Zap />Score</button><button type="button" className={game.input_mode === "DART_BY_DART" ? "active" : ""} onClick={() => changeMode("DART_BY_DART")}><Target />Flèches</button></div></section>

      {game.input_mode === "QUICK_SCORE" ? <section className="x01-entry-panel">
        <header><div><span>VOLÉE {game.current_turn}</span><h2>{activePlayer?.display_name}</h2></div><strong>{modeLabel(game.input_mode)}</strong></header>
        <div className="x01-quick-entry">
          <label><span>Score</span><input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" value={quickScore} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 3); setQuickScore(Math.max(0, Math.min(180, Number(digits || 0)))); }} /></label>
          <label><span>Flèches</span><select value={quickDarts} onChange={(event) => setQuickDarts(Number(event.target.value))}><option value={3}>3</option><option value={2}>2</option><option value={1}>1</option></select></label>
        </div>
        {game.in_rule === "DOUBLE_IN" && !activePlayer?.opened && <label className="x01-check"><input type="checkbox" checked={quickDoubleIn} onChange={(event) => setQuickDoubleIn(event.target.checked)} /><span><b>Double In touché dans cette volée</b><small>Le score saisi doit correspondre aux points valides à partir du double d’entrée.</small></span></label>}
        {game.out_rule === "DOUBLE_OUT" && activePlayer && activePlayer.remaining - quickScore === 0 && <label className="x01-check"><input type="checkbox" checked={quickCheckoutDouble} onChange={(event) => setQuickCheckoutDouble(event.target.checked)} /><span><b>Dernière flèche = Double / Bull</b><small>Obligatoire pour valider le checkout en mode score rapide.</small></span></label>}
        <button className="x01-save" type="button" onClick={submitQuick} disabled={saving}><Save />{saving ? "Enregistrement…" : "Valider la volée"}</button>
      </section> : <section className="x01-entry-panel">
        <header><div><span>VOLÉE {game.current_turn}</span><h2>{activePlayer?.display_name}</h2></div><strong>{modeLabel(game.input_mode)}</strong></header>
        <div className="x01-dart-slots">{[0,1,2].map((index) => <div className={draftDarts[index] ? "filled" : ""} key={index}><span>DART {index + 1}</span><strong>{draftDarts[index]?.label ?? "—"}</strong><small>{draftDarts[index] ? `${draftDarts[index].score} pts` : "en attente"}</small></div>)}</div>
        <div className="x01-multipliers"><button type="button" className={multiplier === 1 ? "active" : ""} onClick={() => setMultiplier(1)}>SINGLE</button><button type="button" className={multiplier === 2 ? "active" : ""} onClick={() => setMultiplier(2)}>DOUBLE</button><button type="button" className={multiplier === 3 ? "active" : ""} onClick={() => setMultiplier(3)}>TRIPLE</button></div>
        <div className="x01-segments">{segmentNumbers.map((segment) => <button type="button" key={segment} disabled={draftDarts.length >= 3 || Boolean(dartPreview?.bust || dartPreview?.checkout)} onClick={() => addDart(makeDart(segment, multiplier))}>{segment}</button>)}</div>
        <div className="x01-specials"><button type="button" onClick={() => addDart(makeDart(25,1))}>25</button><button type="button" className="bull" onClick={() => addDart(makeDart(25,2))}>BULL 50</button><button type="button" onClick={() => addDart(makeDart(0,0))}>MISS</button></div>
        {dartPreview && <div className={`x01-preview ${dartPreview.bust ? "bust" : dartPreview.checkout ? "checkout" : ""}`}><span>Cette volée</span><strong>{dartPreview.bust ? "BUST" : `${dartPreview.creditedScore} pts → reste ${dartPreview.scoreAfter}`}</strong><small>{dartPreview.message}</small></div>}
        <div className="x01-entry-actions"><button type="button" className="x01-undo-dart" disabled={!draftDarts.length || saving} onClick={() => setDraftDarts((current) => current.slice(0,-1))}><Undo2 />Dernière flèche</button><button className="x01-save" type="button" onClick={submitDarts} disabled={saving || draftDarts.length === 0}><Save />{saving ? "Enregistrement…" : "Valider la volée"}</button></div>
      </section>}

      <section className="x01-history">
        <header><div><span>LEG {game.current_leg_number}</span><h2>Historique des volées</h2></div><button type="button" disabled={!visits.length || saving} onClick={correctLastVisit}><Undo2 />Corriger la dernière</button></header>
        {visits.length === 0 ? <p>Aucune volée enregistrée dans ce leg.</p> : <div className="x01-history-list">{[...visits].reverse().map((visit) => {
          const player = livePlayers.find((item) => item.id === visit.game_player_id);
          return <div key={visit.id}><span>#{visit.turn_number}</span><strong>{player?.display_name ?? "Joueur"}</strong><b className={visit.is_bust ? "bust" : visit.is_checkout ? "checkout" : ""}>{visit.is_bust ? "BUST" : visit.score_scored}</b><small>{visit.score_before} → {visit.score_after} · {visit.darts_thrown} dart{visit.darts_thrown > 1 ? "s" : ""}</small></div>;
        })}</div>}
      </section>
    </>}
  </div>;
}
