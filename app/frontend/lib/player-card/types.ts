export type CardFormat = "publication" | "story";
export type ThemeId = "fournaise" | "neige" | "neutral";
export type CardStats = {
  average: number | null; finish: number | null; won: number | null; played: number | null;
  first9: number | null; bestAverage: number | null; scores100: number | null; scores140: number | null;
};
export type CardData = {
  name: string; nickname: string | null; initials: string; club: string | null; team: string | null;
  period: string; competition: string | null; stats: CardStats; hasData: boolean; demonstration: boolean;
};
export type CardPayload = { data: CardData; theme: ThemeId; seasons: Array<{ value: string; label: string }>; selectedSeason: string };
export type Crop = { x: number; y: number; zoom: number };
export const DEFAULT_CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 };
export type CardSnapshot = { data: CardData; theme: ThemeId; format: CardFormat; generatedAt: string; photo: string | null; crop: Crop };
export const CARD_SIZE = { publication: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;
