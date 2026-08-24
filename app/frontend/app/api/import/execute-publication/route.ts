import { requireRole } from "@/lib/auth/session";

function errorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Publication impossible.";
  const value = payload as Record<string, unknown>;
  if (typeof value.detail === "string") return value.detail;
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  return "Publication impossible.";
}

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN"]);
  const formData = await request.formData();
  const file = formData.get("file");
  const confirmed = formData.get("confirmed") === "true";

  if (!(file instanceof File)) {
    return Response.json({ error: "Fichier Excel absent." }, { status: 400 });
  }
  if (!confirmed) {
    return Response.json(
      { error: "La confirmation de publication est obligatoire." },
      { status: 400 },
    );
  }

  const apiUrl = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    return Response.json({ error: "INTERNAL_API_TOKEN absent." }, { status: 500 });
  }

  const outbound = new FormData();
  outbound.append("file", file);

  try {
    const response = await fetch(
      `${apiUrl}/api/v1/import/execute-publication`,
      {
        method: "POST",
        headers: {
          "x-internal-token": token,
          "x-user-id": auth.user!.id,
          "x-publication-confirmed": "true",
        },
        body: outbound,
        cache: "no-store",
      },
    );

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return Response.json(
        { error: errorMessage(payload), backendStatus: response.status },
        { status: response.status },
      );
    }
    return Response.json(payload, { status: response.status });
  } catch {
    return Response.json(
      { error: "Le backend Python ne répond pas. Vérifie la fenêtre FastAPI." },
      { status: 503 },
    );
  }
}
