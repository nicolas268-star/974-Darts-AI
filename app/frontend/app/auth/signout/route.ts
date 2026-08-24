
import { createClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/site-url";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const supabase = await createClient();
    if (supabase) await supabase.auth.signOut();
  }
  return NextResponse.redirect(
    new URL("/login", getSiteOrigin(request)),
    303,
  );
}
