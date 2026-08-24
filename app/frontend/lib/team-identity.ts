const normalizeTeamName = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const fournaiseAliases = new Set([
  "fournaise",
  "fournaises",
  "pdc fournaise",
  "pdc fournaises",
  "papangue fournaise",
  "papangue fournaises",
  "pdc st leu fournaise",
  "pdc st leu fournaises",
]);

export function canonicalTeamName(value: string | null | undefined) {
  const normalized = normalizeTeamName(value);
  if (fournaiseAliases.has(normalized)) return "PDC Fournaise";
  return value?.trim() || "";
}

export function sameTeam(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return canonicalTeamName(left) === canonicalTeamName(right);
}
