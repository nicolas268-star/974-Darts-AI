import styles from "./loading.module.css";

export default function LoadingChampionship() {
  return <main className={styles.loading} aria-busy="true" aria-label="Chargement du championnat">
    <p role="status">Chargement du classement officiel…</p>
    <div className={styles.kpis} aria-hidden="true">{[1, 2, 3, 4].map(key => <div key={key} />)}</div>
    <div className={styles.panels} aria-hidden="true">{[1, 2, 3].map(key => <div key={key} />)}</div>
  </main>;
}
