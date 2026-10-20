import { loadCaptainData } from "@/lib/captain-nico/data";
import CaptainNico from "./CaptainNico";
import styles from "./CaptainNico.module.css";

export default async function CaptainNicoPage() {
  const data = await loadCaptainData();
  return <main className={styles.shell}><CaptainNico {...data} /></main>;
}
