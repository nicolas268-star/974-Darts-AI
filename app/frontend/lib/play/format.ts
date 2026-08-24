export type PlayFormat = "SOLO" | "DUEL" | "THREE" | "FOUR" | "TEAMS_2V2";

export type PlayParticipant = {
  name: string;
  side: number;
};

export const PLAY_FORMATS: Array<{ id: PlayFormat; label: string; subtitle: string; count: number }> = [
  { id: "SOLO", label: "Solo", subtitle: "1 joueur", count: 1 },
  { id: "DUEL", label: "1 vs 1", subtitle: "2 joueurs", count: 2 },
  { id: "THREE", label: "3 joueurs", subtitle: "Chacun pour soi", count: 3 },
  { id: "FOUR", label: "4 joueurs", subtitle: "Chacun pour soi", count: 4 },
  { id: "TEAMS_2V2", label: "2 vs 2", subtitle: "2 équipes", count: 4 },
];

export function participantCount(format: PlayFormat) {
  return PLAY_FORMATS.find((item) => item.id === format)?.count ?? 2;
}

export function sideForSeat(format: PlayFormat, seatIndex: number) {
  if (format === "TEAMS_2V2") return seatIndex % 2;
  return seatIndex;
}

export function buildParticipants(format: PlayFormat, rawNames: string[]): PlayParticipant[] {
  const count = participantCount(format);
  return rawNames.slice(0, count).map((name, index) => ({
    name: name.trim() || `Joueur ${index + 1}`,
    side: sideForSeat(format, index),
  }));
}

export function sideCount(format: PlayFormat) {
  if (format === "TEAMS_2V2") return 2;
  return participantCount(format);
}

export function sideName(format: PlayFormat, side: number, participants: PlayParticipant[]) {
  const members = participants.filter((participant) => participant.side === side).map((participant) => participant.name);
  if (format === "TEAMS_2V2") return `Équipe ${side === 0 ? "A" : "B"} · ${members.join(" + ")}`;
  return members[0] ?? `Joueur ${side + 1}`;
}

export function nextParticipantIndex(current: number, participants: PlayParticipant[], eligibleSides?: Set<number>) {
  if (!participants.length) return 0;
  for (let offset = 1; offset <= participants.length; offset += 1) {
    const candidate = (current + offset) % participants.length;
    if (!eligibleSides || eligibleSides.has(participants[candidate].side)) return candidate;
  }
  return current;
}
