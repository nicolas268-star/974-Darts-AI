import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import MatchDayStudio from "./MatchDayStudio";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdmin();
  if (process.env.MATCH_DAY_ENABLED !== "true") notFound();
  return <MatchDayStudio />;
}
