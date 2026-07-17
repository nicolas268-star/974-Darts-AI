
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/session";

export async function POST(request: Request) {
  await requireRole(["ADMIN"]);

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return Response.json({ ok: true, demo: true });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "Configuration serveur incomplète." }, { status: 500 });
  }

  const body = await request.json();
  const email = String(body.email ?? "").trim();
  const role = String(body.role ?? "PLAYER");
  const playerId = body.playerId || null;
  const captainTeamId = body.captainTeamId || null;

  if (!email) {
    return Response.json({ error: "Email obligatoire." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/update-password`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { display_name: email.split("@")[0] }
  });

  if (error || !data.user) {
    return Response.json({ error: error?.message ?? "Invitation impossible." }, { status: 400 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role,
      player_id: playerId,
      captain_team_id: captainTeamId
    })
    .eq("user_id", data.user.id);

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 400 });
  }

  return Response.json({ ok: true, userId: data.user.id });
}
