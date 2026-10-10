import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      {
        source: "/100",
        destination: "/records/finishes",
        permanent: true,
      },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "font-src 'self' data:",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "img-src 'self' data: blob:",
          "object-src 'none'",
          // Webpack development workers use eval; production stays strict.
          `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
          "style-src 'self' 'unsafe-inline'",
        ].join("; "),
      },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Camera permission belongs to the document: enter via a full-page navigation.
        source: "/admin/vision",
        headers: [
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), screen-wake-lock=(self)" },
          { key: "Content-Security-Policy", value: securityHeaders.find(header => header.key === "Content-Security-Policy")!.value + "; media-src 'self' blob:; worker-src 'self'" },
        ],
      },
      ...(process.env.PLAYER_CARD_ENABLED === "true" ? [
        {
          source: "/players/:player_id/card",
          headers: [
            { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
            { key: "Content-Security-Policy", value: securityHeaders.find(header => header.key === "Content-Security-Policy")!.value + "; media-src 'self' blob:" },
          ],
        },
        ...(process.env.NODE_ENV !== "production" && process.env.PLAYER_CARD_PREVIEW === "true" ? [{
          source: "/player-card-preview",
          headers: [
            { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
            { key: "Content-Security-Policy", value: securityHeaders.find(header => header.key === "Content-Security-Policy")!.value + "; media-src 'self' blob:" },
          ],
        }] : []),
      ] : []),
    ];
  },
};

export default nextConfig;
