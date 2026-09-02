import type { MetadataRoute } from "next";

const origin = "https://974darts.re";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "", "/flechettes-la-reunion", "/dashboard", "/competitions", "/calendar",
    "/teams", "/players", "/duos", "/tournaments", "/records/180",
    "/records/finishes", "/records/mvp", "/records/mvp/2026",
    "/mentions-legales", "/confidentialite", "/conditions-utilisation",
  ];
  const now = new Date();
  return routes.map((route, index) => ({
    url: `${origin}${route}`,
    lastModified: now,
    changeFrequency: index < 5 ? "daily" : "weekly",
    priority: route === "" ? 1 : index < 5 ? 0.9 : 0.7,
  }));
}
