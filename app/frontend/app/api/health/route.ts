
export async function GET() {
  return Response.json({
    app: "974 Darts AI Web",
    version: "21.0.13",
    status: "ok",
    demoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
    supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    publicKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });
}
