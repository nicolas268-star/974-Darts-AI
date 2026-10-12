/** Local, audited BDC doubles only. Sporting season is independent of date year. */
export type BdcPartnerPhase = "pool" | "all" | "finals";
export type BdcPartnerFilters = { season: number; rounds: number[]; phase: BdcPartnerPhase };
export type PartnerPlayer = { id: string; name: string; club: string | null; team: string | null };
export type PartnerFinish = { value: number; darts: number | null; leg: number | null; matchId: string };
export type RecordedPlayerStats = {
  playerId: string;
  score: number | null; darts: number | null;
  first9Score: number | null; first9Darts: number | null;
  visits100: number | null; visits140: number | null; visits170: number | null; visits180: number | null;
  zeroVisits: number | null; visits: number | null; doubleAttempts: number | null;
  finishes: PartnerFinish[] | null;
};
export type PartnerMatchSide = {
  teamId: string; name: string; playerIds: [string, string];
  score: number | null; players: [RecordedPlayerStats | null, RecordedPlayerStats | null];
};
export type PartnerMatch = {
  id: string; round: number; season: number; date: string;
  phase: "pool" | "finals"; phaseLabel: string; startedAt: number | null;
  scoreUnit: "legs" | "sets"; recordedLegs: number; officialLegs: number | null;
  statisticsComplete: boolean; sourceStatus: string; sourceUrl: string; sourceFile: string;
  teamA: PartnerMatchSide; teamB: PartnerMatchSide;
};
export type PartnerParticipation = {
  round: number; season: number; date: string; teamId: string; pairKey: string;
  playerIds: [string, string]; place: number | null; points: number | null;
  pointsStatus: "validated" | "provisional" | "unavailable";
};
export type PartnerData = {
  players: PartnerPlayer[];
  rounds: { number: number; date: string; season: number; sourceUrl: string }[];
  matches: PartnerMatch[]; participations: PartnerParticipation[];
};
export type MetricCoverage = {
  matches: number; completeMatches: number; totalMatches: number;
  recordedLegs: number; partial: boolean;
  matchIds: string[]; missingMatchIds: string[];
};
export type PartnerStats = {
  score: number | null; darts: number | null; average3: number | null;
  first9Score: number | null; first9Darts: number | null; first9: number | null;
  visits100: number | null; visits140: number | null; visits170: number | null; visits180: number | null;
  visits100Plus: number | null; visits: number | null; frequency100Plus: number | null;
  zeroVisits: number | null; finishCount: number | null; bestFinish: number | null;
  finishes: PartnerFinish[]; checkoutPercent: number | null;
  scoringShare: number | null; dartsShare: number | null; finishShare: number | null;
  dispersion: { value: number | null; matches: number; darts: number };
  coverage: Record<"average3" | "first9" | "highVisits" | "finishes" | "zeroVisits" | "contribution" | "finishShare" | "frequency100Plus" | "checkoutPercent" | "dispersion", MetricCoverage>;
};
export type PartnerDuoStats = {
  score: number | null; darts: number | null; average3: number | null;
  playerAverage3: number | null; partnerAverage3: number | null;
  playerScore: number | null; partnerScore: number | null;
  playerDarts: number | null; partnerDarts: number | null;
  finishCount: number | null; playerFinishes: number | null; partnerFinishes: number | null;
  coverage: MetricCoverage; finishCoverage: MetricCoverage;
};
export type PartnerResult = {
  matches: number; knownMatches: number; wins: number; losses: number; draws: number;
  winRate: number | null; legsWon: number | null; legsLost: number | null;
  legWinRate: number | null; legMatches: number; unknownLegMatches: number;
  /** False when sets or unknown scores prevent a common legs criterion. */
  legsComparable: boolean;
};
export type PartnerReference = {
  average3: number | null; score: number | null; darts: number | null;
  matches: number; completeMatches: number; evenings: number; partnerIds: string[];
  difference: number | null; coverage: MetricCoverage;
};
export type PartnerMatchObservation = {
  match: PartnerMatch; opponents: string; result: "win" | "loss" | "draw" | "unknown";
  ownScore: number | null; opponentScore: number | null;
  playerStats: RecordedPlayerStats | null; partnerStats: RecordedPlayerStats | null;
  playerAverage3: number | null; partnerAverage3: number | null; duoAverage3: number | null;
};
export type PartnerObservation = { text: string; metric: string; matchIds: string[]; rounds: number[] };
export type PartnerAnalysis = {
  pairKey: string; player: PartnerPlayer; partner: PartnerPlayer;
  rounds: number[]; dates: string[]; evenings: number;
  matches: PartnerMatchObservation[]; coverage: MetricCoverage;
  result: PartnerResult; playerStats: PartnerStats; partnerStats: PartnerStats; duoStats: PartnerDuoStats;
  playerReference: PartnerReference; partnerReference: PartnerReference;
  roundResults: PartnerParticipation[]; observations: PartnerObservation[];
  chronological: boolean;
};
export type PartnerConclusion = {
  criterion: "results" | "individual" | "collective";
  title: string; partnerIds: string[]; value: number | null;
  metric: "legWinRate" | "winRate" | "average3";
  status: "available" | "single-partner" | "insufficient";
  onAvailableData: boolean; explanation: string;
};
export type BdcPartnerAnalysis = {
  player: PartnerPlayer | null; filters: BdcPartnerFilters;
  partners: PartnerAnalysis[]; conclusions: PartnerConclusion[];
  observations: PartnerObservation[];
  bestObservedPartnerIds: string[];
};
