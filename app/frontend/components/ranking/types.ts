export type Role = "ADMIN" | "SPORTS_DIRECTOR";
export type Metadata = {
  title: string;
  event_date: string;
  kind: string;
  category?: string;
  organizer: string;
  source_url: string;
  season_key: string;
};
export type Recognition = {
  declared_on: string | null;
  received_at: string | null;
  ended_at: string | null;
  logo_confirmed: boolean;
  format_confirmed: boolean;
  eligibility_confirmed: boolean;
  classification_confirmed: boolean;
  evidence: string;
  classification_basis: string;
};
export type Result = {
  source_ref: string;
  identity_id: string | null;
  player_name: string;
  source_name?: string;
  club?: string;
  gender: string;
  placement: string;
  eligibility: string;
  reason: string;
  points?: number;
  duo_id?: string | null;
};
export type Snapshot = {
  metadata: Metadata;
  recognition?: Recognition;
  results: Result[];
  blockers: string[];
  point_scale?: number[];
  summary?: { players: number; points: number };
  source?: {
    format: string;
    collectedAt: string;
    summary: { matches: number; completeMatches: number };
    matches: {
      id: string;
      stage_label: string;
      home: string;
      away: string;
      home_score: number;
      away_score: number;
    }[];
    participants: {
      sourceId: string;
      name: string;
      average3Darts: number | null;
      matchesPlayed: number;
      matchesWon: number;
    }[];
  };
  historical_attestation?: { label: string };
};
export type Revision = {
  id: string;
  number: number;
  status: string;
  fingerprint: string;
  director_id: string | null;
  created_at: string;
  historical: boolean;
  snapshot: Snapshot;
};
export type Event = {
  id: string;
  current_revision_id: string;
  published_revision_id: string | null;
  revision_id: string;
  number: number;
  status: string;
  metadata: Metadata;
  blockers: number;
  historical: boolean;
};
export type Detail = {
  event: Event;
  revision: Revision;
  history: Omit<Revision, "snapshot" | "director_id">[];
  decisions: {
    id: string;
    revision_id: string;
    actor_name: string;
    action: string;
    comment: string;
    created_at: string;
  }[];
  jobs?: { id: string; state: string; error: string | null }[];
  notifications?: {
    template: string;
    state: string;
    attempts: number;
    last_error: string | null;
  }[];
  impact?: {
    player_name: string;
    before: number;
    after: number;
    rank_before: number | null;
    rank_after: number | null;
  }[];
  audit?: {
    action: string;
    reason: string;
    created_at: string;
    before_state: { revision_id: string | null };
    after_state: { revision_id: string | null };
  }[];
};
export type Options = {
  directors: { user_id: string; display_name: string }[];
  identities: {
    id: string;
    canonical_display_name: string;
    club: string;
    licensed: boolean;
  }[];
  clubs: string[];
};
export type EditData = {
  metadata: Metadata;
  recognition: Recognition;
  results: Result[];
  director_id: string | null;
  reason: string;
};
export const labels: Record<string, string> = {
  DRAFT: "Brouillon",
  ANALYZED: "À contrôler",
  PENDING_DS: "À valider par le DS",
  CORRECTION_REQUESTED: "Correction demandée",
  DS_VALIDATED: "Validé par le DS",
  READY_TO_PUBLISH: "Prêt à publier",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
  CREATE: "Création",
  SAVE: "Nouvelle version",
  IMPORT: "Analyse demandée",
  ANALYZE: "Analyse terminée",
  SUBMIT: "Envoi au DS",
  APPROVE_DS: "Validation DS",
  REQUEST_CORRECTION: "Correction demandée",
  APPROVE_ADMIN: "Contrôle final",
  PUBLISH: "Publication",
  ARCHIVE: "Archivage",
  QUEUED: "En attente",
  RUNNING: "En cours",
  FAILED: "Échec",
  SUCCEEDED: "Terminée",
  SMTP_ACCEPTED: "Accepté par le serveur email",
  SENDING: "Envoi en cours",
};
export const kinds: Record<string, string> = {
  CLUB_SINGLE: "Open Club simple",
  CLUB_DOUBLE: "Open Club double",
  COMMITTEE_OPEN: "Open Comité",
  COMMITTEE_CUP: "Coupe Comité",
};
export const places: Record<string, string> = {
  UNCONFIRMED: "À confirmer",
  WINNER: "Vainqueur",
  RUNNER_UP: "Finaliste",
  SEMI_FINALIST: "½ finaliste",
  QUARTER_FINALIST: "¼ finaliste",
  ROUND_OF_16: "⅛ finaliste",
  OUTSIDE_POINTS: "Hors points",
};
export const emptyRecognition: Recognition = {
  declared_on: null,
  received_at: null,
  ended_at: null,
  logo_confirmed: false,
  format_confirmed: false,
  eligibility_confirmed: false,
  classification_confirmed: false,
  evidence: "",
  classification_basis: "",
};
