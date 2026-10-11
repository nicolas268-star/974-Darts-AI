import type { Metadata } from "next";
import { MvpSeasonPage } from "../MvpSeasonPage";

export const metadata: Metadata = {
  title: "MVP 2027",
  description: "Classement analytique MVP du championnat 974 pour la saison 2027.",
};

export default function Mvp2027Page() {
  return <MvpSeasonPage season="2027" />;
}
