
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/player";
  const siteOrigin = getSiteOrigin(request);

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-or-expired-link", siteOrigin),
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/login?error=auth-unavailable", siteOrigin),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-or-expired-link", siteOrigin),
    );
  }

  return NextResponse.redirect(new URL(next, siteOrigin));
}
