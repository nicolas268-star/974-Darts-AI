import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth/session";
import { getSiteOrigin } from "@/lib/site-url";
import { franceServiceClient } from "@/lib/france-server";
import { httpsReference, object } from "@/lib/france-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) return authorization.response;
  if (request.headers.get("origin") !== getSiteOrigin(request)) return fail(403, "Origine refusée.");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail(415, "Format JSON requis.");
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "Décision manquante.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 12_000) { await reader.cancel(); return fail(413, "Décision trop volumineuse."); }
    chunks.push(value);
  }
  let input;
  try { input = object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { return fail(400, "Décision invalide."); }
  if (Object.keys(input).some(k => !["n01_id", "committee_id", "status", "reason", "confirmed", "evidence"].includes(k)) ||
      typeof input.n01_id !== "string" || !/^t_[A-Za-z0-9_]+$/.test(input.n01_id) ||
      typeof input.committee_id !== "string" || !/^[a-z0-9_-]{1,100}$/.test(input.committee_id) ||
      !["VERIFIED", "REVIEW_REQUIRED", "REJECTED"].includes(String(input.status)) ||
      typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 1600 || input.confirmed !== true) {
    return fail(400, "Vérifiez la compétition, le comité, la justification et la confirmation.");
  }
  let evidence;
  if (input.status === "VERIFIED") {
    const provided = object(input.evidence);
    const url = httpsReference(provided.url);
    if (!url || url.length > 2000 || !["OFFICIAL_LINK", "OFFICIAL_RESULT", "ORGANIZER_CONFIRMATION", "OFFICIAL_DIRECTORY"].includes(String(provided.kind)) ||
        typeof provided.justification !== "string" || provided.justification.trim().length < 5 || provided.justification.length > 1600) {
      return fail(400, "Une source HTTPS fiable et une justification ciblée sont obligatoires.");
    }
    evidence = { target: input.n01_id, url, kind: provided.kind, justification: provided.justification.trim(), checked_at: new Date().toISOString() };
  }
  try {
    const db = franceServiceClient();
    // The trusted session supplies the actor. Client-supplied actors/targets are refused.
    const { error } = await db.rpc("france_inventory_command", { p_action: "decide", p_payload: {
      n01_id: input.n01_id, committee_id: input.committee_id, status: input.status,
      actor: authorization.auth.user!.id, reason: input.reason.trim(), ...(evidence ? { evidence } : {}),
    } });
    if (error) return fail(409, "La décision a été refusée. Vérifiez la preuve et rechargez le référentiel avant de réessayer.");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail(503, "Le service est indisponible. Aucune décision n’a été confirmée."); }
}
