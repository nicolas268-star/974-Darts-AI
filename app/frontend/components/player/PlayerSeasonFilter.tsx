import Link from "next/link";

export type PlayerSeasonOption = {
  year: number;
  hasData: boolean;
};

export function PlayerSeasonFilter({
  playerId,
  selected,
  seasons,
}: {
  playerId: string;
  selected: string;
  seasons: PlayerSeasonOption[];
}) {
  return (
    <nav className="player-season-filter card" aria-label="Filtrer les statistiques par saison">
      <div>
        <span>Période statistique</span>
        <strong>{selected === "all" ? "Toute la carrière" : `Saison ${selected}`}</strong>
      </div>
      <div className="player-season-options">
        <Link className={selected === "all" ? "is-active" : ""} href={`/players/${playerId}?season=all`}>
          Toute la carrière
        </Link>
        {seasons.map(({ year, hasData }) => hasData ? (
          <Link className={selected === String(year) ? "is-active" : ""} href={`/players/${playerId}?season=${year}`} key={year}>
            {year}
          </Link>
        ) : (
          <span aria-disabled="true" className="is-empty" key={year} title={`Saison ${year} sans statistiques publiées`}>
            {year}
          </span>
        ))}
      </div>
    </nav>
  );
}
