
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AppRole = "VISITOR" | "PLAYER" | "CAPTAIN" | "ADMIN";

export type AuthContext = {
  user: { id: string; email?: string | null } | null;
  profile: {
    role: AppRole;
    player_id: string | null;
    captain_team_id: string | null;
    display_name: string | null;
  } | null;
  demo: boolean;
  profileError: string | null;
};

export async function getCurrentUser(): Promise<AuthContext> {
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  if (demo) {
    return {
      user: { id: "demo-user", email: "nico@demo.fr" },
      profile: {
        role: "ADMIN",
        player_id: "demo-player",
        captain_team_id: "demo-team",
        display_name: "Nico",
      },
      demo: true,
      profileError: null,
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      user: null,
      profile: null,
      demo: false,
      profileError: "Supabase client unavailable",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      user: null,
      profile: null,
      demo: false,
      profileError: userError?.message ?? null,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, player_id, captain_team_id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    user: { id: user.id, email: user.email },
    profile: profile
      ? {
          role: profile.role as AppRole,
          player_id: profile.player_id,
          captain_team_id: profile.captain_team_id,
          display_name: profile.display_name,
        }
      : null,
    demo: false,
    profileError: profileError?.message ?? null,
  };
}

export async function requireUser() {
  const auth = await getCurrentUser();

  if (!auth.user) {
    redirect("/login");
  }

  if (!auth.profile) {
    const reason = auth.profileError ? "profile-query" : "profile-missing";
    redirect(`/unauthorized?reason=${reason}`);
  }

  return auth;
}

export async function requireRole(roles: AppRole[]) {
  const auth = await requireUser();
  const role = auth.profile?.role;

  if (!role || !roles.includes(role)) {
    redirect(`/unauthorized?reason=role&current=${role ?? "NONE"}`);
  }

  return auth;
}
