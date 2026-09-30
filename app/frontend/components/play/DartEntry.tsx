"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseDartInput } from "@/lib/play/dart-input";
import type { DartThrow } from "@/lib/x01/engine";

type Props = { onDart: (dart: DartThrow) => void; disabled?: boolean; focusKey: string | number; defaultMultiplier?: 1 | 2 | 3 };

export function DartEntry({ onDart, disabled = false, focusKey, defaultMultiplier = 1 }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(defaultMultiplier);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!disabled && window.matchMedia("(pointer: fine)").matches) input.current?.focus({ preventScroll: true });
  }, [disabled, focusKey]);
  function record(dart: DartThrow) {
    if (disabled) return;
    onDart(dart);
    setValue("");
    setError("");
    setMultiplier(defaultMultiplier);
    input.current?.focus({ preventScroll: true });
  }
  return <form className="play-dart-entry" onSubmit={(event) => {
    event.preventDefault();
    if (disabled) return;
    const dart = parseDartInput(value, multiplier);
    if (!dart) { setError("Saisis un numéro de 1 à 20, T20, D10, 25, 50 ou 0. Pour un total ambigu, précise D ou T."); return; }
    record(dart);
  }}>
    <fieldset disabled={disabled}><legend>Impact de la fléchette</legend>
      <div className="play-factors" aria-label="Multiplicateur">
        {([1, 2, 3] as const).map((m) => <button type="button" key={m} aria-pressed={multiplier === m} onClick={() => { setMultiplier(m); input.current?.focus({ preventScroll: true }); }}>{m === 1 ? "Simple" : m === 2 ? "Double" : "Triple"}</button>)}
      </div>
      <label htmlFor={id}>Fléchette</label>
      <div className="play-input-row"><input ref={input} id={id} value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} inputMode="numeric" enterKeyHint="done" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={8} placeholder="20, T20, D10…" aria-describedby={id + "-hint"} aria-invalid={Boolean(error)} /><button type="submit" disabled={!value.trim()}>Ajouter</button></div>
      <p id={id + "-hint"} className="play-input-hint">Numéro + Simple / Double / Triple, ou tape directement T20, D10… Entrée pour ajouter.</p>
      <div className="play-shortcuts"><button type="button" onClick={() => record(parseDartInput("S25")!)}>25</button><button type="button" onClick={() => record(parseDartInput("BULL")!)}>Bull 50</button><button type="button" onClick={() => record(parseDartInput("0")!)}>Raté / 0</button></div>
    </fieldset>
    {error ? <p className="play-input-error" role="alert">{error}</p> : null}
  </form>;
}
