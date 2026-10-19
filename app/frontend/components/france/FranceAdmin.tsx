"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Info, ShieldCheck } from "lucide-react";
import { franceDate, franceStatuses, publicInventory, type FranceInventory } from "@/lib/france-model";
import styles from "./France.module.css";

type View = "review" | "observations" | "committees" | "runs";
export default function FranceAdmin({ inventory }: { inventory: FranceInventory }) {
  const router = useRouter();
  const [view, setView] = useState<View>("review");
  const [committee, setCommittee] = useState("");
  const [season, setSeason] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState("REVIEW_REQUIRED");
  const committees = new Map(inventory.committees.map(c => [c.id, c]));
  const competitions = new Map(inventory.competitions.map(c => [c.n01_id, c]));
  const pending = inventory.candidates.filter(c => c.status === "REVIEW_REQUIRED");
  const visible = pending.filter(c => (!committee || c.committee_id === committee) && (!season || competitions.get(c.n01_id)?.season === season))
    .sort((a,b) => (competitions.get(b.n01_id)?.competition_date ?? "").localeCompare(competitions.get(a.n01_id)?.competition_date ?? "") || a.id.localeCompare(b.id));
  const observed = inventory.competitions.filter(c => !season || c.season === season).sort((a,b) => (b.competition_date ?? "").localeCompare(a.competition_date ?? ""));
  const seasons = [...new Set(inventory.competitions.map(c => c.season).filter((s): s is string => Boolean(s)))].sort().reverse();
  const proposed = [...new Set(pending.map(c => c.committee_id))];
  const selected = inventory.candidates.find(c => c.id === selectedId);
  const selectedCompetition = selected ? competitions.get(selected.n01_id) : null;
  const size = 12, total = view === "review" ? visible.length : observed.length;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(total / size) - 1));
  const confirmed = publicInventory(inventory.committees, inventory.competitions).competitions.length;
  function select(id: string) { setSelectedId(id); setDecision("REVIEW_REQUIRED"); setMessage(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/comites-france", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n01_id: selected.n01_id, committee_id: selected.committee_id, status: decision,
          reason: form.get("reason"), confirmed: form.get("confirmed") === "on",
          ...(decision === "VERIFIED" ? { evidence: { url: form.get("source"), kind: form.get("kind"), justification: form.get("reason") } } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "La décision n’a pas été enregistrée.");
      setMessage("Décision enregistrée. Le référentiel a été actualisé."); setSelectedId(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Le service est indisponible."); }
    finally { setSaving(false); }
  }
  return <main className={styles.page}><div className={styles.wrap}>
    <div className={styles.top}><span className={styles.brand}><ShieldCheck size={23}/>Comités France</span><Link href="/comites/france">Consulter l’annuaire <ExternalLink size={14}/></Link></div>
    <header className={styles.hero}><span className={styles.eyebrow}>FIABILITÉ AVANT PUBLICATION</span><h1>Des pistes à confirmer.</h1><p>Examiner les liens entre les compétitions N01 et les organismes référencés.</p></header>
    <section className={styles.metrics} aria-label="État des validations"><div><strong>{pending.length}</strong><span>Rapprochements proposés</span></div><div><strong>{confirmed}</strong><span>Rattachements confirmés</span></div><div><strong>{inventory.competitions.length}</strong><span>Observations collectées</span></div></section>
    <div className={styles.warning}><Info size={18}/><span>Une concordance de nom ou de ligue ne suffit pas à confirmer l’organisateur. Les observations sans origine française établie restent privées.</span></div>
    <nav className={styles.tabs} aria-label="Sections du référentiel">{([ ["review", "À vérifier"], ["observations", "Observations"], ["committees", "Organismes"], ["runs", "Historique des imports"] ] as [View,string][]).map(([key,label]) => <button key={key} aria-pressed={view === key} onClick={() => { setView(key); setPage(0); setSelectedId(null); }}>{label}</button>)}</nav>
    {message && <div className={styles.message} role="status">{message}</div>}
    {(view === "review" || view === "observations") && <>
      <div className={styles.sectionTitle}><h2>{view === "review" ? "File de vérification" : "Observations N01"}</h2><span>{total} résultat{total > 1 ? "s" : ""}</span></div>
      <div className={styles.toolbar}>{view === "review" && <select aria-label="Comité candidat" value={committee} onChange={e => { setCommittee(e.target.value); setPage(0); }}><option value="">Tous les comités candidats</option>{proposed.map(id => <option key={id} value={id}>{committees.get(id)?.name ?? id}</option>)}</select>}<select aria-label="Saison" value={season} onChange={e => { setSeason(e.target.value); setPage(0); }}><option value="">Toutes les saisons</option>{seasons.map(s => <option key={s}>{s}</option>)}</select></div>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Compétition N01</th><th>{view === "review" ? "Comité proposé" : "État de la source"}</th><th>Examen</th></tr></thead><tbody>{view === "review" ? visible.slice(currentPage * size, (currentPage + 1) * size).map(candidate => {
        const c = competitions.get(candidate.n01_id); if (!c) return null;
        return <tr key={candidate.id}><td><strong>{c.title}</strong><small>{franceDate(c.competition_date, true)} · {c.participants === null ? "Effectif non renseigné" : `${c.participants} entrées`}</small></td><td>{committees.get(candidate.committee_id)?.name ?? candidate.committee_id}<small>Organisateur à confirmer</small></td><td><span className={styles.pending}>À vérifier</span> <button onClick={() => select(candidate.id)}>Examiner</button></td></tr>;
      }) : observed.slice(currentPage * size, (currentPage + 1) * size).map(c => <tr key={c.n01_id}><td><strong>{c.title}</strong><small>{franceDate(c.competition_date, true)} · {franceStatuses[c.status] ?? "Non renseigné"}</small></td><td>{c.source_public ? "Source publique" : "Source retirée"}<small>{c.verification_status === "VERIFIED" ? "Rattachement confirmé" : "Périmètre ou organisateur à vérifier"}</small></td><td>{c.source_url && <a className={styles.source} href={c.source_url} target="_blank" rel="noopener noreferrer">N01 <ExternalLink size={13}/></a>}</td></tr>)}</tbody></table></div>
      {total === 0 && <p className={styles.empty}>Aucun élément pour ces filtres.</p>}
      <div className={styles.pagination}><span>{total ? `${currentPage * size + 1}–${Math.min((currentPage + 1) * size,total)} sur ${total}` : "0 résultat"}</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Précédents</button><button disabled={(currentPage + 1) * size >= total} onClick={() => setPage(currentPage + 1)}>Suivants →</button></div></div>
    </>}
    {view === "committees" && <div className={styles.grid}>{inventory.committees.map(c => <article className={styles.committee} key={c.id}><span className={styles.badge}>{c.verification_status === "VERIFIED" ? "Identité vérifiée" : "Identité à vérifier"}</span><h3>{c.name}</h3><p>{c.parent_organization ?? "Rattachement non renseigné"}</p>{c.reference_url && <a className={styles.source} href={c.reference_url} target="_blank" rel="noopener noreferrer">Source <ExternalLink size={14}/></a>}</article>)}</div>}
    {view === "runs" && <section className={styles.panel}><h2>Historique des imports</h2>{inventory.runs.length === 0 && <p>Aucune exécution enregistrée.</p>}{inventory.runs.slice().sort((a,b) => (b.started_at ?? "").localeCompare(a.started_at ?? "")).map(run => <article className={styles.run} key={run.id}><strong>{franceDate(run.started_at)} · {run.status}</strong><p>{run.since ?? "Date inconnue"} → {run.until ?? "Date inconnue"} · {run.stats.checked ?? 0} éléments examinés · {run.stats.requests ?? 0} requêtes</p><code>{run.id}</code></article>)}</section>}
    {selected && selectedCompetition && <section className={styles.examination} aria-label="Examen du rattachement"><header><div><span className={styles.eyebrow}>EXAMEN DU RATTACHEMENT</span><h3>{selectedCompetition.title}</h3></div><button aria-label="Fermer l’examen" onClick={() => setSelectedId(null)}>Fermer</button></header><div className={styles.detailFields}><div><span>Comité proposé</span><strong>{committees.get(selected.committee_id)?.name}</strong></div><div><span>Origine de la proposition</span><strong>{selected.reason === "N01 league relation" ? "Relation de ligue N01" : "Correspondance de nom ou alias"}</strong></div></div>{selectedCompetition.source_url && <a className={styles.source} href={selectedCompetition.source_url} target="_blank" rel="noopener noreferrer">Consulter la compétition N01 <ExternalLink size={14}/></a>}
      <form key={selected.id} onSubmit={submit} className={styles.form}>
        <label className={styles.field}><span>Décision</span><select value={decision} onChange={e => setDecision(e.target.value)}><option value="REVIEW_REQUIRED">Conserver en attente</option><option value="REJECTED">Rejeter ce rattachement</option><option value="VERIFIED">Confirmer avec une preuve</option></select></label>
        <label className={styles.field}><span>Justification de la décision</span><textarea name="reason" required minLength={5} maxLength={1600} placeholder="Indiquez les faits contrôlés et la raison de votre décision."/></label>
        {decision === "VERIFIED" && <><label className={styles.field}><span>Source fiable confirmant l’organisateur exact de cette compétition</span><input name="source" type="url" pattern="https://.*" required maxLength={2000} placeholder="https://…"/></label><label className={styles.field}><span>Nature de la preuve</span><select name="kind"><option value="OFFICIAL_LINK">Lien officiel de l’organisateur</option><option value="OFFICIAL_RESULT">Résultat officiel</option><option value="ORGANIZER_CONFIRMATION">Confirmation de l’organisateur</option><option value="OFFICIAL_DIRECTORY">Référentiel officiel visant cette compétition</option></select></label><p className={styles.subtle}>La confirmation rend cette compétition consultable dans l’annuaire public si sa source N01 reste publique.</p></>}
        <label className={styles.checkbox}><input name="confirmed" type="checkbox" required/><span>J’ai vérifié cette décision{decision === "VERIFIED" ? " et la preuve confirme bien l’organisateur de cette compétition" : ""}.</span></label>
        <button className={styles.primary} type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la décision"}</button>
      </form>
    </section>}
    <p className={styles.footnote}><ShieldCheck size={17}/>{inventory.leagueCount} ligues observées. Aucune décision ne modifie les points, statistiques ou classements sportifs existants.</p>
  </div></main>;
}
