import { scoring120139Description, type Scoring120139 } from "@/lib/player/scoring-ranges";

export function ScoringRangeValue({ data }: { data: Scoring120139 }) {
  return <span title={scoring120139Description(data)}>{data.scores_120_139 ?? "—"}</span>;
}

export function ScoringRangeNote({ data }: { data: Scoring120139 }) {
  return <p className="muted" data-scoring-range-note>120–139 : <strong>{data.scores_120_139 ?? "—"}</strong>. {scoring120139Description(data)}</p>;
}
