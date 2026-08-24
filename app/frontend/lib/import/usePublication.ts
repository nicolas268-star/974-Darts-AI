"use client";

import { useCallback, useState } from "react";
import {
  normalizePublicationResponse,
  type ExecutePublicationResponse,
  type PublicationError,
} from "@/lib/import/publication";

export type PublicationPhase = "idle" | "confirm" | "publishing" | "success" | "error";

export function usePublication() {
  const [phase, setPhase] = useState<PublicationPhase>("idle");
  const [result, setResult] = useState<ExecutePublicationResponse | null>(null);
  const [error, setError] = useState<PublicationError | null>(null);

  const requestConfirmation = useCallback(() => {
    setError(null);
    setPhase("confirm");
  }, []);

  const cancelConfirmation = useCallback(() => {
    setPhase("idle");
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setError(null);
  }, []);

  const execute = useCallback(async (file: File) => {
    setPhase("publishing");
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);
    form.append("confirmed", "true");

    try {
      const response = await fetch("/api/import/execute-publication", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : "Publication impossible.";
        setError({ status: response.status, message });
        setPhase("error");
        return null;
      }

      const normalized = normalizePublicationResponse(payload);
      setResult(normalized);
      setPhase("success");
      return normalized;
    } catch {
      setError({
        status: 503,
        message: "Le serveur de publication ne répond pas.",
      });
      setPhase("error");
      return null;
    }
  }, []);

  return {
    phase,
    result,
    error,
    requestConfirmation,
    cancelConfirmation,
    execute,
    reset,
  };
}
