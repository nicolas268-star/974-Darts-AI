import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isSoleAdministrator } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest, context: { params: Promise<{ code: string; action: string }> }) {
  const auth = await getCurrentUser();
  if (!auth.user || auth.demo) return fail(401, "Connexion personnelle requise.");
  if (!isSoleAdministrator(auth)) return fail(403, "Action administrateur requise.");
  const { code, action } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(code) || !["preview", "apply"].includes(action)) return fail(404, "Route inconnue.");
  if (request.headers.get("origin") !== getSiteOrigin(request)) return fail(403, "Origine de la requête refusée.");
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail(415, "Format JSON requis.");
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "Données manquantes.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); return fail(413, "Requête trop volumineuse."); }
    chunks.push(value);
  }
  let payload: { preview_id?: string; confirmed?: boolean };
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail(400, "JSON invalide.");
  } catch { return fail(400, "JSON invalide."); }
  if (action === "apply" && (typeof payload.preview_id !== "string" || !payload.preview_id || payload.confirmed !== true)) return fail(400, "Confirmez l’aperçu avant l’actualisation.");
  const supabase = await createClient();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session?.access_token) return fail(401, "Session expirée.");
  const base = process.env.BACKEND_API_URL ?? process.env.PYTHON_API_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!base || !token) return fail(503, "Le service d’actualisation est indisponible.");
  try {
    const response = await fetch(new URL(`/api/v1/competitions/tournaments/${encodeURIComponent(code)}/refresh/${action}`, base), {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(240_000),
      headers: { "Content-Type": "application/json", "X-Internal-Token": token, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(action === "preview" ? {} : { preview_id: payload.preview_id, confirmed: true }),
    });
    if (!response.headers.get("content-type")?.includes("application/json")) return fail(502, "Réponse du service indisponible.");
    const data = await response.json();
    if (!response.ok) return fail(response.status, typeof data.detail === "string" ? data.detail : "Actualisation impossible. Relancez l’aperçu.");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail(502, "Le service est indisponible. La fiche publiée reste conservée."); }
}
