export type TeamThemeKey =
  | "kazadarts-a"
  | "kazadarts-b"
  | "pdc-fournaise"
  | "pdc-neige"
  | "tdc"
  | "3bdc"
  | "default";

export type TeamTheme = {
  key: TeamThemeKey;
  label: string;
  logo?: string;
  banner?: string;
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function getTeamTheme(teamName: string): TeamTheme {
  const name = normalize(teamName);

  if (name.includes("kazadarts") || name.includes("kazadart")) {
    const isB = /(?:^|\s)b(?:\s|$)/.test(name);
    return {
      key: isB ? "kazadarts-b" : "kazadarts-a",
      label: "Kaz à Darts 974",
    };
  }

  if (name.includes("fournaise")) {
    return {
      key: "pdc-fournaise",
      label: "Piton de la Fournaise",
      logo: "/team-themes/fournaise-logo.jpg",
      banner: "/team-themes/fournaise-banner.png",
    };
  }

  if (name.includes("neige")) {
    return {
      key: "pdc-neige",
      label: "Piton des Neiges",
      logo: "/team-themes/neige-logo.png",
      banner: "/team-themes/neige-banner.png",
    };
  }

  if (name === "tdc" || name.includes("tampon darts")) {
    return {
      key: "tdc",
      label: "Tampon Darts Club",
    };
  }

  if (name.includes("3bdc") || name.includes("3 brasseur")) {
    return {
      key: "3bdc",
      label: "Brasserie & fléchettes",
      logo: "/team-themes/3bdc-logo.png",
      banner: "/team-themes/3bdc-banner.png",
    };
  }

  return { key: "default", label: "Championnat 974" };
}
