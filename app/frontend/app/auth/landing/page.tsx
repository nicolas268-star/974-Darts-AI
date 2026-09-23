import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { safeReturnPath } from "@/lib/auth/return-path";
export default async function AuthLanding({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeReturnPath((await searchParams).next ?? null);
  const auth = await requireUser(next ?? "/auth/landing");
  redirect(
    next ??
      (auth.profile?.role === "SPORTS_DIRECTOR"
        ? "/directeur-sportif"
        : auth.profile?.role === "ADMIN"
          ? "/admin"
          : "/player"),
  );
}
