
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("nico@demo.fr");
  const [password, setPassword] = useState("demo974");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
      localStorage.setItem("974-demo-role", "ADMIN");
      router.push("/player");
      router.refresh();
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setMessage("Configuration Supabase absente.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    router.push("/player");
    router.refresh();
  }

  return (
    <main className="container">
      <form className="card form" onSubmit={submit}>
        <span className="badge">
          {process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
            ? "Mode démonstration"
            : "Connexion sécurisée"}
        </span>
        <h2 style={{ marginTop: 18 }}>Connexion</h2>
        <p>Connecte-toi pour accéder à ton profil et à tes performances.</p>

        <label className="label">Adresse email</label>
        <input
          className="input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
        />

        <label className="label">Mot de passe</label>
        <input
          className="input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
        />

        {message && <div className="notice" style={{ marginTop: 14 }}>{message}</div>}

        <button
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 20 }}
          disabled={loading}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <div style={{ marginTop: 18, textAlign: "center" }}>
          <Link href="/forgot-password" className="muted">
            Mot de passe oublié ?
          </Link>
        </div>
      </form>
    </main>
  );
}
