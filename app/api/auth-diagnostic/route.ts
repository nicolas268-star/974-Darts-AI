
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const auth = await getCurrentUser();

  return Response.json({
    app: "974 Darts AI Web",
    version: "0.6.1",
    demoMode: auth.demo,
    authenticated: Boolean(auth.user),
    user: auth.user
      ? { id: auth.user.id, email: auth.user.email }
      : null,
    profile: auth.profile,
    profileError: auth.profileError,
  });
}
