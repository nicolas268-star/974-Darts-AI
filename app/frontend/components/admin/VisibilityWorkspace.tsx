"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, Search, Send, ShieldCheck } from "lucide-react";
import EveningSummary from "@/components/admin/EveningSummary";
import type { BdcVisibilityOption } from "@/lib/visibility-summary";
import { withVisibilitySignature } from "@/lib/visibility-summary";
import styles from "@/app/admin/visibility/visibility.module.css";

export default function VisibilityWorkspace({ bdcOptions }: { bdcOptions: BdcVisibilityOption[] }) {
  const [kind, setKind] = useState("Résultat");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [facebookText, setFacebookText] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const draft = useMemo(() => {
    const heading = title.trim() || "L’actualité des fléchettes à La Réunion";
    const body = detail.trim() || "Découvrez les derniers résultats et rendez-vous de la communauté 974 Darts.";
    return withVisibilitySignature(`🎯 ${heading}\n\n${body}\n\n➡️ Toutes les informations sur https://974darts.re\n\n#974Darts #FlechettesReunion #Darts974 #LaReunion`);
  }, [title, detail]);

  async function copyDraft(openFacebook = false) {
    const popup = openFacebook ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    try {
      await navigator.clipboard.writeText(facebookText ?? draft);
      if (openFacebook) {
        if (popup && !popup.closed) popup.location.replace("https://www.facebook.com/");
        else window.location.assign("https://www.facebook.com/");
      }
      setStatus(openFacebook ? "Texte copié. Colle-le dans ta publication Facebook, puis publie depuis ton compte." : "Texte copié !");
    } catch {
      popup?.close();
      setStatus("La copie automatique est bloquée. Sélectionne le texte ci-dessous pour le copier.");
    }
  }

  return <main className={styles.page}>
    <section className={styles.hero}><div><span>Communication · 974 Darts</span><h1>Visibilité 974 Darts</h1><p>La soirée pour le groupe WhatsApp. Les résultats pour Facebook.</p></div><Send size={64}/></section>
    <EveningSummary bdcOptions={bdcOptions} onFacebookReady={(text) => { setFacebookText(text); setStatus(""); }}/>
    <section className={styles.composer} id="facebook-publication" aria-labelledby="facebook-title">
      <header><div><span>Réseaux sociaux · communication officielle</span><h2 id="facebook-title">Publication Facebook</h2></div><div className={styles.manual}><ShieldCheck size={17}/> Publication depuis ton compte</div></header>
      <p className={styles.intro}>Charge la version courte de la soirée avec le bouton du bloc WhatsApp, ou rédige une annonce libre.</p>
      <div className={styles.composeGrid}>
        <form onSubmit={(event) => event.preventDefault()}>
          {facebookText !== null && <div className={styles.facebookLoaded}><b>Texte prêt à relire et à modifier</b><button type="button" className={styles.secondaryButton} onClick={() => setFacebookText(null)}>Revenir à la rédaction libre</button></div>}
          <fieldset disabled={facebookText !== null} className={styles.freeform}>
            <label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}><option>Résultat</option><option>Annonce</option><option>Tournoi</option><option>Record</option><option>Portrait joueur</option></select></label>
            <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${kind} — titre de la publication`}/></label>
            <label>Informations<textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Score, lieu, date, joueur ou équipe…" rows={6}/></label>
          </fieldset>
        </form>
        <aside><div className={styles.networks}><span>Facebook</span><span>Instagram · texte réutilisable</span></div>
          <label className={styles.draftLabel} htmlFor="facebook-draft">Texte à publier</label>
          <textarea id="facebook-draft" className={styles.summaryDraft} value={facebookText ?? draft} onChange={(event) => setFacebookText(event.target.value)} rows={14} maxLength={10000}/>
          <div className={styles.summaryActions}><button disabled={!(facebookText ?? draft).trim()} onClick={() => copyDraft(true)}><ExternalLink size={17}/> Copier et ouvrir Facebook</button><button className={styles.secondaryButton} disabled={!(facebookText ?? draft).trim()} onClick={() => copyDraft()}><Clipboard size={17}/> Copier le texte</button></div>
          <p><Send size={15}/> Le texte est copié. Tu choisis la page ou le groupe Facebook et valides la publication sur Facebook.</p>
          {status && <p role="status">{status}</p>}
        </aside>
      </div>
    </section>
    <section className={styles.grid} aria-label="Référencement Google">
      <article className={styles.card}><header><div><span>SEO Google</span><h2>Socle technique</h2></div><CheckCircle2/></header><ul><li><b>Sitemap XML</b><small>Liste des pages publiques à transmettre à Google.</small><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">Ouvrir <ExternalLink size={14}/></a></li><li><b>Robots.txt</b><small>Pages publiques autorisées, Administration protégée.</small><a href="/robots.txt" target="_blank" rel="noopener noreferrer">Ouvrir <ExternalLink size={14}/></a></li><li><b>Données structurées</b><small>Organisation, site et identité locale La Réunion.</small><em>Actif</em></li><li><b>Page locale dédiée</b><small>Contenu ciblé « fléchettes La Réunion ».</small><a href="/flechettes-la-reunion" target="_blank" rel="noopener noreferrer">Ouvrir <ExternalLink size={14}/></a></li></ul></article>
      <article className={styles.card}><header><div><span>Google Search Console</span><h2>Mise en service</h2></div><Search/></header><ol><li>Ajoute la propriété <b>https://974darts.re</b>.</li><li>Valide le domaine grâce au DNS OVH.</li><li>Envoie <b>https://974darts.re/sitemap.xml</b>.</li><li>Demande l’indexation de la page d’accueil et de la page locale.</li></ol><a className={styles.outbound} href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Ouvrir Search Console <ExternalLink size={16}/></a></article>
    </section>
  </main>;
}
