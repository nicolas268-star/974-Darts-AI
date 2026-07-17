
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (password.length < 8) return setMessage("8 caractères minimum.");
    if (password !== confirmation) return setMessage("Les mots de passe diffèrent.");

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      setMessage("Mot de passe simulé en mode démo.");
      return;
    }

    const supabase = createClient();
    if (!supabase) return setMessage("Configuration Supabase absente.");

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMessage(error.message);

    router.push("/player");
    router.refresh();
  }

  return (
    <main className="container">
      <form className="card form" onSubmit={submit}>
        <h2>Nouveau mot de passe</h2>
        <label className="label">Nouveau mot de passe</label>
        <input className="input" type="password" required value={password}
          onChange={(event) => setPassword(event.target.value)} />
        <label className="label">Confirmation</label>
        <input className="input" type="password" required value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)} />
        {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 20 }}>
          Enregistrer
        </button>
      </form>
    </main>
  );
}
