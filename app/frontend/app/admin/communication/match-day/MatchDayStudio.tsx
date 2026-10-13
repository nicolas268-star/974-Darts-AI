"use client";
/* eslint-disable @next/next/no-img-element -- Preview is the exact approved PNG; optimization would change it. */
import { useEffect, useRef, useState } from "react";
import { MATCH_THEME_IDS, MATCH_THEME_LABELS, THEMES } from "@/lib/player-card/themes";
import { CARD_METRICS, metricValue } from "@/lib/player-card/metrics";
import { normalizePhoto, decodeImage } from "@/lib/player-card/photo";
import { downloadFile } from "@/lib/player-card/export";
import { caption, createSnapshot, frenchDate, historicalUnavailable, invert, localToUtc, playerCardData, publicationCaption, resetThemes, schedulePreset, sideFromTeam } from "@/lib/match-day/model";
import { renderMatchDay } from "@/lib/match-day/render";
import type { Draft, History, MatchPlayer, MatchSnapshot, MatchSource, MetaStatus, Side } from "@/lib/match-day/types";
import { TEAM_METRICS, teamMetricSelection, teamMetricValue } from "@/lib/match-day/team-metrics";
import styles from "./match-day.module.css";
const API = "/api/admin/match-day/";
const states: Record<string, string> = { SCHEDULED: "Programmé", SUSPENDED: "Suspendu", SENDING: "En cours d’envoi", PUBLISHED: "Publié", FAILED: "Échec", CANCELLED: "Annulé", VERIFY: "Publication à vérifier", REVIEW: "À valider" };
async function request<T>(path: string, payload?: unknown): Promise<T> {
  const r = await fetch(API + path, { method: payload === undefined ? "GET" : "POST", headers: payload === undefined ? undefined : { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload), cache: "no-store" });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || d.detail || "Opération indisponible."); return d;
}
async function blobData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob); });
}
export default function MatchDayStudio() {
  const [view, setView] = useState("create"), [stage, setStage] = useState(0), [mobilePanel, setMobilePanel] = useState("settings");
  const [source, setSource] = useState<MatchSource | null>(null), [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [history, setHistory] = useState<History>({ drafts: [], jobs: [], versions: [], audit: [] });
  const [meta, setMeta] = useState<MetaStatus | null>(null), [season, setSeason] = useState("2027"), [statsSeason, setStatsSeason] = useState("2027");
  const [draft, setDraft] = useState<Draft | null>(null), [approved, setApproved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ blob: Blob; url: string; warnings: string[]; snapshot: MatchSnapshot } | null>(null), [renderError, setRenderError] = useState("");
  const [pageId, setPageId] = useState(""), [due, setDue] = useState(""), [presetTime, setPresetTime] = useState("10:00"), [slot, setSlot] = useState("announcement"), [reminders, setReminders] = useState(false);
  const [linkEvent, setLinkEvent] = useState(false), [roundFilter, setRoundFilter] = useState("");
  const generation = useRef(0), urlRef = useRef<string | null>(null), operation = useRef(false);
  async function refreshHistory() { setHistory(await request<History>("history")); }
  async function run(fn: () => Promise<void>) {
    if (operation.current) return; operation.current = true; setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Opération indisponible."); }
    finally { setBusy(false); operation.current = false; }
  }
  async function load(seasonValue: string, statsValue: string) {
    const data = await request<MatchSource>(`source?season=${seasonValue}&stats_season=${statsValue}`); setSource(data);
    setDraft(null); setApproved(null); setDirty(true); setPreview(null); setStage(0); setLinkEvent(false); setRoundFilter("");
    setSnapshot(data.teams.length >= 2 ? createSnapshot(data, data.teams[0], data.teams[1]) : null);
  }
  useEffect(() => {
    let live = true;
    void request<MatchSource>("source?season=2027&stats_season=2027").then(data => { if (live) { setSource(data); if (data.teams.length >= 2) setSnapshot(createSnapshot(data, data.teams[0], data.teams[1])); } }).catch(e => { if (live) setError(e.message); });
    void request<MetaStatus>("status").then(d => { if (live) setMeta(d); }).catch(e => { if (live) setError(e.message); });
    void request<History>("history").then(d => { if (live) setHistory(d); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const n = ++generation.current;
    if (!snapshot) return;
    let live = true;
    void renderMatchDay(snapshot).then(result => {
      if (!live || n !== generation.current) { URL.revokeObjectURL(result.url); return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = result.url;
      setPreview({ ...result, snapshot }); setRenderError("");
    }).catch(e => { if (live && n === generation.current) { setPreview(null); setRenderError(e.message); } });
    return () => { live = false; };
  }, [snapshot]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  function edit(next: MatchSnapshot) { setSnapshot({ ...next, generated_at: new Date().toISOString() }); setDirty(true); setApproved(null); setNotice(""); }
  const currentPreview = preview && preview.snapshot === snapshot ? preview : null;
  async function save() {
    if (!snapshot) return null;
    const d = await request<Draft>("save", { id: draft?.id ?? null, revision: draft?.revision ?? 0, snapshot });
    setDraft(d); setDirty(false); setApproved(null); await refreshHistory(); return d;
  }
  async function approve() {
    if (!snapshot || !currentPreview) throw new Error("Attendez le rendu final.");
    const final = currentPreview, d = dirty || !draft ? await save() : draft;
    if (!d) return;
    const result = await request<{ version_id: string }>("approve", { id: d.id, revision: d.revision, png: await blobData(final.blob) });
    setApproved(result.version_id); setNotice("Cette version et son PNG exact sont validés."); await refreshHistory();
  }
  async function openDraft(d: Draft) {
    const data = await request<MatchSource>(`source?source_id=${encodeURIComponent(d.snapshot.source_id)}`);
    setSource(data); setSnapshot(d.snapshot); setDraft(d); setDirty(false); setSeason(d.snapshot.season); setStatsSeason(d.snapshot.stats_season);
    setApproved(null); setView("create"); setStage(0); setLinkEvent(Boolean(d.snapshot.event)); setNotice("Brouillon restauré. Les versions validées sont consultables dans l’historique.");
  }
  async function refreshStats() {
    if (!snapshot) return;
    const data = await request<MatchSource>(`source?season=${snapshot.season}&stats_season=${statsSeason}`);
    const sides = [snapshot.teamA, snapshot.teamB].map(side => {
      const original = data.teams.find(t => t.id === side.id); if (!original) throw new Error("Équipe absente de cette saison.");
      const players = side.players.flatMap(p => { const fresh = original.players.find(o => o.id === p.id); if (!fresh?.id) { if (snapshot.content_mode === "teams") return []; throw new Error("Visibilité ou affiliation d’un joueur modifiée."); } return [{ ...p, name: fresh.name, dashboard: fresh.dashboard, warning: fresh.warning }]; });
      return { ...side, name: original.name, club: original.club, players, team_stats: original.team_stats ?? null };
    });
    const event = snapshot.event ? data.events.find(e => e.id === snapshot.event!.id) ?? null : null;
    if (snapshot.event && !event) throw new Error("Rencontre supprimée ou non vérifiable.");
    if (snapshot.event && JSON.stringify(snapshot.event) !== JSON.stringify(event)) throw new Error("Le calendrier a changé. Utilisez Reprendre les informations du calendrier et revalidez la légende.");
    setSource(data);
    edit({ ...snapshot, source_id: data.source_id, reference_at: data.reference_at, stats_season: data.stats_season, stats_label: data.stats_label, teamA: sides[0], teamB: sides[1], event });
  }
  async function refreshCalendar() {
    if (!snapshot?.event) return;
    const data = await request<MatchSource>(`source?season=${snapshot.season}&stats_season=${snapshot.stats_season}`);
    const event = data.events.find(e => e.id === snapshot.event!.id);
    if (!event || event.status !== "SCHEDULED") throw new Error("Rencontre annulée, supprimée ou non vérifiable.");
    const a = data.teams.find(t => t.id === event.team_ids[0]), b = data.teams.find(t => t.id === event.team_ids[1]);
    if (!a || !b) throw new Error("Les équipes du calendrier nécessitent une vérification.");
    const next = createSnapshot(data, a, b, event);
    const side = (id: string) => [snapshot.teamA, snapshot.teamB].find(t => t.id === id);
    for (const key of ["teamA", "teamB"] as const) {
      const prior = side(next[key].id);
      if (prior) next[key] = { ...next[key], theme: prior.theme, composition_confirmed: prior.composition_confirmed,
        players: prior.players.map(p => { const fresh = next[key].players.find(f => f.id === p.id); if (!fresh) throw new Error("Affiliation ou visibilité modifiée. Révisez la composition."); return { ...p, name: fresh.name, dashboard: fresh.dashboard, warning: fresh.warning }; }) };
    }
    if (snapshot.teamA.id === next.teamB.id) { const swapped = invert(next); next.teamA = swapped.teamA; next.teamB = swapped.teamB; }
    setSource(data); edit({ ...next, mode: snapshot.mode, format: snapshot.format, metrics: snapshot.metrics, content_mode: snapshot.content_mode ?? "players", team_metrics: teamMetricSelection(snapshot), caption: snapshot.caption, match: { ...next.match, title: snapshot.match.title } });
    setNotice(`Calendrier actualisé : ${snapshot.match.date || "—"} ${snapshot.match.time || "horaire inconnu"} / ${snapshot.match.location} → ${event.start_date} ${event.start_time || "horaire inconnu"} / ${event.location}. Relisez la légende avant une nouvelle validation.`);
  }
  function chooseEvent(id: string) {
    if (!source || !snapshot) return;
    const event = source.events.find(e => e.id === id) ?? null;
    if (!event) { edit({ ...snapshot, event: null }); return; }
    const a = source.teams.find(t => t.id === event.team_ids[0]), b = source.teams.find(t => t.id === event.team_ids[1]);
    if (!a || !b) { setError("Les équipes de cette rencontre ne sont pas identifiées. Utilisez la création manuelle ou corrigez le calendrier dans son espace dédié."); return; }
    edit({ ...snapshot, event, teamA: sideFromTeam(a), teamB: sideFromTeam(b), match: { ...snapshot.match, date: event.start_date, time: event.start_time, location: event.location, competition: event.competition, round: event.round } });
  }
  function changeSide(sideKey: "teamA" | "teamB", value: Side) { if (snapshot) edit({ ...snapshot, [sideKey]: value }); }
  async function photo(sideKey: "teamA" | "teamB", p: MatchPlayer, file: File) {
    if (!snapshot) return;
    const imported = await normalizePhoto(file);
    const image = await decodeImage(imported), canvas = document.createElement("canvas");
    const scale = Math.min(1, 360 / Math.max(image.width, image.height)); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    changeSide(sideKey, { ...snapshot[sideKey], players: snapshot[sideKey].players.map(o => o.id === p.id ? { ...o, photo: canvas.toDataURL("image/png") } : o) });
  }
  const teamOnly = snapshot?.content_mode === "teams";
  const stages = ["Rencontre", teamOnly ? "Statistiques d’équipe" : "Joueurs et statistiques", "Thèmes et design", "Texte", "Validation et diffusion"];
  function sidePanel(key: "teamA" | "teamB") {
    if (!snapshot || !source) return null;
    const side = snapshot[key], original = source.teams.find(t => t.id === side.id), other = snapshot[key === "teamA" ? "teamB" : "teamA"];
    const move = (i: number, offset: number) => { const players = [...side.players]; const target = i + offset; if (target < 0 || target >= players.length) return; [players[i], players[target]] = [players[target], players[i]]; changeSide(key, { ...side, players }); };
    return <section className={styles.side} key={key}>
      <h3>Côté {key === "teamA" ? "A" : "B"} <span>{side.name}</span></h3>
      {stage === 0 && <label>Équipe<select disabled={Boolean(snapshot.event)} value={side.id} onChange={e => { const team = source.teams.find(t => t.id === e.target.value)!; changeSide(key, sideFromTeam(team)); }}>
        {source.teams.map(t => <option key={t.id} value={t.id} disabled={t.id === other.id}>{t.name}</option>)}
      </select></label>}
      {stage === 2 && <div className={styles.themes} role="group" aria-label={`Thème ${key === "teamA" ? "A" : "B"}`}>
        {MATCH_THEME_IDS.map(id => <button key={id} type="button" aria-pressed={side.theme === id} onClick={() => changeSide(key, { ...side, theme: id })}>
          <i style={{ background: `repeating-linear-gradient(${THEMES[id].pattern === "rings" ? 30 : 130}deg, transparent 0 8px, ${THEMES[id].accent}66 9px 10px), linear-gradient(120deg,${THEMES[id].background},${THEMES[id].accent})` }} />{MATCH_THEME_LABELS[id]}</button>)}
        {!side.theme && <p>Choisir un thème avant la validation du mode Duel.</p>}
      </div>}
      {stage === 1 && teamOnly && <>
        <p className={styles.muted}>KPI collectifs · {snapshot.stats_label}</p>
        {teamMetricSelection(snapshot).map(id => <p key={id}>{TEAM_METRICS.find(metric => metric.id === id)!.label} : <strong>{teamMetricValue(side, id, historicalUnavailable(snapshot))}</strong></p>)}
        <p className={styles.muted}>{side.team_stats?.average_method ?? "Actualisez les statistiques pour charger les données d’équipe."}</p>
        {side.team_stats?.average_players ? <small>{side.team_stats.average_players} joueurs avec une moyenne disponible.</small> : <small>Moyenne indisponible pour cette période.</small>}
        {side.team_stats?.detail_complete === false && <p className={styles.warning}>Le détail des legs est incomplet ; les KPI de legs restent indisponibles.</p>}
      </>}
      {stage === 1 && !teamOnly && <>
        <label className={styles.check}><input type="checkbox" checked={side.composition_confirmed} onChange={e => changeSide(key, { ...side, composition_confirmed: e.target.checked })} />Je confirme explicitement cette composition pour la rencontre</label>
        <p className={styles.muted}>{side.composition_confirmed ? "Composition confirmée" : "Effectif de l’équipe — la présence au match n’est pas confirmée."}</p>
        {!side.roster_complete && <p className={styles.warning}>Effectif historique partiel : affiliations vérifiées uniquement.</p>}
        <div className={styles.selection}>{original?.players.map(p => <label className={styles.check} key={p.id ?? p.name}>
          <input type="checkbox" disabled={!p.id} checked={side.players.some(o => o.id === p.id)} onChange={e => changeSide(key, { ...side, players: e.target.checked && p.id ? [...side.players, { ...p, id: p.id }] : side.players.filter(o => o.id !== p.id), composition_confirmed: false })} />{p.name}{!p.id && <small>{p.warning}</small>}
        </label>)}</div>
        {side.players.map((p, i) => <article className={styles.player} key={p.id}>
          <div><strong>{p.name}</strong><div className={styles.actions}><button type="button" aria-label={`Monter ${p.name}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button type="button" aria-label={`Descendre ${p.name}`} disabled={i === side.players.length - 1} onClick={() => move(i, 1)}>↓</button></div></div>
          <small>{snapshot.metrics.map(id => `${CARD_METRICS.find(m => m.id === id)!.label} : ${metricValue(id, playerCardData(snapshot, p).stats)}`).join(" · ")}</small>
          {p.warning && <p className={styles.warning}>{p.warning}</p>}
          <div className={styles.actions}><label className={styles.check}><input type="checkbox" checked={p.featured || false} onChange={e => changeSide(key, { ...side, players: side.players.map(o => o.id === p.id ? { ...o, featured: e.target.checked } : o) })} />Mise en avant</label>
            <label className={styles.check}><input type="checkbox" checked={p.captain || false} onChange={e => changeSide(key, { ...side, players: side.players.map(o => ({ ...o, captain: o.id === p.id ? e.target.checked : false })) })} />Capitaine confirmé</label></div>
          <label>Surnom pour ce visuel<input maxLength={40} value={p.nickname ?? ""} onChange={e => changeSide(key, { ...side, players: side.players.map(o => o.id === p.id ? { ...o, nickname: e.target.value || null } : o) })} /></label>
          <label>Photo pour cette affiche uniquement<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) void run(() => photo(key, p, f)); e.target.value = ""; }} /></label>
          {p.photo && <button type="button" onClick={() => changeSide(key, { ...side, players: side.players.map(o => o.id === p.id ? { ...o, photo: null } : o) })}>Utiliser les initiales</button>}
        </article>)}
      </>}
    </section>;
  }
  return <main className={styles.studio}>
    <header className={styles.header}><div><p>ADMIN / COMMUNICATION</p><h1>Studio <em>Match Day</em></h1><span>Deux équipes. Deux univers. Une affiche prête à partager.</span></div><b>974Darts <small>NDX Performance Lab</small></b></header>
    <nav className={styles.tabs} aria-label="Vues du studio">{[["create", "Créer une affiche"], ["scheduled", "Publications programmées"], ["history", "Historique"]].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => { setView(id); if (id !== "create") void run(refreshHistory); }}>{label}</button>)}</nav>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {view === "create" && <>
      <div className={styles.topbar}><label>Saison d’affiliation<select aria-label="Saison d’affiliation" value={season} onChange={e => setSeason(e.target.value)}>{(source?.seasons ?? [{ value: "2027", label: "Saison 2027" }]).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label>Période statistique<select aria-label="Période statistique" value={statsSeason} onChange={e => setStatsSeason(e.target.value)}>{(source?.seasons ?? [{ value: "2027", label: "Saison 2027" }]).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <button disabled={busy} onClick={() => void run(() => load(season, statsSeason))}>Nouvelle affiche / charger la saison</button>
        <button disabled={busy || !snapshot || season !== snapshot.season} onClick={() => void run(refreshStats)}>Actualiser les statistiques</button>
        {snapshot && <label>Contenu de l’affiche<select aria-label="Contenu de l’affiche" disabled={busy} value={snapshot.content_mode ?? "players"} onChange={e => edit({ ...snapshot, content_mode: e.target.value as "players" | "teams" })}><option value="players">Joueurs et statistiques individuelles</option><option value="teams">Équipes uniquement — sans joueurs</option></select></label>}
      </div>
      <nav className={styles.steps} aria-label="Étapes">{stages.map((label, i) => <button key={label} aria-current={stage === i ? "step" : undefined} onClick={() => { setStage(i); setMobilePanel("settings"); }}><span>{i + 1}</span>{label}</button>)}</nav>
      {!source && <p>Chargement des sources officielles…</p>}{source && !snapshot && <p>Aucun effectif vérifié disponible pour cette saison. Aucun rattachement à l’équipe actuelle n’est utilisé comme historique.</p>}
      {snapshot && source && <><div className={styles.mobileToggle}><button aria-pressed={mobilePanel === "settings"} onClick={() => setMobilePanel("settings")}>Configuration</button><button aria-pressed={mobilePanel === "preview"} onClick={() => setMobilePanel("preview")}>Aperçu</button></div><div className={styles.workspace} data-mobile={mobilePanel}>
        <fieldset className={styles.settings} disabled={busy}>
          <h2>{stages[stage]}</h2>
          {stage === 0 && <>
            <label className={styles.check}><input type="checkbox" checked={linkEvent} onChange={e => { setLinkEvent(e.target.checked); if (!e.target.checked) edit({ ...snapshot, event: null }); }} />Créer depuis le calendrier / rattacher une rencontre</label>
            {linkEvent && <><label>Compétition<input readOnly value={`Championnat · Saison ${snapshot.season}`} /></label><label>Journée<select aria-label="Journée" value={roundFilter} onChange={e => setRoundFilter(e.target.value)}><option value="">Toutes les journées</option>{Array.from(new Set(source.events.map(e => e.round))).filter(Boolean).map(round => <option key={round}>{round}</option>)}</select></label>
              <label>Occurrence de la rencontre<select aria-label="Occurrence de la rencontre" value={snapshot.event?.id ?? ""} onChange={e => chooseEvent(e.target.value)}><option value="">Sélectionner la rencontre exacte</option>{source.events.filter(e => !roundFilter || e.round === roundFilter).map(e => <option key={e.id} value={e.id} disabled={e.status !== "SCHEDULED" || e.team_ids.length !== 2}>{e.start_date} · {e.round} · {e.title}{e.team_ids.length !== 2 ? " — équipes à vérifier" : ""}</option>)}</select></label>
              {!source.events.length && <p>Pas de rencontre avec une saison vérifiée dans le calendrier. La création manuelle reste disponible.</p>}
              {snapshot.event && <small>Rattachement : {snapshot.event.id}. L’inversion des côtés reste visuelle.</small>}
              {snapshot.event && <button onClick={() => void run(refreshCalendar)}>Reprendre les informations du calendrier</button>}
            </>}
            <div className={styles.twoSides}>{sidePanel("teamA")}{sidePanel("teamB")}</div>
            <label>Titre<input maxLength={40} value={snapshot.match.title} onChange={e => edit({ ...snapshot, match: { ...snapshot.match, title: e.target.value } })} /></label>
            <div className={styles.topbar}><label>Date<input type="date" value={snapshot.match.date ?? ""} onChange={e => edit({ ...snapshot, match: { ...snapshot.match, date: e.target.value || null } })} /></label><label>Heure (Réunion)<input type="time" value={snapshot.match.time ?? ""} onChange={e => edit({ ...snapshot, match: { ...snapshot.match, time: e.target.value || null } })} /></label></div>
            <label>Lieu<input maxLength={120} value={snapshot.match.location} onChange={e => edit({ ...snapshot, match: { ...snapshot.match, location: e.target.value } })} /></label>
            <label>Compétition<input maxLength={100} value={snapshot.match.competition} onChange={e => edit({ ...snapshot, match: { ...snapshot.match, competition: e.target.value } })} /></label><label>Journée<input maxLength={20} value={snapshot.match.round} onChange={e => edit({ ...snapshot, match: { ...snapshot.match, round: e.target.value } })} /></label>
            <p className={styles.muted}>Ces champs modifient l’affiche uniquement. <a href="/admin/calendar">Ouvrir le calendrier officiel</a></p>
          </>}
          {stage === 1 && teamOnly && <>
            <p>Référence : {frenchDate(snapshot.reference_at)} · {snapshot.stats_label}</p>
            <fieldset><legend>KPI d’équipe (1 à 6)</legend><div className={styles.selection}>{TEAM_METRICS.map(metric => <label key={metric.id} className={styles.check}>
              <input type="checkbox" checked={teamMetricSelection(snapshot).includes(metric.id)} disabled={!teamMetricSelection(snapshot).includes(metric.id) && teamMetricSelection(snapshot).length >= 6 || teamMetricSelection(snapshot).includes(metric.id) && teamMetricSelection(snapshot).length === 1} onChange={e => edit({ ...snapshot, team_metrics: e.target.checked ? [...teamMetricSelection(snapshot), metric.id] : teamMetricSelection(snapshot).filter(id => id !== metric.id) })} />{metric.label}
            </label>)}</div></fieldset>
            <p className={styles.muted}>Les statistiques portent sur l’équipe entière pour la période choisie. La moyenne reprend les joueurs publics avec données ; elle ne dépend pas des joueurs cochés dans le mode individuel.</p>
            {sidePanel("teamA")}{sidePanel("teamB")}
          </>}
          {stage === 1 && !teamOnly && <><p className={styles.muted}>{source.scope_note}</p><p>Référence : {frenchDate(snapshot.reference_at)} · {snapshot.stats_label}</p>
            <fieldset><legend>KPI par joueur (1 à 3)</legend><div className={styles.selection}>{CARD_METRICS.filter(m => m.id !== "bestAverage").map(m => <label key={m.id} className={styles.check}><input type="checkbox" checked={snapshot.metrics.includes(m.id)} disabled={!snapshot.metrics.includes(m.id) && snapshot.metrics.length >= 3 || snapshot.metrics.includes(m.id) && snapshot.metrics.length === 1} onChange={e => edit({ ...snapshot, metrics: e.target.checked ? [...snapshot.metrics, m.id] : snapshot.metrics.filter(id => id !== m.id) })} />{m.label}</label>)}</div></fieldset>
            {sidePanel("teamA")}{sidePanel("teamB")}
          </>}
          {stage === 2 && <>
            <div className={styles.topbar}><label>Composition<select aria-label="Composition" value={snapshot.mode} onChange={e => edit({ ...snapshot, mode: e.target.value as MatchSnapshot["mode"] })}><option value="duel">Duel — deux thèmes</option><option value="premium">974Darts Premium — fond commun</option></select></label><label>Format<select aria-label="Format" value={snapshot.format} onChange={e => edit({ ...snapshot, format: e.target.value as MatchSnapshot["format"] })}><option value="publication">Publication · 1080 × 1350</option><option value="story">Story · 1080 × 1920</option></select></label></div>
            {sidePanel("teamA")}{sidePanel("teamB")}
            <div className={styles.actions}><button onClick={() => edit(invert(snapshot))}>Inverser les côtés</button><button onClick={() => edit(resetThemes(snapshot))}>Réinitialiser les thèmes des équipes</button></div><p className={styles.muted}>Le thème habille chaque côté ; il conserve l’identité, le club et les statistiques de l’équipe.</p>
          </>}
          {stage === 3 && <>
            <div className={styles.actions}><button onClick={() => edit({ ...snapshot, caption: publicationCaption(snapshot) })}>Générer une publication avec les stats</button><button onClick={() => edit({ ...snapshot, caption: caption(snapshot) })}>Courte et percutante</button><button onClick={() => edit({ ...snapshot, caption: caption(snapshot, true) })}>{teamOnly ? "Texte détaillé avec KPI d’équipe" : "Détaillée avec joueurs mis en avant"}</button></div>
            <p className={styles.muted}>{teamOnly ? "La publication reprend le match et les KPI collectifs choisis, sans noms de joueurs." : "La publication reprend le match et les KPI choisis, avec jusqu’à deux joueurs par équipe. Les joueurs marqués « Mise en avant » sont prioritaires."} Le bouton remplace la légende actuelle ; vous pouvez ensuite la modifier.</p>
            <label>Légende Facebook<textarea rows={16} maxLength={5000} value={snapshot.caption} onChange={e => edit({ ...snapshot, caption: e.target.value })} /></label><button onClick={() => void run(async () => { await navigator.clipboard.writeText(snapshot.caption); setNotice("Texte copié."); })}>Copier le texte</button><p className={styles.muted}>Relisez la légende après tout changement de rencontre ou de composition.</p>
          </>}
          {stage === 4 && <>
            <p>{approved ? "Version validée" : dirty ? "Brouillon à enregistrer et à valider" : "Brouillon enregistré · à valider"}</p>
            <p>{snapshot.teamA.name} / {snapshot.teamB.name} · {snapshot.format === "story" ? "Story" : "Publication"}</p>
            <p className={styles.muted}>{snapshot.caption || "Aucune légende. La diffusion Facebook exige un texte validé."}</p>
            <div className={styles.actions}><button disabled={!currentPreview} onClick={() => void run(approve)}>Valider ce PNG et ce texte</button></div>
            <section className={styles.meta}><h3>Diffusion Facebook</h3><p>{meta?.note ?? "État de connexion indisponible."}</p><small>Graph API {meta?.graph_version ?? "—"} · ordonnanceur serveur interne</small>
              {!meta?.facebook_enabled && <p className={styles.warning}>Diffusion désactivée. Configurez Meta côté serveur avant activation.</p>}
              {!meta?.pages.length && <p>Aucune Page autorisée configurée.</p>}
              <label>Page cible<select aria-label="Page cible" value={pageId} onChange={e => setPageId(e.target.value)}><option value="">Choisir explicitement une Page</option>{meta?.pages.map(p => <option key={p.id} value={p.id} disabled={!p.available}>{p.name} · {p.id}{!p.available ? " — indisponible" : ""}</option>)}</select></label>
              {meta?.pages.map(p => <p key={p.id}>{p.name} : {p.error || p.permissions || "Connexion disponible"}</p>)}
              <label>Heure des règles J-1 / jour du match<input type="time" value={presetTime} onChange={e => setPresetTime(e.target.value)} /></label>
              <div className={styles.actions}>{[["previous", "J-1"], ["match", "Jour du match"], ["h2", "H-2"]].map(([rule, label]) => <button key={rule} disabled={!snapshot.match.date || rule === "h2" && !snapshot.match.time} onClick={() => { try { setDue(schedulePreset(snapshot, rule as "previous" | "match" | "h2", presetTime)); } catch (e) { setError((e as Error).message); } }}>{label}</button>)}</div>
              <label>Publication — Indian/Reunion (UTC+4)<input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
              <label className={styles.check}><input type="checkbox" checked={reminders} onChange={e => { setReminders(e.target.checked); setSlot("announcement"); }} />Activer explicitement un rappel supplémentaire</label>
              {reminders && <label>Créneau éditorial<select aria-label="Créneau éditorial" value={slot} onChange={e => setSlot(e.target.value)}><option value="announcement">Annonce principale</option><option value="reminder-1">Rappel 1</option><option value="reminder-2">Rappel 2</option></select></label>}
              <p>{due ? `Échéance locale : ${due.replace("T", " à ")} · ${slot === "announcement" ? "Annonce principale" : slot === "reminder-1" ? "Rappel 1" : "Rappel 2"}` : "Choisissez une échéance."}</p>
              <div className={styles.actions}><button disabled={!approved || !pageId || !meta?.facebook_enabled || snapshot.format !== "publication" || !due} onClick={() => void run(async () => { await request("schedule", { version_id: approved, page_id: pageId, due_at: localToUtc(due), slot, immediate: false }); setNotice("Publication programmée. Elle sera envoyée par le worker serveur après les contrôles."); await refreshHistory(); })}>Programmer la publication</button>
              <button disabled={!approved || !pageId || !meta?.facebook_enabled || snapshot.format !== "publication"} onClick={() => void run(async () => { await request("schedule", { version_id: approved, page_id: pageId, due_at: null, slot, immediate: true }); setNotice("Envoi demandé au worker. Consultez l’historique pour la confirmation Meta."); await refreshHistory(); })}>Publier maintenant</button></div>
              {snapshot.format === "story" && <p className={styles.warning}>Story : téléchargement disponible, diffusion automatique non prise en charge.</p>}
            </section>
          </>}
          <div className={styles.bottom}><button disabled={stage === 0} onClick={() => setStage(stage - 1)}>Précédent</button><button disabled={stage === 4} onClick={() => setStage(stage + 1)}>Suivant</button></div>
        </fieldset>
        <aside className={styles.preview} aria-label="Aperçu de l’image réellement exportée"><div className={styles.previewHeader}><h2>Aperçu final</h2><span>{snapshot.format === "story" ? "1080 × 1920" : "1080 × 1350"}</span></div>
          {renderError && <p role="alert" className={styles.error}>{renderError}</p>}
          {currentPreview ? <img className={styles.poster} src={currentPreview.url} alt={`Match Day : ${snapshot.teamA.name} contre ${snapshot.teamB.name}`} /> : !renderError && <p>Préparation du PNG…</p>}
          {currentPreview?.warnings.map(w => <p key={w} className={styles.warning}>{w}</p>)}
          <div className={styles.actions}><button disabled={busy || !currentPreview} onClick={() => { if (currentPreview) downloadFile(new File([currentPreview.blob], `974darts-match-day-${snapshot.match.date || "sans-date"}-${snapshot.format}.png`, { type: "image/png" })); }}>Télécharger l’affiche</button><button disabled={busy} onClick={() => void run(async () => { await save(); setNotice("Brouillon enregistré."); })}>Enregistrer un brouillon</button></div>
          <small>{teamOnly ? `Équipes uniquement · ${teamMetricSelection(snapshot).length} KPI collectifs · aucun joueur affiché.` : `${snapshot.teamA.players.length} + ${snapshot.teamB.players.length} joueurs sélectionnés. Un seul visuel ; tout dépassement bloque la validation.`}</small>
        </aside>
      </div></>}
    </>}
    {view !== "create" && <section className={styles.history}><div className={styles.actions}><h2>{view === "scheduled" ? "Publications programmées" : "Historique et versions"}</h2><button disabled={busy} onClick={() => void run(refreshHistory)}>Actualiser</button></div>
      {history.jobs.filter(j => view === "history" || ["SCHEDULED", "SUSPENDED", "SENDING", "VERIFY"].includes(j.state)).map(j => <article className={styles.job} key={j.id}><div><strong>{states[j.state] || j.state}</strong><p>{frenchDate(j.due_at)} · Page {j.page_id} · {j.slot}</p><small>Tâche {j.id} · Version {j.version_id}</small></div>
        {j.error && <p className={styles.warning}>{j.error}</p>}{j.calendar_warning && <p className={styles.warning}>{j.calendar_warning}</p>}
        <div className={styles.actions}><a href={API + `versions/${j.version_id}/image`} target="_blank" rel="noreferrer">PNG approuvé</a>{j.remote_url && <a href={j.remote_url} target="_blank" rel="noreferrer">Voir le post Facebook</a>}
          {["SCHEDULED", "SUSPENDED", "FAILED", "REVIEW"].includes(j.state) && <button disabled={busy} onClick={() => void run(async () => { await request("cancel", { id: j.id }); await refreshHistory(); })}>Annuler cette tâche</button>}
          {j.state === "VERIFY" && <button disabled={busy} onClick={() => void run(async () => { const remote_id = window.prompt("Après contrôle de la Page, indiquez l’ID du post (page_post). Laissez vide si aucun post n’a été retrouvé. L’anti-doublon sera conservé."); if (remote_id === null) return; await request("resolve", { id: j.id, remote_id: remote_id || null, confirmed: true }); await refreshHistory(); })}>Enregistrer le contrôle Admin</button>}
        </div></article>)}
      {!history.jobs.length && <p>Aucune publication programmée.</p>}
      {view === "history" && <><h3>Brouillons</h3>{history.drafts.map(d => <article className={styles.job} key={d.id}><strong>{d.snapshot.teamA.name} / {d.snapshot.teamB.name}</strong><p>Révision {d.revision} · {d.snapshot.match.date || "Date à confirmer"}</p><button disabled={busy} onClick={() => void run(() => openDraft(d))}>Réouvrir le brouillon</button><div className={styles.actions}>{history.versions.filter(v => v.draft_id === d.id).map(v => <a key={v.id} href={API + `versions/${v.id}/image`} target="_blank" rel="noreferrer">PNG validé · révision {v.revision}</a>)}</div></article>)}
        <details><summary>Journal des actions ({history.audit.length})</summary>{history.audit.map(a => <p key={a.id}>{frenchDate(a.at)} · {a.action} · {a.actor}</p>)}</details></>}
    </section>}
  </main>;
}
