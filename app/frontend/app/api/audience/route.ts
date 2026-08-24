import { authorizeAdminApi } from "@/lib/auth/session";

const backend = process.env.BACKEND_API_URL ?? process.env.PYTHON_API_URL ?? "http://backend:8000";
const token = process.env.INTERNAL_API_TOKEN ?? "";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await fetch(`${backend}/api/v1/audience/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": token },
      body,
      cache: "no-store",
    });
    return new Response(null, { status: response.ok ? 204 : response.status });
  } catch {
    return new Response(null, { status: 503 });
  }
}

export async function GET(request: Request) {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) return authorization.response;
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  try {
    const response = await fetch(`${backend}/api/v1/audience/summary?days=${encodeURIComponent(days)}`, {
      headers: { "x-internal-token": token }, cache: "no-store",
    });
    return Response.json(await response.json(), { status: response.status });
  } catch {
    return Response.json({ error: "Mesure d’audience indisponible." }, { status: 503 });
  }
}
