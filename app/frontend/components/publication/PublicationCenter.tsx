"use client";

import Link from "next/link";
import styles from "./PublicationCenter.module.css";

type StepState = "available" | "planned";

type PublicationStep = {
  key: string;
  order: number;
  title: string;
  description: string;
  state: StepState;
};

const STEPS: PublicationStep[] = [
  {
    key: "import",
    order: 1,
    title: "Import",
    description: "Charger un export Nakka et préparer son analyse.",
    state: "planned",
  },
  {
    key: "control",
    order: 2,
    title: "Contrôle",
    description: "Vérifier la structure, les joueurs, les équipes et les incohérences.",
    state: "planned",
  },
  {
    key: "preview",
    order: 3,
    title: "Prévisualisation",
    description: "Consulter l’impact attendu avant toute écriture.",
    state: "planned",
  },
  {
    key: "publish",
    order: 4,
    title: "Publication",
    description: "Publier uniquement après validation des contrôles.",
    state: "planned",
  },
  {
    key: "history",
    order: 5,
    title: "Historique",
    description: "Consulter les publications et opérations passées.",
    state: "planned",
  },
];

function StepCard({ step }: { step: PublicationStep }) {
  return (
    <article className={styles.stepCard}>
      <div className={styles.stepTop}>
        <span className={styles.stepNumber}>{step.order}</span>
        <span className={styles.stepState}>
          {step.state === "available" ? "Disponible" : "À venir"}
        </span>
      </div>
      <h2>{step.title}</h2>
      <p>{step.description}</p>
      <div className={styles.stepAction} aria-disabled="true">
        Non activé
        <span aria-hidden="true">—</span>
      </div>
    </article>
  );
}

export default function PublicationCenter() {
  return (
    <main className={styles.shell}>
      <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">
        <Link href="/admin">Administration</Link>
        <span aria-hidden="true">/</span>
        <strong>Publication Nakka</strong>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>CENTRE DE PUBLICATION</p>
          <h1>Centre Publication Nakka</h1>
          <p>
            Point d’entrée unique du pipeline de publication. Cet espace installe
            l’architecture et la navigation sans inventer d’API ni exécuter
            d’écriture en base.
          </p>
        </div>
        <div className={styles.heroStatus}>
          <span>Centre installé</span>
          <strong>Mode sécurisé</strong>
        </div>
      </header>

      <section className={styles.safetyPanel}>
        <div>
          <strong>Aucune écriture active</strong>
          <p>
            Import, contrôle, prévisualisation, publication et historique seront
            activés dans les modules suivants.
          </p>
        </div>
        <div>
          <strong>Protection des données</strong>
          <p>
            Le Centre Publication n’écrit, ne remplace et ne supprime aucune donnée
            dans cet espace.
          </p>
        </div>
        <div>
          <strong>Aucune API fictive</strong>
          <p>
            Aucun endpoint backend n’est supposé ou appelé par cette première livraison.
          </p>
        </div>
      </section>

      <section className={styles.pipeline} aria-labelledby="pipeline-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>PIPELINE</p>
            <h2 id="pipeline-title">Parcours de publication</h2>
          </div>
          <p>Importer → Contrôler → Prévisualiser → Publier → Historiser</p>
        </div>

        <div className={styles.stepsGrid}>
          {STEPS.map((step) => (
            <StepCard key={step.key} step={step} />
          ))}
        </div>
      </section>

      <section className={styles.bottomGrid}>
        <article>
          <p className={styles.eyebrow}>DISPONIBLE</p>
          <h3>Centre Publication</h3>
          <p>Route, interface, navigation et structure du pipeline.</p>
        </article>
        <article>
          <p className={styles.eyebrow}>PROCHAINE ÉTAPE</p>
          <h3>Import des données Nakka</h3>
          <p>Chargement, sélection de fichier et validation initiale.</p>
        </article>
        <article>
          <p className={styles.eyebrow}>RETOUR</p>
          <h3>Cockpit Administrateur</h3>
          <Link href="/admin">Retour au cockpit →</Link>
        </article>
      </section>
    </main>
  );
}
