import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_048_576;
const TIMEOUT_MS = 20_000;

const allowedGetPaths = [
  /^\/api\/v1\/identities$/,
  /^\/api\/v1\/identities\/suggestions\/list$/,
  /^\/api\/v1\/identities\/hub\/list$/,
  /^\/api\/v1\/identities\/hub-quality\/dashboard$/,
  /^\/api\/v1\/identities\/candidates\/list$/,
  /^\/api\/v1\/identities\/tournament-alias\/preview$/,
  /^\/api\/v1\/nakka-sync\/status$/,
  /^\/api\/v1\/nakka-sync\/identity-candidates$/,
  /^\/api\/v1\/nakka-sync\/radar\/status$/,
  /^\/api\/v1\/nakka-sync\/direct\/status$/,
  /^\/api\/v1\/nakka-sync\/watch\/status$/,
  /^\/api\/v1\/control\/quality$/,
  /^\/api\/v1\/calendar\/events$/,
  /^\/api\/v1\/tournament-watch\/status$/,
  /^\/api\/v1\/seasons\/admin$/,
  /^\/api\/v1\/player-transfers\/admin$/,
];

const allowedPostPaths = [
  /^\/api\/v1\/identities\/canonical-merge\/preview$/,
  /^\/api\/v1\/identities\/canonical-merge\/apply$/,
  /^\/api\/v1\/identities\/suggestions\/reject$/,
  /^\/api\/v1\/identities\/merge-aliases$/,
  /^\/api\/v1\/nakka-sync\/run$/,
  /^\/api\/v1\/nakka-sync\/reference\/accept$/,
  /^\/api\/v1\/nakka-sync\/radar\/scan$/,
  /^\/api\/v1\/nakka-sync\/radar\/decision$/,
  /^\/api\/v1\/nakka-sync\/direct\/analyze$/,
  /^\/api\/v1\/nakka-sync\/direct\/import$/,
  /^\/api\/v1\/nakka-sync\/watch\/upsert$/,
  /^\/api\/v1\/nakka-sync\/watch\/run$/,
  /^\/api\/v1\/nakka-sync\/watch\/acknowledge$/,
  /^\/api\/v1\/nakka-sync\/watch\/delete$/,
  /^\/api\/v1\/calendar\/events\/upsert$/,
  /^\/api\/v1\/calendar\/events\/delete$/,
  /^\/api\/v1\/tournament-watch\/sources\/upsert$/,
  /^\/api\/v1\/tournament-watch\/sources\/delete$/,
  /^\/api\/v1\/tournament-watch\/scan$/,
  /^\/api\/v1\/tournament-watch\/manual\/analyze$/,
  /^\/api\/v1\/tournament-watch\/settings$/,
  /^\/api\/v1\/tournament-watch\/settings\/test-email$/,
  /^\/api\/v1\/tournament-watch\/decision$/,
  /^\/api\/v1\/seasons\/scan$/,
  /^\/api\/v1\/seasons\/calendar\/preview$/,
  /^\/api\/v1\/seasons\/calendar\/import$/,
  /^\/api\/v1\/player-transfers\/upsert$/,
  /^\/api\/v1\/player-transfers\/cancel$/,
];

function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function backendBaseUrl(): string | null {
  const value = (
    process.env.BACKEND_API_URL ??
    process.env.PYTHON_API_URL
  )?.trim();

  return value ? value.replace(/\/$/, "") : null;
}

function isAllowed(method: string, path: string): boolean {
  const patterns = method === "GET" ? allowedGetPaths : allowedPostPaths;
  return patterns.some((pattern) => pattern.test(path));
}

async function relay(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) {
    return authorization.response;
  }

  const { path: segments } = await context.params;
  const backendPath = `/${segments.join("/")}`;

  if (!isAllowed(request.method, backendPath)) {
    return jsonError(404, "Route administrateur non autorisée.");
  }

  const baseUrl = backendBaseUrl();
  const internalToken = process.env.INTERNAL_API_TOKEN?.trim();
  if (!baseUrl || !internalToken) {
    return jsonError(500, "Configuration du backend incomplète.");
  }

  const target = new URL(`${baseUrl}${backendPath}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const headers = new Headers({
    Accept: "application/json",
    "X-Internal-Token": internalToken,
    "X-User-Id": authorization.auth.user!.id,
  });

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET") {
    const declaredSize = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) {
      return jsonError(413, "Requête trop volumineuse.");
    }

    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return jsonError(413, "Requête trop volumineuse.");
    }

    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
  }

  const controller = new AbortController();
  const timeoutMs =
    backendPath === "/api/v1/nakka-sync/run" ||
    backendPath === "/api/v1/nakka-sync/radar/scan" ||
    backendPath === "/api/v1/nakka-sync/direct/analyze"
    || backendPath === "/api/v1/nakka-sync/watch/run"
    || backendPath === "/api/v1/tournament-watch/scan"
      ? 240_000
      : TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    const contentType =
      response.headers.get("content-type") ?? "application/json";
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(504, "Le backend a dépassé le délai autorisé.");
    }
    return jsonError(502, "Le backend administrateur est indisponible.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return relay(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return relay(request, context);
}
