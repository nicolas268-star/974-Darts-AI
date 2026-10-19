import type { Metadata } from "next";
import FranceDirectory from "@/components/france/FranceDirectory";
import { getPublicFranceInventory } from "@/lib/france-server";
import styles from "@/components/france/France.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comités France", description: "Annuaire documenté des comités français de fléchettes et de leurs compétitions N01 confirmées.", alternates: { canonical: "/comites/france" } };

export default async function FrancePage() {
  let data;
  try { data = await getPublicFranceInventory(); }
  catch { return <main className={styles.page}><div className={styles.wrap}><h1>Comités France</h1><p role="status">L’annuaire est temporairement indisponible. Réessayez dans quelques instants.</p></div></main>; }
  return <FranceDirectory committees={data.committees} competitions={data.competitions}/>;
}
