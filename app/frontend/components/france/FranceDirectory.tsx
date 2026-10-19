"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, Search, ShieldCheck, Target } from "lucide-react";
import { franceDate, type FranceCommittee, type FranceCompetition } from "@/lib/france-model";
import styles from "./France.module.css";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

export default function FranceDirectory({ committees, competitions }: { committees: FranceCommittee[]; competitions: FranceCompetition[] }) {
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("");
  const [season, setSeason] = useState("");
  const [page, setPage] = useState(0);
  const selectedCompetitions = competitions.filter(c => !season || c.season === season);
  const counts = new Map<string, number>();
  selectedCompetitions.forEach(c => { if (c.committee_id) counts.set(c.committee_id, (counts.get(c.committee_id) ?? 0) + 1); });
  const leagues = [...new Set(committees.map(c => c.parent_organization).filter((s): s is string => Boolean(s)))].sort();
  const seasons = [...new Set(competitions.map(c => c.season).filter((s): s is string => Boolean(s)))].sort().reverse();
  const filtered = useMemo(() => committees.filter(c => normalize(c.name).includes(normalize(search)) && (!league || c.parent_organization === league))
    .sort((a,b) => a.name.localeCompare(b.name, "fr")), [committees, search, league]);
  const pageSize = 9, pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const lastDate = committees.map(c => c.checked_at).filter((s): s is string => Boolean(s)).sort().at(-1) ?? null;
  return <main className={styles.page}>
    <div className={styles.wrap}>
      <div className={styles.top}><Link href="/" className={styles.brand}><Target size={25}/>974Darts <span>FRANCE</span></Link><Link href="/comite">Comité La Réunion <ArrowRight size={15}/></Link></div>
      <div className={styles.breadcrumb}><Link href="/">974Darts</Link><span>/ Comités / France</span><span className={styles.outline}>Premier inventaire · couverture partielle</span></div>
      <header className={styles.hero}><span className={styles.eyebrow}>LE RÉSEAU DES FLÉCHETTES</span><h1>Les comités,<br/>partout en France.</h1><p>Retrouver les organismes documentés et leurs compétitions Nakka dont le rattachement est confirmé.</p></header>
      <section className={styles.metrics} aria-label="État du référentiel"><div><strong>{committees.length}</strong><span>Organismes documentés</span><small>Identités vérifiées avec une source</small></div><div><strong>{selectedCompetitions.length}</strong><span>Compétitions confirmées</span><small>Organisateur et rattachement vérifiés</small></div><div><strong className={styles.dateMetric}>{lastDate ? franceDate(lastDate, true) : "Non renseigné"}</strong><span>Vérification du référentiel</span><small>Comités, ligues et organismes distincts</small></div></section>
      <div className={styles.sectionTitle}><h2>Annuaire des comités</h2><span>Des identités documentées, des sources consultables.</span></div>
      <div className={styles.toolbar}><label className={styles.search}><Search size={17}/><input type="search" aria-label="Rechercher un comité" placeholder="Rechercher un comité…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}/></label><select aria-label="Ligue de rattachement" value={league} onChange={e => { setLeague(e.target.value); setPage(0); }}><option value="">Toutes les ligues de rattachement</option>{leagues.map(l => <option key={l}>{l}</option>)}</select>{seasons.length > 0 && <select aria-label="Saison" value={season} onChange={e => setSeason(e.target.value)}><option value="">Toutes les saisons</option>{seasons.map(s => <option key={s}>{s}</option>)}</select>}</div>
      <div className={styles.grid} aria-live="polite">{filtered.slice(page * pageSize, (page + 1) * pageSize).map(c => <article className={styles.committee} key={c.id}><div className={styles.cardTop}><span className={styles.code}>{c.id.replace(/^ffd-/, "").toUpperCase()}</span><span className={styles.badge}><BadgeCheck size={13}/>Identité vérifiée</span></div><h3>{c.name.replace(/^Comité /, "")}</h3><p>{c.parent_organization ?? "Rattachement non renseigné"}</p><div className={styles.cardFoot}><span>{counts.get(c.id) ?? 0} compétition{(counts.get(c.id) ?? 0) > 1 ? "s" : ""} confirmée{(counts.get(c.id) ?? 0) > 1 ? "s" : ""}</span><Link href={`/comites/france/${encodeURIComponent(c.id)}`}>Voir la fiche <ArrowRight size={14}/></Link></div></article>)}</div>
      {!filtered.length && <p className={styles.empty}>Aucun organisme ne correspond à cette recherche.</p>}
      <div className={styles.pagination}><span>{filtered.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} sur ${filtered.length}` : "0 résultat"}</span><div><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Précédents</button><button disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Suivants →</button></div></div>
      <p className={styles.footnote}><ShieldCheck size={17}/>Seuls les rattachements confirmés sont publiés. Un organisme documenté peut n’avoir aucune compétition N01 attribuée à ce stade.</p>
    </div>
  </main>;
}
