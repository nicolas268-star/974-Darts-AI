export type InRule = "STRAIGHT_IN" | "DOUBLE_IN";
export type OutRule = "STRAIGHT_OUT" | "DOUBLE_OUT";
export type InputMode = "QUICK_SCORE" | "DART_BY_DART";

export type DartThrow = {
  segment: number;
  multiplier: 0 | 1 | 2 | 3;
  score: number;
  label: string;
  isDouble: boolean;
  isBull: boolean;
  isMiss: boolean;
};

export type VisitResult = {
  scoreAfter: number;
  creditedScore: number;
  attemptedScore: number;
  dartsThrown: number;
  bust: boolean;
  checkout: boolean;
  openedAfter: boolean;
  opensScoring: boolean;
  message: string;
};

export function makeDart(segment: number, multiplier: 0 | 1 | 2 | 3): DartThrow {
  if (segment === 0 || multiplier === 0) {
    return { segment: 0, multiplier: 0, score: 0, label: "MISS", isDouble: false, isBull: false, isMiss: true };
  }
  if (segment === 25) {
    const bullMultiplier = multiplier === 2 ? 2 : 1;
    return {
      segment: 25,
      multiplier: bullMultiplier,
      score: 25 * bullMultiplier,
      label: bullMultiplier === 2 ? "BULL" : "25",
      isDouble: bullMultiplier === 2,
      isBull: true,
      isMiss: false,
    };
  }
  const safeSegment = Math.max(1, Math.min(20, Math.round(segment)));
  const safeMultiplier = Math.max(1, Math.min(3, Math.round(multiplier))) as 1 | 2 | 3;
  const prefix = safeMultiplier === 1 ? "S" : safeMultiplier === 2 ? "D" : "T";
  return {
    segment: safeSegment,
    multiplier: safeMultiplier,
    score: safeSegment * safeMultiplier,
    label: `${prefix}${safeSegment}`,
    isDouble: safeMultiplier === 2,
    isBull: false,
    isMiss: false,
  };
}

export function evaluateDarts(args: {
  scoreBefore: number;
  opened: boolean;
  inRule: InRule;
  outRule: OutRule;
  darts: DartThrow[];
}): VisitResult {
  const { scoreBefore, inRule, outRule, darts } = args;
  let remaining = scoreBefore;
  let opened = args.opened || inRule === "STRAIGHT_IN";
  let opensScoring = false;
  let creditedScore = 0;
  const attemptedScore = darts.reduce((total, dart) => total + dart.score, 0);

  for (const dart of darts) {
    if (!opened) {
      if (!dart.isMiss && dart.isDouble) {
        opened = true;
        opensScoring = true;
      } else {
        continue;
      }
    }

    const next = remaining - dart.score;
    const invalidRemainder = next < 0 || (outRule === "DOUBLE_OUT" && next === 1);
    if (invalidRemainder) {
      return {
        scoreAfter: scoreBefore,
        creditedScore: 0,
        attemptedScore,
        dartsThrown: darts.length,
        bust: true,
        checkout: false,
        openedAfter: opened,
        opensScoring,
        message: "BUST — le score revient au début de la volée.",
      };
    }

    if (next === 0) {
      const validCheckout = outRule === "STRAIGHT_OUT" || dart.isDouble;
      if (!validCheckout) {
        return {
          scoreAfter: scoreBefore,
          creditedScore: 0,
          attemptedScore,
          dartsThrown: darts.length,
          bust: true,
          checkout: false,
          openedAfter: opened,
          opensScoring,
          message: "BUST — le checkout doit se terminer par un double ou le Bull.",
        };
      }
      creditedScore += dart.score;
      return {
        scoreAfter: 0,
        creditedScore,
        attemptedScore,
        dartsThrown: darts.length,
        bust: false,
        checkout: true,
        openedAfter: opened,
        opensScoring,
        message: "CHECKOUT — leg gagné.",
      };
    }

    remaining = next;
    creditedScore += dart.score;
  }

  return {
    scoreAfter: remaining,
    creditedScore,
    attemptedScore,
    dartsThrown: darts.length,
    bust: false,
    checkout: false,
    openedAfter: opened,
    opensScoring,
    message: opensScoring ? "Double In validé — scoring ouvert." : "Volée prête à être enregistrée.",
  };
}

export function evaluateQuickScore(args: {
  scoreBefore: number;
  score: number;
  dartsThrown: number;
  opened: boolean;
  inRule: InRule;
  outRule: OutRule;
  opensScoringConfirmed: boolean;
  checkoutDoubleConfirmed: boolean;
}): VisitResult {
  const score = Math.max(0, Math.min(180, Math.round(args.score)));
  const dartsThrown = Math.max(1, Math.min(3, Math.round(args.dartsThrown)));
  const attemptedScore = score;
  let opened = args.opened || args.inRule === "STRAIGHT_IN";
  let opensScoring = false;

  if (!opened) {
    if (!args.opensScoringConfirmed) {
      return {
        scoreAfter: args.scoreBefore,
        creditedScore: 0,
        attemptedScore,
        dartsThrown,
        bust: false,
        checkout: false,
        openedAfter: false,
        opensScoring: false,
        message: "Double In non validé — la volée ne marque pas de points.",
      };
    }
    opened = true;
    opensScoring = true;
  }

  const next = args.scoreBefore - score;
  if (next < 0 || (args.outRule === "DOUBLE_OUT" && next === 1)) {
    return {
      scoreAfter: args.scoreBefore,
      creditedScore: 0,
      attemptedScore,
      dartsThrown,
      bust: true,
      checkout: false,
      openedAfter: opened,
      opensScoring,
      message: "BUST — le score revient au début de la volée.",
    };
  }

  if (next === 0) {
    const validCheckout = args.outRule === "STRAIGHT_OUT" || args.checkoutDoubleConfirmed;
    if (!validCheckout) {
      return {
        scoreAfter: args.scoreBefore,
        creditedScore: 0,
        attemptedScore,
        dartsThrown,
        bust: true,
        checkout: false,
        openedAfter: opened,
        opensScoring,
        message: "BUST — confirme le double/Bull final pour valider le checkout.",
      };
    }
    return {
      scoreAfter: 0,
      creditedScore: score,
      attemptedScore,
      dartsThrown,
      bust: false,
      checkout: true,
      openedAfter: opened,
      opensScoring,
      message: "CHECKOUT — leg gagné.",
    };
  }

  return {
    scoreAfter: next,
    creditedScore: score,
    attemptedScore,
    dartsThrown,
    bust: false,
    checkout: false,
    openedAfter: opened,
    opensScoring,
    message: opensScoring ? "Double In validé — scoring ouvert." : "Volée prête à être enregistrée.",
  };
}

const checkoutDarts: DartThrow[] = [
  ...Array.from({ length: 20 }, (_, index) => makeDart(index + 1, 3)),
  ...Array.from({ length: 20 }, (_, index) => makeDart(index + 1, 2)),
  makeDart(25, 2),
  ...Array.from({ length: 20 }, (_, index) => makeDart(index + 1, 1)),
  makeDart(25, 1),
].sort((a, b) => b.score - a.score || Number(b.isDouble) - Number(a.isDouble));

const finishDarts = checkoutDarts.filter((dart) => dart.isDouble);

export function checkoutSuggestions(remaining: number, outRule: OutRule, limit = 3): string[] {
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 180 || limit <= 0) return [];

  const suggestions: string[] = [];
  const seen = new Set<string>();
  const pushSuggestion = (value: string) => {
    if (!seen.has(value) && suggestions.length < limit) {
      seen.add(value);
      suggestions.push(value);
    }
  };

  if (outRule === "STRAIGHT_OUT") {
    const exact = checkoutDarts.find((dart) => dart.score === remaining);
    if (exact) pushSuggestion(exact.label);
  }

  const finalPool = outRule === "DOUBLE_OUT" ? finishDarts : checkoutDarts;
  for (const dart of finalPool) {
    if (dart.score === remaining) pushSuggestion(dart.label);
    if (suggestions.length >= limit) return suggestions;
  }
  for (const first of checkoutDarts) {
    for (const last of finalPool) {
      if (first.score + last.score === remaining) pushSuggestion(`${first.label} · ${last.label}`);
      if (suggestions.length >= limit) return suggestions;
    }
  }
  for (const first of checkoutDarts) {
    for (const second of checkoutDarts) {
      for (const last of finalPool) {
        if (first.score + second.score + last.score === remaining) pushSuggestion(`${first.label} · ${second.label} · ${last.label}`);
        if (suggestions.length >= limit) return suggestions;
      }
    }
  }
  return suggestions;
}

export function checkoutRoute(remaining: number, outRule: OutRule): string | null {
  return checkoutSuggestions(remaining, outRule, 1)[0] ?? null;
}
