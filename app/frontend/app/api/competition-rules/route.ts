export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const apiUrl = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  const seasonId = new URL(request.url).searchParams.get("season_id");
  try {
    const response = await fetch(`${apiUrl}/api/v1/competition-rules${seasonId ? `?season_id=${encodeURIComponent(seasonId)}` : ""}`, { cache: "no-store" });
    return Response.json(await response.json(), { status: response.status });
  } catch { return Response.json({ error: "Backend Python indisponible." }, { status: 503 }); }
}
