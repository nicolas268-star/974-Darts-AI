import type { Metadata } from "next";
import { MvpSeasonPage } from "../mvp/MvpSeasonPage";

export const metadata: Metadata = {
  title: "MVP 2026",
  description: "Classement analytique MVP du championnat 974 pour la saison 2026.",
};

export default function Mvp2026Page() {
  return <MvpSeasonPage season="2026" />;
}
