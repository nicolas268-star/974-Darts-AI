import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  History,
  ShieldCheck,
} from "lucide-react";
import type { IdentityHubDetailResponse } from "@/lib/player/identity-hub-types";
import "../identity-detail.css";
const backend = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
async function getData(id: string) {
  try {
    const token = process.env.INTERNAL_API_TOKEN?.trim();
    if (!token) return null;
    const r = await fetch(`${backend}/api/v1/identities/hub/${id}`, {
      cache: "no-store",
      headers: { "X-Internal-Token": token },
    });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}
export default async function Page({
  params,
}: {
  params: Promise<{ identity_id: string }>;
}) {
  const { identity_id } = await params;
  const d: IdentityHubDetailResponse | null = await getData(identity_id);
  if (!d) notFound();
  return (
    <main className="identity-detail-page">
      <Link href="/admin/identities">
        <ArrowLeft size={16} /> Retour
      </Link>
      <header className="identity-detail-hero">
        <div>{d.identity.canonical_display_name.slice(0, 2).toUpperCase()}</div>
        <section>
          <span>{d.identity.status}</span>
          <h1>{d.identity.canonical_display_name}</h1>
          <small>{d.identity.id}</small>
        </section>
        <aside>
          <ShieldCheck size={15} /> Données sécurisées
        </aside>
      </header>
      <section className="identity-detail-kpis">
        <article>
          <strong>{d.career_overview.legs_total}</strong>
          <span>legs</span>
        </article>
        <article>
          <strong>{d.career_overview.alias_count}</strong>
          <span>alias</span>
        </article>
        <article>
          <strong>{d.career_overview.team_count}</strong>
          <span>équipes</span>
        </article>
        <article>
          <strong>{d.career_overview.season_count}</strong>
          <span>saisons</span>
        </article>
      </section>
      <section className="identity-detail-grid">
        <article className="identity-panel">
          <header>
            <BadgeCheck size={18} />
            <h2>Alias</h2>
          </header>
          {d.aliases.map((a: any) => (
            <p key={a.id}>
              <strong>{a.alias_name}</strong>
              <small>
                {a.source} · {a.confidence}%
              </small>
            </p>
          ))}
        </article>
        <article className="identity-panel">
          <header>
            <BriefcaseBusiness size={18} />
            <h2>Équipes</h2>
          </header>
          {d.memberships.map((m: any) => (
            <p key={m.id}>
              <strong>{m.team?.name ?? "Équipe inconnue"}</strong>
              <small>
                {m.season?.name ?? "Toutes saisons"} · {m.valid_from ?? "?"} →{" "}
                {m.valid_to ?? "en cours"}
              </small>
            </p>
          ))}
        </article>
      </section>
      <article className="identity-panel">
        <header>
          <History size={18} />
          <h2>Timeline</h2>
        </header>
        {d.timeline.map((e, i) => (
          <p key={i}>
            <strong>{e.title}</strong>
            <small>
              {e.date ?? "Date inconnue"} ·{" "}
              {typeof e.detail === "string"
                ? e.detail
                : JSON.stringify(e.detail)}
            </small>
          </p>
        ))}
      </article>
    </main>
  );
}
