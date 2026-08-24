"use client";

import { Users } from "lucide-react";
import { PLAY_FORMATS, participantCount, type PlayFormat } from "@/lib/play/format";

type Props = {
  format: PlayFormat;
  onFormatChange: (format: PlayFormat) => void;
  names: string[];
  onNameChange: (index: number, name: string) => void;
  note?: string;
};

export function ParticipantSetup({ format, onFormatChange, names, onNameChange, note }: Props) {
  const count = participantCount(format);
  return (
    <section className="play-participant-panel">
      <header><Users /><div><strong>Participants</strong><small>{note ?? "Choisissez le format puis renseignez les joueurs."}</small></div></header>
      <div className="play-format-grid">
        {PLAY_FORMATS.map((item) => (
          <button type="button" key={item.id} className={format === item.id ? "selected" : ""} onClick={() => onFormatChange(item.id)}>
            <strong>{item.label}</strong><small>{item.subtitle}</small>
          </button>
        ))}
      </div>
      <div className={`play-player-inputs count-${count}`}>
        {Array.from({ length: count }, (_, index) => (
          <label key={index}>
            <span>{format === "TEAMS_2V2" ? `${index % 2 === 0 ? "Équipe A" : "Équipe B"} · Joueur ${Math.floor(index / 2) + 1}` : `Joueur ${index + 1}`}</span>
            <input value={names[index] ?? ""} onChange={(event) => onNameChange(index, event.target.value)} maxLength={40} />
          </label>
        ))}
      </div>
    </section>
  );
}
