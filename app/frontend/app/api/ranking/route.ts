export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const apiUrl = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const seasonId = new URL(request.url).searchParams.get("season_id");
  try {
    const response = await fetch(`${apiUrl}/api/v1/ranking${seasonId ? `?season_id=${encodeURIComponent(seasonId)}` : ""}`, { cache: "no-store" });
    const payload = await response.json();
    return Response.json(payload, { status: response.status });
  } catch { return Response.json({ error: "Backend Python indisponible." }, { status: 503 }); }
}
