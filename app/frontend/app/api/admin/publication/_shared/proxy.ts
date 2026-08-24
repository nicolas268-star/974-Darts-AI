import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/auth/session";

const DEFAULT_TIMEOUT_MS = 60_000;
const FILE_FIELD_NAME = "file";

type ProxyOptions = {
  backendPath: string;
  forwardAllowUpdates?: boolean;
  requirePublicationConfirmation?: boolean;
};

function jsonError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

function getBackendConfiguration(): {
  baseUrl: string;
  internalToken: string;
} | null {
  const baseUrl = process.env.BACKEND_API_URL?.trim().replace(/\/$/, "");
  const internalToken = process.env.INTERNAL_API_TOKEN?.trim();

  if (!baseUrl || !internalToken) {
    return null;
  }

  return { baseUrl, internalToken };
}

function readTimeoutMs(): number {
  const configured = Number(process.env.PUBLICATION_PROXY_TIMEOUT_MS);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.floor(configured);
}

async function parseFile(request: NextRequest): Promise<File | NextResponse> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "La requête doit être envoyée en multipart/form-data.");
  }

  const candidate = formData.get(FILE_FIELD_NAME);

  if (!(candidate instanceof File)) {
    return jsonError(400, "Le champ de fichier 'file' est obligatoire.");
  }

  if (candidate.size === 0) {
    return jsonError(400, "Le fichier envoyé est vide.");
  }

  return candidate;
}

async function relayResponse(response: Response): Promise<NextResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({
      detail: "La réponse JSON du backend est illisible.",
    }));

    return NextResponse.json(body, { status: response.status });
  }

  const text = await response.text();

  return NextResponse.json(
    {
      detail:
        text.trim() ||
        `Le backend a répondu avec le statut HTTP ${response.status}.`,
    },
    { status: response.status },
  );
}

export async function proxyPublicationRequest(
  request: NextRequest,
  options: ProxyOptions,
): Promise<NextResponse> {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) {
    return new NextResponse(authorization.response.body, {
      status: authorization.response.status,
      headers: authorization.response.headers,
    });
  }

  const configuration = getBackendConfiguration();

  if (!configuration) {
    return jsonError(
      500,
      "Configuration serveur incomplète : BACKEND_API_URL et INTERNAL_API_TOKEN sont requis.",
    );
  }

  const file = await parseFile(request);

  if (file instanceof NextResponse) {
    return file;
  }

  const targetUrl = new URL(
    `${configuration.baseUrl}${options.backendPath}`,
  );

  if (options.forwardAllowUpdates) {
    const requestedValue = request.nextUrl.searchParams.get("allow_updates");

    if (requestedValue === "true" || requestedValue === "false") {
      targetUrl.searchParams.set("allow_updates", requestedValue);
    }
  }

  const headers = new Headers({
    "X-Internal-Token": configuration.internalToken,
    "X-User-Id": authorization.auth.user!.id,
  });

  if (options.requirePublicationConfirmation) {
    const confirmation = request.headers
      .get("X-Publication-Confirmed")
      ?.trim()
      .toLowerCase();

    if (confirmation !== "true") {
      return jsonError(400, "La confirmation explicite de publication est obligatoire.");
    }

    headers.set("X-Publication-Confirmed", "true");

  }

  const outboundFormData = new FormData();
  outboundFormData.set(FILE_FIELD_NAME, file, file.name || "upload.xlsx");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readTimeoutMs());

  try {
    const backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: outboundFormData,
      cache: "no-store",
      signal: controller.signal,
    });

    return await relayResponse(backendResponse);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(504, "Le backend a dépassé le délai de réponse autorisé.");
    }

    return jsonError(502, "Le proxy ne parvient pas à joindre le backend FastAPI.");
  } finally {
    clearTimeout(timeout);
  }
}
