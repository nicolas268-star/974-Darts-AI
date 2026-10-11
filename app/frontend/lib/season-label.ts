export function seasonYear(name: string | null | undefined): string | null {
  return name?.match(/20\d{2}/g)?.at(-1) ?? null;
}

export function seasonLabel(season: { id: string; name: string } | null | undefined): string {
  if (season?.id === "all") return "Toute la carrière";
  if (!season?.name) return "Période non renseignée";
  return `Saison ${seasonYear(season.name) ?? season.name}`;
}
