"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, UserPlus, Users } from "lucide-react";
import styles from "./players.module.css";

type Registration = {
  id: string; identity_id: string; season_id: string; season_key: string; club_code: string; team_id: string;
  display_name: string; first_name: string; last_name: string; nakka_name: string; license_number: string | null; joined_on: string;
};
type Options = {
  seasons: { id: string; name: string; key: string; is_active: boolean }[];
  clubs: { code: string; name: string }[];
  teams: { id: string; name: string; official_club_code: string }[];
  players: { identity_id: string; player_id: string; name: string }[];
  registrations: Registration[];
};
type Form = {
  identity_id: string; season_id: string; club_code: string; team_id: string;
  first_name: string; last_name: string; nakka_name: string; license_number: string; joined_on: string;
};
const API = "/api/admin/backend/api/v1/player-registrations";
function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Reunion", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const blank = (): Form => ({ identity_id: "", season_id: "", club_code: "", team_id: "", first_name: "", last_name: "", nakka_name: "", license_number: "", joined_on: localDate() });
function errorMessage(payload: { detail?: unknown; error?: string }) {
  return typeof payload.detail === "string" ? payload.detail : payload.error ?? "Vérifie les champs du formulaire et réessaie.";
}

export default function PlayerRegistrationPage() {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ name: string; playerId: string; teamId: string } | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`${API}/admin`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(errorMessage(payload));
    setOptions(payload);
    setForm(current => ({ ...current, season_id: current.season_id || payload.seasons.find((s: Options["seasons"][number]) => s.is_active)?.id || payload.seasons[0]?.id || "" }));
  }, []);
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : "Chargement impossible.")); }, [load]);

  const teams = options?.teams.filter(team => team.official_club_code === form.club_code) ?? [];
  const season = options?.seasons.find(s => s.id === form.season_id);
  const team = teams.find(t => t.id === form.team_id);
  const club = options?.clubs.find(c => c.code === form.club_code);
  const existing = options?.players.find(p => p.identity_id === form.identity_id);
  const displayName = existing?.name || `${form.first_name} ${form.last_name.toLocaleUpperCase("fr")}`.trim();
  const candidates = options?.players.filter(p => p.identity_id === form.identity_id || p.name.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr"))) ?? [];
  const update = (key: keyof Form, value: string) => setForm(current => ({ ...current, [key]: value }));

  function selectExisting(identity: string) {
    const prior = options?.registrations.find(r => r.identity_id === identity && r.season_id === form.season_id);
    if (prior) { edit(prior); return; }
    const player = options?.players.find(p => p.identity_id === identity);
    const [first = "", ...last] = player?.name.split(" ") ?? [];
    setForm(current => ({ ...current, identity_id: identity, first_name: first, last_name: last.join(" "), nakka_name: "", license_number: "" }));
  }
  function edit(row: Registration) {
    setMode("existing"); setSearch(""); setSaved(null); setError("");
    setForm({ identity_id: row.identity_id, season_id: row.season_id, club_code: row.club_code, team_id: row.team_id,
      first_name: row.first_name, last_name: row.last_name, nakka_name: row.nakka_name, license_number: row.license_number ?? "", joined_on: row.joined_on });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setSaved(null);
    const body = { ...form, identity_id: mode === "existing" ? form.identity_id : null };
    const key = JSON.stringify(body);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch(`${API}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, request_id: request.current.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload));
      setSaved({ name: payload.registration.display_name, playerId: payload.player_id, teamId: payload.registration.team_id });
      setForm({ ...blank(), season_id: form.season_id, club_code: form.club_code, team_id: form.team_id });
      setMode("new"); setSearch(""); request.current = null;
      router.refresh();
      await load().catch(() => setError("Inscription enregistrée. Recharge la page pour actualiser la liste des inscriptions."));
    } catch (e) { setError(e instanceof Error ? e.message : "L’inscription n’a pas pu être confirmée."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.hero}><div><span>ADMINISTRATION · EFFECTIFS</span><h1>Inscrire un joueur</h1><p>Une inscription, un joueur reconnu dans tout 974Darts.</p></div><UserPlus size={42} aria-hidden="true" /></header>
    {error && <div role="alert" className={styles.error}>{error}{!options && <button type="button" onClick={() => { setError(""); void load().catch(e => setError(e.message)); }}>Réessayer</button>}</div>}
    {saved && <section role="status" className={styles.success}><CheckCircle2 aria-hidden="true" /><div><strong>{saved.name} est enregistré.</strong><p>Son effectif, sa fiche joueur et les sélections sont actualisés.</p><Link href={`/players/${saved.playerId}`}>Voir la fiche joueur →</Link><Link href={`/teams/${saved.teamId}`}>Voir l’équipe →</Link></div></section>}
    {!options ? <p aria-live="polite">Chargement des clubs, équipes et saisons…</p> : <div className={styles.columns}>
      <form className={styles.form} onSubmit={submit}>
        <fieldset disabled={busy}><legend>1. Identité du joueur</legend>
          <div className={styles.modes}>{([ ["new", "Nouveau joueur"], ["existing", "Joueur existant"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setForm(current => ({ ...blank(), season_id: current.season_id, club_code: current.club_code, team_id: current.team_id })); }}>{label}</button>)}</div>
          {mode === "existing" && <><label>Rechercher une fiche<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom ou prénom" /></label><label>Joueur<select aria-label="Joueur" required value={form.identity_id} onChange={e => selectExisting(e.target.value)}><option value="">Choisir une fiche…</option>{candidates.map(p => <option key={p.identity_id} value={p.identity_id}>{p.name}</option>)}</select></label><p className={styles.hint}>La fiche existante et son historique sont conservés.</p></>}
          <div className={styles.pair}><label>Prénom<input required maxLength={80} autoComplete="given-name" value={form.first_name} onChange={e => update("first_name", e.target.value)} /></label><label>Nom<input required maxLength={80} autoComplete="family-name" value={form.last_name} onChange={e => update("last_name", e.target.value)} /></label></div>
          <label>Pseudo Nakka <small>facultatif</small><input maxLength={120} value={form.nakka_name} onChange={e => update("nakka_name", e.target.value)} placeholder="Nom utilisé pendant les rencontres" /></label>
        </fieldset>
        <fieldset disabled={busy}><legend>2. Club et saison</legend>
          <label>Saison<select aria-label="Saison" required value={form.season_id} onChange={e => update("season_id", e.target.value)}><option value="">Choisir…</option>{options.seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? " · active" : ""}</option>)}</select></label>
          <div className={styles.pair}><label>Club<select aria-label="Club" required value={form.club_code} onChange={e => setForm(current => ({ ...current, club_code: e.target.value, team_id: "" }))}><option value="">Choisir…</option>{options.clubs.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label><label>Équipe<select aria-label="Équipe" required disabled={!form.club_code} value={form.team_id} onChange={e => update("team_id", e.target.value)}><option value="">Choisir…</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
          <div className={styles.pair}><label>Date d’arrivée<input required type="date" max={localDate()} value={form.joined_on} onChange={e => update("joined_on", e.target.value)} /></label><label>Numéro de licence <small>facultatif</small><input inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={form.license_number} onChange={e => update("license_number", e.target.value)} placeholder="8 chiffres, si connu" /></label></div>
          <p className={styles.hint}>Sans numéro de licence, le joueur rejoint l’effectif et dispose de sa fiche. Son éligibilité aux points comité reste à confirmer. Tu peux compléter la licence depuis la liste ci-dessous.</p>
        </fieldset>
        <button className={styles.submit} disabled={busy || (mode === "existing" && !form.identity_id)}>{busy ? "Enregistrement…" : "Valider l’inscription"}</button>
      </form>
      <aside className={styles.summary}><span>APERÇU DE L’INSCRIPTION</span><Users aria-hidden="true" /><h2>{displayName || "Nouveau joueur"}</h2><dl><dt>Saison</dt><dd>{season?.name || "À sélectionner"}</dd><dt>Club</dt><dd>{club?.name || "À sélectionner"}</dd><dt>Équipe</dt><dd>{team?.name || "À sélectionner"}</dd><dt>Licence</dt><dd>{form.license_number || "En attente"}</dd></dl><h3>Après validation</h3><ul><li>Effectif de l’équipe et nombre de joueurs</li><li>Fiche joueur et filtres de saison</li><li>Captain Nico et Studio Match Day</li><li>Identité et pseudo pour les prochains imports</li></ul><p>Les statistiques se rempliront avec ses rencontres. Aucune performance n’est créée à l’inscription.</p><Link href="/admin/transfers">Changer d’équipe en cours de saison →</Link></aside>
    </div>}
    {options && <section className={styles.history}><header><span>SUIVI DES INSCRIPTIONS</span><h2>{options.registrations.length} inscription(s)</h2></header>{options.registrations.length ? <div className={styles.tableWrap}><table><thead><tr><th>Joueur</th><th>Saison</th><th>Équipe</th><th>Licence</th><th><span className={styles.srOnly}>Action</span></th></tr></thead><tbody>{options.registrations.map(row => <tr key={row.id}><td><strong>{row.display_name}</strong><small>{row.nakka_name || "Sans pseudo"}</small></td><td>{row.season_key}</td><td>{options.teams.find(t => t.id === row.team_id)?.name || row.club_code}</td><td>{row.license_number || "En attente"}</td><td><button type="button" disabled={busy} onClick={() => edit(row)}>Compléter</button></td></tr>)}</tbody></table></div> : <p>Les prochaines inscriptions apparaîtront ici.</p>}</section>}
  </main>;
}
