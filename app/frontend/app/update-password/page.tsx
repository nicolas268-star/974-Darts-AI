
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRecoveryClient } from "@/lib/supabase/recovery-client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createRecoveryClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      setMessage("Configuration Supabase absente.");
      setChecking(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setReady(true);
        setChecking(false);
        setMessage("");
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (data.session) {
        setReady(true);
        setMessage("");
      } else if (error) {
        setMessage("Ce lien de réinitialisation est invalide ou expiré.");
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (password.length < 8) return setMessage("8 caractères minimum.");
    if (password !== confirmation) return setMessage("Les mots de passe diffèrent.");

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      setMessage("Mot de passe simulé en mode démo.");
      return;
    }

    const supabase = supabaseRef.current;
    if (!supabase) return setMessage("Configuration Supabase absente.");
    if (!ready) {
      return setMessage(
        "Ce lien n'est plus valide. Demande un nouvel email de réinitialisation.",
      );
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMessage(error.message);

    await supabase.auth.signOut();
    router.replace("/login?message=password-updated");
    router.refresh();
  }

  return (
    <main className="container">
      <form className="card form" onSubmit={submit}>
        <h2>Nouveau mot de passe</h2>
        {checking ? (
          <div className="notice" style={{ marginTop: 14 }}>
            Vérification du lien sécurisé…
          </div>
        ) : null}
        <label className="label">Nouveau mot de passe</label>
        <input className="input" type="password" required value={password}
          disabled={!ready}
          onChange={(event) => setPassword(event.target.value)} />
        <label className="label">Confirmation</label>
        <input className="input" type="password" required value={confirmation}
          disabled={!ready}
          onChange={(event) => setConfirmation(event.target.value)} />
        {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 20 }}
          disabled={!ready}>
          Enregistrer
        </button>
      </form>
    </main>
  );
}
