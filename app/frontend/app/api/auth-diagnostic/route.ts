
import { authorizeAdminApi } from "@/lib/auth/session";

export async function GET() {
  const authorization = await authorizeAdminApi();
  if (!authorization.ok) return authorization.response;
  const { auth } = authorization;

  return Response.json({
    app: "974 Darts AI Web",
    version: "21.0.12",
    demoMode: auth.demo,
    authenticated: Boolean(auth.user),
    user: auth.user
      ? { id: auth.user.id, email: auth.user.email }
      : null,
    profile: auth.profile,
    profileError: auth.profileError,
  });
}
