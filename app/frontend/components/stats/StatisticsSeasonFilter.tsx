import Link from "next/link";
import { RECORD_YEARS, statisticsHref } from "@/lib/statistics-filters";
import "./statistics-season-filter.css";

export function StatisticsSeasonFilter({ path, selected, extra }: { path: string; selected: string; extra?: Record<string, string | undefined> }) {
  return <nav className="card statistics-season-filter" aria-label="Filtrer les records par année">
    <div><span>Période statistique</span><strong>Saison {selected}</strong></div>
    <div className="statistics-season-options">{RECORD_YEARS.map(year => <Link key={year} href={statisticsHref(path,year,extra)} className={selected === String(year) ? "active" : ""} aria-current={selected === String(year) ? "page" : undefined}>{year}</Link>)}</div>
    <p>Tournois : saison annoncée, ou année de la date publiée lorsqu’aucune saison n’est indiquée.</p>
  </nav>;
}
