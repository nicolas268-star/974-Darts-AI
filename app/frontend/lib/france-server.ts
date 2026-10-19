import "server-only";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { candidateFromRow, committeeFromRow, competitionFromRow, object, publicInventory, type FranceInventory, type JsonObject } from "@/lib/france-model";

async function rows(db: SupabaseClient, table: string): Promise<JsonObject[]> {
  const result: JsonObject[] = [];
  for (let offset = 0; offset < 100_000; offset += 500) {
    const { data, error } = await db.from(table).select("id,payload").order("id").range(offset, offset + 499);
    if (error) throw new Error("Le référentiel Comités France est indisponible.");
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
  throw new Error("Le référentiel nécessite une pagination supplémentaire.");
}

export async function getPublicFranceInventory() {
  const db = await createClient();
  if (!db) throw new Error("Le référentiel Comités France est indisponible.");
  // Use the visitor's RLS context, never a service credential, for public pages.
  const [committees, competitions] = await Promise.all([rows(db, "france_committees"), rows(db, "france_competitions")]);
  return publicInventory(committees.map(committeeFromRow), competitions.map(competitionFromRow));
}

export function franceServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Le service de validation est indisponible.");
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getAdminFranceInventory(): Promise<FranceInventory> {
  // Caller must requireAdmin() before invoking this server-only function.
  const db = franceServiceClient();
  const [committees, competitions, candidates, runs, leagues] = await Promise.all([
    rows(db, "france_committees"), rows(db, "france_competitions"), rows(db, "france_candidates"),
    rows(db, "france_runs"), db.from("france_leagues").select("id", { count: "exact", head: true }),
  ]);
  if (leagues.error) throw new Error("Les ligues sont indisponibles.");
  return { committees: committees.map(committeeFromRow), competitions: competitions.map(competitionFromRow),
    candidates: candidates.map(candidateFromRow), leagueCount: leagues.count ?? 0,
    runs: runs.map(row => {
      const p = object(row.payload), config = object(p.config);
      const stats = Object.fromEntries(Object.entries(object(p.stats)).filter(([,v]) => typeof v === "number")) as Record<string, number>;
      return { id: String(row.id), status: String(p.status ?? "UNKNOWN"), started_at: typeof p.started_at === "string" ? p.started_at : null,
        since: typeof config.since === "string" ? config.since : null, until: typeof config.until === "string" ? config.until : null, stats };
    }) };
}
