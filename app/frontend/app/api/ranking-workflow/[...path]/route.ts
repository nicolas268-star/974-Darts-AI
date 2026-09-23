import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isSoleAdministrator } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 1_048_576;
const eventId = "[a-zA-Z0-9_-]{1,100}";
const getPaths = [
  new RegExp(`^events(?:/${eventId}(?:/revisions/[0-9a-f-]{36})?)?$`),
  /^options$/,
];
const postPaths = [new RegExp(`^events(?:/${eventId}/actions)?$`)];
const fail = (status: number, error: string) =>
  NextResponse.json({ error }, { status });

async function relay(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const auth = await getCurrentUser();
  if (!auth.user || auth.demo)
    return fail(401, "Connexion personnelle requise.");
  const admin = isSoleAdministrator(auth);
  if (!admin && auth.profile?.role !== "SPORTS_DIRECTOR")
    return fail(403, "Accès refusé.");
  if (process.env.RANKING_WORKFLOW_ENABLED !== "true")
    return fail(503, "Le nouveau workflow n’est pas encore activé.");
  const path = (await context.params).path.join("/");
  if (
    !(request.method === "GET" ? getPaths : postPaths).some((p) => p.test(path))
  )
    return fail(404, "Route inconnue.");
  if (
    !admin &&
    (path === "options" || (request.method === "POST" && path === "events"))
  )
    return fail(403, "Action administrateur requise.");
  let body: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== getSiteOrigin(request))
      return fail(403, "Origine de la requête refusée.");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      return fail(415, "Format JSON requis.");
    const reader = request.body?.getReader();
    if (!reader) return fail(400, "Données manquantes.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return fail(413, "Requête trop volumineuse.");
      }
      chunks.push(value);
    }
    body = Buffer.concat(chunks).toString("utf8");
    try {
      const parsed = JSON.parse(body);
      if (
        !admin &&
        !["APPROVE_DS", "REQUEST_CORRECTION"].includes(parsed.action)
      )
        return fail(403, "Action non autorisée.");
    } catch {
      return fail(400, "JSON invalide.");
    }
  }
  const supabase = await createClient();
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (!session?.access_token) return fail(401, "Session expirée.");
  const base = process.env.BACKEND_API_URL ?? process.env.PYTHON_API_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!base || !token)
    return fail(503, "Le service de validation est indisponible.");
  const target = new URL(`/api/v1/ranking-workflow/${path}`, base);
  if (path === "events" && request.nextUrl.searchParams.has("offset"))
    target.searchParams.set(
      "offset",
      request.nextUrl.searchParams.get("offset")!,
    );
  try {
    const response = await fetch(target, {
      method: request.method,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      return fail(502, "Réponse du service indisponible.");
    const data = await response.json();
    if (!response.ok)
      return fail(
        response.status,
        typeof data.detail === "string"
          ? data.detail
          : "Vérifiez les champs saisis.",
      );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return fail(
      502,
      "Connexion au service interrompue. Rechargez avant de réessayer.",
    );
  }
}
export const GET = relay;
export const POST = relay;
