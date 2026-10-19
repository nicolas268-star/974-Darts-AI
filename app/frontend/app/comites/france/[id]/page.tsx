import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink, ShieldCheck } from "lucide-react";
import { getPublicFranceInventory } from "@/lib/france-server";
import { franceDate, franceStatuses } from "@/lib/france-model";
import styles from "@/components/france/France.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fiche comité — Comités France" };

export default async function CommitteePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try { data = await getPublicFranceInventory(); }
  catch { return <main className={styles.page}><div className={styles.wrap}><Link href="/comites/france">← Annuaire des comités</Link><p role="status">La fiche est temporairement indisponible.</p></div></main>; }
  const committee = data.committees.find(c => c.id === id);
  if (!committee) notFound();
  const competitions = data.competitions.filter(c => c.committee_id === id).sort((a,b) => (b.competition_date ?? "").localeCompare(a.competition_date ?? ""));
  return <main className={styles.page}><div className={styles.wrap}>
    <Link className={styles.back} href="/comites/france"><ArrowLeft size={16}/> Annuaire des comités</Link>
    <header className={styles.hero}><span className={styles.badge}><BadgeCheck size={14}/>Identité vérifiée</span><h1>{committee.name}</h1><p>{committee.parent_organization ?? "Rattachement sportif non renseigné"}</p></header>
    <section className={styles.panel}><div className={styles.detailFields}><div><span>Département</span><strong>{committee.department ?? "Non renseigné"}</strong></div><div><span>Région administrative</span><strong>{committee.region ?? "Non renseignée"}</strong></div><div><span>Identité vérifiée le</span><strong>{franceDate(committee.checked_at)}</strong></div></div>{committee.reference_url && <a className={styles.source} href={committee.reference_url} target="_blank" rel="noopener noreferrer">Consulter la source de référence <ExternalLink size={14}/></a>}</section>
    <div className={styles.sectionTitle}><h2>Compétitions confirmées</h2><span>{competitions.length} compétition{competitions.length > 1 ? "s" : ""}</span></div>
    {!competitions.length ? <div className={styles.empty}><ShieldCheck size={25}/><h3>Aucun rattachement confirmé pour le moment</h3><p>Les compétitions sont affichées après vérification de leur organisateur. L’identité de ce comité est documentée indépendamment de sa présence sur N01.</p></div> : <div className={styles.competitionList}>{competitions.map(c => <article className={styles.panel} key={c.n01_id}><span className={styles.badge}>{franceStatuses[c.status] ?? "Statut non renseigné"}</span><h3>{c.title}</h3><p>{franceDate(c.competition_date)} · Saison {c.season ?? "non renseignée"} · {c.participants === null ? "Effectif non renseigné" : `${c.participants} entrées enregistrées`}</p>{c.source_url && <a className={styles.source} href={c.source_url} target="_blank" rel="noopener noreferrer">Consulter la compétition Nakka <ExternalLink size={14}/></a>}</article>)}</div>}
  </div></main>;
}
