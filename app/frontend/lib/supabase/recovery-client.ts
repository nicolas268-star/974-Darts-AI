import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createRecoveryClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: true,
      flowType: "implicit",
      persistSession: true,
      storageKey: "974-password-recovery",
    },
  });
}
