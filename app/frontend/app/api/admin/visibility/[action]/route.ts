import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth/session";
import { getSiteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tournamentCode = /^[a-zA-Z0-9_-]{1,120}$/;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

async function relay(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) return authorization.response;
  const { action } = await context.params;
  if (!["evenings", "summary", "tournaments", "tournament-summary"].includes(action) || (request.method === "POST" && !["summary", "tournament-summary"].includes(action))) return fail(404, "Action inconnue.");
  const tournament = action === "tournament-summary";
  const base = process.env.BACKEND_API_URL ?? process.env.PYTHON_API_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!base || !token) return fail(503, "Le service de résumé est indisponible.");
  const target = new URL(`/api/v1/visibility/${action}`, base);
  let body: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== getSiteOrigin(request)) return fail(403, "Origine refusée.");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail(415, "Format JSON requis.");
    const reader = request.body?.getReader();
    if (!reader) return fail(400, tournament ? "Sélectionnez un tournoi." : "Sélectionnez une rencontre.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12_000) { await reader.cancel(); return fail(413, "Requête trop volumineuse."); }
      chunks.push(value);
    }
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const key = tournament ? "code" : "result_id";
      if (!input || typeof input[key] !== "string" || !(tournament ? tournamentCode : uuid).test(input[key]) || Object.keys(input).some((field) => ![key, "context"].includes(field))) return fail(400, tournament ? "Tournoi invalide." : "Rencontre invalide.");
      if (input.context !== undefined && !(tournament && input.context === null) && (typeof input.context !== "string" || input.context.length > 1600)) return fail(400, "Le contexte doit contenir au maximum 1 600 caractères.");
      body = JSON.stringify({ [key]: input[key], ...(input.context !== undefined ? { context: input.context } : {}) });
    } catch { return fail(400, "Requête invalide."); }
  } else if (action === "summary" || tournament) {
    const key = tournament ? "code" : "result_id";
    const selected = request.nextUrl.searchParams.get(key) ?? "";
    if (!(tournament ? tournamentCode : uuid).test(selected)) return fail(400, tournament ? "Sélectionnez un tournoi." : "Sélectionnez une rencontre.");
    target.searchParams.set(key, selected);
  }
  try {
    const response = await fetch(target, { method: request.method, body, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(55_000), headers: { "Content-Type": "application/json", "X-Internal-Token": token } });
    const data = await response.json();
    if (!response.ok) return fail(response.status, typeof data.detail === "string" ? data.detail : "Le résumé est indisponible.");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail(502, "Le service n’a pas répondu. Réessaie dans quelques instants."); }
}

export const GET = relay;
export const POST = relay;
