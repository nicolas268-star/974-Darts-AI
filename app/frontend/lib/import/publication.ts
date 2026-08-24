export type PublicationStatus =
  | "COMMITTED"
  | "NO_CHANGES"
  | "BLOCKED"
  | "FAILED"
  | string;

export type PublicationDetails = {
  encounters: number;
  matches: number;
  legs: number;
  playerLegRows: number;
};

export type ExecutePublicationResponse = {
  status: PublicationStatus;
  transactionId?: string | null;
  inserted: number;
  updated: number;
  unchanged: number;
  details: PublicationDetails;
  message: string;
};

export type PublicationError = {
  status: number;
  message: string;
  code?: string;
};

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizePublicationResponse(
  payload: Record<string, unknown>,
): ExecutePublicationResponse {
  const summary =
    payload.summary && typeof payload.summary === "object"
      ? (payload.summary as Record<string, unknown>)
      : payload;
  const rawDetails =
    payload.details && typeof payload.details === "object"
      ? (payload.details as Record<string, unknown>)
      : {};

  return {
    status: String(payload.status ?? "FAILED"),
    transactionId:
      typeof payload.transactionId === "string" ? payload.transactionId : null,
    inserted: numberValue(summary.inserted ?? payload.inserted),
    updated: numberValue(summary.updated ?? payload.updated),
    unchanged: numberValue(summary.unchanged ?? payload.unchanged),
    details: {
      encounters: numberValue(rawDetails.encounters),
      matches: numberValue(rawDetails.matches),
      legs: numberValue(rawDetails.legs),
      playerLegRows: numberValue(
        rawDetails.playerLegRows ?? rawDetails.player_leg_rows,
      ),
    },
    message:
      typeof payload.message === "string"
        ? payload.message
        : "Publication terminée.",
  };
}
