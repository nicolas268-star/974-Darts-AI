"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, Search, Send, ShieldCheck } from "lucide-react";
import styles from "./visibility.module.css";

const networks = ["Facebook", "Instagram"];

export default function VisibilityPage() {
  const [kind, setKind] = useState("Résultat");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [copied, setCopied] = useState(false);
  const draft = useMemo(() => {
    const heading = title.trim() || "L’actualité des fléchettes à La Réunion";
    const body = detail.trim() || "Découvrez les derniers résultats et rendez-vous de la communauté 974 Darts.";
    return `🎯 ${heading}\n\n${body}\n\n➡️ Toutes les informations sur https://974darts.re\n\n#974Darts #FlechettesReunion #Darts974 #LaReunion`;
  }, [title, detail]);

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <main className={styles.page}>
    <section className={styles.hero}><div><span>Référencement & communication</span><h1>Visibilité 974 Darts</h1><p>Pilote la présence Google et prépare tes publications sociales sans diffusion automatique.</p></div><Search size={70}/></section>
    <section className={styles.grid}>
      <article className={styles.card}><header><div><span>SEO Google</span><h2>Socle technique</h2></div><CheckCircle2/></header><ul><li><b>Sitemap XML</b><small>Liste des pages publiques à transmettre à Google.</small><a href="/sitemap.xml" target="_blank">Ouvrir <ExternalLink size={14}/></a></li><li><b>Robots.txt</b><small>Pages publiques autorisées, Administration protégée.</small><a href="/robots.txt" target="_blank">Ouvrir <ExternalLink size={14}/></a></li><li><b>Données structurées</b><small>Organisation, site et identité locale La Réunion.</small><em>Actif</em></li><li><b>Page locale dédiée</b><small>Contenu ciblé « fléchettes La Réunion ».</small><a href="/flechettes-la-reunion" target="_blank">Ouvrir <ExternalLink size={14}/></a></li></ul></article>
      <article className={styles.card}><header><div><span>Google Search Console</span><h2>Mise en service</h2></div><ShieldCheck/></header><ol><li>Ajoute la propriété <b>https://974darts.re</b>.</li><li>Valide le domaine grâce au DNS OVH.</li><li>Envoie <b>https://974darts.re/sitemap.xml</b>.</li><li>Demande l’indexation de la page d’accueil et de la page locale.</li></ol><a className={styles.outbound} href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Ouvrir Search Console <ExternalLink size={16}/></a></article>
    </section>
    <section className={styles.composer}><header><div><span>Centre de communication</span><h2>Préparer une publication</h2></div><div className={styles.manual}><ShieldCheck size={17}/> Validation manuelle obligatoire</div></header><div className={styles.composeGrid}><form><label>Type<select value={kind} onChange={(e)=>setKind(e.target.value)}><option>Résultat</option><option>Annonce</option><option>Tournoi</option><option>Record</option><option>Portrait joueur</option></select></label><label>Titre<input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder={`${kind} — titre de la publication`}/></label><label>Informations<textarea value={detail} onChange={(e)=>setDetail(e.target.value)} placeholder="Score, lieu, date, joueur ou équipe…" rows={6}/></label></form><aside><div className={styles.networks}>{networks.map((n)=><span key={n}>{n}</span>)}</div><pre>{draft}</pre><button onClick={copyDraft}><Clipboard size={17}/>{copied ? "Copié !" : "Copier le texte"}</button><p><Send size={15}/> Aucune publication n’est envoyée automatiquement. Tu relis, copies puis publies sur le réseau choisi.</p></aside></div></section>
  </main>;
}
