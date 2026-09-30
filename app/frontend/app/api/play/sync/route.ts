import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { isKind, validCloudRow, validCommand } from "@/lib/play/cloud-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (status: number, error: string) => json({ error }, status);

async function handle(request: NextRequest) {
  const auth = await getCurrentUser();
  if (!auth.user || auth.demo) return fail(401, "Connectez-vous avec votre compte sur les deux appareils.");
  const client = await createClient();
  if (!client) return fail(503, "Synchronisation indisponible.");
  try {
    if (request.method === "GET") {
      const kind = request.nextUrl.searchParams.get("kind");
      if (kind !== null && !isKind(kind)) return fail(400, "Jeu inconnu.");
      let query = client.from("play_cloud_sessions").select("kind,revision,writer_device,record,updated_at").eq("owner_id", auth.user.id);
      if (kind) query = query.eq("kind", kind);
      const after = request.nextUrl.searchParams.get("after");
      if (after !== null) {
        if (!kind || !/^\d{1,10}$/.test(after)) return fail(400, "Révision invalide.");
        query = query.gt("revision", Number(after));
      }
      const { data, error } = await query.limit(7);
      if (error) return fail(503, "Synchronisation indisponible. Votre sauvegarde locale reste disponible.");
      if (!(data ?? []).every(validCloudRow)) return fail(422, "Sauvegarde distante incompatible.");
      return json({ row: kind ? data?.[0] ?? null : null, rows: data ?? [], unchanged: after !== null && data?.length === 0 });
    }
    if (request.headers.get("origin") !== getSiteOrigin(request)) return fail(403, "Origine refusée.");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail(415, "Format JSON requis.");
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "Données manquantes.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) { await reader.cancel(); return fail(413, "Sauvegarde trop volumineuse."); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return fail(400, "JSON invalide."); }
    if (!validCommand(body)) return fail(400, "Sauvegarde invalide.");
    const { data, error } = await client.rpc("play_cloud_command", {
      p_kind: body.kind, p_expected: body.expected, p_device: body.device,
      p_command: body.command, p_action: body.action, p_record: body.record,
    });
    if (error) return fail(503, "Enregistrement non confirmé. Réessayez avant de lancer à nouveau.");
    if (!data || typeof data.ok !== "boolean" || (data.row !== null && !validCloudRow(data.row))) return fail(422, "Sauvegarde distante incompatible.");
    return json({ row: data.row, rows: [], ok: data.ok }, data.ok ? 200 : 409);
  } catch { return fail(503, "Connexion interrompue. Réessayez la synchronisation."); }
}
export const GET = handle;
export const POST = handle;
