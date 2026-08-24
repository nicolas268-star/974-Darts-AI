const PRODUCTION_SITE_ORIGIN = "https://974darts.re";

export function getSiteOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    try {
      const origin = new URL(configured).origin;
      if (process.env.NODE_ENV !== "production" || origin.startsWith("https://")) {
        return origin;
      }
    } catch {
      // La valeur de production ci-dessous reste le repli sécurisé.
    }
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_ORIGIN;
  }

  return request ? new URL(request.url).origin : "http://localhost:3000";
}
