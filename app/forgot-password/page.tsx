
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      setMessage("Mode démo : aucun email n'est envoyé.");
      return;
    }

    const supabase = createClient();
    if (!supabase) return setMessage("Configuration Supabase absente.");

    const redirectTo = `${window.location.origin}/auth/callback?next=/update-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setMessage(
      error
        ? error.message
        : "Un email de réinitialisation vient d'être envoyé."
    );
  }

  return (
    <main className="container">
      <form className="card form" onSubmit={submit}>
        <h2>Mot de passe oublié</h2>
        <p>Indique ton email pour recevoir un lien sécurisé.</p>
        <label className="label">Adresse email</label>
        <input
          className="input"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 20 }}>
          Envoyer le lien
        </button>
        <p style={{ textAlign: "center" }}>
          <Link href="/login">Retour à la connexion</Link>
        </p>
      </form>
    </main>
  );
}
