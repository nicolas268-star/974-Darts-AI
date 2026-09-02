"use client";

import { useEffect, useState } from "react";

const audienceOptOutKey = "974-audience-opt-out";
const audienceSessionKey = "974-audience-session";

export function AudiencePrivacyControl() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    try {
      setOptedOut(localStorage.getItem(audienceOptOutKey) === "true");
    } catch {
      setStorageAvailable(false);
      setOptedOut(false);
    }
  }, []);

  function updatePreference(nextOptedOut: boolean) {
    try {
      if (nextOptedOut) {
        localStorage.setItem(audienceOptOutKey, "true");
        sessionStorage.removeItem(audienceSessionKey);
      } else {
        localStorage.removeItem(audienceOptOutKey);
      }
      setOptedOut(nextOptedOut);
    } catch {
      setStorageAvailable(false);
    }
  }

  return (
    <section className="audience-control" aria-labelledby="audience-control-title">
      <div>
        <span className="legal-kicker">VOTRE CHOIX</span>
        <h2 id="audience-control-title">Mesure d’audience interne</h2>
        <p>
          {optedOut
            ? "La mesure d’audience est désactivée dans ce navigateur."
            : "La mesure d’audience est active dans ce navigateur."}
        </p>
        <small>
          Ce choix s’applique aux prochaines pages consultées. Les événements déjà
          enregistrés ne sont liés à aucun compte et sont supprimés au plus tard après 12 mois.
        </small>
      </div>
      <button
        className={optedOut ? "audience-toggle is-disabled" : "audience-toggle"}
        type="button"
        disabled={optedOut === null || !storageAvailable}
        aria-pressed={Boolean(optedOut)}
        onClick={() => updatePreference(!optedOut)}
      >
        {optedOut ? "Réactiver la mesure" : "Désactiver la mesure"}
      </button>
      {!storageAvailable && (
        <p className="audience-storage-warning" role="status">
          Votre navigateur bloque l’enregistrement de cette préférence.
        </p>
      )}
    </section>
  );
}
