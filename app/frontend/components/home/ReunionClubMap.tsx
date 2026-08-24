"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

type TeamLink = { name: string; teamId: string | null };
type SocialLink = { name: string; url: string; source_type: string };
type Club = {
  key: string; name: string; city: string; venue: string; logo: string; accent: string;
  marker: { left: string; top: string }; cardClass: string; teams: TeamLink[]; socialLink?: SocialLink;
};
type Props = { teamIds: Record<string, string>; socialLinks?: Record<string, SocialLink> };

const definitions = [
  { key: "3bdc", name: "3B Darts Club", city: "Saint-Paul", venue: "Brasserie 3 Brasseurs", logo: "/club-map/3bdc.jpeg", accent: "#55b8ff", marker: { left: "28%", top: "43%" }, cardClass: "club-callout-3bdc", teamNames: ["3BDC"] },
  { key: "pdc", name: "Papangue Darts Club", city: "Saint-Leu", venue: "Bar du Chipek", logo: "/club-map/pdc.png", accent: "#f2b43b", marker: { left: "31%", top: "62%" }, cardClass: "club-callout-pdc", teamNames: ["PDC Neige", "PDC Fournaise"] },
  { key: "tdc", name: "Tampon Darts Club", city: "Le Tampon", venue: "Bar Le Chamo", logo: "/club-map/tdc.jpeg", accent: "#f2b43b", marker: { left: "54%", top: "66%" }, cardClass: "club-callout-tdc", teamNames: ["TDC"] },
  { key: "kazadarts", name: "Kazadarts", city: "Saint-Pierre", venue: "Tennis Club de Saint-Pierre", logo: "/club-map/kazadarts.png", accent: "#55a7ff", marker: { left: "48%", top: "80%" }, cardClass: "club-callout-kazadarts", teamNames: ["Kazadarts A", "Kazadarts B"] },
] as const;

const committee = {
  key: "committee",
  name: "Comité de fléchettes de La Réunion",
  city: "La Réunion",
  logo: "/club-map/institutions.png",
  accent: "#f2b43b",
};

const community = {
  key: "darts974",
  name: "Darts974 Réunion Island",
  city: "La Réunion",
  accent: "#1877f2",
  logo: "/club-map/darts974-reunion-island.png",
};

function clubHref(club: Club) {
  const available = club.teams.find((team) => team.teamId);
  return available?.teamId ? `/teams/${available.teamId}` : "/teams";
}

function socialName(link?: SocialLink) {
  if (!link) return "";
  if (link.source_type === "FACEBOOK") return "Facebook";
  if (link.source_type === "INSTAGRAM") return "Instagram";
  return "page publique";
}

function SocialLogo({ logo, name, link, variant = "directory" }: { logo: string; name: string; link?: SocialLink; variant?: "directory" | "map" | "committee" }) {
  const image = (
    <span className={variant === "map" ? "club-marker-logo" : `club-directory-logo ${variant === "committee" ? "is-institution" : ""}`}>
      <Image alt={`Logo ${name}`} fill sizes={variant === "map" ? "54px" : variant === "committee" ? "78px" : "52px"} src={logo} />
    </span>
  );
  if (!link?.url) return image;
  return <a className="club-social-logo-link" href={link.url} target="_blank" rel="noreferrer" title={`Ouvrir ${name} sur ${socialName(link)}`}>{image}<span className="club-social-mark" aria-hidden="true">{link.source_type === "FACEBOOK" ? "f" : "↗"}</span></a>;
}

export function ReunionClubMap({ teamIds, socialLinks = {} }: Props) {
  const clubs: Club[] = useMemo(
    () => definitions.map((club) => ({
      ...club,
      teams: club.teamNames.map((name) => ({ name, teamId: teamIds[name] ?? null })),
      // La page Facebook historique de 3B Darts Club n'est plus disponible.
      // On conserve donc uniquement sa fiche sportive 974Darts jusqu'à l'arrivée
      // d'une nouvelle page officielle publique.
      socialLink: club.key === "3bdc" ? undefined : socialLinks[club.key],
    })),
    [teamIds, socialLinks],
  );
  const committeeLink = socialLinks[committee.key];
  const communityLink = socialLinks[community.key];

  return (
    <div className="reunion-club-explorer">
      <div className="reunion-map-stage" aria-label="Carte des clubs de fléchettes de La Réunion">
        <span className="map-compass" aria-hidden="true">✦<small>N</small></span>
        <Image className="reunion-island-map" alt="Relief topographique de l’île de La Réunion" fill priority sizes="(max-width: 900px) 100vw, 70vw" src="/club-map/reunion-topographic-v2109.png" />
        <svg className="club-connector-layer" viewBox="0 0 1000 650" aria-hidden="true" preserveAspectRatio="none">
          <path className="connector blue" d="M220 210 L280 280" /><path className="connector gold" d="M220 355 L310 403" />
          <path className="connector gold" d="M790 405 L540 429" /><path className="connector blue" d="M350 560 L480 520" />
        </svg>
        {clubs.map((club) => <span className="map-location-dot" key={`${club.key}-dot`} style={{ left: club.marker.left, top: club.marker.top, "--club-accent": club.accent } as React.CSSProperties} />)}
        {clubs.map((club) => (
          <div className={`club-map-callout ${club.cardClass}`} key={club.key} style={{ "--club-accent": club.accent } as React.CSSProperties}>
            <SocialLogo logo={club.logo} name={club.name} link={club.socialLink} variant="map" />
            {club.socialLink?.url ? (
              <a className="club-marker-label club-marker-detail-link" href={club.socialLink.url} target="_blank" rel="noreferrer" title={`Ouvrir ${club.name} sur ${socialName(club.socialLink)}`}>
                <strong>{club.name}</strong><small>⌖&nbsp; {club.city} · {socialName(club.socialLink)} ↗</small>
              </a>
            ) : (
              <Link className="club-marker-label club-marker-detail-link" href={clubHref(club)}><strong>{club.name}</strong><small>⌖&nbsp; {club.city}</small></Link>
            )}
          </div>
        ))}
      </div>

      <aside className="club-map-panel">
        <div className="club-panel-summary"><span className="club-summary-icon" aria-hidden="true">♙</span><div><strong>4 CLUBS · 1 COMITÉ · 1 COMMUNAUTÉ</strong><p>Clubs, fédération et actualités du darts réunionnais.</p></div></div>
        <div className="club-directory-list">
          {clubs.map((club) => (
            <article className="club-directory-row" key={club.key} style={{ "--club-accent": club.accent } as React.CSSProperties}>
              <span className="club-directory-logo-wrap"><SocialLogo logo={club.logo} name={club.name} link={club.socialLink} /></span>
              <div>
                {club.socialLink?.url ? <a className="club-directory-name-link" href={club.socialLink.url} target="_blank" rel="noreferrer"><strong>{club.name}</strong></a> : <strong>{club.name}</strong>}
                <small>⌖&nbsp; {club.city}{club.socialLink ? ` · ${socialName(club.socialLink)}` : ""}</small>
                <Link className="club-stats-inline" href={clubHref(club)}>Stats 974Darts →</Link>
              </div>
              {club.socialLink?.url ? (
                <a className="club-social-action" href={club.socialLink.url} target="_blank" rel="noreferrer">{socialName(club.socialLink)} <span>↗</span></a>
              ) : (
                <Link href={clubHref(club)}>Stats 974Darts <span>→</span></Link>
              )}
            </article>
          ))}
          <article className="club-directory-row club-directory-committee" style={{ "--club-accent": committee.accent } as React.CSSProperties}>
            <span className="club-directory-logo-wrap"><SocialLogo logo={committee.logo} name={committee.name} link={committeeLink} variant="committee" /></span>
            <div><strong>{committee.name}</strong><small>Fédération · La Réunion{committeeLink ? ` · logo → ${socialName(committeeLink)}` : ""}</small></div>
            {committeeLink?.url ? <a href={committeeLink.url} target="_blank" rel="noreferrer">Page du Comité <span>↗</span></a> : <span className="club-source-missing">Lien via Veille tournois</span>}
          </article>
          <article className="club-directory-row club-directory-community" style={{ "--club-accent": community.accent } as React.CSSProperties}>
            <span className="club-directory-logo-wrap"><span className="club-community-logo" aria-hidden="true"><Image alt={`Logo ${community.name}`} fill sizes="54px" src={community.logo} /></span></span>
            <div>
              {communityLink?.url ? <a className="club-directory-name-link" href={communityLink.url} target="_blank" rel="noreferrer"><strong>{community.name}</strong></a> : <strong>{community.name}</strong>}
              <small>Actualités · communauté darts de La Réunion</small>
            </div>
            {communityLink?.url ? <a className="club-social-action" href={communityLink.url} target="_blank" rel="noreferrer">Facebook <span>↗</span></a> : <span className="club-source-missing">Lien via Veille tournois</span>}
          </article>
        </div>
        <Link className="all-clubs-action" href="/teams"><span>◎</span><div><strong>Trouvez votre club et rejoignez l’aventure !</strong><small>Des équipes engagées et une passion qui rassemble.</small></div><b>Voir tous les clubs →</b></Link>
      </aside>
    </div>
  );
}
