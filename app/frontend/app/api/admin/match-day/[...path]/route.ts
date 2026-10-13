import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIMIT = 18 * 1024 * 1024;
const getPaths = /^(source|status|history|versions\/[0-9a-f-]{36}\/image)$/;
const postPaths = /^(save|approve|schedule|cancel|resolve)$/;
async function relay(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) return authorization.response;
  if (process.env.MATCH_DAY_ENABLED !== "true") return NextResponse.json({ error: "Studio désactivé." }, { status: 404 });
  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || `${request.nextUrl.protocol}//${request.headers.get("host")}`).origin;
  if (request.method === "POST" && request.headers.get("origin") !== expectedOrigin) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const path = (await context.params).path.join("/");
  if (!(request.method === "GET" ? getPaths : postPaths).test(path)) return NextResponse.json({ error: "Route inconnue." }, { status: 404 });
  const base = (process.env.BACKEND_API_URL ?? process.env.PYTHON_API_URL)?.replace(/\/$/, "");
  const token = process.env.INTERNAL_API_TOKEN;
  if (!base || !token) return NextResponse.json({ error: "Backend non configuré." }, { status: 503 });
  const headers: Record<string, string> = { "X-Internal-Token": token, "X-User-Id": authorization.auth.user!.id };
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length")) > LIMIT) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
    const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > LIMIT) { await reader.cancel(); return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 }); } chunks.push(value);
    }
    body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    headers["Content-Type"] = "application/json";
  }
  try {
    const response = await fetch(`${base}/api/v1/match-day/${path}${request.nextUrl.search}`, { method: request.method, headers, body, cache: "no-store", signal: AbortSignal.timeout(60_000) });
    return new NextResponse(await response.arrayBuffer(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Backend indisponible. Rechargez l’historique avant de réessayer une action." }, { status: 503 }); }
}
export const GET = relay;
export const POST = relay;
