import type { CardData } from "./types";
// Imported only by the explicitly gated development preview; never by a production data adapter.
export const DEMO_CARD: CardData = {
  name: "NICO", nickname: "DataMan", initials: "ND", club: "Papangue Dart Club", team: "PDC La Fournaise",
  period: "Historique partagé — période à préciser", competition: null, hasData: true, demonstration: true,
  stats: { average: 43.14, finish: 104, won: 40, played: 87, first9: 52.96, bestAverage: 75.90, scores100: 44, scores140: 9 },
};
