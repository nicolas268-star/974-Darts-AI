import { requireAdmin } from "@/lib/auth/session";
import { getAdminFranceInventory } from "@/lib/france-server";
import FranceAdmin from "@/components/france/FranceAdmin";
import styles from "@/components/france/France.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comités France — administration", robots: { index: false, follow: false } };

export default async function FranceAdminPage() {
  await requireAdmin();
  let inventory;
  try { inventory = await getAdminFranceInventory(); }
  catch { return <main className={styles.page}><div className={styles.wrap}><h1>Comités France</h1><p role="status">Le référentiel est temporairement indisponible. Aucune validation n’a été modifiée.</p></div></main>; }
  return <FranceAdmin inventory={inventory}/>;
}
