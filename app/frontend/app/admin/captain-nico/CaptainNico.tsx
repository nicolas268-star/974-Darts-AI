"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowRight, ChartNoAxesCombined, Check, FlaskConical, Printer, RotateCcw, Save, ShieldCheck, Users } from "lucide-react";
import type { PlayerOverview } from "@/lib/types/sprint4";
import type { DuoOverview } from "@/lib/duo/types";
import { forecast, makeLineup, pairings, playerRating, simulate, type Forecast, type Lineup, type Scenario } from "@/lib/captain-nico/model";
import { emptyDraft, emptySelection, restoreDraft, type CaptainDraft } from "@/lib/captain-nico/draft";
import styles from "./CaptainNico.module.css";

type Props = { players: PlayerOverview[]; duos: DuoOverview[]; seasonLabel: string; notice?: string; unavailable?: boolean };
const roles = { home: ["A", "B", "C", "D"], away: ["E", "F", "G", "H"] };
const fmt = (v: number | null | undefined) => v == null ? "—" : (Math.abs(v) < .05 ? 0 : v).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number | null) => v == null ? "—" : `${Math.round(v * 100)} %`;
const sequence = (n: number) => n <= 4 ? "1 · Simples" : n <= 8 ? "2 · Simples" : n <= 10 ? "3 · Doubles" : n <= 14 ? "4 · Simples" : n <= 18 ? "5 · Simples" : "6 · Doubles";

export default function CaptainNico({ players, duos, seasonLabel, notice, unavailable = false }: Props) {
  const [draft, setDraft] = useState<CaptainDraft>(() => emptyDraft(seasonLabel));
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState({ home: "", away: "" });
  const [simulation, setSimulation] = useState<ReturnType<typeof simulate> | null>(null);
  const [prediction, setPrediction] = useState<Forecast | null>(null);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const byId = useMemo(() => new Map(players.map(p => [p.player_id, p])), [players]);
  const teams = useMemo(() => [...new Set(players.map(p => p.team).filter(t => t && t !== "—"))].sort((a, b) => a.localeCompare(b, "fr")), [players]);
  const storageKey = `captain-nico-v2:${seasonLabel}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let restored = emptyDraft(seasonLabel);
      try { restored = restoreDraft(localStorage.getItem(storageKey), localStorage.getItem("captain-nico-v1"), new Set(players.map(p => p.player_id)), seasonLabel); } catch { /* Storage may be disabled. */ }
      setDraft(restored); setSimulation(null); setPrediction(null); setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [players, seasonLabel, storageKey]);

  const input = { players, duos, assumptions: draft.assumptions };
  const selected = [...draft.home, ...draft.away].filter(Boolean);
  const unknown = [...new Set(selected)].map(id => byId.get(id)).filter((p): p is PlayerOverview => !!p && playerRating(p, {}) == null);
  const complete = draft.home.slice(0, 4).every(Boolean) && draft.away.slice(0, 4).every(Boolean);
  const unique = new Set(selected).size === selected.length;
  const valid = ready && !unavailable && complete && unique && selected.every(id => byId.has(id));
  const name = (id: string) => byId.get(id)?.name ?? "Joueur non renseigné";
  const names = (ids: string[]) => ids.map(name).join(" + ");
  const scenario = (): Scenario => ({ home: makeLineup(draft.home.filter(Boolean), draft.homePairing), away: makeLineup(draft.away.filter(Boolean), draft.awayPairing) });

  function update(patch: Partial<CaptainDraft>) {
    setDraft(current => ({ ...current, ...patch })); setSimulation(null); setPrediction(null); setSaved(false);
    setMessage("Composition modifiée. Relance Simulation ou Prévision pour l’analyser.");
  }
  function select(side: "home" | "away", index: number, id: string) {
    const ids = [...draft[side]]; ids[index] = id;
    update({ [side]: ids, [side === "home" ? "homePairing" : "awayPairing"]: 0 });
  }
  function move(side: "home" | "away", index: number, delta: number) {
    const ids = [...draft[side]]; [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    update({ [side]: ids, [side === "home" ? "homePairing" : "awayPairing"]: 0 });
  }
  function run(kind: "simulation" | "prediction") {
    if (!valid) return;
    try {
      if (kind === "simulation") { setSimulation(simulate(draft.home.filter(Boolean), draft.away.filter(Boolean), draft.homePairing, draft.awayPairing, input)); setMessage("Simulation terminée sur les joueurs sélectionnés."); }
      else { setPrediction(forecast(scenario(), input)); setMessage("Prévision calculée pour la composition retenue."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Cette composition ne peut pas être analysée."); }
  }
  function apply(lineup: Lineup) {
    const partition = pairings(lineup.starters).findIndex(option => option.every((pair, i) => pair.every(id => lineup.pairs[i].includes(id))));
    update({ home: [...lineup.starters, ...lineup.reserves, ...emptySelection()].slice(0, 6), homePairing: Math.max(0, partition) });
    setMessage("Composition appliquée. Clique sur Prévision pour étudier ces séquences.");
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); setSaved(true); setMessage("Composition enregistrée dans ce navigateur."); }
    catch { setMessage("L’enregistrement est indisponible dans ce navigateur."); }
  }
  function sidePanel(side: "home" | "away") {
    const ids = draft[side], label = side === "home" ? "Votre équipe" : "Équipe adverse";
    const startersValid = ids.slice(0, 4).every(Boolean) && new Set(ids.slice(0, 4)).size === 4;
    const list = players.filter(p => !filters[side] || p.team === filters[side] || ids.includes(p.player_id)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return <section className={styles.teamPanel} aria-label={label} data-testid={`selection-${side}`}>
      <header><div className={styles.teamIcon}><Users size={20} /></div><div><span>{side === "home" ? "Votre sélection" : "L’opposition"}</span><h2>{label}</h2></div><b>{ids.filter(Boolean).length}<small>/ 6</small></b></header>
      <label className={styles.filter}><span>Filtrer les joueurs par équipe</span><select aria-label={`Filtrer ${label.toLowerCase()}`} value={filters[side]} onChange={e => setFilters(current => ({ ...current, [side]: e.target.value }))}><option value="">Toutes les équipes</option>{teams.map(team => <option key={team}>{team}</option>)}</select></label>
      <div className={styles.slots}>{ids.map((id, index) => { const player = byId.get(id), role = index < 4 ? roles[side][index] : `R${index - 3}`;
        return <div className={`${styles.playerSlot} ${index >= 4 ? styles.reserve : ""}`} key={`${side}-${index}`}><b className={styles.position}>{role}</b><div className={styles.slotBody}>
          <label><span>{index < 4 ? `Titulaire ${role}` : `Remplaçant ${index - 3} (facultatif)`}</span><select aria-label={`${label} · ${index < 4 ? role : `remplaçant ${index - 3}`}`} value={id} onChange={e => select(side, index, e.target.value)}><option value="">{index < 4 ? "Choisir un joueur" : "Aucun remplaçant"}</option>{list.map(p => <option key={p.player_id} value={p.player_id} disabled={p.player_id !== id && selected.includes(p.player_id)}>{p.name} · {p.team}</option>)}</select></label>
          {player ? <small>Moy. <strong>{fmt(player.average_3_darts)}</strong> · First 9 <strong>{fmt(player.first_9)}</strong> · {player.legs_played ?? 0} legs{playerRating(player, {}) == null && <em>Statistiques insuffisantes</em>}</small> : <small>{index < 4 ? "Position dans les séquences" : "Candidat supplémentaire pour la simulation"}</small>}
        </div>{index < 4 && <div className={styles.reorder}><button aria-label={`Monter ${label} ${role}`} disabled={index === 0} onClick={() => move(side, index, -1)}><ArrowUp size={14} /></button><button aria-label={`Descendre ${label} ${role}`} disabled={index === 3} onClick={() => move(side, index, 1)}><ArrowDown size={14} /></button></div>}</div>;
      })}</div>
      <label className={styles.pairing}><span>Composition des doubles</span><select aria-label={`Doubles ${label.toLowerCase()}`} value={side === "home" ? draft.homePairing : draft.awayPairing} disabled={!startersValid} onChange={e => update({ [side === "home" ? "homePairing" : "awayPairing"]: Number(e.target.value) })}>{[0, 1, 2].map(i => { const pairs = startersValid ? pairings(ids.slice(0, 4))[i] : null; return <option key={i} value={i}>{pairs ? `${names(pairs[0])} / ${names(pairs[1])}` : `Répartition ${i + 1}`}</option>; })}</select></label>
      <p className={styles.teamNote}>{side === "home" ? "Simulation compare vos titulaires et vos paires parmi ces 4 à 6 joueurs." : "Les quatre titulaires et les doubles adverses restent fixes dans la simulation."}</p>
    </section>;
  }

  return <div className={styles.workspace} data-ready={ready ? "true" : "false"}>
    <header className={styles.hero}><div><span className={styles.eyebrow}><ShieldCheck size={14} /> Espace privé du capitaine</span><h1>Captain Nico<span>Analyse avant match</span></h1><p>Choisis tes joueurs. Compare les compositions. Prépare tes séquences.</p></div><div className={styles.season}><span>Base statistique</span><strong>{seasonLabel}</strong><small>16 simples · 4 doubles · 20 parties</small></div></header>
    <div className={styles.topbar}><label><span>Nom de la rencontre</span><input aria-label="Nom de la rencontre" maxLength={140} value={draft.title} onChange={e => { setDraft(current => ({ ...current, title: e.target.value })); setSaved(false); }} /></label><div><button onClick={save} disabled={!ready}><Save size={16} />{saved ? "Enregistré" : "Enregistrer"}</button><button onClick={() => window.print()}><Printer size={16} />Imprimer</button><button onClick={() => { update(emptyDraft(seasonLabel)); setFilters({ home: "", away: "" }); }}><RotateCcw size={16} />Réinitialiser</button></div></div>
    {notice && <p className={styles.notice} role={unavailable ? "alert" : "status"}>{notice}</p>}
    <div className={styles.stepHeading}><span>01</span><div><h2>Sélectionne les joueurs</h2><p>Quatre titulaires dans chaque camp, jusqu’à deux remplaçants pour comparer tes options.</p></div></div>
    <div className={styles.teams}>{sidePanel("home")}{sidePanel("away")}</div>
    {unknown.length > 0 && <section className={styles.assumptions} aria-label="Joueurs sans statistiques"><h3>Des joueurs n’ont pas encore de moyenne exploitable</h3><p>Ils restent sélectionnables. Une moyenne de travail permet d’explorer un scénario ; cette hypothèse ne modifie aucune statistique officielle.</p><div>{unknown.map(player => <label key={player.player_id}><span>{player.name} · moyenne estimée</span><input aria-label={`Moyenne estimée ${player.name}`} type="number" min={1} max={180} step="0.1" placeholder="Non renseignée" value={draft.assumptions[player.player_id] ?? ""} onChange={e => { const assumptions = { ...draft.assumptions }, value = Number(e.target.value); if (e.target.value && Number.isFinite(value) && value >= 1 && value <= 180) assumptions[player.player_id] = value; else delete assumptions[player.player_id]; update({ assumptions }); }} /></label>)}</div></section>}
    <div className={styles.stepHeading}><span>02</span><div><h2>Lance ton analyse</h2><p>Les résultats sont calculés à la demande et retirés dès que la composition change.</p></div></div>
    <div className={styles.actions}><button className={styles.simulate} disabled={!valid} onClick={() => run("simulation")}><FlaskConical size={25} /><span><strong>Simulation</strong><small>Comparer les titulaires et les doubles</small></span><ArrowRight size={20} /></button><button className={styles.predict} disabled={!valid} onClick={() => run("prediction")}><ChartNoAxesCombined size={25} /><span><strong>Prévision</strong><small>Estimer la composition retenue sur 20 parties</small></span><ArrowRight size={20} /></button></div>
    {!complete && <p className={styles.hint}>Sélectionne les quatre titulaires de chaque camp pour activer les deux analyses.</p>}
    {!unique && <p className={styles.notice} role="alert">Un joueur ne peut occuper qu’une position et ne peut pas jouer dans les deux camps.</p>}
    <p className={styles.feedback} role="status" aria-live="polite">{message || "Aucune analyse lancée. La composition reste sous ton contrôle."}</p>

    {simulation && <section className={styles.resultSection} aria-label="Résultat de simulation" data-testid="simulation-results"><header><span className={styles.eyebrow}>Simulation</span><h2>Les compositions à comparer</h2><p>{simulation.evaluated} configurations étudiées · titulaires et doubles adverses conservés.</p></header>
      {simulation.missingPlayerIds.length > 0 ? <p className={styles.notice}>Comparaison chiffrée indisponible : {simulation.missingPlayerIds.map(name).join(", ")}. Renseigne une moyenne de travail ou adapte ta sélection. Ces joueurs ne sont pas considérés comme de niveau zéro.</p> : <div className={styles.candidates}>{simulation.candidates.map((candidate, index) => <article key={index}><span className={styles.candidateRank}>Option {index + 1}</span><strong className={styles.expected}>{fmt(candidate.forecast.expectedHome)}<small> / 20 attendus</small></strong><p>Composition actuelle : {fmt(simulation.baseline.expectedHome)} / 20 · écart {fmt((candidate.forecast.expectedHome ?? 0) - (simulation.baseline.expectedHome ?? 0))}</p><ol>{candidate.scenario.home.starters.map((id, i) => <li key={id}><b>{roles.home[i]}</b><span>{name(id)}</span></li>)}</ol><div className={styles.pairSummary}><span>Double 1 · {names(candidate.scenario.home.pairs[0])}</span><span>Double 2 · {names(candidate.scenario.home.pairs[1])}</span></div><p className={styles.muted}>Réserve : {candidate.scenario.home.reserves.map(name).join(", ") || "Aucune"}</p>{candidate.forecast.assumedPlayerIds.length > 0 && <p className={styles.assumptionTag}>Inclut des moyennes estimées</p>}<button onClick={() => apply(candidate.scenario.home)}><Check size={16} />Appliquer cette composition</button></article>)}</div>}
      <p className={styles.modelNote}>Les 16 simples couvrent toutes les confrontations entre titulaires. Leur ordre change la chronologie, pas le total attendu. Les gains viennent du choix des titulaires et des doubles ; aucun avantage du premier lancer n’est supposé.</p>
    </section>}

    {prediction && <section className={styles.resultSection} aria-label="Résultat de prévision" data-testid="forecast-results"><header><span className={styles.eyebrow}>Prévision · {seasonLabel}</span><h2>{draft.title || "Composition retenue"}</h2><p>Estimation analytique de la composition actuelle, sans résultat saisi.</p></header>
      {prediction.expectedHome == null ? <p className={styles.notice}>Prévision globale non estimable : données manquantes pour {prediction.missingPlayerIds.map(name).join(", ")}. Les confrontations disposant de données restent détaillées ci-dessous.</p> : <><div className={styles.forecastGrid}><article className={styles.scoreCard}><span>Score moyen du modèle</span><strong>{fmt(prediction.expectedHome)} <small>–</small> {fmt(20 - prediction.expectedHome)}</strong><p>{fmt(prediction.expectedSingles)} / 16 simples · {fmt(prediction.expectedDoubles)} / 4 doubles</p></article><article className={styles.oddsCard}><span>Issues estimées</span><div><p>Votre équipe <strong>{pct(prediction.homeWin)}</strong></p><p>Match nul <strong>{pct(prediction.draw)}</strong></p><p>Équipe adverse <strong>{pct(prediction.awayWin)}</strong></p></div></article><article className={styles.scoreCard}><span>Score entier le plus probable</span><strong>{prediction.mostLikelyScore?.join(" – ")}</strong><p>Un scénario possible, pas un résultat annoncé.</p></article></div>
        {prediction.scoreDistribution && <div className={styles.distribution}><h3>Répartition des scores possibles</h3><div className={styles.bars} aria-label="Distribution des scores estimés">{prediction.scoreDistribution.map((probability, i) => <div key={i} title={`${i}–${20 - i} : ${pct(probability)}`}><span style={{ height: `${Math.max(1, probability / Math.max(...prediction.scoreDistribution!) * 76)}px` }} /><small>{i}</small></div>)}</div><p>Parties gagnées par votre équipe, sur 20.</p></div>}</>}
      {prediction.assumedPlayerIds.length > 0 && <p className={styles.assumptionTag}>Hypothèses du capitaine : {prediction.assumedPlayerIds.map(id => `${name(id)} (${fmt(draft.assumptions[id])} de moyenne)`).join(" · ")}.</p>}
      <p className={styles.modelNote}>Prévision indicative : ce modèle de scoring n’est pas calibré sur des prévisions passées. Les probabilités supposent des parties indépendantes et ne quantifient pas la forme du soir.</p>
      <div className={styles.scheduleHeading}><h3>Les 6 séquences de la rencontre</h3><span>Les deux camps sont nommés, simples et doubles inclus.</span></div><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Séquences des 20 parties"><table className={styles.schedule}><thead><tr><th>Séquence</th><th>N°</th><th>Votre équipe</th><th>Équipe adverse</th><th>Premier lancer</th><th>Victoire estimée</th></tr></thead><tbody>{prediction.matches.map(match => <tr key={match.number} data-testid="match-row"><td>{sequence(match.number)}</td><td>{match.number}</td><td>{names(match.home)}</td><td>{names(match.away)}</td><td>{match.homeStarts ? "Votre équipe" : "Adversaires"}</td><td><strong>{pct(match.probability)}</strong><small>{match.basis}</small></td></tr>)}</tbody></table></div>
    </section>}
    <details className={styles.method}><summary>Comprendre la simulation et la prévision</summary><div><p>Indice de scoring : 80 % de moyenne à trois fléchettes et 20 % de First 9 lorsqu’il existe, sinon la moyenne seule. Les legs renseignent la couverture, sans bonus de niveau. L’écart est transformé par une courbe logistique d’échelle 8 en probabilité de manche, puis en probabilité de partie au meilleur des trois manches.</p><p>Les doubles combinent les moyennes des joueurs avec celles du duo lorsqu’elles sont connues, pondérées par son nombre de legs. Aucune précision aux doubles n’est déduite des finishes. Les scores possibles supposent les 20 parties indépendantes.</p><p>Ce modèle indicatif n’est pas calibré sur des prévisions passées. Fatigue, pression et avantage du premier lancer ne sont pas quantifiés. Les réserves servent à comparer des compositions de départ, sans substitution automatique en cours de rencontre. Les moyennes de travail restent des hypothèses locales ; la licence n’est pas nécessaire pour utiliser l’outil.</p></div></details>
  </div>;
}
