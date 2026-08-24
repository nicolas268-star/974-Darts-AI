"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import type {
  IdentityHubListResponse,
  IdentityQualityResponse,
} from "@/lib/player/identity-hub-types";
import "./identity-hub.css";
import "./tournament-alias.css";
import TournamentAliasLink from "./TournamentAliasLink";
const backend = "/api/admin/backend";
export default function Page() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<IdentityHubListResponse | null>(null);
  const [quality, setQuality] = useState<IdentityQualityResponse | null>(null);
  const load = async () => {
    const u = new URL(`${backend}/api/v1/identities/hub/list`, window.location.origin);
    if (q.trim()) u.searchParams.set("query", q.trim());
    const [a, b] = await Promise.all([
      fetch(u.toString()),
      fetch(`${backend}/api/v1/identities/hub-quality/dashboard`),
    ]);
    setData(await a.json());
    setQuality(await b.json());
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="identity-hub-page">
      <header className="identity-hub-hero">
        <div>
          <Sparkles size={15} /> Identity Hub
        </div>
        <h1>Centre de contrôle des identités</h1>
        <p>Recherche, alias, équipes, timeline et qualité des données.</p>
        <aside>
          <ShieldCheck size={15} /> Référentiel sécurisé
        </aside>
      </header>
      <section className="identity-quality-grid">
        <article>
          <strong>{quality?.kpis.identities_total ?? "—"}</strong>
          <span>Identités</span>
        </article>
        <article>
          <strong>{quality?.kpis.aliases_total ?? "—"}</strong>
          <span>Alias</span>
        </article>
        <article>
          <strong>{quality?.kpis.merges_total ?? "—"}</strong>
          <span>Fusions</span>
        </article>
        <article>
          <strong>{quality?.kpis.average_alias_confidence ?? "—"}%</strong>
          <span>Confiance</span>
        </article>
      </section>
      <section className="identity-hub-toolbar">
        <label>
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Rechercher une identité ou un alias"
          />
        </label>
        <button onClick={() => void load()}>Rechercher</button>
        <Link href="/admin/player-identities">Assistant de fusion</Link>
      </section>
      <TournamentAliasLink onLinked={() => void load()}/>
      <section className="identity-hub-list">
        {(data?.items ?? []).map((item) => (
          <Link
            className="identity-hub-card"
            href={`/admin/identities/${item.identity.id}`}
            key={item.identity.id}
          >
            <div className="identity-avatar">
              {item.identity.canonical_display_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <span>{item.identity.status}</span>
              <h2>{item.identity.canonical_display_name}</h2>
              <small>{item.identity.id}</small>
            </div>
            <div className="identity-hub-stats">
              <b>{item.summary.alias_count} alias</b>
              <b>{item.summary.team_count} équipes</b>
              <b>{item.summary.season_count} saisons</b>
            </div>
          </Link>
        ))}
        {!data?.items?.length && (
          <div className="identity-hub-empty">
            <Users size={28} />
            <strong>Aucune identité trouvée</strong>
          </div>
        )}
      </section>
    </main>
  );
}
