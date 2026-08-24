
import { requireRole } from "@/lib/auth/session";

export async function POST(request: Request) {
  const auth = await requireRole(["ADMIN"]);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Fichier Excel absent." }, { status: 400 });
  }

  const apiUrl = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    return Response.json({ error: "INTERNAL_API_TOKEN absent." }, { status: 500 });
  }

  const outbound = new FormData();
  outbound.append("file", file);

  try {
    const response = await fetch(`${apiUrl}/api/v1/import/publish`, {
      method: "POST",
      headers: {
        "x-internal-token": token,
        "x-user-id": auth.user!.id,
      },
      body: outbound,
      cache: "no-store",
    });
    const payload = await response.json();
    return Response.json(
      response.ok ? payload : { error: payload.detail ?? "Publication impossible." },
      { status: response.status }
    );
  } catch {
    return Response.json(
      { error: "Le backend Python ne répond pas. Vérifie la fenêtre FastAPI." },
      { status: 503 }
    );
  }
}
