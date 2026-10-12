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
  if (["3b darts club b londe", "3b darts club blonde", "3b darts club b rune", "3b darts club brune"].includes(normalized)) {
    return "3B Darts Club - B(rune)";
  }
  return value?.trim() || "";
}

export function sameTeam(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  return canonicalTeamName(left) === canonicalTeamName(right);
}

// Calendar text can still contain the legacy source label; preserve the stored audit.
export function displayTeamNames(value: string) {
  return value.replace(/B\(londe\)/gi, "B(rune)");
}
