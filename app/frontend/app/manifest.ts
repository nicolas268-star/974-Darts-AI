import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "974 Darts AI",
    short_name: "974 Darts",
    description: "Le championnat et les tournois de fléchettes à La Réunion.",
    start_url: "/",
    display: "standalone",
    background_color: "#061425",
    theme_color: "#ff8a2a",
    lang: "fr-RE",
  };
}
