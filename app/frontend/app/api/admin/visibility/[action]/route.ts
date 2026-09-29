import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth/session";
import { getSiteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });

async function relay(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) return authorization.response;
  const { action } = await context.params;
  if (!["evenings", "summary"].includes(action) || (request.method === "POST" && action !== "summary")) return fail(404, "Action inconnue.");
  const base = process.env.BACKEND_API_URL ?? process.env.PYTHON_API_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!base || !token) return fail(503, "Le service de résumé est indisponible.");
  const target = new URL(`/api/v1/visibility/${action}`, base);
  let body: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== getSiteOrigin(request)) return fail(403, "Origine refusée.");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail(415, "Format JSON requis.");
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "Sélectionnez une rencontre.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return fail(413, "Requête trop volumineuse."); }
      chunks.push(value);
    }
    try {
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!input || typeof input.result_id !== "string" || !uuid.test(input.result_id) || Object.keys(input).some((key) => key !== "result_id")) return fail(400, "Rencontre invalide.");
      body = JSON.stringify({ result_id: input.result_id });
    } catch { return fail(400, "Requête invalide."); }
  } else if (action === "summary") {
    const resultId = request.nextUrl.searchParams.get("result_id") ?? "";
    if (!uuid.test(resultId)) return fail(400, "Sélectionnez une rencontre.");
    target.searchParams.set("result_id", resultId);
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
