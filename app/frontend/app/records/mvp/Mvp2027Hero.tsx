import Image from "next/image";
import styles from "./Mvp2027Hero.module.css";

/** Presentation only: the ranking continues to own the live status. */
export function Mvp2027Hero({ provisional }: { provisional: boolean }) {
  return (
    <>
      <section className={styles.hero} aria-labelledby="mvp-2027-title">
        <div className={styles.art} aria-hidden="true">
          <Image
            src="/brand/mvp-2027-darts.svg"
            alt=""
            width={600}
            height={360}
            unoptimized
            loading="eager"
          />
        </div>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>Indice analytique · Saison 2027</span>
          <h1 className={styles.title} id="mvp-2027-title">
            <span className={styles.gold}>MVP</span>{" "}
            <span className={styles.silver}>2027</span>
          </h1>
          <p className={styles.tagline}>
            Des joueurs d’aujourd’hui aux champions de demain
          </p>
          <div className={styles.partner}>
            <span className={styles.byline}>Présenté par</span>
            <div className={styles.brand}>
              <Image
                className={styles.logo}
                src="/brand/ndx-performance-lab.png"
                alt=""
                width={1254}
                height={1254}
                sizes="48px"
              />
              <strong>NDX <span>Performance Lab</span></strong>
            </div>
          </div>
        </div>
        <span className={styles.status}>
          <i aria-hidden="true" />
          {provisional ? "Classement provisoire" : "Calcul transparent"}
        </span>
      </section>
      <p className={styles.introduction}>
        Un classement global fondé sur le scoring, les résultats, le
        volume observé et les finishs des joueurs.
      </p>
    </>
  );
}
